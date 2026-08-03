/**
 * One-off backfill: stamps a check-in (court_visits + court_attendance) for every player on a
 * tournament match or ladder challenge that was already scored WITH a court attached, before the
 * check-in-from-score-submission trigger (functions/taskPoints.js: checkInFromMatch, wired into
 * onMatchCompletedAwardPoints / onLadderConfirmedAwardPoints) was deployed. Going forward, new
 * court-tagged scores are checked in live by those triggers — this script only needs to run once
 * to cover the gap.
 *
 * Idempotent: court_visits uses .create() (fails silently if the player already has a passport
 * stamp for that court — never overwrites a real GPS check-in), and court_attendance's
 * deterministic per-day id just re-writes the same doc if run twice. Writing these docs also
 * naturally re-triggers the already-deployed onCourtVisitAwardPoints / onCourtVisitPioneer /
 * onCourtAttendanceGroupBonus functions, which is what actually credits the Traveller badge —
 * no task_progress counters are touched directly here.
 *
 * Usage:
 *   node scripts/backfill-court-checkins.mjs --key serviceAccount.json --dry-run
 *   node scripts/backfill-court-checkins.mjs --key serviceAccount.json
 */
import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const dryRun = process.argv.includes('--dry-run');
const keyArgIndex = process.argv.indexOf('--key');
if (keyArgIndex === -1 || !process.argv[keyArgIndex + 1]) {
  console.error('Usage: node scripts/backfill-court-checkins.mjs --key path/to/serviceAccount.json [--dry-run]');
  process.exit(1);
}
const keyPath = path.resolve(process.argv[keyArgIndex + 1]);
if (!fs.existsSync(keyPath)) { console.error(`Key not found: ${keyPath}`); process.exit(1); }

admin.initializeApp({ credential: admin.credential.cert(JSON.parse(fs.readFileSync(keyPath, 'utf8'))) });
const db = admin.firestore();

// Same courtKey roster functions/taskPoints.js and functions/groupAwards.js use.
const ROSTER = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'functions', 'courts.json'), 'utf8'));

// Same normalization as src/utils/courtKey.ts — keep in sync.
const courtKeySlug = (name) =>
  String(name).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const TZ = 'America/Toronto';
function torontoDay(iso) {
  const d = iso ? new Date(iso) : new Date();
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(d).map((p) => [p.type, p.value]),
  );
  return `${parts.year}${parts.month}${parts.day}`;
}

// Mirrors functions/taskPoints.js's checkInFromMatch exactly.
async function checkInFromMatch(uid, name, courtName, whenISO) {
  if (!uid || !courtName) return { visitWritten: false, attendanceWritten: false };
  const courtKey = courtKeySlug(courtName);
  if (!courtKey) return { visitWritten: false, attendanceWritten: false };
  const zone = ROSTER[courtKey] || '';
  const now = whenISO || new Date().toISOString();
  const base = { user_id: uid, user_name: name || '', court_key: courtKey, court_name: courtName, zone, dist_m: 0 };

  let visitWritten = false;
  const visitRef = db.doc(`court_visits/${uid}_${courtKey}`);
  const visitSnap = await visitRef.get();
  if (!visitSnap.exists) {
    visitWritten = true;
    if (!dryRun) {
      await visitRef.create({ ...base, visit_type: 'Tournament', lat: 0, lng: 0, created_at: now });
    }
  }

  const attendanceId = `${uid}_${courtKey}_${torontoDay(now)}`;
  if (!dryRun) {
    await db.doc(`court_attendance/${attendanceId}`).set({
      ...base, match_type: 'Tournament', lat: 0, lng: 0, day: torontoDay(now), created_at: now,
    });
  }
  return { visitWritten, attendanceWritten: true };
}

async function main() {
  let newVisits = 0;
  let attendanceWrites = 0;

  // Tournament matches: completed with a court attached.
  const matchesSnap = await db.collection('tournament_matches').where('status', '==', 'complete').get();
  for (const doc of matchesSnap.docs) {
    const m = doc.data();
    if (!m.court) continue;
    const whenISO = m.completed_at;
    const pairs = [
      [m.player_1_user_id, m.player_1_name],
      [m.player_2_user_id, m.player_2_name],
    ].filter(([uid]) => uid);
    for (const [uid, name] of pairs) {
      const { visitWritten } = await checkInFromMatch(uid, name, m.court, whenISO);
      if (visitWritten) newVisits += 1;
      attendanceWrites += 1;
      console.log(`${dryRun ? '[dry-run] ' : ''}${name || uid} @ ${m.court} (match ${doc.id})${visitWritten ? ' — NEW passport stamp' : ''}`);
    }
  }

  // Ladder challenges: confirmed with a court attached.
  const challengesSnap = await db.collection('ladder_challenges').where('status', '==', 'confirmed').get();
  for (const doc of challengesSnap.docs) {
    const c = doc.data();
    if (!c.court) continue;
    const whenISO = c.confirmed_at;
    const pairs = [
      [c.challenger_id, c.challenger_name],
      [c.opponent_id, c.opponent_name],
    ].filter(([uid]) => uid);
    for (const [uid, name] of pairs) {
      const { visitWritten } = await checkInFromMatch(uid, name, c.court, whenISO);
      if (visitWritten) newVisits += 1;
      attendanceWrites += 1;
      console.log(`${dryRun ? '[dry-run] ' : ''}${name || uid} @ ${c.court} (challenge ${doc.id})${visitWritten ? ' — NEW passport stamp' : ''}`);
    }
  }

  console.log(`\n${dryRun ? '[dry-run] ' : ''}Done. ${newVisits} new court_visits passport stamp(s), ${attendanceWrites} court_attendance write(s).`);
}

main().catch((e) => { console.error(e); process.exit(1); });
