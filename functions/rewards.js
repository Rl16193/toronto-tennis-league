/**
 * Redeemable points and rewards.
 *
 * redeemable = leaguePoints26 (stats/{uid}) + earned RS points (tasks/{uid}) − offers/{uid}.pointsSpent.
 * Redeeming NEVER touches the earning counters, so leaderboards and match history are unaffected.
 *
 * Everything that moves points runs here — the client cannot write `offers/*` or `redemptions/*`
 * at all. Each callable does its read-modify-write in a transaction so a double-tap can't redeem
 * twice. Coupon codes ARE the redemption doc id, so uniqueness comes from create-if-absent
 * semantics rather than a query — no race window.
 *
 * Redeeming also opens a booking (bookings.js). A coupon tied to one moves with the booking: used
 * when the provider starts the job, and into an organizer's review if the booking is cancelled.
 *
 * Deploy: firebase deploy --only functions
 */
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');
const { REGION } = require('./lib/constants');
const { earnedRsPoints } = require('./lib/points');
const { notify, organizerUids } = require('./lib/notify');
const { isOrganizer, providerIdFor } = require('./lib/roles');
const { normalizeCouponCode, requireAuth, requireDocId } = require('./lib/callable');
const { recordServiceLead } = require('./lib/serviceLeads');
const { OPEN_BOOKING_STATUSES, assertNoOpenBooking, newBooking, notifyNewBooking } = require('./lib/bookingState');

const db = () => admin.firestore();
const nowISO = () => new Date().toISOString();

// Ambiguous glyphs (0/O, 1/I) left out so a code read aloud or off a phone screen can't be
// mistyped at the counter.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const randomCode = () => {
  const pick = (n) => Array.from({ length: n }, () =>
    CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('');
  return `RS-${pick(4)}-${pick(2)}`;
};

// Coupons still in play. Mirrors OPEN_STATUSES in src/features/services/types.ts.
const OPEN = ['active', 'flagged', 'cancel_requested'];

// ─── Shared helpers ─────────────────────────────────────────────────────────────────────────

/** Reads the three inputs to a player's redeemable balance inside a transaction. */
async function readBalance(tx, uid) {
  const [statsSnap, progressSnap, spentSnap] = await Promise.all([
    tx.get(db().doc(`stats/${uid}`)),
    tx.get(db().doc(`tasks/${uid}`)),
    tx.get(db().doc(`offers/${uid}`)),
  ]);
  const league = statsSnap.exists && typeof statsSnap.data().leaguePoints26 === 'number'
    ? statsSnap.data().leaguePoints26 : 0;
  const rs = earnedRsPoints(progressSnap.exists ? progressSnap.data() : null);
  const spent = spentSnap.exists && typeof spentSnap.data().pointsSpent === 'number'
    ? spentSnap.data().pointsSpent : 0;
  const earned = Math.max(0, Math.round(league + rs));
  return { earned, spent, balance: earned - spent };
}

// ─── Redeem ─────────────────────────────────────────────────────────────────────────────────

/**
 * Spend points on a catalog offer and open a booking with its provider in the same transaction.
 * Returns { code, bookingId }. Rejects if the offer can't be booked, the balance is short, or the
 * player already holds an open coupon or booking for the same offer.
 */
exports.redeemReward = onCall({ region: REGION }, async (request) => {
  const uid = requireAuth(request);
  const rewardId = requireDocId(request.data && request.data.rewardId, 'Missing reward.');
  // The same checks and contact sharing as bookService (lib/serviceLeads.js).
  const { offer: reward, providerUids, userName } = await recordServiceLead(uid, rewardId, 'You can’t redeem your own service.');
  const cost = typeof reward.points_cost === 'number' ? reward.points_cost : 25;

  // Retry on the (vanishingly unlikely) case of a code collision.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode();
    const redemptionRef = db().doc(`redemptions/${code}`);
    const bookingRef = db().collection('bookings').doc();
    try {
      const result = await db().runTransaction(async (tx) => {
        const existing = await tx.get(redemptionRef);
        if (existing.exists) return null; // collision — caller retries with a new code

        // readBalance reads offers/{uid}, which every redeem and booking by this member also
        // writes, so two taps at once collide and the retry sees the first coupon.
        const { earned, spent, balance } = await readBalance(tx, uid);
        const forOffer = await tx.get(db().collection('redemptions')
          .where('uid', '==', uid)
          .where('reward_id', '==', rewardId));
        if (forOffer.docs.some((d) => OPEN.includes(d.data().status))) {
          throw new HttpsError('already-exists', 'You already have an open coupon for this offer.');
        }
        await assertNoOpenBooking(tx, uid, reward.id);
        // A group lesson takes one redeemed booking at a time (lib/bookingState.js releaseRedeem).
        const offerRef = db().doc(`tasks/${rewardId}`);
        if (reward.group_lesson) {
          const held = (await tx.get(offerRef)).get('redeem_booking_id');
          const holder = held ? await tx.get(db().doc(`bookings/${held}`)) : null;
          if (holder && holder.exists && OPEN_BOOKING_STATUSES.includes(holder.data().status)) {
            throw new HttpsError('failed-precondition', 'The discount for this lesson has been redeemed.');
          }
        }
        if (balance < cost) {
          throw new HttpsError('failed-precondition',
            `You need ${cost} points to redeem this — you have ${balance}.`);
        }

        const booking = newBooking({
          id: bookingRef.id,
          offer: reward,
          uid,
          userName,
          price: typeof reward.discounted_price === 'number' ? reward.discounted_price : reward.total_price,
          points: cost,
          code,
          providerUids,
        });
        tx.set(redemptionRef, {
          code,
          reward_id: rewardId,
          stringer_id: reward.provider_id || '',
          stringer_name: reward.provider_name || '',
          offer: reward.offer || '',
          discounted_price: reward.discounted_price ?? null,
          points_cost: cost,
          uid: uid,
          user_name: userName,
          status: 'active',
          booking_id: bookingRef.id,
          created_at: nowISO(),
        });
        tx.create(bookingRef, booking);
        if (reward.group_lesson) tx.update(offerRef, { redeem_booking_id: bookingRef.id });
        tx.set(db().doc(`offers/${uid}`), {
          uid: uid,
          pointsSpent: spent + cost,
          lastEarnedSnapshot: earned,
          updated_at: nowISO(),
        }, { merge: true });
        return booking;
      });

      if (result === null) continue; // collided, try another code
      logger.info(`Redemption ${code} — ${uid} spent ${cost} on ${rewardId}, booking ${result.id}`);
      await notifyNewBooking(providerUids, result);
      return { code, bookingId: result.id };
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      logger.error('redeemReward failed', err);
      throw new HttpsError('internal', 'Could not redeem right now. Try again.');
    }
  }
  throw new HttpsError('internal', 'Could not generate a coupon code. Try again.');
});

// ─── Mark used (stringer or organizer) ──────────────────────────────────────────────────────

/** Burns a coupon — the offer's stringer or an organizer. Transactional, so never used twice. */
exports.markCouponUsed = onCall({ region: REGION }, async (request) => {
  const uid = requireAuth(request);
  const code = normalizeCouponCode(request.data && request.data.code);

  const [organizer, myProviderId] = await Promise.all([isOrganizer(uid), providerIdFor(uid)]);
  const ref = db().doc(`redemptions/${code}`);

  const redemption = await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'No coupon with that code.');
    const d = snap.data();

    if (!organizer && d.stringer_id !== myProviderId) {
      throw new HttpsError('permission-denied', 'That coupon isn’t for your shop.');
    }
    // A booking's coupon moves with the booking (bookings.js), never on its own.
    if (d.booking_id) throw new HttpsError('failed-precondition', 'That coupon belongs to a booking. Use the Provider Dash.');
    if (d.status === 'used') throw new HttpsError('failed-precondition', 'That coupon was already used.');
    if (d.status === 'cancelled') throw new HttpsError('failed-precondition', 'That coupon was cancelled.');

    tx.update(ref, { status: 'used', used_at: nowISO(), used_by: uid });
    return d;
  });

  await notify(redemption.uid, {
    type: 'reward_used',
    title: 'Reward redeemed',
    body: `${redemption.offer} at ${redemption.stringer_name} is marked as used.`,
    link: '/marketplace',
  }).catch(() => { /* notification is best-effort */ });

  return { ok: true };
});

// ─── Flag a problem (stringer) ──────────────────────────────────────────────────────────────

/** Stringer flags a coupon for the organizer to look at — a no-show, a disputed code, etc. */
exports.flagCoupon = onCall({ region: REGION }, async (request) => {
  const uid = requireAuth(request);
  const code = normalizeCouponCode(request.data && request.data.code);
  const note = typeof (request.data && request.data.note) === 'string' ? request.data.note.trim() : '';

  const [organizer, myProviderId] = await Promise.all([isOrganizer(uid), providerIdFor(uid)]);
  const ref = db().doc(`redemptions/${code}`);

  const redemption = await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'No coupon with that code.');
    const d = snap.data();
    if (!organizer && d.stringer_id !== myProviderId) {
      throw new HttpsError('permission-denied', 'That coupon isn’t for your shop.');
    }
    if (d.booking_id) throw new HttpsError('failed-precondition', 'That coupon belongs to a booking. Use the Provider Dash.');
    if (d.status === 'cancelled') throw new HttpsError('failed-precondition', 'That coupon was cancelled.');
    tx.update(ref, {
      status: 'flagged',
      flagged_at: nowISO(),
      flagged_by: uid,
      ...(note ? { flag_note: note } : {}),
    });
    return d;
  });

  const organizers = await organizerUids().catch(() => []);
  await notify(organizers, {
    type: 'reward_flagged',
    title: 'Coupon flagged',
    body: `${redemption.stringer_name} flagged ${code} (${redemption.user_name}).`,
    link: '/profile?dash=organizer',
  }).catch(() => { /* best-effort */ });

  return { ok: true };
});

// ─── Cancellation (player requests, organizer decides) ──────────────────────────────────────

/** Player asks for a redemption to be undone. Only possible while the coupon is unused. */
exports.requestCancellation = onCall({ region: REGION }, async (request) => {
  const uid = requireAuth(request);
  const code = normalizeCouponCode(request.data && request.data.code);
  const reason = typeof (request.data && request.data.reason) === 'string' ? request.data.reason.trim() : '';

  const ref = db().doc(`redemptions/${code}`);
  const redemption = await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'No coupon with that code.');
    const d = snap.data();
    if (d.uid !== uid) throw new HttpsError('permission-denied', 'That isn’t your coupon.');
    if (d.booking_id) throw new HttpsError('failed-precondition', 'Cancel the booking instead.');
    if (d.status === 'used') throw new HttpsError('failed-precondition', 'That coupon has already been used.');
    if (d.status === 'cancelled') throw new HttpsError('failed-precondition', 'That coupon is already cancelled.');
    if (d.status === 'cancel_requested') throw new HttpsError('failed-precondition', 'A cancellation is already pending.');
    tx.update(ref, {
      status: 'cancel_requested',
      cancel_requested_at: nowISO(),
      ...(reason ? { cancel_reason: reason } : {}),
    });
    return d;
  });

  const organizers = await organizerUids().catch(() => []);
  await notify(organizers, {
    type: 'reward_cancel_requested',
    title: 'Cancellation requested',
    body: `${redemption.user_name} wants to cancel ${code} (${redemption.offer}).`,
    link: '/profile?dash=organizer',
  }).catch(() => { /* best-effort */ });

  return { ok: true };
});

/**
 * Organizer decides a cancellation (or resolves a flag). Approving refunds by decrementing
 * pointsSpent — the earning counters were never touched, so nothing else moves. For a coupon tied
 * to a cancelled booking, the decision is recorded on the booking too.
 */
exports.reviewRedemption = onCall({ region: REGION }, async (request) => {
  const uid = requireAuth(request);
  if (!(await isOrganizer(uid))) throw new HttpsError('permission-denied', 'Organizers only.');

  const code = normalizeCouponCode(request.data && request.data.code);
  const approve = request.data && request.data.approve === true;
  const note = typeof (request.data && request.data.note) === 'string' ? request.data.note.trim() : '';

  const ref = db().doc(`redemptions/${code}`);
  const redemption = await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'No coupon with that code.');
    const d = snap.data();
    // Approving refunds, so it needs a requested cancellation. Declining also resolves a flag.
    const reviewable = approve
      ? d.status === 'cancel_requested'
      : d.status === 'cancel_requested' || d.status === 'flagged';
    if (!reviewable) throw new HttpsError('failed-precondition', 'That coupon has nothing waiting for review.');

    const bookingRef = d.booking_id ? db().doc(`bookings/${d.booking_id}`) : null;
    const bookingSnap = bookingRef ? await tx.get(bookingRef) : null;
    if (bookingRef) {
      const b = bookingSnap.exists ? bookingSnap.data() : null;
      if (!b || b.status !== 'cancelled' || b.refund !== 'pending') {
        throw new HttpsError('failed-precondition', 'That booking isn’t waiting on a refund.');
      }
    }
    const spentRef = db().doc(`offers/${d.uid}`);
    const spentSnap = approve ? await tx.get(spentRef) : null;
    const now = nowISO();

    if (bookingRef) {
      tx.update(bookingRef, { refund: approve ? 'approved' : 'declined', refund_reviewed_at: now, updated_at: now });
    }

    if (!approve) {
      // A legacy coupon goes back to being spendable at the counter. A cancelled booking's coupon
      // has nothing left to spend on, so it closes with the points kept.
      tx.update(ref, {
        status: bookingRef ? 'refund_declined' : 'active',
        reviewed_at: now,
        reviewed_by: uid,
        ...(note ? { reviewer_note: note } : {}),
      });
      return d;
    }

    // Approved — refund, from the spend counter read above.
    const spent = spentSnap.exists && typeof spentSnap.data().pointsSpent === 'number'
      ? spentSnap.data().pointsSpent : 0;
    const cost = typeof d.points_cost === 'number' ? d.points_cost : 25;

    tx.update(ref, {
      status: 'cancelled',
      cancelled_at: now,
      reviewed_by: uid,
      ...(note ? { reviewer_note: note } : {}),
    });
    tx.set(spentRef, {
      uid: d.uid,
      pointsSpent: Math.max(0, spent - cost),
      updated_at: now,
    }, { merge: true });
    return d;
  });

  const forBooking = !!redemption.booking_id;
  await notify(redemption.uid, {
    type: approve ? 'reward_cancelled' : 'reward_cancel_declined',
    title: approve ? 'Points refunded' : forBooking ? 'Refund declined' : 'Cancellation declined',
    body: approve
      ? `${redemption.points_cost} points are back in your balance.`
      : forBooking
        ? `The ${redemption.points_cost} points for ${redemption.offer} stay spent.`
        : `Your coupon for ${redemption.offer} is still active.`,
    link: '/marketplace',
  }).catch(() => { /* best-effort */ });

  return { ok: true };
});

