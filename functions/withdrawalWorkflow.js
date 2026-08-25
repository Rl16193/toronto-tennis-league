const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');
const { REGION, SUPER_ADMIN_UID } = require('./lib/constants');
const { requireAuth } = require('./lib/callable');
const { notify } = require('./lib/notify');

const db = () => admin.firestore();
const FieldValue = admin.firestore.FieldValue;
const AWARDS = { R32: 1, R16: 2, QF: 3, SF: 5, F: 10 };
const withdrawalAward = (round) => AWARDS[round] || 1;
const manager = (event, uid) =>
  uid === SUPER_ADMIN_UID || event.creator_id === uid || (event.organizer_ids || []).includes(uid);

async function withdrawParticipant({ eventId, uid, actorUid, reason = 'other', note = '' }) {
  const eventRef = db().doc(`events/${eventId}`);
  const eventSnap = await eventRef.get();
  if (!eventSnap.exists) throw new HttpsError('not-found', 'Event not found.');
  const event = eventSnap.data() || {};
  if (actorUid !== uid && !manager(event, actorUid))
    throw new HttpsError('permission-denied', 'Only the member or event organizer may withdraw this player.');
  if (!['injury', 'unavailable', 'cannot_contact', 'other'].includes(reason))
    throw new HttpsError('invalid-argument', 'Invalid withdrawal reason.');

  const participantSnap = await db()
    .collection('event_participants')
    .where('event_id', '==', eventId)
    .where('uid', '==', uid)
    .get();
  if (participantSnap.empty) throw new HttpsError('not-found', 'Participant not found.');
  const now = new Date().toISOString();
  const participantRefs = participantSnap.docs.map((doc) => doc.ref);
  const matchSnap = await db().collection('matches').where('event_id', '==', eventId).get();
  const affected = [];
  for (const doc of matchSnap.docs) {
    const match = doc.data();
    if (!['singles', 'doubles'].includes(match.category) || match.status === 'complete') continue;
    if (![match.player_1_uid, match.player_2_uid].includes(uid)) continue;
    const opponentUid = match.player_1_uid === uid ? match.player_2_uid : match.player_1_uid;
    if (!opponentUid) continue;
    const opponentName = match.player_1_uid === uid ? match.player_2_name : match.player_1_name;
    await db().runTransaction(async (tx) => {
      const currentSnap = await tx.get(doc.ref);
      const current = currentSnap.data();
      if (!current || current.status === 'complete') return;
      let nextRef = null;
      let next = null;
      if (current.format !== 'rr' && current.next_match_id) {
        const nextSnap = await tx.get(
          db().collection('matches').where('event_id', '==', eventId).where('match_id', '==', current.next_match_id),
        );
        next = nextSnap.docs.find((candidate) => (candidate.data().zone ?? null) === (current.zone ?? null));
        nextRef = next?.ref || null;
      }
      const patch = {
        winner_uid: opponentUid,
        winner_name: opponentName,
        status: 'complete',
        walkover: true,
        withdrawal_walkover: true,
        completed_at: now,
        result_at: now,
        set_1_player_1: 0,
        set_1_player_2: 0,
        set_2_player_1: 0,
        set_2_player_2: 0,
        set_3_player_1: 0,
        set_3_player_2: 0,
      };
      tx.update(doc.ref, patch);
      const rr = current.format === 'rr' && current.round === 'RR';
      const points = rr ? 1 : withdrawalAward(current.round);
      tx.set(db().doc(`stats/${opponentUid}`), { leaguePoints26: FieldValue.increment(rr ? 1 : 0) }, { merge: true });
      tx.set(db().doc(`stats/${uid}`), { leaguePoints26: FieldValue.increment(points) }, { merge: true });
      // Knockout advancement remains in the official result shape: the opponent occupies the
      // next match slot, while played downstream matches are never overwritten.
      if (!rr && nextRef && next && next.data().status !== 'complete') {
        const slot = current.next_slot === 'player_2' ? 'player_2' : 'player_1';
        tx.update(nextRef, { [`${slot}_uid`]: opponentUid, [`${slot}_name`]: opponentName });
      }
    });
    affected.push({ match, opponentUid, opponentName });
  }
  await Promise.all(
    participantRefs.map((ref) =>
      ref.update({
        status: 'withdrawn',
        withdrawn_reason: reason,
        withdrawn_note: String(note).slice(0, 500),
        withdrawn_at: now,
        withdrawn_by: actorUid === uid ? 'self' : actorUid,
      }),
    ),
  );
  const recipients = new Set([
    uid,
    event.creator_id,
    ...(event.organizer_ids || []),
    ...affected.map((entry) => entry.opponentUid),
  ]);
  await notify([...recipients].filter(Boolean), {
    type: 'event_participant_withdrawn',
    title: `A player withdraws from ${event.title || 'the event'}`,
    body: affected.length
      ? 'Unplayed matches were recorded as walkovers. Played matches were left untouched.'
      : 'The player remains registered and unplaced.',
    link: `/tournament?event=${eventId}`,
  });
  return { withdrawn: true, affectedMatches: affected.length };
}

exports.withdrawalAward = withdrawalAward;
exports.withdrawParticipant = withdrawParticipant;
exports.withdrawEventParticipant = onCall({ region: REGION }, async (request) => {
  const actorUid = requireAuth(request);
  const eventId = String(request.data?.eventId || '').trim();
  const uid = String(request.data?.uid || actorUid).trim();
  if (!eventId || !uid) throw new HttpsError('invalid-argument', 'Event and participant are required.');
  try {
    return await withdrawParticipant({
      eventId,
      uid,
      actorUid,
      reason: request.data?.reason,
      note: request.data?.note,
    });
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    logger.error('participant withdrawal failed', { eventId, uid, error: error.message });
    throw new HttpsError('internal', 'Could not complete withdrawal.');
  }
});
