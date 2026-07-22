/**
 * One-time backfill for the Tasks/Community Points system.
 *
 * Cloud Function triggers (functions/taskPoints.js) only fire on NEW writes going forward from
 * deployment — they never see history that already happened. This script closes that gap by
 * replaying every player's existing match/ladder history and setting their task_progress fields
 * to the true totals, so points already earned before deployment actually register.
 *
 * SCOPE — deliberately narrow. This backfills only the things that had no other way to become
 * correct:
 *   - matchesPlayed / Tournament tiers (play5/10/20/30/50)
 *   - challengesPlayed, challengesWon / Ladder tiers (chal1/5/10/20, win5/10/20)
 *   - bestStreak, currentStreak / Streak tiers (streak3/5/10/20) — replayed chronologically
 *     across BOTH tournament matches and ladder challenges together, matching live semantics
 *   - monthsActive, active_months / Season Regular tiers (months3/6/12)
 *   - Initiation checkboxes: playMatch, ladderMatch, joinEvent, profileComplete, profilePhoto
 *   - setupComplete, recomputed from the final Initiation state
 *
 * Deliberately NOT touched (already correct, or nothing to backfill):
 *   - climbSpots — accumulated live at each ladder confirm since the ladder shipped; a backfill
 *     can't reconstruct historical rank deltas from current standings without corrupting it.
 *   - suggestions — already bumped live on every court_suggestions submit; recomputing from
 *     scratch here risks double-counting rather than fixing anything.
 *   - courtsVisited, boardPhotos, queueUpdates, volunteerEvents, invites, meetups — brand new
 *     collections with zero pre-existing history; every future action is already handled live.
 *
 * A "played a match" requires a real score AND is not a walkover: a walkover is recorded as sets
 * of 0-0 (still non-null), so both checks are required — mirrors the same rule in
 * src/features/tasks/useTasks.ts, src/features/tasks/claimService.ts, and
 * functions/taskPoints.js. Keep all four in sync by hand.
 *
 * Idempotent: every field here is fully recomputed and overwritten (not incremented), so running
 * this twice produces the same result. Safe to re-run.
 *
 * Usage:
 *   node scripts/backfill-task-points.mjs --key serviceAccount.json --dry-run
 *   node scripts/backfill-task-points.mjs --key serviceAccount.json
 */
import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

const dryRun = process.argv.includes('--dry-run');
const keyArgIndex = process.argv.indexOf('--key');
if (keyArgIndex === -1 || !process.argv[keyArgIndex + 1]) {
  console.error('Usage: node scripts/backfill-task-points.mjs --key path/to/serviceAccount.json [--dry-run]');
  process.exit(1);
}
const keyPath = path.resolve(process.argv[keyArgIndex + 1]);
if (!fs.existsSync(keyPath)) { console.error(`Key not found: ${keyPath}`); process.exit(1); }

admin.initializeApp({ credential: admin.credential.cert(JSON.parse(fs.readFileSync(keyPath, 'utf8'))) });
const db = admin.firestore();

// Mirror of the relevant slice of ALL_TIERS in functions/taskPoints.js — keep in sync by hand.
const TIERS = [
  { id: 'play5', points: 2, counter: 'matchesPlayed', need: 5 },
  { id: 'play10', points: 5, counter: 'matchesPlayed', need: 10 },
  { id: 'play20', points: 8, counter: 'matchesPlayed', need: 20 },
  { id: 'play30', points: 15, counter: 'matchesPlayed', need: 30 },
  { id: 'play50', points: 25, counter: 'matchesPlayed', need: 50 },

  { id: 'chal1', points: 2, counter: 'challengesPlayed', need: 1 },
  { id: 'chal5', points: 8, counter: 'challengesPlayed', need: 5 },
  { id: 'chal10', points: 15, counter: 'challengesPlayed', need: 10 },
  { id: 'chal20', points: 25, counter: 'challengesPlayed', need: 20 },
  { id: 'win5', points: 15, counter: 'challengesWon', need: 5 },
  { id: 'win10', points: 25, counter: 'challengesWon', need: 10 },
  { id: 'win20', points: 40, counter: 'challengesWon', need: 20 },

  { id: 'streak3', points: 5, counter: 'bestStreak', need: 3 },
  { id: 'streak5', points: 15, counter: 'bestStreak', need: 5 },
  { id: 'streak10', points: 30, counter: 'bestStreak', need: 10 },
  { id: 'streak20', points: 50, counter: 'bestStreak', need: 20 },

  { id: 'months3', points: 10, counter: 'monthsActive', need: 3 },
  { id: 'months6', points: 25, counter: 'monthsActive', need: 6 },
  { id: 'months12', points: 50, counter: 'monthsActive', need: 12 },
];
const SETUP_POINTS = 25;
const INITIATION_TASK_IDS = [
  'profileComplete', 'followSocial', 'tagPost', 'waitingBoard', 'courtVisit', 'queuePhoto',
  'playMatch', 'courtSuggestion', 'whatsappGroup', 'profilePhoto', 'joinEvent', 'ladderMatch',
];

// Mirror of profileMissingFields() in src/features/tasks/useTasks.ts.
const isProfileComplete = (user, prefs) => {
  if (!user?.name?.trim()) return false;
  if (!user?.phone?.trim()) return false;
  if (!(user?.whatsapp_contact?.trim() || user?.whatsapp_same_as_phone)) return false;
  if (!user?.bio?.trim()) return false;
  if (!prefs?.preferred_courts?.length) return false;
  const grid = prefs?.availability;
  const hasAvailability =
    (grid && Object.values(grid).some((slots) => Array.isArray(slots) && slots.length > 0)) ||
    (prefs?.availability_day?.length > 0);
  return !!hasAvailability;
};

async function main() {
  console.log(dryRun ? '🔍 DRY RUN — no writes\n' : '✏️  LIVE RUN\n');

  // ── 1. Tournament matches: real score, not a walkover, status complete ──────
  const matchesSnap = await db.collection('tournament_matches').where('status', '==', 'complete').get();
  const playResults = new Map(); // uid -> [{ at, won, source }]
  const push = (uid, at, won, source) => {
    if (!uid) return;
    if (!playResults.has(uid)) playResults.set(uid, []);
    playResults.get(uid).push({ at, won, source });
  };
  let walkoversSkipped = 0;
  matchesSnap.forEach((d) => {
    const m = d.data();
    if (m.walkover === true) { walkoversSkipped++; return; }
    if (m.set_1_player_1 == null || m.set_1_player_2 == null) return;
    const at = new Date(m.completed_at || m.created_at || 0).getTime();
    if (m.player_1_user_id) push(m.player_1_user_id, at, m.winner_user_id === m.player_1_user_id, 'tournament');
    if (m.player_2_user_id) push(m.player_2_user_id, at, m.winner_user_id === m.player_2_user_id, 'tournament');
  });

  // ── 2. Ladder challenges: confirmed only ─────────────────────────────────────
  const laddersSnap = await db.collection('ladder_challenges').where('status', '==', 'confirmed').get();
  laddersSnap.forEach((d) => {
    const c = d.data();
    const at = new Date(c.confirmed_at || c.created_at || 0).getTime();
    if (c.challenger_id) push(c.challenger_id, at, c.claimed_winner_id === c.challenger_id, 'ladder');
    if (c.opponent_id) push(c.opponent_id, at, c.claimed_winner_id === c.opponent_id, 'ladder');
  });

  // ── 3. Event joins ────────────────────────────────────────────────────────────
  const joinedUids = new Set();
  (await db.collection('event_participants').get()).forEach((d) => {
    const uid = d.data().user_id;
    if (uid) joinedUids.add(uid);
  });

  // ── 4. Profiles (for profileComplete / profilePhoto) ─────────────────────────
  const usersSnap = await db.collection('users').get();
  const prefsSnap = await db.collection('preferences').get();
  const usersMap = new Map(usersSnap.docs.map((d) => [d.id, d.data()]));
  const prefsMap = new Map(prefsSnap.docs.map((d) => [d.id, d.data()]));

  // ── 5. Existing task_progress (to merge without ever un-setting a true flag) ──
  const progressSnap = await db.collection('task_progress').get();
  const existingMap = new Map(progressSnap.docs.map((d) => [d.id, d.data()]));

  const allUids = new Set([
    ...playResults.keys(), ...joinedUids, ...usersMap.keys(), ...existingMap.keys(),
  ]);

  const patches = []; // { uid, name, fields, newTierPoints }
  let totalNewTierPoints = 0;
  let newlyCompleteCount = 0;

  for (const uid of allUids) {
    const existing = existingMap.get(uid) || {};
    const results = (playResults.get(uid) || []).slice().sort((a, b) => a.at - b.at);

    const matchesPlayed = results.filter((r) => r.source === 'tournament').length;
    const challengesPlayed = results.filter((r) => r.source === 'ladder').length;
    const challengesWon = results.filter((r) => r.source === 'ladder' && r.won).length;

    let bestStreak = 0, currentStreak = 0;
    const months = new Set();
    for (const r of results) {
      currentStreak = r.won ? currentStreak + 1 : 0;
      if (currentStreak > bestStreak) bestStreak = currentStreak;
      if (r.at > 0) months.add(new Date(r.at).toISOString().slice(0, 7));
    }

    const counters = { matchesPlayed, challengesPlayed, challengesWon, bestStreak, monthsActive: months.size };
    const fields = { user_id: uid, updatedAt: new Date().toISOString() };
    let newTierPoints = 0;

    if (matchesPlayed > 0) fields.matchesPlayed = matchesPlayed;
    if (challengesPlayed > 0) fields.challengesPlayed = challengesPlayed;
    if (challengesWon > 0) fields.challengesWon = challengesWon;
    if (bestStreak > 0) { fields.bestStreak = bestStreak; fields.currentStreak = currentStreak; }
    if (months.size > 0) { fields.monthsActive = months.size; fields.active_months = [...months]; }

    for (const t of TIERS) {
      if (existing[t.id]) continue; // never unset an already-earned tier
      if ((counters[t.counter] || 0) >= t.need) { fields[t.id] = true; newTierPoints += t.points; }
    }

    const user = usersMap.get(uid);
    const prefs = prefsMap.get(uid);
    if (!existing.playMatch && matchesPlayed > 0) fields.playMatch = true;
    if (!existing.ladderMatch && challengesPlayed > 0) fields.ladderMatch = true;
    if (!existing.joinEvent && joinedUids.has(uid)) fields.joinEvent = true;
    if (!existing.profilePhoto && user?.avatar) fields.profilePhoto = true;
    if (!existing.profileComplete && isProfileComplete(user, prefs)) fields.profileComplete = true;

    const merged = { ...existing, ...fields };
    let becameComplete = false;
    if (!existing.setupComplete && INITIATION_TASK_IDS.every((id) => merged[id])) {
      fields.setupComplete = true;
      becameComplete = true;
    }

    // Skip uids with nothing to write beyond the bookkeeping fields.
    const meaningfulKeys = Object.keys(fields).filter((k) => !['user_id', 'updatedAt'].includes(k));
    if (meaningfulKeys.length === 0) continue;

    if (!fields.name) fields.name = user?.name || existing.name || '';
    patches.push({ uid, fields, newTierPoints, becameComplete });
    totalNewTierPoints += newTierPoints + (becameComplete ? SETUP_POINTS : 0);
    if (becameComplete) newlyCompleteCount++;
  }

  console.log(`Matches: ${matchesSnap.size} complete (${walkoversSkipped} walkovers excluded)`);
  console.log(`Ladder challenges confirmed: ${laddersSnap.size}`);
  console.log(`Players touched: ${patches.length} of ${allUids.size} known users`);
  console.log(`New tier/Initiation points to award: ${totalNewTierPoints} (${newlyCompleteCount} newly-complete Initiations)\n`);

  for (const p of patches.slice(0, 25)) {
    const tierNames = Object.keys(p.fields).filter((k) => TIERS.some((t) => t.id === k));
    console.log(
      `  ${p.uid.slice(0, 8)} → matches=${p.fields.matchesPlayed ?? '-'} ladder=${p.fields.challengesPlayed ?? '-'}` +
      ` streak=${p.fields.bestStreak ?? '-'} months=${p.fields.monthsActive ?? '-'}` +
      `${tierNames.length ? ` +tiers[${tierNames.join(',')}]` : ''}${p.becameComplete ? ' +INITIATION' : ''}`,
    );
  }
  if (patches.length > 25) console.log(`  … +${patches.length - 25} more`);

  if (dryRun) { console.log('\n(dry run — no writes)'); process.exit(0); }

  for (let i = 0; i < patches.length; i += 400) {
    const batch = db.batch();
    for (const p of patches.slice(i, i + 400)) {
      batch.set(db.collection('task_progress').doc(p.uid), p.fields, { merge: true });
    }
    await batch.commit();
  }
  console.log(`\nWrote task_progress updates for ${patches.length} player(s).`);
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
