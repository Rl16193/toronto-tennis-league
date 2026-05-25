/**
 * Backfill match stats from confirmed tournament_matches into stats collection.
 *
 * Run AFTER syncLeagueStats.mjs --write so the XLSX baseline is already set.
 * This script adds matchesPlayed, wins, loses, and leaguePoints26 for every
 * completed match in Firestore that wasn't auto-incremented by the app.
 *
 * Usage:
 *   node scripts/backfillMatchStats.mjs           # dry run
 *   node scripts/backfillMatchStats.mjs --write   # write to Firestore
 *
 * Authentication:
 *   Set FIREBASE_SERVICE_ACCOUNT env var or place serviceAccount.json in project root.
 *
 * Round points (loser earns points for how far they got):
 *   R32=1, R16=2, QF=3, SF=5, F loser=10, F winner=20
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
const increment = (n) => FieldValue.increment(n);
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const shouldWrite = args.includes('--write');

const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT
  ? resolve(process.env.FIREBASE_SERVICE_ACCOUNT)
  : resolve('./serviceAccount.json');

let serviceAccount;
try {
  serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
} catch {
  console.error(`Cannot read service account file: ${serviceAccountPath}`);
  process.exit(1);
}

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

// ── Round points ──────────────────────────────────────────────────────────────

// Main draw points
const ROUND_LOSER_PTS = { R32: 1, R16: 2, QF: 3, SF: 5, F: 10 };
const WINNER_PTS = 20;
// LL Draw (reserves) — halved
const ROUND_LOSER_PTS_LL = { R32: 0.5, R16: 1, QF: 1.5, SF: 2.5, F: 5 };
const WINNER_PTS_LL = 10;

// ── Fetch all completed matches ───────────────────────────────────────────────

const snap = await db.collection('tournament_matches')
  .where('status', '==', 'complete')
  .get();

console.log(`\nFound ${snap.size} completed matches.\n`);

// Game tallies from accepted score submissions (keyed by match_doc_id)
const subsSnap = await db.collection('score_submissions').where('status', '==', 'accepted').get();
const subsByMatch = new Map();
subsSnap.docs.forEach(d => {
  const sub = d.data();
  if (!subsByMatch.has(sub.match_doc_id)) subsByMatch.set(sub.match_doc_id, sub);
});
console.log(`Found ${subsByMatch.size} accepted score submissions.\n`);

// ── Aggregate per user ────────────────────────────────────────────────────────

// uid → { matchesPlayed, wins, loses, leaguePoints26, league, eliminatedEventIds }
// eliminatedEventIds: events where this player was knocked out (loser or F winner).
// Winners still in progress are NOT counted — Leagues.tsx adds +1 for active players.
const userStats = new Map();

const ensure = (uid) => {
  if (!userStats.has(uid)) userStats.set(uid, { matchesPlayed: 0, wins: 0, loses: 0, leaguePoints26: 0, league: '', eliminatedEventIds: new Set(), pointswon: 0, totalPointsPlayed: 0 });
  return userStats.get(uid);
};

for (const doc of snap.docs) {
  const m = doc.data();
  const isLL = m.bracket === 'reserves';
  const winnerUid = m.winner_user_id;
  const loserUid = winnerUid === m.player_1_user_id ? m.player_2_user_id : m.player_1_user_id;
  const isFinal = m.round === 'F';
  const loserPts = (isLL ? ROUND_LOSER_PTS_LL : ROUND_LOSER_PTS)[m.round] ?? (isLL ? 0.5 : 1);
  const winnerPts = isLL ? WINNER_PTS_LL : WINNER_PTS;
  const matchLeague = m.tournament_choice === 'Doubles' ? 'Doubles' : (m.division || '');

  // Game tallies from score submission
  const sub = subsByMatch.get(doc.id);
  const p1G = sub ? (sub.set_1_player_1??0)+(sub.set_2_player_1??0)+(sub.set_3_player_1??0) : 0;
  const p2G = sub ? (sub.set_1_player_2??0)+(sub.set_2_player_2??0)+(sub.set_3_player_2??0) : 0;
  const totalG = p1G + p2G;
  const winnerIsP1 = winnerUid === m.player_1_user_id;

  if (winnerUid) {
    const s = ensure(winnerUid);
    s.matchesPlayed += 1;
    s.wins += 1;
    s.league = matchLeague;
    s.pointswon += winnerIsP1 ? p1G : p2G;
    s.totalPointsPlayed += totalG;
    // Tournament winner (F) is done — count the event for them too
    if (isFinal && m.event_id) s.eliminatedEventIds.add(m.event_id);
    if (isFinal) s.leaguePoints26 += winnerPts;
  }
  if (loserUid) {
    const s = ensure(loserUid);
    s.matchesPlayed += 1;
    s.loses += 1;
    s.leaguePoints26 += loserPts;
    s.league = matchLeague;
    s.pointswon += winnerIsP1 ? p2G : p1G;
    s.totalPointsPlayed += totalG;
    // Loser is eliminated — count this event for them
    if (m.event_id) s.eliminatedEventIds.add(m.event_id);
  }
}

// ── Display summary ───────────────────────────────────────────────────────────

console.table(
  [...userStats.entries()].map(([uid, s]) => ({
    uid: uid.slice(0, 12) + '…',
    matchesPlayed: s.matchesPlayed,
    wins: s.wins,
    loses: s.loses,
    leaguePoints26: s.leaguePoints26,
  }))
);

if (!shouldWrite) {
  console.log('\nDry run — no changes written.');
  console.log('To write: node scripts/backfillMatchStats.mjs --write');
  process.exit(0);
}

// ── Write to Firestore ────────────────────────────────────────────────────────
//
// Strategy: read each player's _xlsx baseline fields (set by syncLeagueStats).
// Final value = xlsx_baseline + tournament_match_total.
// _xlsx fields are deleted after write — they are baked into the regular fields.
// To re-run: first run syncLeagueStats --write to restore _xlsx baselines, then this script.

// Read XLSX baselines for all affected players
const uids = [...userStats.keys()];
const baselines = new Map();
const chunkSize = 10;
for (let i = 0; i < uids.length; i += chunkSize) {
  const chunk = uids.slice(i, i + chunkSize);
  const docs = await Promise.all(chunk.map((uid) => db.collection('stats').doc(uid).get()));
  docs.forEach((d, idx) => {
    const data = d.exists ? d.data() : {};
    baselines.set(chunk[idx], {
      matchesPlayed:    data.matchesPlayed_xlsx    ?? 0,
      wins:             data.wins_xlsx             ?? 0,
      loses:            data.loses_xlsx            ?? 0,
      leaguePoints26:   data.leaguePoints26_xlsx   ?? 0,
      tournamentsPlayed: data.tournamentsPlayed_xlsx ?? 0,
      pointswon:        data.pointswon_xlsx        ?? 0,
      totalPointsPlayed: data.totalPointsPlayed_xlsx ?? 0,
    });
  });
}

let written = 0;
const batch = db.batch();

for (const [uid, s] of userStats.entries()) {
  const base = baselines.get(uid) || { matchesPlayed: 0, wins: 0, loses: 0, leaguePoints26: 0, tournamentsPlayed: 0 };
  const ref = db.collection('stats').doc(uid);
  const finalMatchesPlayed   = base.matchesPlayed    + s.matchesPlayed;
  const finalWins            = base.wins             + s.wins;
  const finalLoses           = base.loses            + s.loses;
  const finalPoints          = base.leaguePoints26   + s.leaguePoints26;
  const finalTournaments     = base.tournamentsPlayed + s.eliminatedEventIds.size;
  const finalPointswon      = base.pointswon + s.pointswon;
  const finalTotalGames     = base.totalPointsPlayed + s.totalPointsPlayed;
  const finalPointsWonPct   = finalTotalGames > 0 ? Math.round(finalPointswon / finalTotalGames * 100) : 0;
  batch.set(ref, {
    matchesPlayed:     finalMatchesPlayed,
    wins:              finalWins,
    loses:             finalLoses,
    leaguePoints26:    finalPoints,
    tournamentsPlayed: finalTournaments,
    league:            s.league,
    pointswon:         finalPointswon,
    totalPointsPlayed: finalTotalGames,
    pointsWonPct:      finalPointsWonPct,
    // Delete stale _xlsx baseline fields (xlsx data is now baked into the regular fields above)
    matchesPlayed_xlsx:     FieldValue.delete(),
    wins_xlsx:              FieldValue.delete(),
    loses_xlsx:             FieldValue.delete(),
    leaguePoints26_xlsx:    FieldValue.delete(),
    tournamentsPlayed_xlsx: FieldValue.delete(),
    pointswon_xlsx:         FieldValue.delete(),
    totalPointsPlayed_xlsx: FieldValue.delete(),
    // Delete snake_case duplicates written by old signup flow
    matches_played:         FieldValue.delete(),
    matches_won:            FieldValue.delete(),
    points_won_percentage:  FieldValue.delete(),
  }, { merge: true });
  console.log(`  ${uid} → ${finalMatchesPlayed}MP ${finalWins}W/${finalLoses}L ${finalPoints}pts | ${finalPointswon}/${finalTotalGames} games (${finalPointsWonPct}%) [xlsx:${base.pointswon}/${base.totalPointsPlayed} + tm:${s.pointswon}/${s.totalPointsPlayed}]`);
  written++;
}

await batch.commit();
console.log(`\nDone. Updated ${written} players.`);
