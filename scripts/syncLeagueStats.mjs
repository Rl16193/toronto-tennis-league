/**
 * Sync league stats from 2025League.xlsx to Firestore.
 *
 * Prerequisites:
 *   npm install --save-dev firebase-admin xlsx
 *
 * Usage:
 *   node scripts/syncLeagueStats.mjs                          # dry run (default XLSX)
 *   node scripts/syncLeagueStats.mjs [path-to-xlsx]          # dry run with custom file
 *   node scripts/syncLeagueStats.mjs --write                 # write to Firestore (default XLSX)
 *   node scripts/syncLeagueStats.mjs [path-to-xlsx] --write  # write with custom file
 *
 * Authentication:
 *   Set FIREBASE_SERVICE_ACCOUNT env var to your service account key path.
 *   Default: ./serviceAccount.json
 *   Download: Firebase Console → Project Settings → Service Accounts → Generate new private key
 *
 * XLSX columns used:
 *   user_id, League, name, tournamentsPlayed, matchesPlayed, wins, loses,
 *   pointswon, totalPointsPlayed, pointsWonPct, leaguePoints26
 *
 * Rows without a valid user_id are skipped.
 * skill_level is never overwritten (managed by the app).
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import XLSX from 'xlsx';

const DEFAULT_XLSX = resolve('./public/2025League.xlsx');

const args = process.argv.slice(2);
const shouldWrite = args.includes('--write');
const xlsxArg = args.find((a) => !a.startsWith('-'));
const xlsxPath = xlsxArg ? resolve(xlsxArg) : DEFAULT_XLSX;

// ── Firebase Admin init ───────────────────────────────────────────────────

const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT
  ? resolve(process.env.FIREBASE_SERVICE_ACCOUNT)
  : resolve('./serviceAccount.json');

let serviceAccount;
try {
  serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
} catch {
  console.error(`Cannot read service account file: ${serviceAccountPath}`);
  console.error('Download: Firebase Console → Project Settings → Service Accounts → Generate new private key');
  process.exit(1);
}

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

// ── Parse XLSX ────────────────────────────────────────────────────────────

let allRows;
try {
  const workbook = XLSX.readFile(xlsxPath);
  allRows = workbook.SheetNames.flatMap((name) =>
    XLSX.utils.sheet_to_json(workbook.Sheets[name]),
  );
} catch (err) {
  console.error(`Cannot parse XLSX: ${xlsxPath}`);
  console.error(err.message);
  process.exit(1);
}

const rows = allRows.filter((r) => r.user_id && String(r.user_id).trim() !== '');

console.log(`\nXLSX: ${xlsxPath}`);
console.log(`Total rows: ${allRows.length}  |  Valid user_id: ${rows.length}\n`);
console.table(
  rows.map((r) => ({
    user_id: String(r.user_id).slice(0, 12) + '…',
    name: r.name,
    League: r.League,
    matchesPlayed: r.matchesPlayed,
    wins: r.wins,
    leaguePoints26: r.leaguePoints26,
  }))
);

if (!shouldWrite) {
  console.log('\nDry run — no changes written.');
  console.log('To write: node scripts/syncLeagueStats.mjs --write');
  process.exit(0);
}

// ── Write to Firestore ────────────────────────────────────────────────────

let created = 0;
let updated = 0;

for (const row of rows) {
  const uid = String(row.user_id).trim();
  const ref = db.collection('stats').doc(uid);
  const existing = await ref.get();

  const xlsxMatchesPlayed = Number(row.matchesPlayed ?? 0);
  const xlsxWins         = Number(row.wins ?? 0);
  const xlsxLoses        = Number(row.loses ?? 0);
  const xlsxPoints       = Number(row.leaguePoints26 ?? row.leaguepoints26 ?? 0);

  const update = {
    user_id: uid,
    name: String(row.name ?? ''),
    league: String(row.League ?? ''),
    tournamentsPlayed: Number(row.tournamentsPlayed ?? 0),
    // Display fields (XLSX baseline — backfill adds tournament totals on top)
    matchesPlayed: xlsxMatchesPlayed,
    wins: xlsxWins,
    loses: xlsxLoses,
    pointswon: Number(row.pointswon ?? 0),
    totalPointsPlayed: Number(row.totalPointsPlayed ?? 0),
    pointsWonPct: Number(row.pointsWonPct ?? 0),
    leaguePoints26: xlsxPoints,
    // Stored baselines so backfill can recompute idempotently
    matchesPlayed_xlsx: xlsxMatchesPlayed,
    wins_xlsx: xlsxWins,
    loses_xlsx: xlsxLoses,
    leaguePoints26_xlsx: xlsxPoints,
  };

  if (!existing.exists) {
    await ref.set({ ...update, skill_level: 2 });
    console.log(`Created  stats/${uid}  (${row.name})`);
    created++;
  } else {
    await ref.update(update);
    console.log(`Updated  stats/${uid}  (${row.name})`);
    updated++;
  }
}

console.log(`\nDone. Created: ${created}  Updated: ${updated}`);
