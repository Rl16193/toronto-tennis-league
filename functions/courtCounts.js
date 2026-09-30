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
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');
const { TZ, REGION } = require('./lib/constants');
const { courtKey } = require('./lib/memberLocation');

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

// Recent activity per court, for the map's Recent Activity view. Every event counts once, so a
// member who checks in, plays a match and files a report contributes 3 — that is deliberate: the
// number answers "how busy has this court been", not "how many people".
//
// Two key spaces, for the same reason computeCourtCounts stores raw preference strings: `courts`
// docs already carry a slugified `court_key` (mirror of src/utils/courtKey.ts), while a match
// carries whatever free-text court name the scorer typed. Resolving that name needs the courts CSV
// and matchCourtName, which are client-side, so the raw string is passed through untouched.
async function computeActivity() {
  const now = Date.now();
  const iso = (daysAgo) => new Date(now - daysAgo * 24 * 60 * 60 * 1000).toISOString();
  const cutoff30 = iso(30);
  const cutoff7 = iso(7);

  const blank = () => ({ byKey: {}, byName: {} });
  const out = { d7: blank(), d30: blank() };
  const bump = (bucket, space, key) => {
    if (!key) return;
    bucket[space][key] = (bucket[space][key] ?? 0) + 1;
  };

  // Check-ins, attendance and every kind of photo report all live in `courts`, discriminated by
  // `type`. All of them are activity, so none is filtered out.
  const courtsSnap = await db.collection('courts').where('created_at', '>=', cutoff30).get();
  courtsSnap.forEach((d) => {
    const { court_key: key, created_at: at } = d.data();
    if (!key || !at) return;
    bump(out.d30, 'byKey', key);
    if (at >= cutoff7) bump(out.d7, 'byKey', key);
  });

  // A recorded result — tournament match, challenge or rally alike. `completed_at` is pinned
  // to first scoring, so an edited score never re-dates the activity.
  const matchSnap = await db.collection('matches').where('completed_at', '>=', cutoff30).get();
  matchSnap.forEach((d) => {
    const { court, completed_at: at } = d.data();
    const name = String(court || '').trim();
    if (!name || !at) return;
    bump(out.d30, 'byName', name);
    if (at >= cutoff7) bump(out.d7, 'byName', name);
  });

  return out;
}

// Explicit region + timeZone, like every other scheduled function here. The bare-cron form
// defaulted the schedule to UTC, so "every 6 hours" drifted against Toronto local time.
exports.aggregateCourtCounts = onSchedule({ schedule: '0 */6 * * *', timeZone: TZ, region: REGION }, async () => {
  try {
    const [counts, activity] = await Promise.all([computeCourtCounts(), computeActivity()]);
    await db.doc('site_stats/court_counts').set({
      counts,
      activity,
      updated_at: new Date().toISOString(),
    });
    logger.info(`[aggregateCourtCounts] wrote ${Object.keys(counts).length} court keys, `
      + `${Object.keys(activity.d30.byKey).length + Object.keys(activity.d30.byName).length} with 30d activity`);
  } catch (err) {
    logger.error('[aggregateCourtCounts] failed', err);
    throw err;
  }
});

/**
 * A homepage court report becomes a court-condition entry, with nobody approving it.
 *
 * The report arrives from a signed-out visitor into `court_improvements`, which only organizers may
 * read. Court conditions live in `courts`, which is members-only — so the browser cannot make this
 * copy and the server has to. The organizer still sees the original in their dash; this is what
 * puts it against the court for everyone else.
 *
 * It is written as `uid: 'no_account'`, the same marker the anonymous Submit-a-Photo flow uses, and
 * onPhotoReportAwardPoints returns early on that — so a stranger's report pays nobody. That is
 * deliberate: do not "fix" it by stamping the reporter's uid, or the homepage button becomes a
 * points path with no review.
 *
 * Requires deploy: `firebase deploy --only functions:onCourtImprovementReported`
 */
exports.onCourtImprovementReported = onDocumentCreated(
  { document: 'court_improvements/{id}', region: REGION },
  async (event) => {
    const r = event.data?.data();
    if (!r?.court || !r?.note) return;
    try {
      await db.collection('courts').add({
        uid: 'no_account',
        type: 'condition',
        status: 'open',
        types: ['other'],
        court: String(r.court).trim(),
        // `court_key` is what the activity aggregate above counts by; the free-text name is kept
        // as typed so the client's own matching still has something to work with.
        court_key: courtKey(r.court),
        description: String(r.note).trim(),
        source: 'homepage_report',
        created_at: r.created_at || new Date().toISOString(),
      });
    } catch (err) {
      // The report itself is already saved and visible to organizers; failing to mirror it must
      // not retry forever against a collection the reporter never touched.
      logger.error('[onCourtImprovementReported] could not mirror to courts', err);
    }
  },
);
