/**
 * Group / community bonuses — points unlocked by COLLECTIVE activity, not one player's counter.
 * Unlike taskPoints.js (per-player tiers), these read across many players' docs and pay a group at
 * once. Two rules make that safe:
 *   1. A deterministic award id per event (`matchday_20260722`, `sweep_north-york_0`), with a
 *      per-recipient ledger doc `tasks/{awardId}_{uid}` CREATED inside the payout transaction.
 *      An existing doc means "skip" — so a bonus is paid exactly once under concurrent writes.
 *   2. Payouts land as `bonusPoints` + a `bonusAwards` list on tasks/{uid}.
 *
 * courts.json is the server-side courtKey → zone roster, GENERATED FROM
 * public/Tennis Courts Facilities - 4326.csv. Regenerate it if the CSV changes.
 * Deployment is environment-gated. Follow docs/architecture/ENVIRONMENTS_AND_DEPLOYMENT.md;
 * do not use a bare Firebase deploy command from this checkout.
 */
const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');
const { notify } = require('./lib/notify');
const ROSTER = require('./courts.json'); // { [courtKey]: zoneName }

const { TZ, REGION } = require('./lib/constants');
const db = () => admin.firestore();

// ─── Tunable thresholds (all easily adjusted here) ──────────────────────────────────────────
const MATCHDAY_MIN_MATCHES = 4; // "more than 3" real matches league-wide on one Toronto day
const MATCHDAY_POINTS = 10;

const HOURLY_OPEN_HOUR = 8; // inclusive — start of the "every hour covered" window (Toronto)
const HOURLY_CLOSE_HOUR = 22; // exclusive — so hours 8..21 must each have ≥1 queue photo
const HOURLY_POINTS = 10;

const BOARD_NEW_POINTS = 5; // first approved waiting-board photo for a court
const BOARD_ZONE_POINTS = 10; // every court in a zone now has an approved board photo
const PIONEER_POINTS = 5; // first-ever check-in at a court
const SWEEP_POINTS = 10; // community checks in at every court in a zone (this cycle)

// zone -> [courtKey, …], built once from the roster.
const ZONE_COURTS = (() => {
  const m = {};
  for (const [key, zone] of Object.entries(ROSTER)) (m[zone] = m[zone] || []).push(key);
  return m;
})();

// Doc-id-safe slug (zone names contain spaces / hyphens).
const slug = (s) =>
  String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

// Toronto-local calendar day (YYYYMMDD) and hour (0..23) for an ISO timestamp.
function torontoParts(iso) {
  const d = iso ? new Date(iso) : new Date();
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hour12: false,
    })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  );
  return { day: `${parts.year}${parts.month}${parts.day}`, hour: parseInt(parts.hour, 10) % 24 };
}

// ─── Payout primitive ───────────────────────────────────────────────────────────────────────
// recipients: [{ uid, name }]. Returns true if anyone got paid. One-shot awards (the default) pay
// exactly once; `allowTopUp` awards (Matchday) may pay again on the SAME id but only to recipients
// who haven't received it, so a late finisher still collects and nobody is paid twice.
// Friendly label per award type, used only for the notification copy below.
const AWARD_LABELS = {
  matchday: 'Matchday',
  hourly_coverage: 'Hourly Coverage',
  pioneer: 'Court Pioneer',
  board_new: 'Board Freshness',
  board_zone: 'Board Freshness',
  zone_sweep: 'Full Zone Sweep',
};

async function payGroupAward(awardId, { type, key: _key, pointsEach, recipients, allowTopUp = false }) {
  const clean = recipients.filter((r) => r && r.uid);
  if (clean.length === 0) return false;
  const nowISO = new Date().toISOString();
  const newOnes = await db().runTransaction(async (tx) => {
    const fresh = [];
    for (const r of clean) {
      const entryRef = db().doc(`tasks/${awardId}_${r.uid}`);
      const entrySnap = await tx.get(entryRef);
      // One-shot: skip recipients already paid for this award id.
      // allowTopUp (Matchday) has the same per-recipient check — new recipients to a
      // still-active award day get paid, but nobody is ever paid twice.
      if (entrySnap.exists && !allowTopUp) continue;
      if (entrySnap.exists && allowTopUp) continue;
      // Write the per-recipient ledger entry
      tx.set(entryRef, {
        uid: r.uid,
        type: 'group',
        category: 'group',
        sub_category: type,
        award_name: AWARD_LABELS[type] || '',
        points_each: pointsEach,
        created_at: nowISO,
      });
      // Still write bonusPoints into the per-user progress doc
      tx.set(
        db().doc(`tasks/${r.uid}`),
        {
          uid: r.uid,
          category: 'progress',
          ...(r.name ? { name: r.name } : {}),
          bonusPoints: admin.firestore.FieldValue.increment(pointsEach),
          bonusAwards: admin.firestore.FieldValue.arrayUnion(awardId),
          updatedAt: nowISO,
        },
        { merge: true },
      );
      fresh.push(r);
    }
    return fresh;
  });
  if (newOnes.length === 0) return false;
  await notify(
    newOnes.map((r) => r.uid),
    {
      type: 'group_award_received',
      title: `You earned a ${AWARD_LABELS[type] || 'group'} bonus — +${pointsEach} points`,
      body: '',
      link: '/tasks',
    },
  );
  return true;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// Daily Group Tasks (reset every day — the day is baked into the award id)
// ═══════════════════════════════════════════════════════════════════════════════════════════

// Full Zone Sweep reads off the append-only attendance log. The `courts` collection also holds
// check-ins and photo reports, so gate on the 'attendance' type.
exports.onCourtAttendanceGroupBonus = onDocumentCreated({ document: 'courts/{id}', region: REGION }, async (event) => {
  const a = event.data?.data();
  if (!a?.uid || a.type !== 'attendance' || !a.court_key) return;
  await zoneSweepCheck(a);
});

// Matchday: MORE THAN 3 real matches (walkover-excluded — same gate as taskPoints.js) completed
// league-wide on one Toronto day → 10 to every player who played that day. Top-up award: players
// whose match lands later the same day still collect, exactly once.
exports.onMatchCompletedMatchdayBonus = onDocumentUpdated(
  { document: 'matches/{matchId}', region: REGION },
  async (event) => {
    const before = event.data?.before.data() || {};
    const after = event.data?.after.data() || {};
    if (after.category !== 'singles' && after.category !== 'doubles') return;
    if (before.status === 'complete' || after.status !== 'complete') return;
    if (after.walkover === true) return;
    if (after.set_1_player_1 == null || after.set_1_player_2 == null) return;

    const { day } = torontoParts(after.completed_at);

    // Bounded to a ±36h ISO window around the match, then narrowed to the exact Toronto day in
    // memory. This used to read EVERY completed match in the league on every completion —
    // quadratic, and the first query here that would time out. `completed_at` is an ISO-8601 UTC
    // string, so a lexicographic range needs only the automatic single-field index.
    const pivot = after.completed_at ? new Date(after.completed_at) : new Date();
    const WINDOW_MS = 36 * 60 * 60 * 1000;
    const lowIso = new Date(pivot.getTime() - WINDOW_MS).toISOString();
    const highIso = new Date(pivot.getTime() + WINDOW_MS).toISOString();

    const snap = await db()
      .collection('matches')
      .where('category', 'in', ['singles', 'doubles'])
      .where('completed_at', '>=', lowIso)
      .where('completed_at', '<=', highIso)
      .get();
    let dayMatches = 0;
    const byUid = new Map();
    snap.forEach((d) => {
      const m = d.data();
      if (m.status !== 'complete') return;
      if (m.walkover === true) return;
      if (m.set_1_player_1 == null || m.set_1_player_2 == null) return;
      if (torontoParts(m.completed_at).day !== day) return;
      dayMatches += 1;
      if (m.player_1_uid && !byUid.has(m.player_1_uid)) byUid.set(m.player_1_uid, m.player_1_name || '');
      if (m.player_2_uid && !byUid.has(m.player_2_uid)) byUid.set(m.player_2_uid, m.player_2_name || '');
    });
    if (dayMatches < MATCHDAY_MIN_MATCHES) return;
    const recipients = [...byUid].map(([uid, name]) => ({ uid, name }));
    await payGroupAward(`matchday_${day}`, {
      type: 'matchday',
      key: day,
      pointsEach: MATCHDAY_POINTS,
      recipients,
      allowTopUp: true,
    });
  },
);

// Every hour in the [OPEN, CLOSE) window has ≥1 queue photo at this court today → 10 to each
// player who posted a queue photo there today.
exports.onQueueReportHourlyBonus = onDocumentCreated({ document: 'courts/{id}', region: REGION }, async (event) => {
  const r = event.data?.data();
  if (!r || r.type !== 'queue' || !r.court_key) return;
  const { day } = torontoParts(r.created_at);
  const snap = await db().collection('courts').where('court_key', '==', r.court_key).get();
  const hours = new Set();
  const byUid = new Map();
  snap.forEach((d) => {
    const x = d.data();
    if (x.type !== 'queue') return;
    const p = torontoParts(x.created_at);
    if (p.day !== day) return;
    hours.add(p.hour);
    if (x.uid && !byUid.has(x.uid)) byUid.set(x.uid, x.user_name || '');
  });
  for (let h = HOURLY_OPEN_HOUR; h < HOURLY_CLOSE_HOUR; h += 1) {
    if (!hours.has(h)) return; // a slot is still empty — not covered yet
  }
  const recipients = [...byUid].map(([uid, name]) => ({ uid, name }));
  await payGroupAward(`hourly_${day}_${r.court_key}`, {
    type: 'hourly_coverage',
    key: r.court_key,
    pointsEach: HOURLY_POINTS,
    recipients,
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════
// Community Tasks (accumulate over time)
// ═══════════════════════════════════════════════════════════════════════════════════════════

// First-ever check-in at a court → 5 to that pioneer. Check-ins are one-per-(player,court) and
// append-only, so the very first 'check-in' doc for a court is that court's first-ever visit.
exports.onCourtVisitPioneer = onDocumentCreated({ document: 'courts/{id}', region: REGION }, async (event) => {
  const v = event.data?.data();
  if (!v?.uid || v.type !== 'check-in' || !v.court_key) return;
  await payGroupAward(`pioneer_${v.court_key}`, {
    type: 'pioneer',
    key: v.court_key,
    pointsEach: PIONEER_POINTS,
    recipients: [{ uid: v.uid, name: v.user_name || '' }],
  });
});

// Board Freshness: first approved waiting-board photo for a court → 5 to the submitter; once EVERY
// court in the zone has one → 10 to each contributor.
// onDocumentCreated, NOT onDocumentUpdated: reports auto-approve, and firestore.rules forbids
// updates entirely, so the old update trigger waited for a transition that can never happen.
exports.onBoardApprovedGroupBonus = onDocumentCreated({ document: 'courts/{id}', region: REGION }, async (event) => {
  const after = event.data?.data() || {};
  if (after.status !== 'approved') return;
  if (after.type !== 'waiting_board' || !after.court_key || !after.uid || after.uid === 'no_account') return;

  const submitter = { uid: after.uid, name: after.user_name || '' };
  await payGroupAward(`board_new_${after.court_key}`, {
    type: 'board_new',
    key: after.court_key,
    pointsEach: BOARD_NEW_POINTS,
    recipients: [submitter],
  });

  const zone = ROSTER[after.court_key];
  if (!zone || !ZONE_COURTS[zone]) return;
  const rosterKeys = ZONE_COURTS[zone];
  const ref = db().doc(`site_stats/board_zone_${slug(zone)}`);
  const acc = await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : {};
    const covered = new Set(data.covered_keys || []);
    covered.add(after.court_key);
    const contributors = new Set(data.contributors || []);
    contributors.add(after.uid);
    const names = { ...(data.names || {}) };
    names[after.uid] = after.user_name || names[after.uid] || '';
    tx.set(ref, { zone, covered_keys: [...covered], contributors: [...contributors], names }, { merge: true });
    return { covered: [...covered], contributors: [...contributors], names };
  });
  if (!rosterKeys.every((k) => acc.covered.includes(k))) return;
  const recipients = acc.contributors.map((uid) => ({ uid, name: acc.names[uid] || '' }));
  await payGroupAward(`board_zone_${slug(zone)}`, {
    type: 'board_zone',
    key: zone,
    pointsEach: BOARD_ZONE_POINTS,
    recipients,
  });
});

// Full Zone Sweep: the community checks in at every court in a zone. Pay each contributor 10,
// record the cycle duration, then RESET to 0 so the next cycle starts fresh. Driven by attendance
// (repeatable) — passport visits are once-forever and could never seed a second sweep.
async function zoneSweepCheck(a) {
  const zone = ROSTER[a.court_key] || a.zone;
  if (!zone || !ZONE_COURTS[zone]) return;
  const rosterKeys = ZONE_COURTS[zone];
  const ref = db().doc(`site_stats/zone_sweep_${slug(zone)}`);
  const nowISO = new Date().toISOString();

  const result = await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : {};
    const covered = new Set(data.covered_keys || []);
    covered.add(a.court_key);
    const contributors = new Set(data.contributors || []);
    if (a.uid) contributors.add(a.uid);
    const names = { ...(data.names || {}) };
    if (a.uid) names[a.uid] = a.user_name || names[a.uid] || '';
    const sweepIndex = data.sweep_index || 0;
    const startedAt = data.started_at || nowISO;

    if (rosterKeys.every((k) => covered.has(k))) {
      // Close this sweep and reset the accumulator for the next cycle (starts from 0).
      tx.set(ref, {
        zone,
        started_at: nowISO,
        sweep_index: sweepIndex + 1,
        covered_keys: [],
        contributors: [],
        names: {},
      });
      return { complete: true, sweepIndex, startedAt, contributors: [...contributors], names };
    }
    tx.set(
      ref,
      {
        zone,
        started_at: startedAt,
        sweep_index: sweepIndex,
        covered_keys: [...covered],
        contributors: [...contributors],
        names,
      },
      { merge: true },
    );
    return { complete: false };
  });

  if (!result.complete) return;
  const recipients = result.contributors.map((uid) => ({ uid, name: result.names[uid] || '' }));
  const paid = await payGroupAward(`sweep_${slug(zone)}_${result.sweepIndex}`, {
    type: 'zone_sweep',
    key: zone,
    pointsEach: SWEEP_POINTS,
    recipients,
  });
  if (paid) {
    const days = Math.max(0, Math.round((Date.parse(nowISO) - Date.parse(result.startedAt)) / 86400000));
    await db()
      .doc(`tasks/zone_sweep_${slug(zone)}_${result.sweepIndex}`)
      .set({
        type: 'group',
        sub_category: 'zone_sweep',
        award_name: 'Full Zone Sweep',
        zone,
        sweep_index: result.sweepIndex,
        started_at: result.startedAt,
        completed_at: nowISO,
        created_at: nowISO,
        days_taken: days,
        court_count: rosterKeys.length,
        contributor_count: recipients.length,
      })
      .catch((e) => logger.error('zone_sweep history write failed', e));
  }
}
