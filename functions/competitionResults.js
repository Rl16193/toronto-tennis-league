const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { FieldValue } = require('firebase-admin/firestore');
const { REGION, SUPER_ADMIN_UID } = require('./lib/constants');
const { requireAuth, requireTrimmedString } = require('./lib/callable');

const db = () => admin.firestore();

function isManager(event, uid) {
  return (
    uid === SUPER_ADMIN_UID ||
    event.creator_id === uid ||
    [event.organizer_ids, event.assigned_organizer_uids, event.organizer_uids].some(
      (value) => Array.isArray(value) && value.includes(uid),
    )
  );
}

exports.challengeResults = onCall({ region: REGION }, async (request) => {
  const callerUid = requireAuth(request);
  const matchId = requireTrimmedString(request.data?.matchId, 'Missing challenge.', { maxLength: 500 });
  return db().runTransaction(async (tx) => {
    const challengeRef = db().collection('matches').doc(matchId);
    const challengeSnap = await tx.get(challengeRef);
    if (!challengeSnap.exists || challengeSnap.data().category !== 'challenge') {
      throw new HttpsError('not-found', 'Challenge not found.');
    }
    const challenge = challengeSnap.data();
    const eventSnap = await tx.get(db().collection('events').doc(challenge.event_id));
    if (!eventSnap.exists || !isManager(eventSnap.data(), callerUid)) {
      throw new HttpsError('permission-denied', 'Only the event manager may confirm a challenge.');
    }
    if (challenge.applied === true || challenge.status === 'confirmed') {
      return { applied: false, duplicate: true };
    }
    if (challenge.status !== 'reported' || !challenge.winner_uid) {
      throw new HttpsError('failed-precondition', 'Only a reported challenge can be confirmed.');
    }
    const winnerUid = challenge.winner_uid;
    const loserUid = winnerUid === challenge.player_1_uid ? challenge.player_2_uid : challenge.player_1_uid;
    if (!loserUid || loserUid === winnerUid)
      throw new HttpsError('failed-precondition', 'Challenge players are invalid.');
    const loserRef = db().collection('stats').doc(loserUid);
    const loserSnap = await tx.get(loserRef);
    const loserPoints = Number(loserSnap.data()?.leaguePoints26) || 0;
    const now = new Date().toISOString();
    tx.set(
      db().collection('stats').doc(winnerUid),
      {
        leaguePoints26: FieldValue.increment(3),
        matchesPlayed: FieldValue.increment(1),
        wins: FieldValue.increment(1),
      },
      { merge: true },
    );
    tx.set(
      loserRef,
      {
        leaguePoints26: Math.max(0, loserPoints - 3),
        matchesPlayed: FieldValue.increment(1),
        loses: FieldValue.increment(1),
      },
      { merge: true },
    );
    tx.update(challengeRef, { status: 'confirmed', applied: true, confirmed_at: now, completed_at: now });
    return { applied: true, duplicate: false };
  });
});

exports.setGroupBonus = onCall({ region: REGION }, async (request) => {
  const callerUid = requireAuth(request);
  const eventId = requireTrimmedString(request.data?.eventId, 'Missing event.', { maxLength: 500 });
  const rrGroup = Number(request.data?.rrGroup);
  if (!Number.isInteger(rrGroup) || rrGroup < 0) throw new HttpsError('invalid-argument', 'Invalid group.');
  const award = request.data?.award === true;
  const tournamentChoice = typeof request.data?.tournamentChoice === 'string' ? request.data.tournamentChoice : null;
  const division = typeof request.data?.division === 'string' ? request.data.division : null;
  const skillGroup = typeof request.data?.skillGroup === 'string' ? request.data.skillGroup : null;
  const zone = request.data?.zone == null ? null : String(request.data.zone);
  return db().runTransaction(async (tx) => {
    const eventSnap = await tx.get(db().collection('events').doc(eventId));
    if (!eventSnap.exists || !isManager(eventSnap.data(), callerUid)) {
      throw new HttpsError('permission-denied', 'Only the event manager may award a group bonus.');
    }
    const matchesSnap = await tx.get(
      db().collection('matches').where('event_id', '==', eventId).where('rr_group', '==', rrGroup),
    );
    const matches = matchesSnap.docs.filter((doc) => {
      const data = doc.data();
      return (
        data.format === 'rr' &&
        data.round === 'RR' &&
        (!tournamentChoice || data.tournament_choice === tournamentChoice) &&
        (!division || data.division === division) &&
        (!skillGroup || data.skill_group === skillGroup) &&
        (zone === null ? !data.zone : (data.zone ?? null) === zone)
      );
    });
    if (matches.length === 0) throw new HttpsError('not-found', 'Round Robin group not found.');
    const alreadyAwarded = matches.some(
      (doc) => doc.data().rr_groupbonus === true || doc.data().rr_group_bonus_v2 === true,
    );
    if (award === alreadyAwarded) return { applied: false, awarded: alreadyAwarded };

    const players = new Set();
    matches.forEach((doc) => {
      const data = doc.data();
      for (const uid of [data.player_1_uid, data.player_2_uid]) {
        if (uid && !['BYE', 'PLAYER_LOADING'].includes(uid)) players.add(uid);
      }
      tx.update(doc.ref, { rr_groupbonus: award, rr_group_bonus_v2: FieldValue.delete() });
    });
    for (const uid of players) {
      tx.set(
        db().collection('stats').doc(uid),
        { leaguePoints26: FieldValue.increment(award ? 5 : -5) },
        { merge: true },
      );
    }
    return { applied: true, awarded: award, players: players.size };
  });
});
