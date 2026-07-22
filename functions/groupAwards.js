/**
 * Group / community bonuses — points that unlock from COLLECTIVE activity, not one player's
 * counter. Unlike taskPoints.js (per-player tiers), these read across many players' documents,
 * then pay a whole group at once. Two ideas make that safe:
 *
 *   1. A deterministic award id per event (e.g. `matchday_20260722_high-park`, `sweep_north-york_0`)
 *      whose group_awards/{awardId} doc is CREATED inside the payout transaction. If the doc
 *      already exists the payout is skipped — so a bonus is paid exactly once even if two
 *      near-simultaneous writes both cross the threshold.
 *   2. Payouts land as `bonusPoints` (a running total) + a `bonusAwards` list on task_progress.
 *      taskPoints() on the client adds bonusPoints to the player's total.
 *
 * Zone-based bonuses need the full court roster server-side (to know when a zone is "complete").
 * That lives in courts.json — GENERATED FROM public/Tennis Courts Facilities - 4326.csv, mapping
 * courtKey -> zone (same courtKey()/getZone() as src/utils). Regenerate it if the CSV changes.
 *
 * Awards are SILENT (no notification) — same policy as taskPoints.js.
 * Deploy with: firebase deploy --only functions
 */
const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');
const ROSTER = require('./courts.json'); // { [courtKey]: zoneName }

const REGION = 'us-central1';
const TZ = 'America/Toronto';
const db = () => admin.firestore();

// ─── Tunable thresholds (all easily adjusted here) ──────────────────────────────────────────
const MATCHDAY_MIN_PLAYERS = 6;   // distinct players checking in at one court on one day
const MATCHDAY_POINTS = 10;

const HOURLY_OPEN_HOUR = 8;       // inclusive — start of the "every hour covered" window (Toronto)
const HOURLY_CLOSE_HOUR = 22;     // exclusive — so hours 8..21 must each have ≥1 queue photo
const HOURLY_POINTS = 10;

const BOARD_NEW_POINTS = 5;       // first approved waiting-board photo for a court
const BOARD_ZONE_POINTS = 10;     // every court in a zone now has an approved board photo
const PIONEER_POINTS = 5;         // first-ever check-in at a court
const SWEEP_POINTS = 10;          // community checks in at every court in a zone (this cycle)

// zone -> [courtKey, …], built once from the roster.
const ZONE_COURTS = (() => {
  const m = {};
  for (const [key, zone] of Object.entries(ROSTER)) (m[zone] = m[zone] || []).push(key);
  return m;
})();

// Doc-id-safe slug (zone names contain spaces / hyphens).
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// Toronto-local calendar day (YYYYMMDD) and hour (0..23) for an ISO timestamp.
function torontoParts(iso) {
  const d = iso ? new Date(iso) : new Date();
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false,
    }).formatToParts(d).map((p) => [p.type, p.value]),
  );
  return { day: `${parts.year}${parts.month}${parts.day}`, hour: parseInt(parts.hour, 10) % 24 };
}

// ─── Payout primitive ───────────────────────────────────────────────────────────────────────
// recipients: [{ uid, name }]. Returns true if it paid, false if the award already existed.
async function payGroupAward(awardId, { type, key, pointsEach, recipients }) {
  const clean = recipients.filter((r) => r && r.uid);
  if (clean.length === 0) return false;
  const awardRef = db().doc(`group_awards/${awardId}`);
  return db().runTransaction(async (tx) => {
    const snap = await tx.get(awardRef);
    if (snap.exists) return false;
    tx.set(awardRef, {
      type,
      key: key || null,
      points_each: pointsEach,
      recipient_ids: clean.map((r) => r.uid),
      recipient_count: clean.length,
      created_at: new Date().toISOString(),
    });
    for (const r of clean) {
      tx.set(db().doc(`task_progress/${r.uid}`), {
        user_id: r.uid,
        ...(r.name ? { name: r.name } : {}),
        bonusPoints: admin.firestore.FieldValue.increment(pointsEach),
        bonusAwards: admin.firestore.FieldValue.arrayUnion(awardId),
        updatedAt: new Date().toISOString(),
      }, { merge: true });
    }
    return true;
  });
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// Daily Group Tasks (reset every day — the day is baked into the award id)
// ═══════════════════════════════════════════════════════════════════════════════════════════

// Matchday + Full Zone Sweep both read off the append-only attendance log.
exports.onCourtAttendanceGroupBonus = onDocumentCreated(
  { document: 'court_attendance/{id}', region: REGION },
  async (event) => {
    const a = event.data?.data();
    if (!a?.user_id || !a.court_key) return;
    const { day } = torontoParts(a.created_at);
    await matchdayCheck(a.court_key, day);
    await zoneSweepCheck(a);
  },
);

// ≥ MATCHDAY_MIN_PLAYERS distinct players checked in at the same court on the same day → 10 each.
async function matchdayCheck(courtKey, day) {
  const snap = await db().collection('court_attendance').where('court_key', '==', courtKey).get();
  const byUid = new Map();
  snap.forEach((d) => {
    const x = d.data();
    if (torontoParts(x.created_at).day !== day) return;
    if (x.user_id && !byUid.has(x.user_id)) byUid.set(x.user_id, x.user_name || '');
  });
  if (byUid.size < MATCHDAY_MIN_PLAYERS) return;
  const recipients = [...byUid].map(([uid, name]) => ({ uid, name }));
  await payGroupAward(`matchday_${day}_${courtKey}`, {
    type: 'matchday', key: courtKey, pointsEach: MATCHDAY_POINTS, recipients,
  });
}

// Every hour in the [OPEN, CLOSE) window has ≥1 queue photo at this court today → 10 to each
// player who posted a queue photo there today.
exports.onQueueReportHourlyBonus = onDocumentCreated(
  { document: 'court_reports/{id}', region: REGION },
  async (event) => {
    const r = event.data?.data();
    if (!r || r.type !== 'queue' || !r.court_key) return;
    const { day } = torontoParts(r.created_at);
    const snap = await db().collection('court_reports').where('court_key', '==', r.court_key).get();
    const hours = new Set();
    const byUid = new Map();
    snap.forEach((d) => {
      const x = d.data();
      if (x.type !== 'queue') return;
      const p = torontoParts(x.created_at);
      if (p.day !== day) return;
      hours.add(p.hour);
      if (x.user_id && !byUid.has(x.user_id)) byUid.set(x.user_id, x.user_name || '');
    });
    for (let h = HOURLY_OPEN_HOUR; h < HOURLY_CLOSE_HOUR; h += 1) {
      if (!hours.has(h)) return; // a slot is still empty — not covered yet
    }
    const recipients = [...byUid].map(([uid, name]) => ({ uid, name }));
    await payGroupAward(`hourly_${day}_${r.court_key}`, {
      type: 'hourly_coverage', key: r.court_key, pointsEach: HOURLY_POINTS, recipients,
    });
  },
);

// ═══════════════════════════════════════════════════════════════════════════════════════════
// Community Tasks (accumulate over time)
// ═══════════════════════════════════════════════════════════════════════════════════════════

// First-ever check-in at a court → 5 to that pioneer. court_visits are one-per-(player,court) and
// append-only, so the very first doc for a court is that court's first-ever visit.
exports.onCourtVisitPioneer = onDocumentCreated(
  { document: 'court_visits/{id}', region: REGION },
  async (event) => {
    const v = event.data?.data();
    if (!v?.user_id || !v.court_key) return;
    await payGroupAward(`pioneer_${v.court_key}`, {
      type: 'pioneer', key: v.court_key, pointsEach: PIONEER_POINTS,
      recipients: [{ uid: v.user_id, name: v.user_name || '' }],
    });
  },
);

// Board Freshness: first approved waiting-board photo for a court → 5 to the submitter; and once
// EVERY court in the zone has an approved board photo → 10 to everyone who contributed one.
exports.onBoardApprovedGroupBonus = onDocumentUpdated(
  { document: 'court_reports/{id}', region: REGION },
  async (event) => {
    const before = event.data?.before.data() || {};
    const after = event.data?.after.data() || {};
    if (before.status === 'approved' || after.status !== 'approved') return;
    if (after.type !== 'waitingBoard' || !after.court_key || !after.user_id) return;

    const submitter = { uid: after.user_id, name: after.user_name || '' };
    await payGroupAward(`board_new_${after.court_key}`, {
      type: 'board_new', key: after.court_key, pointsEach: BOARD_NEW_POINTS, recipients: [submitter],
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
      contributors.add(after.user_id);
      const names = { ...(data.names || {}) };
      names[after.user_id] = after.user_name || names[after.user_id] || '';
      tx.set(ref, { zone, covered_keys: [...covered], contributors: [...contributors], names }, { merge: true });
      return { covered: [...covered], contributors: [...contributors], names };
    });
    if (!rosterKeys.every((k) => acc.covered.includes(k))) return;
    const recipients = acc.contributors.map((uid) => ({ uid, name: acc.names[uid] || '' }));
    await payGroupAward(`board_zone_${slug(zone)}`, {
      type: 'board_zone', key: zone, pointsEach: BOARD_ZONE_POINTS, recipients,
    });
  },
);

// Full Zone Sweep: the community checks in at every court in a zone. On completion, pay every
// contributor 10, record how long the cycle took (the baseline metric), then RESET to 0 so the
// next cycle starts fresh. Driven by attendance (repeatable) — passport visits are once-forever
// and so could never seed a second sweep.
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
    if (a.user_id) contributors.add(a.user_id);
    const names = { ...(data.names || {}) };
    if (a.user_id) names[a.user_id] = a.user_name || names[a.user_id] || '';
    const sweepIndex = data.sweep_index || 0;
    const startedAt = data.started_at || nowISO;

    if (rosterKeys.every((k) => covered.has(k))) {
      // Close this sweep and reset the accumulator for the next cycle (starts from 0).
      tx.set(ref, { zone, started_at: nowISO, sweep_index: sweepIndex + 1, covered_keys: [], contributors: [], names: {} });
      return { complete: true, sweepIndex, startedAt, contributors: [...contributors], names };
    }
    tx.set(ref, { zone, started_at: startedAt, sweep_index: sweepIndex, covered_keys: [...covered], contributors: [...contributors], names }, { merge: true });
    return { complete: false };
  });

  if (!result.complete) return;
  const recipients = result.contributors.map((uid) => ({ uid, name: result.names[uid] || '' }));
  const paid = await payGroupAward(`sweep_${slug(zone)}_${result.sweepIndex}`, {
    type: 'zone_sweep', key: zone, pointsEach: SWEEP_POINTS, recipients,
  });
  if (paid) {
    const days = Math.max(0, Math.round((Date.parse(nowISO) - Date.parse(result.startedAt)) / 86400000));
    await db().doc(`zone_sweeps/${slug(zone)}_${result.sweepIndex}`).set({
      zone,
      sweep_index: result.sweepIndex,
      started_at: result.startedAt,
      completed_at: nowISO,
      days_taken: days,
      court_count: rosterKeys.length,
      contributor_count: recipients.length,
    }).catch((e) => logger.error('zone_sweep history write failed', e));
  }
}
