const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { REGION, SUPER_ADMIN_UID } = require('./lib/constants');
const { requireAuth, optionalTrimmedString, requireTrimmedString } = require('./lib/callable');

const db = () => admin.firestore();
const isManager = (event, uid) =>
  uid === SUPER_ADMIN_UID || event?.creator_id === uid || (event?.organizer_ids || []).includes(uid);

exports.reviewTaskClaim = onCall({ region: REGION }, async (request) => {
  const reviewerUid = requireAuth(request);
  const id = requireTrimmedString(request.data?.id, 'Claim is required.');
  const approve = request.data?.approve === true;
  const reviewerNote = optionalTrimmedString(request.data?.reviewer_note, { maxLength: 500 });
  const ref = db().doc(`task_claims/${id}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Claim not found.');
  const claim = snap.data();
  if (claim.type === 'ambassador') throw new HttpsError('failed-precondition', 'Ambassador claims are auto-approved.');
  const eventId = claim.event_id;
  if (!eventId) throw new HttpsError('failed-precondition', 'This claim is missing its event.');
  const eventSnap = await db().doc(`events/${eventId}`).get();
  if (!eventSnap.exists || !isManager(eventSnap.data(), reviewerUid)) {
    throw new HttpsError('permission-denied', 'Only the event organizer can review this claim.');
  }
  if (claim.status !== 'pending') throw new HttpsError('failed-precondition', 'This claim has already been reviewed.');
  await ref.update({
    status: approve ? 'approved' : 'rejected',
    reviewed_at: new Date().toISOString(),
    reviewed_by: reviewerUid,
    ...(reviewerNote ? { reviewer_note: reviewerNote } : {}),
  });
  return { ok: true };
});
