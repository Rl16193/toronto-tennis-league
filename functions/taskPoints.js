/**
 * Server-side points: the same milestone catalogue as src/features/tasks/taskCatalog.ts,
 * mirrored here so tiers and the Community Member Initiation get awarded whether or not the
 * player ever opens the Tasks tab. KEEP THIS CATALOGUE IN SYNC WITH taskCatalog.ts BY HAND —
 * same duplication pattern as scripts/regroup-rr.js mirroring rrGeneration.ts.
 *
 * Two award primitives do all the work:
 *   - recordPlayResult   — tournament/ladder results (matchesPlayed, challenges, streaks, months)
 *   - bumpCounterAndAward — every other counter (court visits, photos, volunteering, …)
 * Both run inside a Firestore transaction (read-modify-write on task_progress/{uid}) so two
 * near-simultaneous results for the same player never race each other. Points/tiers/badges are
 * awarded silently — by design, players are not notified when they earn them (only submission
 * approvals/rejections send a notification; see onPhotoReportReviewed / onClaimReviewed below).
 *
 * Deploy with: firebase deploy --only functions
 */
const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');
const { notify, organizerUids } = require('./lib/notify');

const REGION = 'us-central1';
const db = () => admin.firestore();

// ─── Tier catalogue (mirrors taskCatalog.ts CATEGORIES → ALL_TIERS) ─────────────────────────
const ALL_TIERS = [
  { id: 'play5', title: 'Play 5 matches', points: 2, counter: 'matchesPlayed', need: 5 },
  { id: 'play10', title: 'Play 10 matches', points: 5, counter: 'matchesPlayed', need: 10 },
  { id: 'play20', title: 'Play 20 matches', points: 8, counter: 'matchesPlayed', need: 20 },
  { id: 'play30', title: 'Play 30 matches', points: 15, counter: 'matchesPlayed', need: 30 },
  { id: 'play50', title: 'Play 50 matches', points: 25, counter: 'matchesPlayed', need: 50 },

  { id: 'chal1', title: 'Play a challenge', points: 2, counter: 'challengesPlayed', need: 1 },
  { id: 'chal5', title: 'Play 5 challenges', points: 8, counter: 'challengesPlayed', need: 5 },
  { id: 'chal10', title: 'Play 10 challenges', points: 15, counter: 'challengesPlayed', need: 10 },
  { id: 'chal20', title: 'Play 20 challenges', points: 25, counter: 'challengesPlayed', need: 20 },
  { id: 'win5', title: 'Win 5 challenges', points: 15, counter: 'challengesWon', need: 5 },
  { id: 'win10', title: 'Win 10 challenges', points: 25, counter: 'challengesWon', need: 10 },
  { id: 'win20', title: 'Win 20 challenges', points: 40, counter: 'challengesWon', need: 20 },
  { id: 'climb10', title: 'Climb 10 spots', points: 10, counter: 'climbSpots', need: 10 },
  { id: 'climb20', title: 'Climb 20 spots', points: 20, counter: 'climbSpots', need: 20 },
  { id: 'climb50', title: 'Climb 50 spots', points: 50, counter: 'climbSpots', need: 50 },

  { id: 'streak3', title: '3 wins in a row', points: 5, counter: 'bestStreak', need: 3 },
  { id: 'streak5', title: '5 wins in a row', points: 15, counter: 'bestStreak', need: 5 },
  { id: 'streak10', title: '10 wins in a row', points: 30, counter: 'bestStreak', need: 10 },
  { id: 'streak20', title: '20 wins in a row', points: 50, counter: 'bestStreak', need: 20 },

  { id: 'months3', title: 'Play in 3 different months', points: 10, counter: 'monthsActive', need: 3 },
  { id: 'months6', title: 'Play in 6 different months', points: 25, counter: 'monthsActive', need: 6 },
  { id: 'months12', title: 'Play in 12 different months', points: 50, counter: 'monthsActive', need: 12 },

  { id: 'sugg5', title: 'Submit 5 court improvements', points: 10, counter: 'suggestions', need: 5 },
  { id: 'sugg10', title: 'Submit 10 court improvements', points: 20, counter: 'suggestions', need: 10 },

  { id: 'visit1', title: 'Visit 1 court', points: 5, counter: 'courtsVisited', need: 1 },
  { id: 'visit5', title: 'Visit 5 courts', points: 15, counter: 'courtsVisited', need: 5 },
  { id: 'visit10', title: 'Visit 10 courts', points: 25, counter: 'courtsVisited', need: 10 },
  { id: 'visit20', title: 'Visit 20 courts', points: 40, counter: 'courtsVisited', need: 20 },

  { id: 'board1', title: 'Submit 1 waiting board photo', points: 5, counter: 'boardPhotos', need: 1 },
  { id: 'board5', title: 'Submit 5 waiting board photos', points: 15, counter: 'boardPhotos', need: 5 },
  { id: 'board10', title: 'Submit 10 waiting board photos', points: 25, counter: 'boardPhotos', need: 10 },
  { id: 'board20', title: 'Submit 20 waiting board photos', points: 40, counter: 'boardPhotos', need: 20 },

  { id: 'queue10', title: 'Submit 10 queue updates', points: 10, counter: 'queueUpdates', need: 10 },
  { id: 'queue25', title: 'Submit 25 queue updates', points: 20, counter: 'queueUpdates', need: 25 },
  { id: 'queue50', title: 'Submit 50 queue updates', points: 35, counter: 'queueUpdates', need: 50 },
  { id: 'queue100', title: 'Submit 100 queue updates', points: 50, counter: 'queueUpdates', need: 100 },

  { id: 'vol1', title: 'Volunteer at 1 event', points: 5, counter: 'volunteerEvents', need: 1 },
  { id: 'vol5', title: 'Volunteer at 5 events', points: 15, counter: 'volunteerEvents', need: 5 },
  { id: 'vol10', title: 'Volunteer at 10 events', points: 30, counter: 'volunteerEvents', need: 10 },
  { id: 'vol20', title: 'Volunteer at 20 events', points: 50, counter: 'volunteerEvents', need: 20 },

  { id: 'invite1', title: 'Invite 1 player who joins', points: 5, counter: 'invites', need: 1 },
  { id: 'invite3', title: 'Invite 3 players', points: 10, counter: 'invites', need: 3 },
  { id: 'invite10', title: 'Invite 10 players', points: 25, counter: 'invites', need: 10 },

  { id: 'host1', title: 'Host 1 meetup', points: 10, counter: 'meetups', need: 1 },
  { id: 'host5', title: 'Host 5 meetups', points: 30, counter: 'meetups', need: 5 },
  { id: 'host10', title: 'Host 10 meetups', points: 50, counter: 'meetups', need: 10 },
];

// The Initiation checklist — every task is unlocked, so completing every one of these awards
// the flat 25-point setupComplete bonus (mirrors UNLOCKED_TASK_IDS in useTasks.ts).
const INITIATION_TASK_IDS = [
  'profileComplete', 'followSocial', 'tagPost', 'waitingBoard', 'courtVisit', 'queuePhoto',
  'playMatch', 'courtSuggestion', 'whatsappGroup', 'profilePhoto', 'joinEvent', 'ladderMatch',
];

// ─── Award primitives (transactional read-modify-write on task_progress/{uid}) ──────────────

// Tournament / ladder results — streaks and "active months" span both sources, matching the
// client's own useTasks.ts semantics.
async function recordPlayResult(uid, name, { source, won, whenISO }) {
  const ref = db().collection('task_progress').doc(uid);

  await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : {};

    const update = { user_id: uid, name, updatedAt: new Date().toISOString() };

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

    const touched = source === 'tournament'
      ? ['matchesPlayed', 'bestStreak', 'monthsActive']
      : ['challengesPlayed', 'challengesWon', 'bestStreak', 'monthsActive'];
    for (const tier of ALL_TIERS) {
      if (!touched.includes(tier.counter) || data[tier.id]) continue;
      const val = update[tier.counter] !== undefined ? update[tier.counter] : (data[tier.counter] || 0);
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
  const ref = db().collection('task_progress').doc(uid);

  await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : {};

    const newVal = (data[counterField] || 0) + incrementBy;
    const update = { user_id: uid, name, updatedAt: new Date().toISOString(), [counterField]: newVal };

    for (const tier of ALL_TIERS) {
      if (tier.counter !== counterField || data[tier.id]) continue;
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
  await bumpCounterAndAward(uid, name, '__none__', 0, taskId);
}

// ─── Organizer digest: totals only, never names ─────────────────────────────
// Photo reports no longer need review (they auto-approve at creation) — only claims do.
async function notifyOrganizersOfQueue(link) {
  const [claims, organizers] = await Promise.all([
    db().collection('task_claims').where('status', '==', 'pending').get(),
    organizerUids(),
  ]);
  if (claims.size === 0) return;
  await notify(organizers, {
    type: 'organizer_review_pending',
    title: `${claims.size} task${claims.size > 1 ? 's' : ''} need approval`,
    link,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Triggers
// ═══════════════════════════════════════════════════════════════════════════

// Tournament match completed with a real score (walkovers don't count — matches the client gate).
exports.onMatchCompletedAwardPoints = onDocumentUpdated(
  { document: 'tournament_matches/{matchId}', region: REGION },
  async (event) => {
    const before = event.data?.before.data() || {};
    const after = event.data?.after.data() || {};
    if (before.status === 'complete' || after.status !== 'complete') return;
    // A walkover is recorded as sets of 0-0 — still non-null, so it must be excluded explicitly.
    if (after.walkover === true) return;
    if (after.set_1_player_1 == null || after.set_1_player_2 == null) return;
    const whenISO = after.completed_at || new Date().toISOString();
    const pairs = [
      [after.player_1_user_id, after.player_1_name],
      [after.player_2_user_id, after.player_2_name],
    ].filter(([uid]) => uid);
    for (const [uid, name] of pairs) {
      await recordPlayResult(uid, name || '', { source: 'tournament', won: after.winner_user_id === uid, whenISO });
    }
  },
);

// Ladder challenge confirmed by the organizer.
exports.onLadderConfirmedAwardPoints = onDocumentUpdated(
  { document: 'ladder_challenges/{id}', region: REGION },
  async (event) => {
    const before = event.data?.before.data() || {};
    const after = event.data?.after.data() || {};
    if (before.status === 'confirmed' || after.status !== 'confirmed') return;
    const whenISO = after.confirmed_at || new Date().toISOString();
    const pairs = [
      [after.challenger_id, after.challenger_name],
      [after.opponent_id, after.opponent_name],
    ].filter(([uid]) => uid);
    for (const [uid, name] of pairs) {
      await recordPlayResult(uid, name || '', { source: 'ladder', won: after.claimed_winner_id === uid, whenISO });
    }
  },
);

// Joining any event unlocks the Initiation's "joinEvent" checkbox, regardless of whether the
// player ever opens the Tasks tab.
exports.onEventJoinedAwardPoints = onDocumentCreated(
  { document: 'event_participants/{id}', region: REGION },
  async (event) => {
    const p = event.data?.data();
    if (!p?.user_id) return;
    await markInitiationTask(p.user_id, p.user_name || '', 'joinEvent');
  },
);

// Court check-in — one stamp per (player, court); courtsVisited + Traveller tiers.
exports.onCourtVisitAwardPoints = onDocumentCreated(
  { document: 'court_visits/{id}', region: REGION },
  async (event) => {
    const v = event.data?.data();
    if (!v?.user_id) return;
    await bumpCounterAndAward(v.user_id, v.user_name || '', 'courtsVisited', 1, 'courtVisit');
    // Community-wide coverage tally (no auto "everyone gets 50" yet — see README note below).
    await db().doc('site_stats/court_coverage').set(
      { visited_keys: admin.firestore.FieldValue.arrayUnion(v.court_key), updated_at: new Date().toISOString() },
      { merge: true },
    ).catch((e) => logger.error('court_coverage update failed', e));
  },
);

// "Submit a Photo" reports auto-approve at creation (no organizer review step) — award points
// immediately. Anonymous reports (no user_id) earn nothing, since there's no account to credit.
exports.onPhotoReportAwardPoints = onDocumentCreated(
  { document: 'court_reports/{id}', region: REGION },
  async (event) => {
    const r = event.data?.data();
    if (!r?.user_id) return;
    if (r.type === 'waitingBoard') {
      await bumpCounterAndAward(r.user_id, r.user_name || '', 'boardPhotos', 1, 'waitingBoard');
    } else if (r.type === 'queue') {
      await bumpCounterAndAward(r.user_id, r.user_name || '', 'queueUpdates', 1, 'queuePhoto');
    } else {
      // 'condition' — the only type the unified "Submit a Photo" flow writes today. Same counter
      // the legacy text-only suggestion flow used.
      await bumpCounterAndAward(r.user_id, r.user_name || '', 'suggestions', 1, 'courtSuggestion');
    }
  },
);

// Automated image moderation (functions/index.js) can still flip an already-approved report to
// 'rejected' after the fact if the photo is unsafe — let the submitter know. (Points already
// awarded at creation are not reversed here — a deliberate simplification for this rare edge case.)
exports.onPhotoReportRejected = onDocumentUpdated(
  { document: 'court_reports/{id}', region: REGION },
  async (event) => {
    const before = event.data?.before.data() || {};
    const after = event.data?.after.data() || {};
    if (before.status !== 'approved' || after.status !== 'rejected' || !after.user_id) return;
    await notify(after.user_id, {
      type: 'photo_rejected',
      title: 'Your photo was removed',
      body: after.reviewer_note || '',
      link: '/tasks',
    });
  },
);

// Volunteer / Ambassador / Host claims.
exports.onClaimReviewed = onDocumentUpdated(
  { document: 'task_claims/{id}', region: REGION },
  async (event) => {
    const before = event.data?.before.data() || {};
    const after = event.data?.after.data() || {};
    if (before.status !== 'pending') return;
    const claimRef = event.data.after.ref;

    if (after.status === 'approved') {
      if (after.type === 'volunteer') {
        await bumpCounterAndAward(after.user_id, after.user_name || '', 'volunteerEvents', 1, undefined);
      } else if (after.type === 'host') {
        await bumpCounterAndAward(after.user_id, after.user_name || '', 'meetups', 1, undefined);
      } else if (after.type === 'ambassador') {
        // Authoritative "one inviter per member" check — the client's pre-check is only UX.
        const dupe = await db().collection('task_claims')
          .where('type', '==', 'ambassador')
          .where('invitee_id', '==', after.invitee_id)
          .where('status', '==', 'approved')
          .get();
        const other = dupe.docs.find((d) => d.id !== claimRef.id);
        if (other) {
          await claimRef.update({
            status: 'rejected',
            reviewer_note: 'Already claimed by another member.',
            reviewed_at: new Date().toISOString(),
          });
          await notify(after.user_id, {
            type: 'claim_rejected',
            title: `${after.invitee_name || 'That player'} was already claimed by someone else`,
            link: '/tasks',
          });
          return;
        }
        await bumpCounterAndAward(after.user_id, after.user_name || '', 'invites', 1, undefined);
      }
      await notify(after.user_id, {
        type: 'claim_approved',
        title: 'Your task was approved',
        body: after.event_title || after.invitee_name || after.meetup_title || '',
        link: '/tasks',
      });
    } else if (after.status === 'rejected') {
      await notify(after.user_id, {
        type: 'claim_rejected',
        title: 'Your task wasn’t approved',
        body: after.reviewer_note || '',
        link: '/tasks',
      });
    }
  },
);

// Organizer digest — fires whenever a claim needs approval. Totals only (never names); the link
// opens the review queue.
exports.onTaskClaimCreated = onDocumentCreated(
  { document: 'task_claims/{id}', region: REGION },
  async () => {
    await notifyOrganizersOfQueue('/tasks?review=claims');
  },
);

/**
 * NOTE on the "everyone gets 50 when every Toronto court is visited" community award: this
 * requires knowing the total number of distinct courts, which lives in a CSV served from
 * hosting (public/Tennis Courts Facilities - 4326.csv) rather than anywhere Cloud Functions can
 * cheaply read. `site_stats/court_coverage.visited_keys` (written above) tracks progress, but
 * the 50-point award to every member is NOT auto-granted yet — award it manually (a small
 * one-off admin script, same shape as scripts/snapshot-ranks.mjs) once court_coverage looks
 * complete on the map.
 */
