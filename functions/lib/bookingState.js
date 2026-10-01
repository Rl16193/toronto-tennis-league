/**
 * The booking lifecycle, shared by bookings.js and rewards.js (redeeming points opens a booking).
 *
 *   lead (New) → in_progress (racquet received / lesson confirmed) → completed
 *   lead → cancelled (member cancels or provider declines)
 *
 * Both wait on the member before completing: Mark ready / Mark done stamps `completion_requested_at`
 * and the member answers "ready for pickup. Did you collect it?" or "Did your lesson happen?".
 * A booking paid by points carries its coupon (`redemption_code`); cancelling it sends the points to
 * an organizer's review (`refund: 'pending'`, reviewRedemption). See CLAUDE.md, "Bookings".
 * Group lessons (sub_category group) skip start: the coach seats New bookings in a group.
 */
const { HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { Timestamp } = require('firebase-admin/firestore');
const { notify } = require('./notify');

const db = () => admin.firestore();

const OPEN_BOOKING_STATUSES = ['lead', 'in_progress'];
const isGroup = (b) => b.sub_category === 'group';

/** A real, active catalog service with a provider. Price and provider always come from here, never the client. */
function assertBookable(serviceSnap) {
  const s = serviceSnap.exists ? serviceSnap.data() : null;
  if (!s) throw new HttpsError('not-found', 'That service no longer exists.');
  if (s.active === false) throw new HttpsError('failed-precondition', 'That service is no longer available.');
  if (typeof s.provider_id !== 'string' || !s.provider_id) {
    throw new HttpsError('failed-precondition', 'That service has no provider.');
  }
  if (s.category !== 'stringing' && s.category !== 'coaching') {
    throw new HttpsError('failed-precondition', 'That service can’t be booked.');
  }
  return { ...s, id: serviceSnap.id };
}

/** Inside a transaction: one open booking per member per service. */
async function assertNoOpenBooking(tx, uid, serviceId) {
  const snap = await tx.get(
    db().collection('bookings').where('uid', '==', uid).where('service_id', '==', serviceId),
  );
  if (snap.docs.some((d) => OPEN_BOOKING_STATUSES.includes(d.data().status))) {
    throw new HttpsError('already-exists', 'You already have an open booking for this.');
  }
}

const STEPS = {
  start: (b) => b.status === 'lead',
  decline: (b) => b.status === 'lead',
  // A group lesson member may also leave a group, until the coach marks the lesson done.
  cancel: (b) => b.status === 'lead' || (isGroup(b) && b.status === 'in_progress' && !b.completion_requested_at),
  finish: (b) => b.status === 'in_progress' && !b.completion_requested_at,
  confirm: (b) => b.status === 'in_progress' && !!b.completion_requested_at,
};

function assertCan(booking, step) {
  if (!STEPS[step](booking)) {
    throw new HttpsError('failed-precondition', 'This booking has already moved on.');
  }
}

/** A full bookings doc (every field present, typed empties where not used). */
function newBooking({ service, uid, userName, price, points, code }) {
  const now = Timestamp.now();
  return {
    category: service.category,
    sub_category: service.sub_category || service.category,
    service_id: service.id,
    provider_id: service.provider_id,
    uid,
    user_name: userName,
    payment: points > 0 ? 'points' : 'price',
    price: typeof price === 'number' ? price : 0,
    points: typeof points === 'number' ? points : 0,
    redemption_code: code || '',
    status: 'lead',
    lesson_group: 0,
    started_at: null,
    completion_requested_at: null,
    completed_at: null,
    cancelled_at: null,
    cancelled_by: '',
    cancel_reason: '',
    refund: 'none',
    reviewed_by: '',
    created_at: now,
    updated_at: now,
  };
}

/**
 * A group lesson takes one redeemed booking at a time: `redeem_booking_id` on the service blocks
 * Redeem for everyone else until that booking completes or is cancelled. Call after the reads.
 */
function releaseRedeem(tx, serviceRef, service, bookingId) {
  if (service.redeem_booking_id === bookingId) tx.update(serviceRef, { redeem_booking_id: '', updated_at: Timestamp.now() });
}

/**
 * Cancels a booking inside a transaction (reads before writes). A booking paid by points goes to the
 * organizer's refund review instead of refunding here. Returns true when it did.
 */
async function cancelInTx(tx, bookingRef, booking, by, reason) {
  const now = Timestamp.now();
  const refund = booking.payment === 'points' && booking.points > 0;
  const serviceRef = isGroup(booking) ? db().doc(`services/${booking.service_id}`) : null;
  const service = serviceRef ? await tx.get(serviceRef) : null;
  if (service && service.exists) releaseRedeem(tx, serviceRef, service.data(), bookingRef.id);
  tx.update(bookingRef, {
    status: 'cancelled', cancelled_at: now, cancelled_by: by, cancel_reason: reason,
    refund: refund ? 'pending' : 'none', updated_at: now,
  });
  return refund;
}

/** The service title and provider name a booking's alerts show (read from services / providers). */
async function labelsFor(booking) {
  const [s, p] = await Promise.all([
    db().doc(`services/${booking.service_id}`).get(),
    db().doc(`providers/${booking.provider_id}`).get(),
  ]);
  const offer = (s.exists && s.data().offer) || 'your booking';
  const provider = (p.exists && p.data().name) || (s.exists && s.data().provider_name) || 'the provider';
  return { offer, provider };
}

/** Tells the provider's accounts about a new booking, with the member as the contact on the alert. */
async function notifyNewBooking(providerUids, booking) {
  const coaching = booking.category === 'coaching';
  const { offer } = await labelsFor(booking);
  await notify(providerUids, {
    type: 'booking_created',
    title: coaching ? 'New lesson booking' : 'New stringing job',
    body: `${booking.user_name || 'A member'} booked ${offer}${booking.points ? ` with ${booking.points} points` : ''}.`,
    link: '/profile?dash=provider',
    counterpart_uid: booking.uid,
    counterpart_name: booking.user_name,
  });
}

module.exports = {
  OPEN_BOOKING_STATUSES,
  isGroup,
  assertBookable,
  assertNoOpenBooking,
  assertCan,
  newBooking,
  releaseRedeem,
  cancelInTx,
  labelsFor,
  notifyNewBooking,
};
