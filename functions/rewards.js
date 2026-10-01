/**
 * Redeemable points: redeem a service with points (opens a booking), and the organizer's refund review.
 *
 * redeemable = lifetime league points + stats.rsPoints − stats.pointsSpent, where
 * lifetime league points = Σ league_seasons.season_points + leaguePoints − leaguePointsPrev × 0.5
 * (the half carried into this season is spendable once). Redeeming NEVER touches the earning
 * counters, so leaderboards and match history are unaffected.
 *
 * A redemption IS a booking paid by points: the coupon code lives on the booking
 * (`redemption_code`), and a cancelled one waits for an organizer (`refund: 'pending'`).
 *
 * Deploy: firebase deploy --only functions
 */
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');
const { FieldValue, Timestamp } = require('firebase-admin/firestore');
const { REGION } = require('./lib/constants');
const { notify } = require('./lib/notify');
const { isOrganizer } = require('./lib/roles');
const { normalizeCouponCode, requireAuth, requireDocId } = require('./lib/callable');
const { recordServiceLead } = require('./lib/serviceLeads');
const { OPEN_BOOKING_STATUSES, isGroup, assertNoOpenBooking, newBooking, labelsFor, notifyNewBooking } = require('./lib/bookingState');

const db = () => admin.firestore();
const num = (v) => (typeof v === 'number' ? v : 0);

// Ambiguous glyphs (0/O, 1/I) left out so a code read aloud or off a phone screen can't be mistyped.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const randomCode = () => {
  const pick = (n) => Array.from({ length: n }, () =>
    CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('');
  return `RS-${pick(4)}-${pick(2)}`;
};

/** A member's redeemable balance, read inside a transaction (stats + their finished seasons). */
async function readBalance(tx, uid) {
  const [statsSnap, seasons] = await Promise.all([
    tx.get(db().doc(`stats/${uid}`)),
    tx.get(db().collection('league_seasons').where('uid', '==', uid)),
  ]);
  const s = statsSnap.exists ? statsSnap.data() : {};
  const pastSeasons = seasons.docs.reduce((sum, d) => sum + num(d.data().season_points), 0);
  const lifetimeLeague = pastSeasons + num(s.leaguePoints) - num(s.leaguePointsPrev) * 0.5;
  const earned = Math.max(0, Math.round(lifetimeLeague + num(s.rsPoints)));
  const spent = num(s.pointsSpent);
  return { earned, spent, balance: earned - spent };
}

/**
 * Spend points on a catalog service and open its booking in one transaction. Returns
 * { code, bookingId }. Rejects if the service can't be booked, the balance is short, or the member
 * already has an open booking for it.
 */
exports.redeemReward = onCall({ region: REGION }, async (request) => {
  const uid = requireAuth(request);
  const serviceId = requireDocId(request.data && request.data.rewardId, 'Missing reward.');
  const { service, providerUids, userName } = await recordServiceLead(uid, serviceId, 'You can’t redeem your own service.');
  const cost = typeof service.points_cost === 'number' ? service.points_cost : 25;

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode();
    const bookingRef = db().collection('bookings').doc();
    try {
      const result = await db().runTransaction(async (tx) => {
        const clash = await tx.get(db().collection('bookings').where('redemption_code', '==', code).limit(1));
        if (!clash.empty) return null; // collision — retry with a new code
        // readBalance reads stats/{uid}, which every redeem and booking by this member also writes,
        // so two taps at once collide and the retry sees the first booking.
        const { spent, balance } = await readBalance(tx, uid);
        await assertNoOpenBooking(tx, uid, service.id);
        const serviceRef = db().doc(`services/${serviceId}`);
        if (isGroup(service)) {
          const held = (await tx.get(serviceRef)).get('redeem_booking_id');
          const holder = held ? await tx.get(db().doc(`bookings/${held}`)) : null;
          if (holder && holder.exists && OPEN_BOOKING_STATUSES.includes(holder.data().status)) {
            throw new HttpsError('failed-precondition', 'The discount for this lesson has been redeemed.');
          }
        }
        if (balance < cost) throw new HttpsError('failed-precondition', `You need ${cost} points to redeem this — you have ${balance}.`);

        const booking = newBooking({
          service, uid, userName, points: cost, code,
          price: typeof service.discounted_price === 'number' ? service.discounted_price : service.total_price,
        });
        tx.create(bookingRef, booking);
        if (isGroup(service)) tx.update(serviceRef, { redeem_booking_id: bookingRef.id, updated_at: Timestamp.now() });
        tx.set(db().doc(`stats/${uid}`), { pointsSpent: spent + cost, updated_at: FieldValue.serverTimestamp() }, { merge: true });
        return booking;
      });
      if (result === null) continue;
      logger.info(`Redemption ${code} — ${uid} spent ${cost} on ${serviceId}, booking ${bookingRef.id}`);
      await notifyNewBooking(providerUids, result);
      return { code, bookingId: bookingRef.id };
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      logger.error('redeemReward failed', err);
      throw new HttpsError('internal', 'Could not redeem right now. Try again.');
    }
  }
  throw new HttpsError('internal', 'Could not generate a coupon code. Try again.');
});

/**
 * Organizer decides a points refund on a cancelled booking (found by its coupon code). Approving
 * lowers pointsSpent — the earning counters were never touched, so nothing else moves.
 */
exports.reviewRedemption = onCall({ region: REGION }, async (request) => {
  const uid = requireAuth(request);
  if (!(await isOrganizer(uid))) throw new HttpsError('permission-denied', 'Organizers only.');
  const code = normalizeCouponCode(request.data && request.data.code);
  const approve = request.data && request.data.approve === true;

  const booking = await db().runTransaction(async (tx) => {
    const found = await tx.get(db().collection('bookings').where('redemption_code', '==', code).limit(1));
    if (found.empty) throw new HttpsError('not-found', 'No coupon with that code.');
    const snap = found.docs[0];
    const b = snap.data();
    if (b.status !== 'cancelled' || b.refund !== 'pending') throw new HttpsError('failed-precondition', 'That booking isn’t waiting on a refund.');
    const statsRef = db().doc(`stats/${b.uid}`);
    const statsSnap = approve ? await tx.get(statsRef) : null;
    const now = Timestamp.now();
    tx.update(snap.ref, { refund: approve ? 'approved' : 'declined', reviewed_by: uid, updated_at: now });
    if (approve) {
      const spent = num(statsSnap.exists ? statsSnap.data().pointsSpent : 0);
      tx.set(statsRef, { pointsSpent: Math.max(0, spent - num(b.points)), updated_at: FieldValue.serverTimestamp() }, { merge: true });
    }
    return b;
  });

  const { offer } = await labelsFor(booking);
  await notify(booking.uid, {
    type: approve ? 'reward_cancelled' : 'reward_cancel_declined',
    title: approve ? 'Points refunded' : 'Refund declined',
    body: approve ? `${booking.points} points are back in your balance.` : `The ${booking.points} points for ${offer} stay spent.`,
    link: '/marketplace',
  }).catch(() => { /* best-effort */ });
  return { ok: true };
});
