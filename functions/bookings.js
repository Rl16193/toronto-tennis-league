/**
 * Service bookings: the job a member opens with a stringer or coach, at the regular price here
 * (bookService) or by redeeming points (rewards.js redeemReward). Clients can only read `bookings`;
 * every step is one of these callables. The lifecycle itself is lib/bookingState.js.
 *
 * Deploy: firebase deploy --only functions:bookService,functions:startBooking,functions:declineBooking,
 *   functions:cancelBooking,functions:finishBooking,functions:confirmBooking,functions:lessonGroup,
 *   functions:recordBooking
 */
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');
// From the subpath, not admin.firestore: the Functions emulator proxies admin.firestore as a bound
// function, which drops FieldValue.
const { FieldValue, Timestamp } = require('firebase-admin/firestore');
const { REGION, DAY_MS } = require('./lib/constants');
const { notify, organizerUids } = require('./lib/notify');
const { isOrganizer, providerIdFor, providerMemberUids } = require('./lib/roles');
const { requireAuth, requireDocId } = require('./lib/callable');
const { recordServiceLead } = require('./lib/serviceLeads');
const {
  isGroup, assertNoOpenBooking, assertCan, newBooking, releaseRedeem, cancelInTx, labelsFor, notifyNewBooking,
} = require('./lib/bookingState');
const { linkPlayers } = require('./connections');

const db = () => admin.firestore();

/**
 * Book a service at its regular price. The member's contacts are shared with the provider before
 * the booking is written, so the provider's contact buttons work the moment it arrives.
 */
exports.bookService = onCall({ region: REGION }, async (request) => {
  const uid = requireAuth(request);
  const serviceId = requireDocId(request.data && request.data.serviceId, 'Missing service.');
  const { service, providerUids, userName } = await recordServiceLead(uid, serviceId, 'You can’t book your own service.');

  const ref = db().collection('bookings').doc();
  const lockRef = db().doc(`stats/${uid}`);
  const booking = await db().runTransaction(async (tx) => {
    // Every booking and redeem by this member reads and writes stats/{uid}, so two taps at once
    // collide and the retry sees the first booking.
    await tx.get(lockRef);
    await assertNoOpenBooking(tx, uid, service.id);
    const b = newBooking({ service, uid, userName, price: service.total_price, points: 0 });
    tx.create(ref, b);
    // Every booking ever made, never taken back on cancel; orders a stringer's offers on Services.
    tx.update(db().doc(`services/${service.id}`), { booking_count: FieldValue.increment(1) });
    tx.set(lockRef, { updated_at: FieldValue.serverTimestamp() }, { merge: true });
    return b;
  });

  logger.info(`Booking ${ref.id}: ${uid} booked ${service.id}`);
  await notifyNewBooking(providerUids, booking);
  return { bookingId: ref.id };
});

/**
 * Loads a booking in a transaction, checks the caller and the step, and runs `write` (reads before
 * writes). Returns the booking as it was before the step, and whatever `write` returned.
 */
async function step(request, name, actor, write) {
  const uid = requireAuth(request);
  const bookingId = requireDocId(request.data && request.data.bookingId, 'Missing booking.');
  const providerId = actor === 'provider' ? await providerIdFor(uid) : null;
  const ref = db().doc(`bookings/${bookingId}`);

  const result = await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'That booking no longer exists.');
    const b = snap.data();
    if (actor === 'provider' && !(providerId && b.provider_id === providerId)) {
      throw new HttpsError('permission-denied', 'That booking isn’t for your shop.');
    }
    if (actor === 'member' && b.uid !== uid) throw new HttpsError('permission-denied', 'That isn’t your booking.');
    assertCan(b, name);
    const extra = await write(tx, ref, b, uid);
    return { booking: { ...b, id: bookingId }, extra };
  });
  return { uid, ...result };
}

/** Organizers review the refund; points only come back when they approve. */
async function notifyRefundReview(booking, what) {
  const [organizers, { offer }] = await Promise.all([organizerUids().catch(() => []), labelsFor(booking)]);
  await notify(organizers, {
    type: 'reward_cancel_requested',
    title: 'Refund to review',
    body: `${what} ${offer} for ${booking.user_name || 'a member'}. ${booking.points} points to refund.`,
    link: '/profile?dash=organizer',
  });
}

/** Provider: "Racquet received" or "Confirm lesson". A redeemed coupon counts as used from here. */
exports.startBooking = onCall({ region: REGION }, async (request) => {
  const { uid, booking } = await step(request, 'start', 'provider', async (tx, ref) => {
    const now = Timestamp.now();
    tx.update(ref, { status: 'in_progress', started_at: now, updated_at: now });
  });

  // A provider account linked after the booking was made still needs the member's contacts.
  await linkPlayers(booking.uid, uid, 'booking');
  const coaching = booking.category === 'coaching';
  const { offer, provider } = await labelsFor(booking);
  await notify(booking.uid, {
    type: 'booking_started',
    title: coaching ? 'Lesson confirmed' : 'Racquet received',
    body: coaching ? `${provider} confirmed your ${offer} lesson.` : `${provider} has your racquet for ${offer}.`,
    link: '/marketplace',
  });
  return { ok: true };
});

/** Provider turns down a New booking. */
exports.declineBooking = onCall({ region: REGION }, async (request) => {
  const { booking, extra: refund } = await step(request, 'decline', 'provider',
    (tx, ref, b) => cancelInTx(tx, ref, b, 'provider', 'Declined by the provider'));
  const { offer, provider } = await labelsFor(booking);
  await notify(booking.uid, {
    type: 'booking_declined',
    title: 'Booking declined',
    body: `${provider} can’t take ${offer}.${refund ? ' An organizer will review refunding your points.' : ''}`,
    link: '/marketplace',
  });
  if (refund) await notifyRefundReview(booking, `${provider} declined`);
  return { ok: true };
});

/** Member cancels a New booking, or a group lesson booking until the coach marks it done. */
exports.cancelBooking = onCall({ region: REGION }, async (request) => {
  const { booking, extra: refund } = await step(request, 'cancel', 'member',
    (tx, ref, b) => cancelInTx(tx, ref, b, 'member', 'Cancelled by the member'));
  const { offer } = await labelsFor(booking);
  await notify(await providerMemberUids(booking.provider_id).catch(() => []), {
    type: 'booking_cancelled',
    title: 'Booking cancelled',
    body: `${booking.user_name || 'A member'} cancelled ${offer}.`,
    link: '/profile?dash=provider',
    counterpart_uid: booking.uid,
    counterpart_name: booking.user_name,
  });
  if (refund) await notifyRefundReview(booking, `${booking.user_name || 'A member'} cancelled`);
  return { ok: true };
});

/** The member's question once the provider finishes, per category. */
const askTitle = (b) => (b.category === 'coaching'
  ? 'Did your lesson happen?'
  : 'Your racquet is ready for pickup. Did you collect it?');

/** Provider: "Mark ready" / "Mark done" asks the member to confirm; neither completes the job. */
exports.finishBooking = onCall({ region: REGION }, async (request) => {
  const { booking } = await step(request, 'finish', 'provider', (tx, ref) => {
    const now = Timestamp.now();
    tx.update(ref, { completion_requested_at: now, updated_at: now });
  });
  const { offer, provider } = await labelsFor(booking);
  await notify(booking.uid, {
    type: 'booking_ready',
    title: askTitle(booking),
    body: booking.category === 'coaching'
      ? `${provider} marked your ${offer} lesson done. Confirm it happened.`
      : `${provider} marked ${offer} ready. Confirm once you have it.`,
    link: '/profile?dash=player',
  });
  return { ok: true };
});

/** Member answers askTitle(). Not yet sends the job back to in progress. */
exports.confirmBooking = onCall({ region: REGION }, async (request) => {
  const yes = !!(request.data && request.data.confirmed === true);
  const { booking } = await step(request, 'confirm', 'member', async (tx, ref, b) => {
    const now = Timestamp.now();
    // Yes on a group lesson frees Redeem for the next member (the coupon is used from here).
    if (yes && isGroup(b)) {
      const serviceRef = db().doc(`services/${b.service_id}`);
      const service = await tx.get(serviceRef);
      if (service.exists) releaseRedeem(tx, serviceRef, service.data(), ref.id);
    }
    tx.update(ref, yes
      ? { status: 'completed', completed_at: now, updated_at: now }
      : { completion_requested_at: null, updated_at: now });
  });

  const providers = await providerMemberUids(booking.provider_id).catch(() => []);
  const { offer, provider } = await labelsFor(booking);
  const member = booking.user_name || 'A member';
  const coaching = booking.category === 'coaching';
  const notYetTitle = coaching ? 'Lesson not confirmed' : 'Racquet not collected yet';
  const notYet = coaching ? 'hasn’t happened yet' : 'isn’t collected yet';
  await notify(providers, {
    type: yes ? 'booking_completed' : 'booking_not_back',
    title: yes ? 'Job complete' : notYetTitle,
    body: yes ? `${member} confirmed ${offer} is done.` : `${member} says ${offer} ${notYet}.`,
    link: '/profile?dash=provider',
    counterpart_uid: booking.uid,
    counterpart_name: booking.user_name,
  });
  if (!yes) {
    const organizers = (await organizerUids().catch(() => [])).filter((o) => !providers.includes(o));
    await notify(organizers, {
      type: 'booking_not_back',
      title: notYetTitle,
      body: `${member} says ${offer} at ${provider} ${notYet}.`,
      link: '/marketplace',
    });
  }
  return { ok: true };
});

const GROUP_ACTIONS = ['create', 'add', 'remove', 'done', 'cancel'];

/**
 * Coach: group lessons. Members book a group lesson service and wait as New; the coach puts the ones
 * they choose into Group 1, 2, … (`lesson_group` on the booking, status in progress). create/add
 * seat New bookings, remove sends them back to New, done asks each member "Did your lesson
 * happen?", cancel cancels every open booking in the group (points paid go to review).
 */
exports.lessonGroup = onCall({ region: REGION }, async (request) => {
  const uid = requireAuth(request);
  const d = request.data || {};
  const action = GROUP_ACTIONS.includes(d.action) ? d.action : null;
  if (!action) throw new HttpsError('invalid-argument', 'Unknown action.');
  const serviceId = requireDocId(d.serviceId, 'Missing service.');
  const ids = Array.isArray(d.bookingIds) ? d.bookingIds.filter((x) => typeof x === 'string' && x) : [];
  const providerId = await providerIdFor(uid);
  const serviceRef = db().doc(`services/${serviceId}`);

  const result = await db().runTransaction(async (tx) => {
    const serviceSnap = await tx.get(serviceRef);
    const service = serviceSnap.exists ? serviceSnap.data() : null;
    if (!service || service.sub_category !== 'group') throw new HttpsError('failed-precondition', 'That isn’t a group lesson.');
    if (!providerId || service.provider_id !== providerId) throw new HttpsError('permission-denied', 'That lesson isn’t yours.');

    const all = (await tx.get(db().collection('bookings').where('service_id', '==', serviceId))).docs;
    const inGroup = (s, n) => s.data().status === 'in_progress' && s.data().lesson_group === n;
    const group = action === 'create'
      ? Math.max(0, ...all.map((s) => Number(s.data().lesson_group) || 0)) + 1
      : Number(d.group);
    if (action !== 'create' && !all.some((s) => inGroup(s, group))) {
      throw new HttpsError('not-found', 'That group no longer exists.');
    }

    let members;
    if (action === 'create' || action === 'add') {
      members = all.filter((s) => ids.includes(s.id) && s.data().status === 'lead');
    } else if (action === 'remove') {
      members = all.filter((s) => ids.includes(s.id) && inGroup(s, group) && !s.data().completion_requested_at);
    } else if (action === 'done') {
      members = all.filter((s) => inGroup(s, group) && !s.data().completion_requested_at);
    } else {
      members = all.filter((s) => inGroup(s, group));
    }
    if (members.length === 0) throw new HttpsError('failed-precondition', 'Nobody to update. Refresh and try again.');

    const now = Timestamp.now();
    const refunded = [];
    members.forEach((s) => {
      const b = s.data();
      if (action === 'create' || action === 'add') {
        tx.update(s.ref, { status: 'in_progress', lesson_group: group, started_at: now, updated_at: now });
      } else if (action === 'remove') {
        tx.update(s.ref, { status: 'lead', lesson_group: 0, started_at: null, updated_at: now });
      } else if (action === 'done') {
        tx.update(s.ref, { completion_requested_at: now, updated_at: now });
      } else {
        const refund = b.payment === 'points' && b.points > 0;
        if (refund) refunded.push({ ...b, id: s.id });
        tx.update(s.ref, {
          status: 'cancelled', cancelled_at: now, cancelled_by: 'provider', cancel_reason: 'Class cancelled by the coach',
          refund: refund ? 'pending' : 'none', updated_at: now,
        });
        releaseRedeem(tx, serviceRef, service, s.id);
      }
    });
    return { group, members: members.map((s) => ({ ...s.data(), id: s.id })), refunded, provider: service.provider_name || 'Your coach', offer: service.offer || 'the lesson' };
  });

  const { group, members, refunded, provider, offer } = result;
  await Promise.all(members.map((b) => {
    const refund = refunded.some((r) => r.id === b.id);
    const message = {
      create: { type: 'booking_started', title: `You're in ${provider}'s group lesson`, body: `${provider} will contact you with the details.` },
      remove: { type: 'booking_started', title: 'Your group lesson changed', body: `${provider} moved you out of Group ${group}. You stay on the list for the next group.` },
      done: { type: 'booking_ready', title: askTitle(b), body: `${provider} marked ${offer} done. Confirm it happened.` },
      cancel: {
        type: 'booking_declined',
        title: 'Class cancelled',
        body: `${provider} cancelled the ${offer} class.${refund ? ' An organizer will review refunding your points.' : ''}`,
      },
    }[action === 'add' ? 'create' : action];
    return notify(b.uid, { ...message, link: '/profile?dash=player' });
  }));
  await Promise.all(refunded.map((b) => notifyRefundReview(b, `${provider} cancelled the class`)));
  return { ok: true, group };
});

/**
 * Organizer: record a booking that already happened, straight to `completed` on the date it
 * happened. A record, not a job: nobody is notified, and no points move even when it is marked as
 * redeemed (they were settled outside the site). It still links member and provider, as a real
 * booking does, and counts toward the offer's `booking_count`.
 */
exports.recordBooking = onCall({ region: REGION }, async (request) => {
  const uid = requireAuth(request);
  if (!(await isOrganizer(uid))) throw new HttpsError('permission-denied', 'Organizers only.');
  const d = request.data || {};
  const serviceId = requireDocId(d.serviceId, 'Pick a service.');
  const memberUid = requireDocId(d.memberUid, 'Pick a member.');
  const payment = d.payment === 'points' ? 'points' : 'price';
  const when = Number(d.completedAt);
  if (!Number.isFinite(when)) throw new HttpsError('invalid-argument', 'Pick the date it happened.');
  // A day of slack: the client sends local noon, which is still ahead of "now" on the morning of.
  if (when > Date.now() + DAY_MS) throw new HttpsError('invalid-argument', 'That date is in the future.');

  const [serviceSnap, memberSnap] = await Promise.all([
    db().doc(`services/${serviceId}`).get(),
    db().doc(`users/${memberUid}`).get(),
  ]);
  if (!serviceSnap.exists) throw new HttpsError('not-found', 'That service no longer exists.');
  if (!memberSnap.exists) throw new HttpsError('not-found', 'That member isn’t on the app.');
  const service = { id: serviceSnap.id, ...serviceSnap.data() };
  if (service.provider_id === memberUid) throw new HttpsError('invalid-argument', 'A provider can’t book their own service.');
  if (payment === 'points' && !(service.points_cost > 0)) {
    throw new HttpsError('failed-precondition', 'That offer has no points price, so it can’t be marked as redeemed.');
  }

  const at = Timestamp.fromMillis(when);
  const ref = db().collection('bookings').doc();
  const booking = {
    ...newBooking({
      service,
      uid: memberUid,
      userName: memberSnap.get('name') || '',
      price: payment === 'points' && typeof service.discounted_price === 'number' ? service.discounted_price : service.total_price,
      points: payment === 'points' ? service.points_cost : 0,
    }),
    status: 'completed',
    created_at: at,
    started_at: at,
    completed_at: at,
  };
  const batch = db().batch();
  batch.create(ref, booking);
  batch.update(serviceSnap.ref, { booking_count: FieldValue.increment(1) });
  await batch.commit();
  await linkPlayers(memberUid, service.provider_id, 'booking');

  logger.info(`Booking ${ref.id}: ${uid} recorded ${memberUid} on ${service.id}, completed ${at.toDate().toISOString()}`);
  return { bookingId: ref.id };
});
