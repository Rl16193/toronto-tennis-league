// Court player-counts aggregate.
//
// The /courts page shows "N players prefer this court". It used to compute that in the browser by
// downloading the ENTIRE preferences, stats, and users collections — on a public, logged-out page,
// growing linearly with membership, on every visit.
//
// This recomputes the same numbers server-side on a schedule and parks them in one document the
// client reads instead. The client keeps a fallback to the old in-browser path, so nothing breaks
// before this is deployed (or if the doc is ever missing).
//
// Deliberately stores counts keyed by the RAW `preferred_courts` string, not by resolved court
// name: resolving requires the courts CSV and `matchCourtName`, which live in client code. Keeping
// the raw keys means that matching logic stays in exactly one place — the client maps a few
// hundred distinct strings, instead of iterating every user.
//
// Requires deploy: `firebase deploy --only functions:aggregateCourtCounts`

const { onSchedule } = require('firebase-functions/v2/scheduler');
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');
const { TZ, REGION } = require('./lib/constants');

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

// Mirrors NINETY_DAYS_MS in src/pages/courtmap/courtMapUtils.ts — keep in step. A player counts
// toward a court if they have league points OR have been active in the last 90 days.
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

async function computeCourtCounts() {
  const [prefsSnap, statsSnap, usersSnap] = await Promise.all([
    db.collection('preferences').get(),
    db.collection('stats').get(),
    db.collection('users').get(),
  ]);

  const points = new Map();
  statsSnap.forEach((d) => points.set(d.id, Number(d.data().leaguePoints26) || 0));

  const lastActive = new Map();
  usersSnap.forEach((d) => {
    const raw = d.data().lastActive;
    if (raw && typeof raw.toMillis === 'function') lastActive.set(d.id, raw.toMillis());
  });

  const now = Date.now();
  const counts = {};
  prefsSnap.forEach((d) => {
    const preferred = d.data().preferred_courts || [];
    if (!preferred.length) return;
    if (!points.get(d.id) && now - (lastActive.get(d.id) ?? 0) >= NINETY_DAYS_MS) return;
    for (const pref of preferred) {
      const key = String(pref || '').trim();
      if (key) counts[key] = (counts[key] ?? 0) + 1;
    }
  });

  return counts;
}

// Explicit region + timeZone, like every other scheduled function here. The bare-cron form
// defaulted the schedule to UTC, so "every 6 hours" drifted against Toronto local time.
exports.aggregateCourtCounts = onSchedule({ schedule: '0 */6 * * *', timeZone: TZ, region: REGION }, async () => {
  try {
    const counts = await computeCourtCounts();
    await db.doc('site_stats/court_counts').set({
      counts,
      updated_at: new Date().toISOString(),
    });
    logger.info(`[aggregateCourtCounts] wrote ${Object.keys(counts).length} court keys`);
  } catch (err) {
    logger.error('[aggregateCourtCounts] failed', err);
    throw err;
  }
});
