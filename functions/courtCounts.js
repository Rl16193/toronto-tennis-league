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
const { Timestamp } = require('firebase-admin/firestore');
const { TZ, REGION } = require('./lib/constants');
const { releaseHeldVisits } = require('./lib/memberLocation');

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

// Mirrors NINETY_DAYS_MS in src/pages/courtmap/courtMapUtils.ts — keep in step. A player counts
// toward a court if they have league points OR have been active in the last 90 days.
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

async function computeCourtCounts() {
  const [prefsSnap, statsSnap, contactsSnap] = await Promise.all([
    db.collection('preferences').get(),
    db.collection('stats').get(),
    db.collection('contacts').get(),
  ]);

  const points = new Map();
  statsSnap.forEach((d) => points.set(d.id, Number(d.data().leaguePoints) || 0));

  const lastActive = new Map();
  contactsSnap.forEach((d) => {
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

// Recent activity per court, for the map's Activity view and the court list's pills. A check-in or a
// report counts once; a score counts the players on court ("User Playing Matches": 2 for singles,
// 4 for doubles, from the match's sub_category). byKey[court_key] holds the court-side kinds
// { checkins, waiting_board, queue, condition }; byName[court name] holds the players, keyed by the
// free-text name the scorer typed (resolved client-side by matchCourtName). The map bubble is the sum. A visit written from a score (lat/lng/dist 0) is that score, so it isn't counted again.
const REPORT_KINDS = ['waiting_board', 'queue', 'condition'];
async function computeActivity() {
  const now = Date.now();
  const ago = (days) => Timestamp.fromMillis(now - days * 24 * 60 * 60 * 1000);
  const cutoff30 = ago(30);
  const cutoff7 = ago(7).toMillis();
  const blank = () => ({ byKey: {}, byName: {} });
  const out = { d7: blank(), d30: blank() };
  const bumpKey = (key, kind, at) => {
    for (const win of at >= cutoff7 ? [out.d7, out.d30] : [out.d30]) {
      const row = win.byKey[key] || (win.byKey[key] = { checkins: 0, waiting_board: 0, queue: 0, condition: 0 });
      row[kind] += 1;
    }
  };
  const bumpName = (name, at, players) => {
    for (const win of at >= cutoff7 ? [out.d7, out.d30] : [out.d30]) win.byName[name] = (win.byName[name] ?? 0) + players;
  };

  const courtsSnap = await db.collection('courts').where('created_at', '>=', cutoff30).get();
  courtsSnap.forEach((d) => {
    const c = d.data();
    if (!c.court_key || !c.created_at) return;
    const at = c.created_at.toMillis();
    if (c.category === 'visit') {
      if (!c.lat && !c.lng && !c.dist_m) return; // a score's visit: counted as the score
      bumpKey(c.court_key, 'checkins', at);
    } else if (c.category === 'report' && REPORT_KINDS.includes(c.sub_category)) {
      bumpKey(c.court_key, c.sub_category, at);
    }
  });

  const subSnap = await db.collection('submissions').where('status', '==', 'applied').where('completed_at', '>=', cutoff30).get();
  const scores = subSnap.docs.map((d) => d.data())
    .filter((s) => String(s.court || '').trim() && s.completed_at && ['result', 'correction'].includes(s.sub_category));
  const matchIds = [...new Set(scores.map((s) => s.match_id).filter(Boolean))];
  const matchSnaps = matchIds.length ? await db.getAll(...matchIds.map((id) => db.doc(`matches/${id}`))) : [];
  const doubles = new Set(matchSnaps.filter((m) => m.exists && m.data().sub_category === 'doubles').map((m) => m.id));
  scores.forEach((s) => bumpName(String(s.court).trim(), s.completed_at.toMillis(), doubles.has(s.match_id) ? 4 : 2));
  return out;
}

// The 3 newest court-condition notes per court_key, any age, and how many there are in all (the
// marker number while Reports is on), for the map's Reports view. Public on
// purpose (owner ruling 2026-10-06): copied in full, without names.
async function computeReports() {
  const snap = await db.collection('courts').where('category', '==', 'report').where('sub_category', '==', 'condition').get();
  const rows = snap.docs.map((d) => d.data())
    .filter((c) => c.court_key && c.created_at && String(c.note || '').trim())
    .sort((x, y) => y.created_at.toMillis() - x.created_at.toMillis());
  const out = {};
  const counts = {};
  rows.forEach((c) => {
    counts[c.court_key] = (counts[c.court_key] ?? 0) + 1;
    const list = out[c.court_key] || (out[c.court_key] = []);
    if (list.length < 3) list.push(String(c.note).trim());
  });
  return { notes: out, counts };
}

// Explicit region + timeZone, like every other scheduled function here. The bare-cron form
// defaulted the schedule to UTC, so "every 6 hours" drifted against Toronto local time.
exports.aggregateCourtCounts = onSchedule({ schedule: '0 */6 * * *', timeZone: TZ, region: REGION }, async () => {
  try {
    // Visits held for courts that weren't on the roster: written once the court has been added.
    const released = await releaseHeldVisits(db);
    if (released) logger.info(`[aggregateCourtCounts] released ${released} held match visit(s)`);
    const [counts, activity, { notes: reports, counts: report_counts }] = await Promise.all([computeCourtCounts(), computeActivity(), computeReports()]);
    await db.doc('site_stats/court_counts').set({
      counts,
      activity,
      reports,
      report_counts,
      updated_at: Timestamp.now(),
    });
    logger.info(`[aggregateCourtCounts] wrote ${Object.keys(counts).length} court keys, `
      + `${Object.keys(activity.d30.byKey).length + Object.keys(activity.d30.byName).length} with 30d activity`);
  } catch (err) {
    logger.error('[aggregateCourtCounts] failed', err);
    throw err;
  }
});

