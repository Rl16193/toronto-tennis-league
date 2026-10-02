/**
 * Courts and zones for the Cloud Functions: the one court slug and the zone roster. Same module
 * name and `courtKey` as Racquets-And-Strings. Helpers only (see notify.js for why).
 *
 * courts.json is the courtKey → zone roster, generated from
 * public/Tennis Courts Facilities - 4326.csv. Regenerate it if the CSV changes.
 */
const courts = require('../courts.json');

// Same normalization as src/utils/courtKey.ts — keep in sync.
const courtKey = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** The zone a court belongs to, or '' when it isn't on the roster. */
const zoneOfCourt = (key) => courts[key] || '';

// zone -> [courtKey, …], built once from the roster.
const ZONE_COURTS = (() => {
  const m = {};
  for (const [key, zone] of Object.entries(courts)) (m[zone] = m[zone] || []).push(key);
  return m;
})();

/** Every court key on the roster (the whole city). */
const allCourts = () => Object.keys(courts);

/** Every court key in a zone ([] for an unknown zone). */
const courtsInZone = (zone) => ZONE_COURTS[zone] || [];

// ── Visits from recorded scores ──────────────────────────────────────────────
// A score naming a court on the roster gives every player on court that day's visit
// ({uid}_{courtKey}_{YYYYMMDD}; `create`, so a repeat that day adds nothing). A court NOT on the
// roster writes no visit: it is held in site_stats/pending_court_visits and the organizers are
// asked to add the court. aggregateCourtCounts releases held visits once the court is on the roster.
const PENDING = 'site_stats/pending_court_visits';

async function writeMatchVisits(db, { uids: all, courtKey: key, courtName, category, at }) {
  const { torontoParts, isGuest } = require('./constants');
  const uids = all.filter((u) => !isGuest(u)); // guests get points only, never visits
  const day = torontoParts(at).day;
  const zone = zoneOfCourt(key);
  const names = await Promise.all(uids.map((u) => db.doc(`users/${u}`).get().then((s) => (s.exists && s.data().name) || '').catch(() => '')));
  await Promise.all(uids.map((uid, i) => db.doc(`courts/${uid}_${key}_${day}`).create({
    category: 'visit', sub_category: category, uid, user_name: names[i], court_key: key, court_name: courtName, zone,
    created_at: at, updated_at: at, lat: 0, lng: 0, dist_m: 0,
    note: '', photo_paths: [], photos_meta: [], waiting_boards: 0, racquets_in_queue: 0, queue_time: '',
  }).catch(() => { /* already visited that court that day */ })));
}

/** Holds a score's visits for a court not on the roster. Returns true the first time the court is seen. */
async function holdMatchVisits(db, { uids, courtKey: key, courtName, category, at }) {
  const { FieldValue, FieldPath } = require('firebase-admin/firestore');
  const ref = db.doc(PENDING);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const held = (snap.exists && snap.data().courts) || {};
    const firstTime = !held[key];
    const entry = { uids, category, at };
    if (!snap.exists) {
      tx.set(ref, { courts: { [key]: { court_name: courtName, visits: [entry] } }, updated_at: FieldValue.serverTimestamp() });
    } else {
      tx.update(ref, new FieldPath('courts', key, 'court_name'), courtName,
        new FieldPath('courts', key, 'visits'), FieldValue.arrayUnion(entry), 'updated_at', FieldValue.serverTimestamp());
    }
    return firstTime;
  });
}

/** Writes the held visits of every court now on the roster, and drops them from the hold. */
async function releaseHeldVisits(db) {
  const { FieldValue, FieldPath } = require('firebase-admin/firestore');
  const snap = await db.doc(PENDING).get();
  const held = (snap.exists && snap.data().courts) || {};
  let released = 0;
  for (const [key, { court_name: courtName, visits = [] }] of Object.entries(held)) {
    if (!zoneOfCourt(key)) continue;
    for (const v of visits) await writeMatchVisits(db, { uids: v.uids, courtKey: key, courtName, category: v.category, at: v.at });
    await db.doc(PENDING).update(new FieldPath('courts', key), FieldValue.delete());
    released += visits.length;
  }
  return released;
}

module.exports = { courtKey, zoneOfCourt, courtsInZone, allCourts, writeMatchVisits, holdMatchVisits, releaseHeldVisits };
