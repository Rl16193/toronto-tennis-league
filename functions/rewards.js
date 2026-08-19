/**
 * Redeemable points and rewards.
 *
 * redeemable = leaguePoints26 (stats/{uid}) + earned RS points (tasks/{uid}) − offers/{uid}.pointsSpent.
 * Redeeming NEVER touches the earning counters, so leaderboards and match history are unaffected.
 *
 * Everything that moves points runs here — the client cannot write `offers/*` or `redemptions/*`
 * at all. Each callable does its read-modify-write in a transaction so a double-tap can't redeem
 * twice. Coupon codes ARE the redemption doc id, so uniqueness comes from create-if-absent
 * semantics. A deterministic per-user/per-offer lock also closes the duplicate-offer race.
 *
 * Deployment is environment-gated. Follow docs/architecture/ENVIRONMENTS_AND_DEPLOYMENT.md;
 * do not run a bare `firebase deploy` from this production-sensitive checkout.
 */
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');
const { REGION, SUPER_ADMIN_UID, TZ } = require('./lib/constants');
const { normalizeCouponCode, optionalTrimmedString, requireAuth, requireTrimmedString } = require('./lib/callable');
const { earnedRsPoints } = require('./lib/points');
const { notify, adminUids } = require('./lib/notify');
const { assertCouponStatus } = require('./lib/redemptionState');
const { safeId } = require('./lib/logging');
const {
  OPEN_REDEMPTION_STATUSES,
  assertRedemptionLockAvailable,
  lockIdFor,
  writeRedemptionLock,
} = require('./lib/redemptionLock');

const db = () => admin.firestore();
const nowISO = () => new Date().toISOString();
const REDEMPTION_NOTE_MAX_LENGTH = 500;
const redemptionLockRef = (uid, rewardId) => db().doc(`redemption_locks/${lockIdFor(uid, rewardId)}`);

// Ambiguous glyphs (0/O, 1/I) left out so a code read aloud or off a phone screen can't be
// mistyped at the counter.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const randomCode = () => {
  const pick = (n) =>
    Array.from({ length: n }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('');
  return `RS-${pick(4)}-${pick(2)}`;
};

const isRewardAdmin = (uid) => uid === SUPER_ADMIN_UID;

// A stringer or coach is a normal account with `stringer_id` / `coach_id` on their preferences
// doc naming the catalog entry they own. Same role-flag shape as `event_creator`.
async function providerIdFor(uid) {
  const snap = await db().doc(`preferences/${uid}`).get();
  if (!snap.exists) return null;
  const d = snap.data();
  if (d.stringer === true && typeof d.stringer_id === 'string') return d.stringer_id;
  if (d.coach === true && typeof d.coach_id === 'string') return d.coach_id;
  return null;
}

/** Reads the three inputs to a player's redeemable balance inside a transaction. */
async function readBalance(tx, uid) {
  const [statsSnap, progressSnap, spentSnap] = await Promise.all([
    tx.get(db().doc(`stats/${uid}`)),
    tx.get(db().doc(`tasks/${uid}`)),
    tx.get(db().doc(`offers/${uid}`)),
  ]);
  const league =
    statsSnap.exists && typeof statsSnap.data().leaguePoints26 === 'number' ? statsSnap.data().leaguePoints26 : 0;
  const rs = earnedRsPoints(progressSnap.exists ? progressSnap.data() : null);
  const spent = spentSnap.exists && typeof spentSnap.data().pointsSpent === 'number' ? spentSnap.data().pointsSpent : 0;
  const earned = Math.max(0, Math.round(league + rs));
  return { earned, spent, balance: earned - spent };
}

// ─── Redeem ─────────────────────────────────────────────────────────────────────────────────

/**
 * Spend points on a catalog offer. Returns { code, redemption }. Rejects if the offer is inactive,
 * the balance is short, or the player already holds an active coupon for the same offer (one open
 * coupon per offer keeps the stringer's list sane).
 */
exports.redeemReward = onCall({ region: REGION }, async (request) => {
  const uid = requireAuth(request);
  const rewardId = requireTrimmedString(request.data && request.data.rewardId, 'Missing reward.');

  const rewardSnap = await db().doc(`tasks/${rewardId}`).get();
  if (!rewardSnap.exists) throw new HttpsError('not-found', 'That reward no longer exists.');
  const reward = rewardSnap.data();
  const validOffer =
    reward.type === 'offer' &&
    reward.active === true &&
    typeof reward.provider_id === 'string' &&
    reward.provider_id.trim() !== '' &&
    typeof reward.provider_name === 'string' &&
    reward.provider_name.trim() !== '' &&
    typeof reward.offer === 'string' &&
    reward.offer.trim() !== '' &&
    Number.isInteger(reward.points_cost) &&
    reward.points_cost > 0 &&
    reward.points_cost <= 10_000;
  if (!validOffer) throw new HttpsError('failed-precondition', 'That reward is no longer available.');
  const cost = reward.points_cost;

  // One open coupon per offer, so a stringer's list doesn't fill with duplicates. Two equality
  // filters only (status is filtered in memory) — adding a third would want a composite index,
  // and this project ships no firestore.indexes.json.
  const forOffer = await db()
    .collection('redemptions')
    .where('uid', '==', uid)
    .where('reward_id', '==', rewardId)
    .get();
  if (forOffer.docs.some((d) => OPEN_REDEMPTION_STATUSES.includes(d.data().status))) {
    throw new HttpsError('already-exists', 'You already have an open coupon for this offer.');
  }

  const userSnap = await db().doc(`users/${uid}`).get();
  const userName = userSnap.exists ? userSnap.data().name || '' : '';
  const lockRef = redemptionLockRef(uid, rewardId);

  // Retry on the (vanishingly unlikely) case of a code collision.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode();
    const redemptionRef = db().doc(`redemptions/${code}`);
    try {
      const result = await db().runTransaction(async (tx) => {
        const existing = await tx.get(redemptionRef);
        if (existing.exists) return null; // collision — caller retries with a new code

        await assertRedemptionLockAvailable(tx, lockRef);

        const { earned, spent, balance } = await readBalance(tx, uid);
        if (balance < cost) {
          throw new HttpsError('failed-precondition', `You need ${cost} points to redeem this — you have ${balance}.`);
        }

        const redemption = {
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
          created_at: nowISO(),
        };
        writeRedemptionLock(tx, lockRef, {
          uid,
          reward_id: rewardId,
          code,
          status: 'active',
          updated_at: nowISO(),
        });
        tx.set(redemptionRef, redemption);
        tx.set(
          db().doc(`offers/${uid}`),
          {
            uid: uid,
            pointsSpent: spent + cost,
            lastEarnedSnapshot: earned,
            updated_at: nowISO(),
          },
          { merge: true },
        );
        return redemption;
      });

      if (result === null) continue; // collided, try another code
      logger.info('Redemption created', {
        redemption: safeId(code),
        actor: safeId(uid),
        reward: safeId(rewardId),
        points: cost,
      });
      return { code, redemption: result };
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

  const myProviderId = await providerIdFor(uid);
  const ref = db().doc(`redemptions/${code}`);

  const redemption = await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'No coupon with that code.');
    const d = snap.data();

    if (!isRewardAdmin(uid) && d.stringer_id !== myProviderId) {
      throw new HttpsError('permission-denied', 'That coupon isn’t for your shop.');
    }
    assertCouponStatus(d.status, 'use');

    tx.update(ref, { status: 'used', used_at: nowISO(), used_by: uid });
    tx.set(
      redemptionLockRef(d.uid, d.reward_id),
      {
        uid: d.uid,
        reward_id: d.reward_id,
        code,
        status: 'used',
        updated_at: nowISO(),
      },
      { merge: true },
    );
    return d;
  });

  await notify(redemption.uid, {
    type: 'reward_used',
    title: 'Reward redeemed',
    body: `${redemption.offer} at ${redemption.stringer_name} is marked as used.`,
    link: '/marketplace',
  }).catch(() => {
    /* notification is best-effort */
  });

  return { ok: true };
});

// ─── Flag a problem (stringer) ──────────────────────────────────────────────────────────────

/** Stringer flags a coupon for the organizer to look at — a no-show, a disputed code, etc. */
exports.flagCoupon = onCall({ region: REGION }, async (request) => {
  const uid = requireAuth(request);
  const code = normalizeCouponCode(request.data && request.data.code);
  const note = optionalTrimmedString(request.data && request.data.note, { maxLength: REDEMPTION_NOTE_MAX_LENGTH });

  const myProviderId = await providerIdFor(uid);
  const ref = db().doc(`redemptions/${code}`);

  const redemption = await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'No coupon with that code.');
    const d = snap.data();
    if (!isRewardAdmin(uid) && d.stringer_id !== myProviderId) {
      throw new HttpsError('permission-denied', 'That coupon isn’t for your shop.');
    }
    assertCouponStatus(d.status, 'flag');
    tx.update(ref, {
      status: 'flagged',
      flagged_at: nowISO(),
      flagged_by: uid,
      ...(note ? { flag_note: note } : {}),
    });
    tx.set(
      redemptionLockRef(d.uid, d.reward_id),
      {
        uid: d.uid,
        reward_id: d.reward_id,
        code,
        status: 'flagged',
        updated_at: nowISO(),
      },
      { merge: true },
    );
    return d;
  });

  const admins = await adminUids();
  await notify(admins, {
    type: 'reward_flagged',
    title: 'Coupon flagged',
    body: `${redemption.stringer_name} flagged ${code} (${redemption.user_name}).`,
    link: '/tasks?review=claims',
  }).catch(() => {
    /* best-effort */
  });

  return { ok: true };
});

// ─── Cancellation (player requests, organizer decides) ──────────────────────────────────────

/** Player asks for a redemption to be undone. Only possible while the coupon is unused. */
exports.requestCancellation = onCall({ region: REGION }, async (request) => {
  const uid = requireAuth(request);
  const code = normalizeCouponCode(request.data && request.data.code);
  const reason = optionalTrimmedString(request.data && request.data.reason, { maxLength: REDEMPTION_NOTE_MAX_LENGTH });

  const ref = db().doc(`redemptions/${code}`);
  const redemption = await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'No coupon with that code.');
    const d = snap.data();
    if (d.uid !== uid) throw new HttpsError('permission-denied', 'That isn’t your coupon.');
    assertCouponStatus(d.status, 'cancelRequest');
    tx.update(ref, {
      status: 'cancel_requested',
      cancel_requested_at: nowISO(),
      ...(reason ? { cancel_reason: reason } : {}),
    });
    tx.set(
      redemptionLockRef(d.uid, d.reward_id),
      {
        uid: d.uid,
        reward_id: d.reward_id,
        code,
        status: 'cancel_requested',
        updated_at: nowISO(),
      },
      { merge: true },
    );
    return d;
  });

  const admins = await adminUids();
  await notify(admins, {
    type: 'reward_cancel_requested',
    title: 'Cancellation requested',
    body: `${redemption.user_name} wants to cancel ${code} (${redemption.offer}).`,
    link: '/tasks?review=claims',
  }).catch(() => {
    /* best-effort */
  });

  return { ok: true };
});

/**
 * Organizer decides a cancellation (or resolves a flag). Approving refunds by decrementing
 * pointsSpent — the earning counters were never touched, so nothing else moves.
 */
exports.reviewRedemption = onCall({ region: REGION }, async (request) => {
  const uid = requireAuth(request);
  if (!isRewardAdmin(uid)) throw new HttpsError('permission-denied', 'Reward administrators only.');

  const code = normalizeCouponCode(request.data && request.data.code);
  const approve = request.data && request.data.approve === true;
  const note = optionalTrimmedString(request.data && request.data.note, { maxLength: REDEMPTION_NOTE_MAX_LENGTH });

  const ref = db().doc(`redemptions/${code}`);
  const redemption = await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'No coupon with that code.');
    const d = snap.data();
    if (!approve) {
      assertCouponStatus(d.status, 'reviewDecline');
      // Declined — the coupon goes back to being spendable at the counter.
      tx.update(ref, {
        status: 'active',
        reviewed_at: nowISO(),
        reviewed_by: uid,
        ...(note ? { reviewer_note: note } : {}),
      });
      tx.set(
        redemptionLockRef(d.uid, d.reward_id),
        {
          uid: d.uid,
          reward_id: d.reward_id,
          code,
          status: 'active',
          updated_at: nowISO(),
        },
        { merge: true },
      );
      return d;
    }

    assertCouponStatus(d.status, 'reviewApprove');

    // Approved — refund. Read the spend counter inside the same transaction.
    const spentRef = db().doc(`offers/${d.uid}`);
    const spentSnap = await tx.get(spentRef);
    const spent =
      spentSnap.exists && typeof spentSnap.data().pointsSpent === 'number' ? spentSnap.data().pointsSpent : 0;
    const cost = typeof d.points_cost === 'number' ? d.points_cost : 25;

    tx.update(ref, {
      status: 'cancelled',
      cancelled_at: nowISO(),
      reviewed_by: uid,
      ...(note ? { reviewer_note: note } : {}),
    });
    tx.set(
      redemptionLockRef(d.uid, d.reward_id),
      {
        uid: d.uid,
        reward_id: d.reward_id,
        code,
        status: 'cancelled',
        updated_at: nowISO(),
      },
      { merge: true },
    );
    tx.set(
      spentRef,
      {
        uid: d.uid,
        pointsSpent: Math.max(0, spent - cost),
        updated_at: nowISO(),
      },
      { merge: true },
    );
    return d;
  });

  await notify(redemption.uid, {
    type: approve ? 'reward_cancelled' : 'reward_cancel_declined',
    title: approve ? 'Redemption cancelled' : 'Cancellation declined',
    body: approve
      ? `${redemption.points_cost} points are back in your balance.`
      : `Your coupon for ${redemption.offer} is still active.`,
    link: '/marketplace',
  }).catch(() => {
    /* best-effort */
  });

  return { ok: true };
});

// ─── Free monthly group lesson ──────────────────────────────────────────────────────────────

// One doc per month (`group_lessons/{YYYY-MM}`), so the 4 spots reset on the 1st with no
// scheduled job — a new month is simply a doc that doesn't exist yet. Must match
// currentMonthKey() in src/features/services/types.ts.
function monthKey() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date());
  const get = (t) => (parts.find((p) => p.type === t) || {}).value || '';
  return `${get('year')}-${get('month')}`;
}

const GROUP_LESSON_CAPACITY = 4;

/**
 * Take a spot in this month's free group lesson. Transactional, so two simultaneous Joins can't
 * both claim the last seat. Costs no points.
 */
exports.joinGroupLesson = onCall({ region: REGION }, async (request) => {
  const uid = requireAuth(request);
  const month = monthKey();
  const ref = db().doc(`group_lessons/${month}`);

  const [userSnap, coachSnap] = await Promise.all([
    db().doc(`users/${uid}`).get(),
    db().collection('tasks').where('type', '==', 'offer').get(),
  ]);
  const u = userSnap.exists ? userSnap.data() : {};
  const coachDoc = coachSnap.docs.find((d) => d.data().category === 'coaching');
  const coach = coachDoc ? coachDoc.data() : {};

  const spotsLeft = await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const existing = snap.exists ? snap.data() : null;
    const players = (existing && existing.players) || [];

    if (players.some((p) => p.uid === uid)) {
      throw new HttpsError('already-exists', 'You already have a spot this month.');
    }
    if (players.length >= GROUP_LESSON_CAPACITY) {
      throw new HttpsError('failed-precondition', 'This month’s group lesson is full.');
    }

    // Name and uid only. `group_lessons` is world-readable, so snapshotting phone/email here
    // handed every player's contact details to anyone, signed out, via one getDoc. The coach
    // resolves them from `contacts/{uid}` instead, which requires a sign-in.
    const next = players.concat([
      {
        uid: uid,
        name: u.name || '',
        joined_at: nowISO(),
      },
    ]);

    tx.set(
      ref,
      {
        month,
        coach_id: coach.provider_id || '',
        coach_name: coach.provider_name || '',
        capacity: GROUP_LESSON_CAPACITY,
        players: next,
        updated_at: nowISO(),
      },
      { merge: true },
    );

    return GROUP_LESSON_CAPACITY - next.length;
  });

  return { ok: true, spotsLeft };
});

/** Give up your spot, freeing it for someone else this month. */
exports.leaveGroupLesson = onCall({ region: REGION }, async (request) => {
  const uid = requireAuth(request);
  const ref = db().doc(`group_lessons/${monthKey()}`);

  const spotsLeft = await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'No group lesson this month.');
    const players = snap.data().players || [];
    if (!players.some((p) => p.uid === uid)) {
      throw new HttpsError('failed-precondition', 'You don’t have a spot to give up.');
    }
    const next = players.filter((p) => p.uid !== uid);
    tx.update(ref, { players: next, updated_at: nowISO() });
    return GROUP_LESSON_CAPACITY - next.length;
  });

  return { ok: true, spotsLeft };
});
