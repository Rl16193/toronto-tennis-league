const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { REGION, SUPER_ADMIN_UID } = require('./lib/constants');
const { requireAuth, requireTrimmedString } = require('./lib/callable');
const { providerForUid } = require('./lib/providers');
const { assertBookingStatus, assertCompletionRequested } = require('./lib/bookingState');
const { notify } = require('./lib/notify');

const db = () => admin.firestore();
const now = () => new Date().toISOString();

async function loadBooking(code, tx) {
  const ref = db().doc(`bookings/${code}`);
  const snap = await tx.get(ref);
  if (!snap.exists) throw new HttpsError('not-found', 'Booking not found.');
  return { ref, data: snap.data() };
}

const providerOwns = (booking, provider) =>
  !!provider && (booking.provider_id === provider.id || booking.provider_id === provider.ref?.id);

exports.book = onCall({ region: REGION }, async (request) => {
  const uid = requireAuth(request);
  const serviceId = requireTrimmedString(request.data?.service_id, 'Service is required.');
  const providerId = requireTrimmedString(request.data?.provider_id, 'Provider is required.');
  const note = typeof request.data?.note === 'string' ? request.data.note.trim().slice(0, 500) : '';
  const [service, provider, user] = await Promise.all([
    db().doc(`services/${serviceId}`).get(),
    db().doc(`providers/${providerId}`).get(),
    db().doc(`users/${uid}`).get(),
  ]);
  if (!service.exists || service.data()?.active === false) throw new HttpsError('not-found', 'Service not found.');
  if (service.data()?.provider_id !== providerId || !provider.exists) {
    throw new HttpsError('failed-precondition', 'That service is no longer available from this provider.');
  }
  const userName = user.exists ? String(user.data().name || '') : '';
  const ref = db().collection('bookings').doc();
  const booking = {
    id: ref.id,
    service_id: serviceId,
    provider_id: providerId,
    uid,
    user_name: userName,
    status: 'lead',
    ...(note ? { note } : {}),
    created_at: now(),
    updated_at: now(),
  };
  await ref.create(booking);
  return { ok: true, booking };
});

exports.racquetDropped = onCall({ region: REGION }, async (request) => {
  const uid = requireAuth(request);
  const id = requireTrimmedString(request.data?.booking_id, 'Booking is required.');
  const provider = await providerForUid(uid);
  const ref = db().doc(`bookings/${id}`);
  const result = await db().runTransaction(async (tx) => {
    const { data } = await loadBooking(id, tx);
    if (!providerOwns({ ...data, provider_id: data.provider_id }, provider) && uid !== SUPER_ADMIN_UID) {
      throw new HttpsError('permission-denied', 'Only the assigned provider can update this booking.');
    }
    assertBookingStatus(data.status, 'drop');
    tx.update(ref, { status: 'in_progress', dropped_at: now(), updated_at: now() });
    return data;
  });
  await notify(result.uid, {
    type: 'booking_started',
    title: 'Your racquet is in progress',
    link: '/marketplace',
  }).catch(() => {});
  return { ok: true };
});

exports.requestCompletion = onCall({ region: REGION }, async (request) => {
  const uid = requireAuth(request);
  const id = requireTrimmedString(request.data?.booking_id, 'Booking is required.');
  const provider = await providerForUid(uid);
  const ref = db().doc(`bookings/${id}`);
  const result = await db().runTransaction(async (tx) => {
    const { data } = await loadBooking(id, tx);
    if (!providerOwns({ ...data, provider_id: data.provider_id }, provider) && uid !== SUPER_ADMIN_UID) {
      throw new HttpsError('permission-denied', 'Only the assigned provider can complete this booking.');
    }
    assertBookingStatus(data.status, 'requestCompletion');
    tx.update(ref, { status: 'in_progress', completion_requested_at: now(), updated_at: now() });
    return data;
  });
  await notify(result.uid, {
    type: 'booking_completion_requested',
    title: 'Is your racquet back?',
    link: '/marketplace',
  }).catch(() => {});
  return { ok: true };
});

exports.confirmCompletion = onCall({ region: REGION }, async (request) => {
  const uid = requireAuth(request);
  const id = requireTrimmedString(request.data?.booking_id, 'Booking is required.');
  const yes = request.data?.confirmed === true;
  const ref = db().doc(`bookings/${id}`);
  const result = await db().runTransaction(async (tx) => {
    const { data } = await loadBooking(id, tx);
    if (data.uid !== uid) throw new HttpsError('permission-denied', 'Only the member can confirm completion.');
    assertCompletionRequested(data);
    tx.update(ref, {
      status: yes ? 'completed' : 'in_progress',
      ...(yes ? { completed_at: now() } : { completion_requested_at: null }),
      updated_at: now(),
    });
    return data;
  });
  if (!yes) {
    const provider = await db().doc(`providers/${result.provider_id}`).get();
    const recipients = [provider.data()?.member_uid, SUPER_ADMIN_UID].filter(Boolean);
    await notify(recipients, {
      type: 'booking_completion_declined',
      title: 'Member says the racquet is not back',
      body: `${result.user_name || 'A member'} cancelled job completion.`,
      link: '/tasks?review=bookings',
    }).catch(() => {});
  }
  return { ok: true, status: yes ? 'completed' : 'in_progress' };
});

exports.cancelLead = onCall({ region: REGION }, async (request) => {
  const uid = requireAuth(request);
  const id = requireTrimmedString(request.data?.booking_id, 'Booking is required.');
  const ref = db().doc(`bookings/${id}`);
  await db().runTransaction(async (tx) => {
    const { data } = await loadBooking(id, tx);
    if (data.uid !== uid) throw new HttpsError('permission-denied', 'Only the member can cancel this booking.');
    assertBookingStatus(data.status, 'cancelLead');
    tx.update(ref, { status: 'cancelled', cancelled_at: now(), updated_at: now(), points_refunded: true });
  });
  return { ok: true };
});
