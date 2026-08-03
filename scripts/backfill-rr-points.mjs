/**
 * One-off correction pass for Round Robin leaguePoints26, needed because the live app formula
 * changed mid-tournament:
 *   - RR match winners now score live (+3 per win, +1 for a walkover win) — the old code never
 *     gave RR winners any points at all (only the final's winner scored; RR losers already
 *     scored correctly via LOSER_PTS.RR and are untouched here).
 *   - RR group-completion bonus is now +5 to EVERY player in the group, not just +5 to 1st /
 *     +3 to 2nd.
 *
 * This script applies exactly the shortfall between what was already written and what the new
 * formula owes, and is idempotent: each corrected match doc is stamped with
 * `rr_winner_pts_v2: true` / `rr_group_bonus_v2: true`, and a run skips anything already
 * stamped — so running it twice (or on matches the live app has already scored under the new
 * formula going forward) can never double-award points.
 *
 * Usage:
 *   node scripts/backfill-rr-points.mjs --key serviceAccount.json --dry-run
 *   node scripts/backfill-rr-points.mjs --key serviceAccount.json
 */
import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

const dryRun = process.argv.includes('--dry-run');
const keyArgIndex = process.argv.indexOf('--key');
if (keyArgIndex === -1 || !process.argv[keyArgIndex + 1]) {
  console.error('Usage: node scripts/backfill-rr-points.mjs --key path/to/serviceAccount.json [--dry-run]');
  process.exit(1);
}
const keyPath = path.resolve(process.argv[keyArgIndex + 1]);
if (!fs.existsSync(keyPath)) { console.error(`Key not found: ${keyPath}`); process.exit(1); }

admin.initializeApp({ credential: admin.credential.cert(JSON.parse(fs.readFileSync(keyPath, 'utf8'))) });
const db = admin.firestore();

// Mirror of computeGroupStandings() in src/pages/tournament/rrGeneration.ts — rank order only
// (win value is proportional between the old 2pt and new 3pt formula, so rank order is
// identical either way; only the group-bonus delta below actually depends on which formula ran).
function rankGroup(matches) {
  const playerMap = new Map();
  for (const m of matches) {
    if (m.player_1_user_id) playerMap.set(m.player_1_user_id, m.player_1_name);
    if (m.player_2_user_id) playerMap.set(m.player_2_user_id, m.player_2_name);
  }
  const stats = new Map();
  for (const uid of playerMap.keys()) stats.set(uid, { wins: 0, gamesWon: 0, gamesLost: 0 });
  for (const m of matches) {
    if (m.status !== 'complete' || !m.winner_user_id) continue;
    const winnerUid = m.winner_user_id;
    const loserUid = winnerUid === m.player_1_user_id ? m.player_2_user_id : m.player_1_user_id;
    const p1G = (m.set_1_player_1 ?? 0) + (m.set_2_player_1 ?? 0) + (m.set_3_player_1 ?? 0);
    const p2G = (m.set_1_player_2 ?? 0) + (m.set_2_player_2 ?? 0) + (m.set_3_player_2 ?? 0);
    const winnerGames = winnerUid === m.player_1_user_id ? p1G : p2G;
    const loserGames = winnerUid === m.player_1_user_id ? p2G : p1G;
    const w = stats.get(winnerUid);
    const l = stats.get(loserUid);
    if (w) { w.wins++; w.gamesWon += winnerGames; w.gamesLost += loserGames; }
    if (l) { l.gamesWon += loserGames; l.gamesLost += winnerGames; }
  }
  const rows = [...stats.entries()].map(([userId, s]) => ({ userId, ...s }));
  rows.sort((a, b) => b.wins - a.wins || b.gamesWon - a.gamesWon);
  return rows;
}

async function main() {
  console.log(dryRun ? '🔍 DRY RUN — no writes\n' : '✏️  LIVE RUN\n');

  const snap = await db.collection('tournament_matches')
    .where('format', '==', 'rr')
    .where('round', '==', 'RR')
    .where('status', '==', 'complete')
    .get();
  const matches = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  console.log(`${matches.length} completed RR match(es) found`);

  const pointDelta = new Map(); // uid -> total leaguePoints26 to add
  const addPts = (uid, n) => { if (!uid || !n) return; pointDelta.set(uid, (pointDelta.get(uid) ?? 0) + n); };
  const matchStamps = []; // { id, field }

  // ── 1. Per-match winner shortfall (old code gave RR winners 0 points, always) ──────────────
  let winnersFixed = 0;
  for (const m of matches) {
    if (m.rr_winner_pts_v2 || !m.winner_user_id) continue;
    const pts = m.walkover ? 1 : 3;
    addPts(m.winner_user_id, pts);
    matchStamps.push({ id: m.id, field: 'rr_winner_pts_v2' });
    winnersFixed++;
  }
  console.log(`Winner backfill: ${winnersFixed} match(es) need +points (already-stamped matches skipped)`);

  // ── 2. Group-completion bonus shortfall (old: +5/+3 to top 2; new: +5 to everyone) ─────────
  const groupKey = (m) => [m.event_id, m.tournament_choice, m.division, m.skill_group, m.rr_group ?? 0].join('|');
  const byGroup = new Map();
  for (const m of matches) {
    const k = groupKey(m);
    if (!byGroup.has(k)) byGroup.set(k, []);
    byGroup.get(k).push(m);
  }

  // A group's completeness must be judged against ALL its matches (including any still
  // pending), not just the completed ones already fetched — so re-check per group.
  let groupsFixed = 0;
  for (const [k, groupCompletedMatches] of byGroup) {
    if (groupCompletedMatches.some((m) => m.rr_group_bonus_v2)) continue; // already corrected
    const [event_id, tournament_choice, division, skill_group, rr_group] = k.split('|');
    const allInGroupSnap = await db.collection('tournament_matches')
      .where('event_id', '==', event_id)
      .where('tournament_choice', '==', tournament_choice)
      .where('division', '==', division)
      .where('skill_group', '==', skill_group)
      .where('format', '==', 'rr')
      .where('round', '==', 'RR')
      .get();
    const allInGroup = allInGroupSnap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((m) => String(m.rr_group ?? 0) === rr_group);
    if (allInGroup.length === 0 || !allInGroup.every((m) => m.status === 'complete')) continue; // not actually done

    const ranked = rankGroup(allInGroup);
    ranked.forEach((row, i) => {
      // Old bonus already paid: rank 0 → 5, rank 1 → 3, everyone else → 0. New: everyone → 5.
      const alreadyPaid = i === 0 ? 5 : i === 1 ? 3 : 0;
      addPts(row.userId, 5 - alreadyPaid);
    });
    allInGroup.forEach((m) => matchStamps.push({ id: m.id, field: 'rr_group_bonus_v2' }));
    groupsFixed++;
  }
  console.log(`Group-bonus backfill: ${groupsFixed} fully-complete group(s) need a top-up (already-stamped groups skipped)`);

  console.log(`\nPlayers to correct: ${pointDelta.size}`);
  for (const [uid, pts] of pointDelta) console.log(`  ${uid.slice(0, 8)} → +${pts}`);

  if (dryRun) { console.log('\n(dry run — no writes)'); process.exit(0); }
  if (pointDelta.size === 0 && matchStamps.length === 0) { console.log('\nNothing to correct.'); process.exit(0); }

  const updatedAt = new Date().toISOString();
  const allWrites = [
    ...[...pointDelta.entries()].map(([uid, pts]) => ({
      ref: db.collection('stats').doc(uid),
      data: { leaguePoints26: admin.firestore.FieldValue.increment(pts), rrPointsBackfilledAt: updatedAt },
    })),
    ...matchStamps.map((s) => ({ ref: db.collection('tournament_matches').doc(s.id), data: { [s.field]: true } })),
  ];
  for (let i = 0; i < allWrites.length; i += 400) {
    const batch = db.batch();
    for (const w of allWrites.slice(i, i + 400)) batch.set(w.ref, w.data, { merge: true });
    await batch.commit();
  }
  console.log(`\nWrote corrections for ${pointDelta.size} player(s), stamped ${matchStamps.length} match doc(s).`);
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
