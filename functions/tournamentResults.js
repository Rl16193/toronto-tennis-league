const nodeCrypto = require('node:crypto');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { FieldValue } = require('firebase-admin/firestore');

const { REGION, SUPER_ADMIN_UID } = require('./lib/constants');
const { requireAuth, requireTrimmedString } = require('./lib/callable');
const { notify } = require('./lib/notify');
const {
  TournamentResultError,
  mergeStatDeltas,
  normalizeTournamentResult,
  scoreFieldPatch,
  statDeltasForResult,
  storedTournamentResult,
} = require('./lib/tournamentResult');

const db = () => admin.firestore();

function sameDraw(left, right) {
  return (
    (left.bracket ?? null) === (right.bracket ?? null) &&
    left.tournament_choice === right.tournament_choice &&
    left.division === right.division &&
    left.skill_group === right.skill_group &&
    (left.zone ?? null) === (right.zone ?? null)
  );
}

function isEventOrganizer(event, uid) {
  return (
    uid === SUPER_ADMIN_UID ||
    event.creator_id === uid ||
    (Array.isArray(event.organizer_ids) && event.organizer_ids.includes(uid))
  );
}

function resultHash(matchId, result) {
  return nodeCrypto
    .createHash('sha256')
    .update(JSON.stringify({ matchId, winnerUid: result.winnerUid, scores: result.scores, walkover: result.walkover }))
    .digest('hex');
}

function scoreLine(scores, perspective, match) {
  const p1 = perspective === match.player_1_uid;
  return scores
    .filter(([a, b]) => a > 0 || b > 0)
    .map(([a, b]) => `${p1 ? a : b}-${p1 ? b : a}`)
    .join(', ');
}

function recipientNotification(match, result, recipientUid) {
  const winner = result.winnerUid === recipientUid;
  const opponent = recipientUid === match.player_1_uid ? match.player_2_name : match.player_1_name;
  return {
    type: winner ? 'tournament_result_recorded' : 'tournament_score_recorded',
    title: winner
      ? `Win recorded — ${scoreLine(result.scores, recipientUid, match)} v. ${opponent}`
      : `Score recorded — ${scoreLine(result.scores, recipientUid, match)} v. ${opponent}`,
    body: result.walkover ? `Walkover recorded against ${opponent}.` : 'Your match result is now recorded.',
    link: `/tournament?event=${match.event_id}`,
  };
}

function submissionRecord(uid, result, now, hash) {
  return {
    winner_uid: result.winnerUid,
    sets: persistedScores(result.scores),
    margin: result.margin,
    submitted_at: now,
    hash,
    submitted_by: uid,
  };
}

// Firestore rejects arrays nested inside arrays. Keep the score pairs readable
// while storing them as maps in submission and audit records.
function persistedScores(scores) {
  return Object.fromEntries(
    scores.map(([playerOne, playerTwo], index) => [`set_${index + 1}`, { player_1: playerOne, player_2: playerTwo }]),
  );
}

function persistedResult(result) {
  return result ? { ...result, scores: persistedScores(result.scores) } : null;
}

function activeParticipantMap(snapshot) {
  return new Map(
    snapshot.docs
      .map((doc) => doc.data())
      .filter(
        (participant) =>
          participant.removal !== true &&
          participant.active !== false &&
          !['withdrawn', 'removed', 'inactive'].includes(String(participant.status || '').toLowerCase()),
      )
      .filter((participant) => participant.uid)
      .map((participant) => [participant.uid, participant]),
  );
}

async function nextTarget(tx, match) {
  if (!match.next_match_id) return null;
  const nextQuery = db()
    .collection('matches')
    .where('event_id', '==', match.event_id)
    .where('match_id', '==', match.next_match_id);
  const nextSnap = await tx.get(nextQuery);
  const candidate = nextSnap.docs.find((doc) => sameDraw(doc.data(), match));
  if (!candidate) throw new HttpsError('failed-precondition', 'Advancement target does not exist in this draw.');
  let slot = match.next_slot;
  if (slot !== 'player_1' && slot !== 'player_2') {
    const siblingsQuery = db()
      .collection('matches')
      .where('event_id', '==', match.event_id)
      .where('next_match_id', '==', match.next_match_id);
    const siblingsSnap = await tx.get(siblingsQuery);
    const siblings = siblingsSnap.docs
      .filter((doc) => sameDraw(doc.data(), match))
      .sort((a, b) => (a.data().position ?? 0) - (b.data().position ?? 0));
    slot = siblings.findIndex((doc) => doc.id === match.id) <= 0 ? 'player_1' : 'player_2';
  }
  return { ref: candidate.ref, data: candidate.data(), slot };
}

function applyStatDeltas(tx, deltas) {
  for (const [uid, delta] of deltas) {
    const values = Object.fromEntries(
      Object.entries(delta).map(([key, value]) => [
        key,
        typeof value === 'number' ? FieldValue.increment(value) : value,
      ]),
    );
    tx.set(db().collection('stats').doc(uid), values, { merge: true });
  }
}

function combinedStatDeltas(match, oldResult, nextResult, partnerUidByCaptain) {
  const deltas = new Map();
  if (oldResult) mergeStatDeltas(deltas, statDeltasForResult(match, oldResult, partnerUidByCaptain), -1);
  mergeStatDeltas(deltas, statDeltasForResult(match, nextResult, partnerUidByCaptain), 1);
  return deltas;
}

function resultResponse({ applied, duplicate = false, advanced = false, disputed = false, reconciled = false }) {
  return {
    applied,
    duplicate,
    advanced,
    ...(disputed ? { disputed: true } : {}),
    ...(reconciled ? { reconciled: true } : {}),
    needsManual: false,
  };
}

function mapError(error) {
  if (error instanceof HttpsError) return error;
  if (error instanceof TournamentResultError) return new HttpsError(error.code, error.message);
  return error;
}

exports.applyTournamentResult = onCall({ region: REGION }, async (request) => {
  const callerUid = requireAuth(request);
  const matchId = requireTrimmedString(request.data?.matchId, 'Missing match.', { maxLength: 500 });

  try {
    const outcome = await db().runTransaction(async (tx) => {
      const matchRef = db().collection('matches').doc(matchId);
      const matchSnap = await tx.get(matchRef);
      if (!matchSnap.exists) throw new HttpsError('not-found', 'Match not found.');
      const match = matchSnap.data();
      if (
        !match.event_id ||
        !['singles', 'doubles'].includes(match.category) ||
        !['Singles', 'Doubles'].includes(match.tournament_choice)
      ) {
        throw new HttpsError('invalid-argument', 'Target must be an official tournament match.');
      }

      const eventRef = db().collection('events').doc(match.event_id);
      const eventSnap = await tx.get(eventRef);
      if (!eventSnap.exists) throw new HttpsError('not-found', 'Event not found.');
      const event = eventSnap.data();
      const manager = isEventOrganizer(event, callerUid);
      if (!match.player_1_uid || !match.player_2_uid || match.player_1_uid === match.player_2_uid) {
        throw new HttpsError('failed-precondition', 'Match participants are invalid.');
      }

      const participantSnap = await tx.get(
        db().collection('event_participants').where('event_id', '==', match.event_id),
      );
      const participantsByUid = activeParticipantMap(participantSnap);
      const isParticipant = [match.player_1_uid, match.player_2_uid].includes(callerUid);
      if (!manager && (!isParticipant || !participantsByUid.has(callerUid))) {
        throw new HttpsError('permission-denied', 'Only match participants may submit this result.');
      }
      if (!participantsByUid.has(match.player_1_uid) || !participantsByUid.has(match.player_2_uid)) {
        throw new HttpsError('failed-precondition', 'Both match players must be active event participants.');
      }

      const result = normalizeTournamentResult(request.data, match);
      if (result.walkover && !manager) {
        throw new HttpsError('permission-denied', 'Only the event organizer may record a walkover.');
      }
      const hash = resultHash(matchId, result);
      const now = new Date().toISOString();
      const oldResult = match.status === 'complete' && match.winner_uid ? storedTournamentResult(match) : null;
      const existingSubmission = match.result_submissions?.[callerUid];

      if (existingSubmission?.hash === hash && match.result_application?.hash === hash) {
        return {
          response: resultResponse({ applied: false, duplicate: true, advanced: !!match.next_match_id }),
          notices: [],
        };
      }

      const target = await nextTarget(tx, match);
      const nextHasResult =
        target &&
        (target.data.status === 'complete' ||
          !!target.data.result_application ||
          Object.keys(target.data.result_submissions || {}).length > 0);

      const partnerUidByCaptain = new Map();
      if (match.tournament_choice === 'Doubles') {
        for (const captainUid of [match.player_1_uid, match.player_2_uid]) {
          const participant = participantsByUid.get(captainUid);
          if (participant?.partner_uid && participantsByUid.has(participant.partner_uid)) {
            partnerUidByCaptain.set(captainUid, participant.partner_uid);
          }
        }
      }

      const submissions = {
        ...(match.result_submissions || {}),
        [callerUid]: submissionRecord(callerUid, result, now, hash),
      };

      if (oldResult && !manager) {
        if (result.winnerUid !== oldResult.winnerUid) {
          const alreadyDisputed = match.score_disputed === true;
          tx.update(matchRef, {
            result_submissions: submissions,
            score_disputed: true,
            score_disputed_at: match.score_disputed_at || now,
          });
          return {
            response: resultResponse({ applied: false, disputed: true }),
            notices: alreadyDisputed
              ? []
              : [
                  {
                    recipients: [event.creator_id, ...(event.organizer_ids || [])],
                    payload: {
                      type: 'organizer_score_disputed',
                      title: `Result disputed — ${match.player_1_name} v. ${match.player_2_name}, ${match.round}`,
                      body: 'Players submitted different winners. The first applied result remains in place.',
                      link: `/tournament?event=${match.event_id}`,
                    },
                  },
                ],
          };
        }
        if (result.margin >= oldResult.margin) {
          tx.update(matchRef, { result_submissions: submissions });
          return { response: resultResponse({ applied: false }), notices: [] };
        }
      }

      if (manager && oldResult && result.winnerUid !== oldResult.winnerUid && nextHasResult) {
        throw new HttpsError('failed-precondition', 'Cannot change the winner after the next match has a result.');
      }
      if (!oldResult && match.status !== 'pending' && match.status !== 'scheduled' && match.status !== 'open') {
        throw new HttpsError('failed-precondition', 'Match is not awaiting a result.');
      }
      if (
        !oldResult &&
        target?.data?.[`${target.slot}_uid`] &&
        target.data[`${target.slot}_uid`] !== result.winnerUid
      ) {
        throw new HttpsError('failed-precondition', 'Advancement target is occupied by another player.');
      }

      const deltas = combinedStatDeltas(match, oldResult, result, partnerUidByCaptain);
      applyStatDeltas(tx, deltas);

      const advanced = !!target;
      const applied = {
        hash,
        applied_by: callerUid,
        applied_at: now,
        advanced,
        margin: result.margin,
      };
      tx.update(matchRef, {
        winner_uid: result.winnerUid,
        winner_name: result.winnerUid === match.player_1_uid ? match.player_1_name : match.player_2_name,
        ...scoreFieldPatch(result.scores),
        status: 'complete',
        result_at: now,
        completed_at: match.completed_at || now,
        walkover: result.walkover,
        score_disputed: false,
        score_disputed_at: FieldValue.delete(),
        result_application: applied,
        result_submissions: submissions,
        no_show: FieldValue.delete(),
        score_pending: FieldValue.delete(),
        ...(result.court ? { court: result.court } : {}),
        ...(match.format === 'rr' && match.round === 'RR' && !result.walkover ? { rr_winner_pts_v2: true } : {}),
      });

      // Keep an immutable actor/before/after record for organizer review and reconciliation audits.
      tx.create(db().collection('tournament_result_audit').doc(), {
        event_id: match.event_id,
        match_id: matchId,
        actor_uid: callerUid,
        action: oldResult ? 'rescore' : 'apply',
        before: persistedResult(oldResult),
        after: persistedResult(result),
        recorded_at: now,
      });

      if (target) {
        const oldWinner = oldResult?.winnerUid;
        tx.update(target.ref, {
          [`${target.slot}_uid`]: result.winnerUid,
          [`${target.slot}_name`]: result.winnerUid === match.player_1_uid ? match.player_1_name : match.player_2_name,
          ...(oldWinner && oldWinner !== result.winnerUid ? { [`${target.slot}_previous_uid`]: oldWinner } : {}),
        });
      }

      return {
        response: resultResponse({ applied: true, advanced, reconciled: !!oldResult }),
        notices: [{ recipients: [match.player_1_uid, match.player_2_uid], payload: null }],
        result,
        match,
      };
    });

    for (const notice of outcome.notices || []) {
      if (notice.payload) {
        await notify(notice.recipients, notice.payload);
        continue;
      }
      if (!outcome.result || !outcome.match) continue;
      await Promise.all(
        notice.recipients.map((uid) =>
          notify(uid, { uid, ...recipientNotification(outcome.match, outcome.result, uid) }),
        ),
      );
    }
    return outcome.response;
  } catch (error) {
    throw mapError(error);
  }
});
