const nodeCrypto = require('node:crypto');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

const { REGION } = require('./lib/constants');
const { requireAuth, requireTrimmedString } = require('./lib/callable');
const {
  TournamentResultError,
  normalizeTournamentResult,
  scoreFieldPatch,
  statDeltasForResult,
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
    event.creator_id === uid ||
    [event.organizer_ids, event.assigned_organizer_uids, event.organizer_uids].some(
      (value) => Array.isArray(value) && value.includes(uid),
    )
  );
}

function resultHash(matchId, result) {
  return nodeCrypto
    .createHash('sha256')
    .update(JSON.stringify({ matchId, ...result }))
    .digest('hex');
}

function submissionMatchesResult(submission, result) {
  const submittedScores = [
    [submission.set_1_player_1, submission.set_1_player_2],
    [submission.set_2_player_1, submission.set_2_player_2],
    [submission.set_3_player_1, submission.set_3_player_2],
  ];
  return (
    submission.claimed_winner_uid === result.winnerUid &&
    submission.is_walkover === result.walkover &&
    JSON.stringify(submittedScores) === JSON.stringify(result.scores)
  );
}

function mapError(error) {
  if (error instanceof HttpsError) return error;
  if (error instanceof TournamentResultError) return new HttpsError(error.code, error.message);
  return error;
}

exports.applyTournamentResult = onCall({ region: REGION }, async (request) => {
  const callerUid = requireAuth(request);
  const matchId = requireTrimmedString(request.data?.matchId, 'Missing match.', { maxLength: 500 });
  const submissionId = typeof request.data?.submissionId === 'string' ? request.data.submissionId.trim() : '';
  if (submissionId.length > 500) throw new HttpsError('invalid-argument', 'Invalid submission.');

  try {
    return await db().runTransaction(async (tx) => {
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
      if (!isEventOrganizer(eventSnap.data(), callerUid)) {
        throw new HttpsError('permission-denied', 'Only an assigned organizer may apply this result.');
      }
      if (!match.player_1_uid || !match.player_2_uid || match.player_1_uid === match.player_2_uid) {
        throw new HttpsError('failed-precondition', 'Match participants are invalid.');
      }

      const result = normalizeTournamentResult(request.data, match);
      const hash = resultHash(matchId, result);
      if (match.result_application?.hash === hash) {
        return {
          applied: false,
          duplicate: true,
          advanced: match.result_application.advanced === true,
          needsManual: false,
        };
      }
      if (match.status === 'complete' || match.result_application) {
        throw new HttpsError(
          'already-exists',
          'This match already has a different applied result. Reset it before rescoring.',
        );
      }
      if (match.status !== 'pending') {
        throw new HttpsError('failed-precondition', 'Match is not awaiting a result.');
      }

      const participantQuery = db().collection('event_participants').where('event_id', '==', match.event_id);
      const participantSnap = await tx.get(participantQuery);
      const activeParticipants = participantSnap.docs
        .map((doc) => doc.data())
        .filter((participant) => participant.removal !== true);
      const participantsByUid = new Map(activeParticipants.map((participant) => [participant.uid, participant]));
      if (!participantsByUid.has(match.player_1_uid) || !participantsByUid.has(match.player_2_uid)) {
        throw new HttpsError('failed-precondition', 'Both match players must be active event participants.');
      }

      let submissionRef = null;
      if (submissionId) {
        submissionRef = db().collection('matches').doc(submissionId);
        const submissionSnap = await tx.get(submissionRef);
        if (!submissionSnap.exists) throw new HttpsError('not-found', 'Score submission not found.');
        const submission = submissionSnap.data();
        if (
          submission.category !== 'score_submission' ||
          submission.event_id !== match.event_id ||
          submission.match_id !== matchId ||
          submission.resolved
        ) {
          throw new HttpsError('failed-precondition', 'Score submission does not match this pending result.');
        }
        if (![match.player_1_uid, match.player_2_uid].includes(submission.submitted_by)) {
          throw new HttpsError('failed-precondition', 'Score submitter is not a match participant.');
        }
        if (!submissionMatchesResult(submission, result)) {
          throw new HttpsError('failed-precondition', 'Applied result differs from the selected score submission.');
        }
      }

      let nextRef = null;
      let nextSlot = null;
      if (!result.noShow && match.next_match_id) {
        const nextQuery = db()
          .collection('matches')
          .where('event_id', '==', match.event_id)
          .where('match_id', '==', match.next_match_id);
        const nextSnap = await tx.get(nextQuery);
        const candidate = nextSnap.docs.find((doc) => sameDraw(doc.data(), match));
        if (!candidate) {
          throw new HttpsError('failed-precondition', 'Advancement target does not exist in this draw.');
        }
        {
          nextRef = candidate.ref;
          const nextMatch = candidate.data();
          if (nextMatch.status === 'complete') {
            throw new HttpsError('failed-precondition', 'Advancement target is already complete.');
          }
          nextSlot = match.next_slot;
          if (nextSlot !== 'player_1' && nextSlot !== 'player_2') {
            const siblingsQuery = db()
              .collection('matches')
              .where('event_id', '==', match.event_id)
              .where('next_match_id', '==', match.next_match_id);
            const siblingsSnap = await tx.get(siblingsQuery);
            const siblings = siblingsSnap.docs
              .filter((doc) => sameDraw(doc.data(), match))
              .sort((a, b) => (a.data().position ?? 0) - (b.data().position ?? 0));
            nextSlot = siblings.findIndex((doc) => doc.id === matchId) <= 0 ? 'player_1' : 'player_2';
          }
          const occupied = nextMatch[`${nextSlot}_uid`];
          if (occupied && occupied !== result.winnerUid) {
            throw new HttpsError('failed-precondition', 'Advancement target is occupied by another player.');
          }
        }
      }

      const partnerUidByCaptain = new Map();
      if (match.tournament_choice === 'Doubles') {
        for (const captainUid of [match.player_1_uid, match.player_2_uid]) {
          const participant = participantsByUid.get(captainUid);
          if (participant?.partner_uid && participantsByUid.has(participant.partner_uid)) {
            partnerUidByCaptain.set(captainUid, participant.partner_uid);
          }
        }
      }
      const deltas = statDeltasForResult(match, result, partnerUidByCaptain);
      const now = new Date().toISOString();
      const advanced = !!nextRef;
      tx.update(matchRef, {
        winner_uid: result.winnerUid,
        winner_name:
          result.winnerUid === match.player_1_uid
            ? match.player_1_name
            : result.winnerUid === match.player_2_uid
              ? match.player_2_name
              : '',
        ...scoreFieldPatch(result.scores),
        status: 'complete',
        completed_at: now,
        no_show: result.noShow,
        walkover: result.walkover,
        ...(result.court ? { court: result.court } : {}),
        ...(match.format === 'rr' && match.round === 'RR' && !result.noShow ? { rr_winner_pts_v2: true } : {}),
        result_application: { hash, applied_by: callerUid, applied_at: now, advanced },
      });
      for (const [uid, delta] of deltas) {
        const increments = Object.fromEntries(
          Object.entries(delta).map(([key, value]) => [
            key,
            typeof value === 'number' ? admin.firestore.FieldValue.increment(value) : value,
          ]),
        );
        tx.set(db().collection('stats').doc(uid), increments, { merge: true });
      }
      if (nextRef) {
        tx.update(nextRef, {
          [`${nextSlot}_uid`]: result.winnerUid,
          [`${nextSlot}_name`]: result.winnerUid === match.player_1_uid ? match.player_1_name : match.player_2_name,
        });
      }
      if (submissionRef) {
        tx.update(submissionRef, { resolved: 'confirmed', resolved_at: now, resolved_by: callerUid });
      }
      return { applied: true, duplicate: false, advanced, needsManual: !!match.next_match_id && !advanced };
    });
  } catch (error) {
    throw mapError(error);
  }
});
