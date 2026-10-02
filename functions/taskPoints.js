/**
 * Task progress: the counters on stats/{uid} that the task catalogue (lib/points.js ↔
 * src/features/tasks/taskCatalog.ts) reads. Every write recomputes stats.rsPoints in the same
 * transaction (rsPointsPatch), so RS points always equal tiers reached + initiation + task awards.
 * Tier flags are not stored: a tier is reached when its counter is.
 *
 * matchesPlayed is not touched here: it is a league counter, paid by commitPoints with the result.
 *
 * Deploy: firebase deploy --only functions
 */
const { onDocumentCreated, onDocumentUpdated, onDocumentWritten } = require('firebase-functions/v2/firestore');
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');
const { notify, organizerUids } = require('./lib/notify');
const { torontoParts, isGuest, REGION } = require('./lib/constants');
const { courtKey: toCourtKey, zoneOfCourt, courtsInZone, writeMatchVisits, holdMatchVisits } = require('./lib/memberLocation');
const { isPlayedResult } = require('./lib/scoring');
const { rsPointsPatch } = require('./lib/points');
const db = () => admin.firestore();
const { FieldValue, Timestamp } = require('firebase-admin/firestore');

const NOT_A_MEMBER = 'not_a_member';

/** Writes a stats patch with rsPoints recomputed, in one transaction. `build(stats)` returns the patch. */
async function updateCounters(uid, name, build) {
  if (!uid || uid === NOT_A_MEMBER || isGuest(uid)) return;
  const ref = db().collection('stats').doc(uid);
  await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const patch = build(snap.exists ? snap.data() : {});
    if (!patch) return;
    const withRs = await rsPointsPatch(tx, db(), uid, patch);
    tx.set(ref, { ...withRs, ...(name ? { name } : {}), updated_at: FieldValue.serverTimestamp() }, { merge: true });
  });
}

const bump = (uid, name, field, by = 1) =>
  updateCounters(uid, name, (s) => ({ [field]: (typeof s[field] === 'number' ? s[field] : 0) + by }));

/**
 * A played result for one member: challenge counters, streaks and active months. Tournament
 * matches, challenges and rallies all count toward streaks and months.
 */
function recordPlayResult(uid, name, { isChallenge, won, when }) {
  return updateCounters(uid, name, (s) => {
    const patch = {};
    if (isChallenge) {
      patch.challengesPlayed = (s.challengesPlayed || 0) + 1;
      if (won) patch.challengesWon = (s.challengesWon || 0) + 1;
    }
    patch.currentStreak = won ? (s.currentStreak || 0) + 1 : 0;
    patch.bestStreak = Math.max(s.bestStreak || 0, patch.currentStreak);
    const months = new Set(Array.isArray(s.active_months) ? s.active_months : []);
    months.add(torontoParts(when).month);
    patch.active_months = [...months];
    patch.monthsActive = months.size;
    return patch;
  });
}

/**
 * A court named on a played result is proof of presence: every player on court (both sides and
 * their doubles partners) gets that day's visit — but only at a court on the roster. A court not on
 * it is held until an organizer adds it (lib/memberLocation.js), and they're asked to.
 */
async function visitsFromResult(uids, courtName, category, when) {
  const key = toCourtKey(courtName);
  if (!key) return;
  const visit = { uids, courtKey: key, courtName, category, at: when || Timestamp.now() };
  if (zoneOfCourt(key)) return writeMatchVisits(db(), visit);
  if (await holdMatchVisits(db(), visit)) {
    await notify(await organizerUids(), {
      type: 'custom_court',
      title: 'Court not in the list',
      body: `A score was recorded at "${courtName}". Add it to the courts list so the players' visits count.`,
      link: '/profile?dash=organizer',
    });
  }
}

// ─── Organizer digest: totals only, never names ─────────────────────────────
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

// A match played for the first time (its first applied result entry, not a correction, not a
// walkover), whether a player or an organizer recorded it: streaks/months for both players,
// challenge counters for a challenge, and a visit for everyone on court when a court was named.
exports.onMatchCompletedAwardPoints = onDocumentWritten(
  { document: 'submissions/{id}', region: REGION },
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!isPlayedResult(after) || after.sub_category !== 'result' || isPlayedResult(before)) return;
    const matchSnap = await db().doc(`matches/${after.match_id}`).get();
    if (!matchSnap.exists) return;
    const m = matchSnap.data();
    const when = after.completed_at || after.created_at;
    const players = [[m.player_1_uid, m.player_1_name], [m.player_2_uid, m.player_2_name]].filter(([u]) => u);
    for (const [uid, name] of players) {
      await recordPlayResult(uid, name || '', { isChallenge: m.category === 'challenge', won: after.winner_uid === uid, when });
    }
    if (after.court) {
      const onCourt = new Set([...(Array.isArray(m.participant_uids) ? m.participant_uids : []), ...players.map(([u]) => u)]);
      await visitsFromResult([...onCourt].filter((u) => u && !isGuest(u)), after.court, m.category, when)
        .catch((e) => logger.error('visits from result failed', e));
    }
  },
);

/** "Visit every court in your zone" (the visitZone tier): set once, when the last court is visited. */
async function awardZoneCompleteIfDone(uid, name, visitedCourtKey) {
  const [statsSnap, prefsSnap] = await Promise.all([db().doc(`stats/${uid}`).get(), db().doc(`preferences/${uid}`).get()]);
  if (statsSnap.exists && statsSnap.data().zoneComplete) return;
  const zone = (prefsSnap.exists && prefsSnap.data().preferred_zone) || zoneOfCourt(visitedCourtKey);
  if (!zone) return;
  const zoneKeys = courtsInZone(zone);
  if (zoneKeys.length === 0) return;
  const visits = await db().collection('courts').where('uid', '==', uid).where('category', '==', 'visit').get();
  const visited = new Set(visits.docs.map((d) => d.data().court_key).filter(Boolean));
  if (!zoneKeys.every((k) => visited.has(k))) return;
  await updateCounters(uid, name, () => ({ zoneComplete: 1 }));
}

// A visit (check-in or match): courtsVisited counts distinct courts, so only a member's first-ever
// visit to a court moves it. Reports: the member's report counters. Signed-out reports earn nothing.
exports.onCourtVisitAwardPoints = onDocumentCreated(
  { document: 'courts/{id}', region: REGION },
  async (event) => {
    const v = event.data?.data();
    if (!v?.uid || v.uid === NOT_A_MEMBER) return;
    if (v.category === 'visit') {
      const earlier = await db().collection('courts').where('uid', '==', v.uid).where('court_key', '==', v.court_key)
        .where('category', '==', 'visit').limit(2).get();
      if (earlier.docs.filter((d) => d.id !== event.params.id).length === 0) {
        await bump(v.uid, v.user_name || '', 'courtsVisited');
        await awardZoneCompleteIfDone(v.uid, v.user_name || '', v.court_key).catch((e) => logger.error('zoneComplete check failed', e));
      }
      await db().doc('site_stats/court_coverage').set(
        { visited_keys: FieldValue.arrayUnion(v.court_key), updated_at: FieldValue.serverTimestamp() },
        { merge: true },
      ).catch((e) => logger.error('court_coverage update failed', e));
    } else if (v.category === 'report') {
      const field = { waiting_board: 'boardPhotos', queue: 'queueUpdates', condition: 'suggestions' }[v.sub_category];
      if (field) await bump(v.uid, v.user_name || '', field);
    }
  },
);

// A self-reported task (profile photo, WhatsApp group, …) ticked or revoked moves the initiation
// bonus, so RS points are recomputed. Writes only when the value changes, so it can't loop.
const SELF_REPORTED = ['profilePhoto', 'profileComplete', 'whatsappGroup', 'followSocial', 'tagPost'];
exports.onSelfReportedTask = onDocumentUpdated(
  { document: 'stats/{uid}', region: REGION },
  async (event) => {
    const before = event.data?.before.data() || {};
    const after = event.data?.after.data() || {};
    if (!SELF_REPORTED.some((k) => before[k] !== after[k])) return;
    const uid = event.params.uid;
    await db().runTransaction(async (tx) => {
      const { rsPoints } = await rsPointsPatch(tx, db(), uid);
      if (rsPoints !== after.rsPoints) tx.set(db().doc(`stats/${uid}`), { rsPoints, updated_at: FieldValue.serverTimestamp() }, { merge: true });
    });
  },
);

const CLAIM = {
  volunteer: ['volunteerClaimed', 'volunteerApproved', 'latestVolunteerStatus'],
  ambassador: ['inviteClaimed', 'inviteApproved', 'latestInviteStatus'],
  host: ['hostClaimed', 'hostApproved', 'latestHostStatus'],
};

// A new claim: the member's latest status for that kind reads pending; organizers get a digest.
exports.onTaskClaimCreated = onDocumentCreated(
  { document: 'task_claims/{id}', region: REGION },
  async (event) => {
    const c = event.data?.data();
    const keys = c && CLAIM[c.category];
    if (keys) await updateCounters(c.uid, c.user_name || '', () => ({ [keys[2]]: 'pending' }));
    await notifyOrganizersOfQueue('/profile?dash=organizer');
  },
);

// A reviewed claim: claimed counts at review (approve or reject), so rejected = claimed - approved.
exports.onClaimReviewed = onDocumentUpdated(
  { document: 'task_claims/{id}', region: REGION },
  async (event) => {
    const before = event.data?.before.data() || {};
    const after = event.data?.after.data() || {};
    if (before.status !== 'pending' || !['approved', 'rejected'].includes(after.status)) return;
    const keys = CLAIM[after.category];
    if (!keys) return;
    const claimRef = event.data.after.ref;

    let approved = after.status === 'approved';
    let note = after.reviewer_note || '';
    if (approved && after.category === 'ambassador') {
      // Authoritative "one inviter per member" check — the client's pre-check is only UX. The
      // re-fire of this rewrite returns early (its before-status is no longer pending).
      const dupe = await db().collection('task_claims')
        .where('category', '==', 'ambassador').where('invitee_uid', '==', after.invitee_uid).where('status', '==', 'approved').get();
      if (dupe.docs.some((d) => d.id !== claimRef.id)) {
        approved = false;
        note = `${after.invitee_name || 'That player'} was already claimed by someone else`;
        await claimRef.update({ status: 'rejected', reviewer_note: 'Already claimed by another member.', reviewed_at: FieldValue.serverTimestamp() });
      }
    }
    await updateCounters(after.uid, after.user_name || '', (s) => ({
      [keys[0]]: (s[keys[0]] || 0) + 1,
      ...(approved ? { [keys[1]]: (s[keys[1]] || 0) + 1 } : {}),
      [keys[2]]: approved ? 'approved' : 'rejected',
    }));
    await notify(after.uid, approved
      ? { type: 'claim_approved', title: 'Your task was approved', body: after.event_title || after.invitee_name || after.meetup_title || '', link: '/tasks' }
      : { type: 'claim_rejected', title: 'Your task wasn’t approved', body: note, link: '/tasks' });
  },
);
