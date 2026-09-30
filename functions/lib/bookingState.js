/**
 * The booking lifecycle, shared by bookings.js and rewards.js (redeeming points opens a booking).
 *
 *   lead (New) → in_progress (racquet received / lesson confirmed) → completed
 *   lead → cancelled (member cancels or provider declines)
 *
 * Both wait on the member before completing: Mark ready / Mark done stamps `completion_requested_at`
 * and the member answers "ready for pickup. Did you collect it?" or "Did your lesson happen?".
 * Points only come back through an organizer's review (reviewRedemption). See CLAUDE.md, "Bookings".
 * Group lessons skip start: the coach seats New bookings in a group (bookings.js lessonGroup).
 */
const { HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { FieldValue } = require('firebase-admin/firestore');
const { notify } = require('./notify');

const db = () => admin.firestore();

const OPEN_BOOKING_STATUSES = ['lead', 'in_progress'];

/** A real, active catalog offer with a provider. Price and provider always come from here, never the client. */
function assertBookable(offerSnap) {
  const o = offerSnap.exists ? offerSnap.data() : null;
  if (!o || o.type !== 'offer') throw new HttpsError('not-found', 'That service no longer exists.');
  if (o.active === false) throw new HttpsError('failed-precondition', 'That service is no longer available.');
  if (typeof o.provider_id !== 'string' || !o.provider_id) {
    throw new HttpsError('failed-precondition', 'That service has no provider.');
  }
  // A missing category reads as stringing, the same default the Services page uses.
  const category = o.category || 'stringing';
  if (category !== 'stringing' && category !== 'coaching') {
    throw new HttpsError('failed-precondition', 'That service can’t be booked.');
  }
  return { ...o, id: offerSnap.id, category };
}

/** Inside a transaction: one open booking per member per offer. */
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
  cancel: (b) => b.status === 'lead'
    || (!!b.group_lesson && b.status === 'in_progress' && !b.completion_requested_at),
  finish: (b) => b.status === 'in_progress' && !b.completion_requested_at,
  confirm: (b) => b.status === 'in_progress' && !!b.completion_requested_at,
};

function assertCan(booking, step) {
  if (!STEPS[step](booking)) {
    throw new HttpsError('failed-precondition', 'This booking has already moved on.');
  }
}

function newBooking({ id, offer, uid, userName, price, points, code, providerUids }) {
  const now = new Date().toISOString();
  return {
    id,
    service_id: offer.id,
    offer: offer.offer || '',
    category: offer.category,
    provider_id: offer.provider_id,
    provider_name: offer.provider_name || '',
    // The provider's member accounts. Booking connects the member to each of them, so the member's
    // dash reads contacts/{uid} straight from here rather than re-resolving provider_id.
    provider_uids: Array.isArray(providerUids) ? providerUids : [],
    ...(offer.group_lesson ? { group_lesson: true } : {}),
    uid,
    user_name: userName,
    price: typeof price === 'number' ? price : 0,
    points: typeof points === 'number' ? points : 0,
    ...(code ? { redemption_code: code } : {}),
    status: 'lead',
    created_at: now,
    updated_at: now,
  };
}

/**
 * A group lesson takes one redeemed booking at a time: `redeem_booking_id` on the offer blocks
 * Redeem for everyone else until that booking completes or is cancelled. Call after the reads.
 */
function releaseRedeem(tx, offerRef, offer, bookingId) {
  if (offer.redeem_booking_id === bookingId) tx.update(offerRef, { redeem_booking_id: FieldValue.delete() });
}

/**
 * Cancels a New booking inside a transaction (reads before writes). A redeemed booking's coupon
 * goes to the organizer's review queue instead of refunding here. Returns true when it did.
 */
async function cancelInTx(tx, bookingRef, booking, by, reason) {
  const now = new Date().toISOString();
  const couponRef = booking.redemption_code && booking.points > 0
    ? db().doc(`redemptions/${booking.redemption_code}`)
    : null;
  const coupon = couponRef ? await tx.get(couponRef) : null;
  const refund = !!coupon && coupon.exists && coupon.data().status === 'active';
  const offerRef = booking.group_lesson ? db().doc(`tasks/${booking.service_id}`) : null;
  const offer = offerRef ? await tx.get(offerRef) : null;

  if (offer && offer.exists) releaseRedeem(tx, offerRef, offer.data(), booking.id);
  if (refund) {
    tx.update(couponRef, { status: 'cancel_requested', cancel_requested_at: now, cancel_reason: reason });
  }
  tx.update(bookingRef, {
    status: 'cancelled',
    cancelled_at: now,
    cancelled_by: by,
    ...(refund ? { refund: 'pending' } : {}),
    updated_at: now,
  });
  return refund;
}

/** Tells the provider's accounts about a new booking, with the member as the contact on the alert. */
async function notifyNewBooking(providerUids, booking) {
  const coaching = booking.category === 'coaching';
  await notify(providerUids, {
    type: 'booking_created',
    title: coaching ? 'New lesson booking' : 'New stringing job',
    body: `${booking.user_name || 'A member'} booked ${booking.offer}${booking.points ? ` with ${booking.points} points` : ''}.`,
    link: '/profile?dash=provider',
    counterpart_uid: booking.uid,
    counterpart_name: booking.user_name,
  });
}

module.exports = {
  OPEN_BOOKING_STATUSES,
  assertBookable,
  assertNoOpenBooking,
  assertCan,
  newBooking,
  releaseRedeem,
  cancelInTx,
  notifyNewBooking,
};
