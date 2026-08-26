/**
 * Server-side points: mirrors the milestone catalogue in src/features/tasks/taskCatalog.ts so tiers
 * and the Initiation are awarded whether or not the player opens the Tasks tab.
 * KEEP THE CATALOGUE IN SYNC WITH taskCatalog.ts BY HAND.
 *
 * Two primitives: recordPlayResult (match results) and bumpCounterAndAward (every other counter).
 * Both run in a transaction on tasks/{uid} so simultaneous results can't race. Points/tiers/badges
 * are awarded silently — only submission approvals/rejections notify.
 *
 * Deployment is environment-gated. Follow docs/archive/architecture/ENVIRONMENTS_AND_DEPLOYMENT.md;
 * do not use a bare Firebase deploy command from this checkout.
 */
const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');
const { notify, adminUids } = require('./lib/notify');
const ROSTER = require('./courts.json'); // { [courtKey]: zoneName } — see groupAwards.js header

const { TZ, REGION } = require('./lib/constants');
const db = () => admin.firestore();

// Same normalization as src/utils/courtKey.ts — keep in sync.
const courtKeySlug = (name) =>
  String(name)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

// Same YYYYMMDD format as src/features/tasks/checkinService.ts's torontoDayKey().
function torontoDay(iso) {
  const d = iso ? new Date(iso) : new Date();
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}${parts.month}${parts.day}`;
}

// A tournament match with a court selected is proof of presence — no GPS check needed. Stamps the
// once-forever passport and the daily attendance log in `courts` (types 'check-in'/'attendance'),
// same id-schemes as a real check-in (dist_m: 0 marks it match-derived). Admin SDK bypasses the
// self-write-only client rules — the one place either player can be checked in by the scorer.
async function checkInFromMatch(uid, name, courtName, whenISO) {
  if (!uid || !courtName) return;
  const courtKey = courtKeySlug(courtName);
  if (!courtKey) return;
  const zone = ROSTER[courtKey] || '';
  const now = whenISO || new Date().toISOString();
  const base = { uid, user_name: name || '', court_key: courtKey, court_name: courtName, zone, dist_m: 0 };

  await db()
    .doc(`courts/${uid}_${courtKey}`)
    .create({
      ...base,
      type: 'check-in',
      visit_type: 'Tournament',
      lat: 0,
      lng: 0,
      created_at: now,
    })
    .catch(() => {
      /* already checked in at this court — fine, one-per-player-per-court */
    });

  await db()
    .doc(`courts/${uid}_${courtKey}_${torontoDay(now)}`)
    .set({
      ...base,
      type: 'attendance',
      match_type: 'Tournament',
      lat: 0,
      lng: 0,
      day: torontoDay(now),
      created_at: now,
    });
}

// Tier catalogue + Initiation checklist now live in lib/points.js, shared with rewards.js
// (which sums the same tiers to compute a player's redeemable balance).
const { ALL_TIERS, INITIATION_TASK_IDS } = require('./lib/points');

// ─── Award primitives (transactional read-modify-write on tasks/{uid}) ──────────────

// Tournament / ladder results — streaks and "active months" span both sources, matching the
// client's own useTasks.ts semantics.
async function recordPlayResult(uid, name, { source, won, whenISO }) {
  const ref = db().collection('tasks').doc(uid);

  await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : {};

    const update = { uid, name, category: 'progress', updatedAt: new Date().toISOString() };

    if (source === 'tournament') {
      update.matchesPlayed = (data.matchesPlayed || 0) + 1;
    } else {
      update.challengesPlayed = (data.challengesPlayed || 0) + 1;
      if (won) update.challengesWon = (data.challengesWon || 0) + 1;
    }

    const curStreak = won ? (data.currentStreak || 0) + 1 : 0;
    update.currentStreak = curStreak;
    update.bestStreak = Math.max(data.bestStreak || 0, curStreak);

    const month = (whenISO || new Date().toISOString()).slice(0, 7);
    const months = new Set(data.active_months || []);
    if (!months.has(month)) {
      months.add(month);
      update.active_months = [...months];
      update.monthsActive = months.size;
    }

    const touched =
      source === 'tournament'
        ? ['matchesPlayed', 'bestStreak', 'monthsActive']
        : ['challengesPlayed', 'challengesWon', 'bestStreak', 'monthsActive'];
    for (const tier of ALL_TIERS) {
      if (!touched.includes(tier.counter) || data[tier.id]) continue;
      const val = update[tier.counter] !== undefined ? update[tier.counter] : data[tier.counter] || 0;
      if (val >= tier.need) update[tier.id] = true;
    }

    const initTaskId = source === 'tournament' ? 'playMatch' : 'ladderMatch';
    if (!data[initTaskId]) update[initTaskId] = true;

    const merged = { ...data, ...update };
    if (!data.setupComplete && INITIATION_TASK_IDS.every((id) => merged[id])) update.setupComplete = true;

    tx.set(ref, update, { merge: true });
  });
}

// Every other counter: court visits, approved photos, volunteering, invites, hosting.
async function bumpCounterAndAward(uid, name, counterField, incrementBy, initTaskId) {
  const ref = db().collection('tasks').doc(uid);

  await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : {};

    const update = { uid, name, category: 'progress', updatedAt: new Date().toISOString() };
    const newVal = counterField ? (data[counterField] || 0) + incrementBy : 0;
    if (counterField) update[counterField] = newVal;

    for (const tier of ALL_TIERS) {
      if (!counterField || tier.counter !== counterField || data[tier.id]) continue;
      if (newVal >= tier.need) update[tier.id] = true;
    }

    if (initTaskId && !data[initTaskId]) update[initTaskId] = true;

    const merged = { ...data, ...update };
    if (!data.setupComplete && INITIATION_TASK_IDS.every((id) => merged[id])) update.setupComplete = true;

    tx.set(ref, update, { merge: true });
  });
}

// joinEvent has no tier of its own — just the Initiation checkbox.
async function markInitiationTask(uid, name, taskId) {
  await bumpCounterAndAward(uid, name, null, 0, taskId);
}

// ─── Global-admin digest: totals only, never names ──────────────────────────
// Photo reports no longer need review (they auto-approve at creation) — only claims do.
async function notifyAdminsOfQueue(link) {
  const [claims, administrators] = await Promise.all([
    db().collection('task_claims').where('status', '==', 'pending').get(),
    adminUids(),
  ]);
  if (claims.size === 0) return;
  await notify(administrators, {
    type: 'organizer_review_pending',
    title: `${claims.size} task${claims.size > 1 ? 's' : ''} need approval`,
    link,
  });
}

const AMBASSADOR_DUPLICATE_NOTE = 'Already claimed by another member.';

// Current clients use task_claims/ambassador_{inviteeId}, which gives Firestore Rules one atomic
// slot per invitee. Older releases used random ids, so keep a server-side compatibility guard:
// one single-field query (no composite index) detects an active legacy claim before review or
// award. Existing historical data is not rewritten or migrated.
async function findOtherActiveAmbassadorClaim(claimRef, inviteeId) {
  if (typeof inviteeId !== 'string' || inviteeId.trim() === '') return null;
  const claims = await db().collection('task_claims').where('invitee_id', '==', inviteeId).get();
  return (
    claims.docs.find((doc) => {
      const claim = doc.data();
      return (
        doc.id !== claimRef.id &&
        claim.type === 'ambassador' &&
        (claim.status === 'pending' || claim.status === 'approved')
      );
    }) || null
  );
}

async function rejectDuplicateAmbassadorClaim(claimRef, claim) {
  const other = await findOtherActiveAmbassadorClaim(claimRef, claim.invitee_id);
  if (!other) return false;
  await claimRef.update({
    status: 'rejected',
    reviewer_note: AMBASSADOR_DUPLICATE_NOTE,
    reviewed_at: new Date().toISOString(),
  });
  return true;
}

// ═══════════════════════════════════════════════════════════════════════════
// Triggers
// ═══════════════════════════════════════════════════════════════════════════

// Shared by both result triggers below: records the play result for both participants, then
// (if a court was recorded) checks them both in — same two-pass order both triggers used.
async function awardPairPoints(after, { source, uidA, nameA, uidB, nameB, wonUid, whenISO }) {
  const pairs = [
    [uidA, nameA],
    [uidB, nameB],
  ].filter(([uid]) => uid);
  for (const [uid, name] of pairs) {
    await recordPlayResult(uid, name || '', { source, won: wonUid === uid, whenISO });
  }
  // A court picked when scoring/reporting the match doubles as a check-in for both players.
  if (after.court) {
    for (const [uid, name] of pairs) {
      await checkInFromMatch(uid, name || '', after.court, whenISO);
    }
  }
}

// Tournament match completed with a real score (walkovers don't count — matches the client gate).
exports.onMatchCompletedAwardPoints = onDocumentUpdated(
  { document: 'matches/{matchId}', region: REGION },
  async (event) => {
    const before = event.data?.before.data() || {};
    const after = event.data?.after.data() || {};
    if (after.category !== 'singles' && after.category !== 'doubles') return;
    if (before.status === 'complete' || after.status !== 'complete') return;
    // A walkover is recorded as sets of 0-0 — still non-null, so it must be excluded explicitly.
    if (after.walkover === true) return;
    if (after.set_1_player_1 == null || after.set_1_player_2 == null) return;
    await awardPairPoints(after, {
      source: 'tournament',
      uidA: after.player_1_uid,
      nameA: after.player_1_name,
      uidB: after.player_2_uid,
      nameB: after.player_2_name,
      wonUid: after.winner_uid,
      whenISO: after.completed_at || new Date().toISOString(),
    });
  },
);

// Ladder challenge confirmed by the organizer.
exports.onLadderConfirmedAwardPoints = onDocumentUpdated(
  { document: 'matches/{id}', region: REGION },
  async (event) => {
    const before = event.data?.before.data() || {};
    const after = event.data?.after.data() || {};
    if (after.category !== 'challenge') return;
    if (before.status === 'confirmed' || after.status !== 'confirmed') return;
    await awardPairPoints(after, {
      source: 'ladder',
      uidA: after.player_1_uid,
      nameA: after.player_1_name,
      uidB: after.player_2_uid,
      nameB: after.player_2_name,
      // New field first, legacy second — see friendlyPoints.js for why both are read.
      wonUid: after.winner_uid || after.claimed_winner_uid,
      whenISO: after.completed_at || after.confirmed_at || new Date().toISOString(),
    });
  },
);

// Joining any event unlocks the Initiation's "joinEvent" checkbox, regardless of whether the
// player ever opens the Tasks tab.
exports.onEventJoinedAwardPoints = onDocumentCreated(
  { document: 'event_participants/{id}', region: REGION },
  async (event) => {
    const p = event.data?.data();
    if (!p?.uid) return;
    await markInitiationTask(p.uid, p.user_name || '', 'joinEvent');
  },
);

/**
 * "Visit every court in your zone" (the `visitZone` tier, 30 pts).
 *
 * Belongs here, not the browser: the write carries points, so the owner-field allowlist in
 * firestore.rules rejects it client-side — and a bare catch swallowed that, leaving the tier
 * permanently unreachable. ROSTER (courts.json) is the authoritative courtKey → zoneName map.
 */
async function awardZoneCompleteIfDone(uid, name, visitedCourtKey) {
  const progressRef = db().collection('tasks').doc(uid);
  const [progressSnap, prefsSnap] = await Promise.all([progressRef.get(), db().doc(`preferences/${uid}`).get()]);
  // Already earned — bumpCounterAndAward would keep incrementing the counter past 1.
  if (progressSnap.exists && progressSnap.data().zoneComplete) return;

  const zone = (prefsSnap.exists && prefsSnap.data().preferred_zone) || ROSTER[visitedCourtKey];
  if (!zone) return;

  const zoneKeys = Object.keys(ROSTER).filter((k) => ROSTER[k] === zone);
  if (zoneKeys.length === 0) return;

  // `courts` also holds attendance + photo reports — narrow to the once-forever passport docs.
  const visits = await db().collection('courts').where('uid', '==', uid).get();
  const visited = new Set(
    visits.docs
      .map((d) => d.data())
      .filter((d) => d.type === 'check-in')
      .map((d) => d.court_key)
      .filter(Boolean),
  );
  if (!zoneKeys.every((k) => visited.has(k))) return;

  await bumpCounterAndAward(uid, name, 'zoneComplete', 1, undefined);
}

// Court check-in — one stamp per (player, court); courtsVisited + Traveler tiers. The `courts`
// collection also receives attendance and photo-report docs, so gate on the 'check-in' type.
exports.onCourtVisitAwardPoints = onDocumentCreated({ document: 'courts/{id}', region: REGION }, async (event) => {
  const v = event.data?.data();
  if (!v?.uid || v.type !== 'check-in') return;
  await bumpCounterAndAward(v.uid, v.user_name || '', 'courtsVisited', 1, 'courtVisit');
  await awardZoneCompleteIfDone(v.uid, v.user_name || '', v.court_key).catch((e) =>
    logger.error('zoneComplete check failed', e),
  );
  // Community-wide coverage tally (no auto "everyone gets 50" yet — see README note below).
  await db()
    .doc('site_stats/court_coverage')
    .set(
      { visited_keys: admin.firestore.FieldValue.arrayUnion(v.court_key), updated_at: new Date().toISOString() },
      { merge: true },
    )
    .catch((e) => logger.error('court_coverage update failed', e));
});

// "Submit a Photo" reports auto-approve at creation, so award immediately. Anonymous reports
// (uid: 'no_account') earn nothing. The trigger is on the consolidated `courts` collection, so
// non-report docs (check-in / attendance) are filtered out by the type gate.
exports.onPhotoReportAwardPoints = onDocumentCreated({ document: 'courts/{id}', region: REGION }, async (event) => {
  const r = event.data?.data();
  if (!r?.uid || r.uid === 'no_account') return;
  if (r.type === 'waiting_board') {
    await bumpCounterAndAward(r.uid, r.user_name || '', 'boardPhotos', 1, 'waitingBoard');
  } else if (r.type === 'queue') {
    await bumpCounterAndAward(r.uid, r.user_name || '', 'queueUpdates', 1, 'queuePhoto');
  } else if (r.type === 'condition') {
    // The only type the unified "Submit a Photo" flow writes today. Same counter the legacy
    // text-only suggestion flow used.
    await bumpCounterAndAward(r.uid, r.user_name || '', 'suggestions', 1, 'courtSuggestion');
  }
});

// Volunteer / Ambassador / Host claims.
exports.onClaimReviewed = onDocumentUpdated({ document: 'task_claims/{id}', region: REGION }, async (event) => {
  const before = event.data?.before.data() || {};
  const after = event.data?.after.data() || {};
  const claimRef = event.data.after.ref;
  if (before.status !== 'pending') {
    // Rejected ambassador slots are reusable. A resubmission is an update to the deterministic
    // document, so the create trigger will not see it. Check legacy active claims before putting
    // the resubmission back in the review queue.
    if (before.status === 'rejected' && after.status === 'pending' && after.type === 'ambassador') {
      if (await rejectDuplicateAmbassadorClaim(claimRef, after)) return;
      await claimRef.update({ status: 'approved', reviewed_at: new Date().toISOString(), reviewed_by: 'system' });
    }
    return;
  }

  if (after.status === 'approved') {
    if (after.type === 'volunteer') {
      await bumpCounterAndAward(after.uid, after.user_name || '', 'volunteerEvents', 1, undefined);
    } else if (after.type === 'host') {
      await bumpCounterAndAward(after.uid, after.user_name || '', 'meetups', 1, undefined);
    } else if (after.type === 'ambassador') {
      if (await rejectDuplicateAmbassadorClaim(claimRef, after)) {
        await notify(after.uid, {
          type: 'claim_rejected',
          title: `${after.invitee_name || 'That player'} was already claimed by someone else`,
          link: '/tasks',
        });
        return;
      }
      await bumpCounterAndAward(after.uid, after.user_name || '', 'invites', 1, undefined);
    }
    await notify(after.uid, {
      type: 'claim_approved',
      title: 'Your task was approved',
      body: after.event_title || after.invitee_name || after.meetup_title || '',
      link: '/tasks',
    });
  } else if (after.status === 'rejected') {
    await notify(after.uid, {
      type: 'claim_rejected',
      title: 'Your task wasn’t approved',
      body: after.reviewer_note || '',
      link: '/tasks',
    });
  }
});

// Global-admin digest — fires whenever a claim needs approval. Totals only (never names); the link
// opens the review queue.
exports.onTaskClaimCreated = onDocumentCreated({ document: 'task_claims/{id}', region: REGION }, async (event) => {
  const claim = event.data?.data() || {};
  if (
    claim.type === 'ambassador' &&
    claim.status === 'pending' &&
    (await rejectDuplicateAmbassadorClaim(event.data.ref, claim))
  ) {
    return;
  }
  if (claim.type === 'ambassador' && claim.status === 'pending') {
    await event.data.ref.update({ status: 'approved', reviewed_at: new Date().toISOString(), reviewed_by: 'system' });
    return;
  }
  await notifyAdminsOfQueue('/tasks?review=claims');
});

/**
 * TODO: the "everyone gets 50 when every Toronto court is visited" award is NOT auto-granted.
 * It needs the total distinct court count, which lives in a CSV served from hosting rather than
 * anywhere Cloud Functions can cheaply read. `site_stats/court_coverage.visited_keys` tracks
 * progress — award the 50 manually via a one-off script once coverage looks complete.
 */
