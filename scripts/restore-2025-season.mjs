/**
 * Restores 2025-season records for returning players.
 *
 * These two played in 2025, before the current season's data existed. Their 2025 league points go
 * into a new `leaguePoints25` field (the live leaderboard reads `leaguePoints26`, which is left
 * untouched), and their 2025 match counters are added to the lifetime totals — `matchesPlayed`,
 * `wins`, `loses`, `pointswon`, `totalPointsPlayed` and `tournamentsPlayed` are not season-scoped.
 *
 * Idempotent: anyone who already has a `leaguePoints25` value is skipped, so a re-run can't
 * double-count the lifetime totals.
 *
 * Usage:
 *   node scripts/restore-2025-season.mjs --key serviceAccount.json --dry-run
 *   node scripts/restore-2025-season.mjs --key serviceAccount.json
 */
import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

// Columns as supplied: tournamentsPlayed, matchesPlayed, wins, loses, pointswon,
// totalPointsPlayed, (win% derived), leaguePoints25, (points-per-match derived).
const SEASON_2025 = [
  {
    uid: 'ETM78tiMlGWpYtZHgK6w3AiMf103',
    name: 'Rohan Singla',
    league: "Men's",
    tournamentsPlayed: 2,
    matchesPlayed: 2,
    wins: 0,
    loses: 2,
    pointswon: 13,
    totalPointsPlayed: 48,
    leaguePoints25: 3,
  },
  {
    uid: 'yvNOgObSFqTMmhlrMNrBcAa4mf93',
    name: 'Avinash Bhomia',
    league: "Men's",
    tournamentsPlayed: 1,
    matchesPlayed: 2,
    wins: 1,
    loses: 1,
    pointswon: 32,
    totalPointsPlayed: 66,
    leaguePoints25: 5,
  },
];

const args = process.argv;
const dryRun = args.includes('--dry-run');
const keyIdx = args.indexOf('--key');
if (keyIdx === -1 || !args[keyIdx + 1]) {
  console.error('Usage: node scripts/restore-2025-season.mjs --key <serviceAccount.json> [--dry-run]');
  process.exit(1);
}
const keyPath = path.resolve(args[keyIdx + 1]);
if (!fs.existsSync(keyPath)) { console.error(`Key not found: ${keyPath}`); process.exit(1); }

admin.initializeApp({ credential: admin.credential.cert(JSON.parse(fs.readFileSync(keyPath, 'utf8'))) });
const db = admin.firestore();

const run = async () => {
  const batch = db.batch();
  let queued = 0;

  for (const p of SEASON_2025) {
    const ref = db.doc(`stats/${p.uid}`);
    const snap = await ref.get();
    if (!snap.exists) { console.log(`SKIP  ${p.name} — no stats doc`); continue; }
    const cur = snap.data();

    if (cur.leaguePoints25 !== undefined) {
      console.log(`SKIP  ${p.name} — already has leaguePoints25 = ${cur.leaguePoints25}`);
      continue;
    }

    const n = (k) => Number(cur[k] || 0);
    const update = {
      leaguePoints25: p.leaguePoints25,
      tournamentsPlayed: n('tournamentsPlayed') + p.tournamentsPlayed,
      matchesPlayed: n('matchesPlayed') + p.matchesPlayed,
      wins: n('wins') + p.wins,
      loses: n('loses') + p.loses,
      pointswon: n('pointswon') + p.pointswon,
      totalPointsPlayed: n('totalPointsPlayed') + p.totalPointsPlayed,
      // A returning player can have a blank league; don't overwrite one that's already set.
      ...(String(cur.league || '').trim() ? {} : { league: p.league }),
    };

    console.log(`${dryRun ? '[dry-run] ' : ''}${p.name}`);
    console.log(`    leaguePoints25            -> ${p.leaguePoints25}   (leaguePoints26 stays ${n('leaguePoints26')})`);
    console.log(`    matchesPlayed  ${n('matchesPlayed')} + ${p.matchesPlayed} -> ${update.matchesPlayed}`);
    console.log(`    wins           ${n('wins')} + ${p.wins} -> ${update.wins}      loses ${n('loses')} + ${p.loses} -> ${update.loses}`);
    console.log(`    pointswon      ${n('pointswon')} + ${p.pointswon} -> ${update.pointswon}   of ${update.totalPointsPlayed}`);
    if (update.league) console.log(`    league (was blank)        -> ${update.league}`);

    batch.set(ref, update, { merge: true });
    queued += 1;
  }

  if (!dryRun && queued) await batch.commit();
  console.log(`\n${queued} player(s) ${dryRun ? 'would be ' : ''}updated.`);
  process.exit(0);
};

run().catch((err) => { console.error(err); process.exit(1); });
