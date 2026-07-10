/**
 * Availability Backfill
 *
 * Populates preferences.availability (the per-day AM/PM grid) from the legacy
 * availability_day × availability_time, for users who don't have the grid yet. Each legacy day
 * gets all the legacy times. Idempotent — docs that already have a non-empty grid are skipped.
 *
 * Usage:
 *   node scripts/backfill-availability.js --key serviceAccount.json
 *   node scripts/backfill-availability.js --key serviceAccount.json --dry-run
 */

import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

const dryRun = process.argv.includes('--dry-run');

const keyArgIndex = process.argv.indexOf('--key');
if (keyArgIndex === -1 || !process.argv[keyArgIndex + 1]) {
  console.error('Usage: node scripts/backfill-availability.js --key path/to/serviceAccount.json [--dry-run]');
  process.exit(1);
}
const keyPath = path.resolve(process.argv[keyArgIndex + 1]);
if (!fs.existsSync(keyPath)) { console.error(`Key not found: ${keyPath}`); process.exit(1); }

admin.initializeApp({ credential: admin.credential.cert(JSON.parse(fs.readFileSync(keyPath, 'utf8'))) });
const db = admin.firestore();

const DAY_CODES = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const normalizeDay = (d) => {
  const up = String(d || '').trim().toUpperCase().slice(0, 3);
  return DAY_CODES.includes(up) ? up : null;
};
const asSlots = (arr) => (Array.isArray(arr) ? arr : []).filter((s) => s === 'AM' || s === 'PM');

function deriveGrid(data) {
  const grid = {};
  const times = asSlots(data.availability_time);
  for (const d of data.availability_day ?? []) {
    const code = normalizeDay(d);
    if (code && times.length) grid[code] = [...times];
  }
  return grid;
}

async function main() {
  console.log(dryRun ? '🔍 DRY RUN — no writes will be made\n' : '✏️  LIVE RUN — writing to Firestore\n');

  const snap = await db.collection('preferences').get();
  console.log(`Found ${snap.size} preferences documents\n`);

  const results = { updated: [], alreadySet: [], noLegacy: [] };

  for (const doc of snap.docs) {
    const data = doc.data();
    const name = data.name || doc.id;

    if (data.availability && typeof data.availability === 'object' && Object.keys(data.availability).length > 0) {
      results.alreadySet.push(name);
      continue;
    }

    const grid = deriveGrid(data);
    if (Object.keys(grid).length === 0) {
      results.noLegacy.push(name);
      continue;
    }

    if (!dryRun) await doc.ref.update({ availability: grid });
    results.updated.push({ name, grid });
  }

  console.log('═══════════════════════════════════════════════════════');
  console.log(`✅ UPDATED (${results.updated.length})`);
  console.log('═══════════════════════════════════════════════════════');
  for (const r of results.updated) {
    const summary = Object.entries(r.grid).map(([d, s]) => `${d}:${s.join('/')}`).join('  ');
    console.log(`  ${String(r.name).padEnd(28)} → ${summary}`);
  }

  console.log(`\nSUMMARY: ${results.updated.length} updated · ${results.alreadySet.length} already had a grid · ${results.noLegacy.length} no legacy availability`);
  if (dryRun) console.log('(dry run — nothing written)');
}

main().catch((e) => { console.error(e); process.exit(1); });
