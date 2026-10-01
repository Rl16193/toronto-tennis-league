/**
 * Group / community bonuses — points unlocked by COLLECTIVE activity, not one player's counter.
 * Every award is one `awards/{awardId}` doc (sub_category task) listing its `awardees`; the id is
 * deterministic per event (`matchday_20260722`, `sweep_north-york_0`). Inside the payout
 * transaction a member already in `awardees` is skipped, so a bonus is paid exactly once each, and
 * a later qualifier on the same id (a late Matchday finisher) still collects. Payouts raise
 * stats.rsPoints (recomputed: tiers + initiation + task awards).
 *
 * The court → zone roster is lib/memberLocation.js.
 * Deploy: firebase deploy --only functions
 */
const { onDocumentCreated, onDocumentWritten } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');
const { notify } = require('./lib/notify');
const { torontoParts, toDate, REGION } = require('./lib/constants');
const { courtKey: slug, zoneOfCourt, courtsInZone, allCourts } = require('./lib/memberLocation');
const { isPlayedResult } = require('./lib/scoring');
const { rsPointsPatch } = require('./lib/points');
const db = () => admin.firestore();
const { FieldValue, Timestamp } = require('firebase-admin/firestore');

const NOT_A_MEMBER = 'not_a_member';

// ─── Tunable thresholds (all easily adjusted here) ──────────────────────────────────────────
const MATCHDAY_MIN_MATCHES = 4;   // "more than 3" real matches league-wide on one Toronto day
const MATCHDAY_POINTS = 10;

const HOURLY_OPEN_HOUR = 8;       // inclusive — start of the "every hour covered" window (Toronto)
const HOURLY_CLOSE_HOUR = 22;     // exclusive — so hours 8..21 must each have ≥1 queue photo
const HOURLY_POINTS = 10;

const BOARD_NEW_POINTS = 5;       // a waiting-board photo for a court (once per member per court)
const PIONEER_POINTS = 5;         // first-ever visit at a court
const SWEEP_POINTS = 10;          // the community covers every court in a zone (this cycle)
const EXPLORER_POINTS = 30;       // check-ins and reports cover every court in Toronto (this cycle)

// Friendly label per award, used only for the notification copy below.
const AWARD_LABELS = {
  matchday: 'Matchday',
  hourly_coverage: 'Hourly Coverage',
  pioneer: 'Court Pioneer',
  board_new: 'Board Freshness',
  zone_sweep: 'Full Zone Sweep',
  explorer: 'Explorer',
};

// ─── Payout primitive ───────────────────────────────────────────────────────────────────────
// recipients: [{ uid, name }]. Returns the members newly paid.
async function payGroupAward(awardId, { category, pointsEach, recipients, startedAt = null }) {
  const clean = [...new Map(recipients.filter((r) => r && r.uid && r.uid !== NOT_A_MEMBER).map((r) => [r.uid, r])).values()];
  if (clean.length === 0) return [];
  const ref = db().doc(`awards/${awardId}`);
  const fresh = await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const paid = new Set(snap.exists ? snap.data().awardees || [] : []);
    const newOnes = clean.filter((r) => !paid.has(r.uid));
    if (newOnes.length === 0) return [];
    // Reads first: each new awardee's recomputed RS points (the award isn't written yet, so add it).
    const patches = await Promise.all(newOnes.map((r) => rsPointsPatch(tx, db(), r.uid)));
    const now = Timestamp.now();
    tx.set(ref, {
      category, sub_category: 'task', key: awardId.slice(awardId.indexOf('_') + 1),
      points_each: pointsEach, awardees: [...paid, ...newOnes.map((r) => r.uid)],
      started_at: snap.exists ? snap.data().started_at ?? null : startedAt,
      created_at: snap.exists ? snap.data().created_at : now, updated_at: now,
    });
    newOnes.forEach((r, i) => tx.set(db().doc(`stats/${r.uid}`),
      { rsPoints: patches[i].rsPoints + pointsEach, updated_at: FieldValue.serverTimestamp() }, { merge: true }));
    return newOnes;
  });
  if (fresh.length) {
    await notify(fresh.map((r) => r.uid), {
      type: 'group_award_received',
      title: `You earned a ${AWARD_LABELS[category] || 'group'} bonus: +${pointsEach} points`,
      link: '/tasks',
    });
  }
  return fresh;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// Daily Group Tasks (reset every day — the day is baked into the award id)
// ═══════════════════════════════════════════════════════════════════════════════════════════

// Matchday: MORE THAN 3 real tournament matches (walkovers excluded) played league-wide on one
// Toronto day → 10 to every player who played that day (partners included). Read from applied
// result entries in a ±36h window, narrowed to the exact Toronto day in memory.
exports.onMatchCompletedMatchdayBonus = onDocumentWritten(
  { document: 'submissions/{id}', region: REGION },
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    const played = (s) => s && s.category === 'tournament' && isPlayedResult(s);
    if (!played(after) || after.sub_category !== 'result' || played(before)) return;

    const pivot = toDate(after.completed_at) || new Date();
    const { day } = torontoParts(pivot);
    const WINDOW_MS = 36 * 60 * 60 * 1000;
    const snap = await db().collection('submissions')
      .where('category', '==', 'tournament')
      .where('status', '==', 'applied')
      .where('completed_at', '>=', Timestamp.fromMillis(pivot.getTime() - WINDOW_MS))
      .where('completed_at', '<=', Timestamp.fromMillis(pivot.getTime() + WINDOW_MS))
      .get();
    const matches = new Set();
    const uids = new Set();
    snap.forEach((d) => {
      const s = d.data();
      if (!isPlayedResult(s) || torontoParts(s.completed_at).day !== day) return;
      matches.add(s.match_id);
      Object.keys(s.applied_deltas || {}).forEach((u) => uids.add(u));
    });
    if (matches.size < MATCHDAY_MIN_MATCHES) return;
    await payGroupAward(`matchday_${day}`, {
      category: 'matchday', pointsEach: MATCHDAY_POINTS, recipients: [...uids].map((uid) => ({ uid, name: '' })),
    });
  },
);

// Every hour in the [OPEN, CLOSE) window has ≥1 queue photo at this court today → 10 to each
// member who posted a queue photo there today.
exports.onQueueReportHourlyBonus = onDocumentCreated(
  { document: 'courts/{id}', region: REGION },
  async (event) => {
    const r = event.data?.data();
    if (!r || r.category !== 'report' || r.sub_category !== 'queue' || !r.court_key) return;
    const { day } = torontoParts(r.created_at);
    const snap = await db().collection('courts').where('court_key', '==', r.court_key).where('sub_category', '==', 'queue').get();
    const hours = new Set();
    const byUid = new Map();
    snap.forEach((d) => {
      const x = d.data();
      if (x.category !== 'report') return;
      const p = torontoParts(x.created_at);
      if (p.day !== day) return;
      hours.add(p.hour);
      if (x.uid && !byUid.has(x.uid)) byUid.set(x.uid, x.user_name || '');
    });
    for (let h = HOURLY_OPEN_HOUR; h < HOURLY_CLOSE_HOUR; h += 1) {
      if (!hours.has(h)) return; // a slot is still empty — not covered yet
    }
    await payGroupAward(`hourly_${day}_${r.court_key}`, {
      category: 'hourly_coverage', pointsEach: HOURLY_POINTS, recipients: [...byUid].map(([uid, name]) => ({ uid, name })),
    });
  },
);

// ═══════════════════════════════════════════════════════════════════════════════════════════
// Community Tasks (accumulate over time)
// ═══════════════════════════════════════════════════════════════════════════════════════════

// First-ever visit at a court (check-in or match) → 5 to that pioneer.
exports.onCourtVisitPioneer = onDocumentCreated(
  { document: 'courts/{id}', region: REGION },
  async (event) => {
    const v = event.data?.data();
    if (!v?.uid || v.uid === NOT_A_MEMBER || v.category !== 'visit' || !v.court_key) return;
    const earlier = await db().collection('courts').where('court_key', '==', v.court_key).where('category', '==', 'visit').limit(2).get();
    if (earlier.docs.some((d) => d.id !== event.params.id)) return;
    await payGroupAward(`pioneer_${v.court_key}`, {
      category: 'pioneer', pointsEach: PIONEER_POINTS, recipients: [{ uid: v.uid, name: v.user_name || '' }],
    });
  },
);

// Board Freshness: a waiting-board photo for a court → 5 to the submitter (once per member per court).
exports.onBoardApprovedGroupBonus = onDocumentCreated(
  { document: 'courts/{id}', region: REGION },
  async (event) => {
    const r = event.data?.data() || {};
    if (r.category !== 'report' || r.sub_category !== 'waiting_board' || !r.court_key || !r.uid || r.uid === NOT_A_MEMBER) return;
    await payGroupAward(`board_new_${r.court_key}`, {
      category: 'board_new', pointsEach: BOARD_NEW_POINTS, recipients: [{ uid: r.uid, name: r.user_name || '' }],
    });
  },
);

// One sweep cycle in site_stats/{doc}: adds this court (and a member contributor), and when every
// roster key is covered, closes the cycle (the next one starts at its own first contribution) and
// returns who to pay. started_at is the cycle's first contribution, carried onto the award.
async function advanceSweep(ref, rosterKeys, a, fixed) {
  const member = a.uid && a.uid !== NOT_A_MEMBER;
  return db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : {};
    const covered = new Set(data.covered_keys || []);
    covered.add(a.court_key);
    const contributors = new Set(data.contributors || []);
    if (member) contributors.add(a.uid);
    const names = { ...(data.names || {}) };
    if (member) names[a.uid] = a.user_name || names[a.uid] || '';
    const sweepIndex = data.sweep_index || 0;
    const startedAt = data.started_at || Timestamp.now();
    if (rosterKeys.every((k) => covered.has(k))) {
      tx.set(ref, { ...fixed, started_at: null, sweep_index: sweepIndex + 1, covered_keys: [], contributors: [], names: {}, updated_at: Timestamp.now() });
      return { complete: true, sweepIndex, startedAt, contributors: [...contributors], names };
    }
    tx.set(ref, { ...fixed, started_at: startedAt, sweep_index: sweepIndex, covered_keys: [...covered], contributors: [...contributors], names, updated_at: Timestamp.now() });
    return { complete: false };
  });
}

const payees = (result) => result.contributors.map((uid) => ({ uid, name: result.names[uid] || '' }));

// Full Zone Sweep: visits (check-ins and match visits) and every kind of report cover a court; a
// covered zone pays each member contributor 10. Explorer is the same for the whole city, but only
// check-ins and reports count (a visit written from a score has lat/lng/dist 0) and it pays 30.
exports.onCourtActivityZoneSweep = onDocumentCreated(
  { document: 'courts/{id}', region: REGION },
  async (event) => {
    const a = event.data?.data();
    if (!a?.court_key || !['visit', 'report'].includes(a.category)) return;
    const zone = zoneOfCourt(a.court_key) || a.zone;
    if (zone && courtsInZone(zone).length) {
      const result = await advanceSweep(db().doc(`site_stats/zone_sweep_${slug(zone)}`), courtsInZone(zone), a, { zone, total_courts: courtsInZone(zone).length });
      if (result.complete) {
        await payGroupAward(`sweep_${slug(zone)}_${result.sweepIndex}`, {
          category: 'zone_sweep', pointsEach: SWEEP_POINTS, startedAt: result.startedAt, recipients: payees(result),
        });
      }
    }
    const fromScore = a.category === 'visit' && !a.lat && !a.lng && !a.dist_m;
    if (fromScore || !zoneOfCourt(a.court_key)) return;
    const city = allCourts();
    const result = await advanceSweep(db().doc('site_stats/city_sweep'), city, a, { total_courts: city.length });
    if (result.complete) {
      await payGroupAward(`explorer_${result.sweepIndex}`, {
        category: 'explorer', pointsEach: EXPLORER_POINTS, startedAt: result.startedAt, recipients: payees(result),
      });
    }
  },
);
