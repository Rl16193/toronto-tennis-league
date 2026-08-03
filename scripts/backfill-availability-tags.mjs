/**
 * One-time backfill: map each existing preferences doc's old day×AM/PM availability grid (or
 * legacy availability_day/availability_time fields) onto the new simplified `availability_tags`
 * (see AVAILABILITY_TAGS in src/utils/availability.ts) — best-effort, so existing users don't
 * appear to have "no availability" after the new UI ships. Duplicates the pure mapping logic
 * from src/utils/availability.ts (same pattern as scripts/regroup-rr.js) — keep them in sync.
 *
 * Usage:
 *   node scripts/backfill-availability-tags.mjs --key serviceAccount.json --dry-run
 *   node scripts/backfill-availability-tags.mjs --key serviceAccount.json
 */

import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dryRun = process.argv.includes('--dry-run');

const keyArgIndex = process.argv.indexOf('--key');
if (keyArgIndex === -1 || !process.argv[keyArgIndex + 1]) {
  console.error('Usage: node scripts/backfill-availability-tags.mjs --key path/to/serviceAccount.json [--dry-run]');
  process.exit(1);
}
const keyPath = path.resolve(process.argv[keyArgIndex + 1]);
if (!fs.existsSync(keyPath)) { console.error(`Key not found: ${keyPath}`); process.exit(1); }

admin.initializeApp({ credential: admin.credential.cert(JSON.parse(fs.readFileSync(keyPath, 'utf8'))) });
const db = admin.firestore();

const DAY_CODES = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const normalizeDay = (d) => {
  const up = String(d).trim().toUpperCase().slice(0, 3);
  return DAY_CODES.includes(up) ? up : null;
};
const asSlots = (arr) => (Array.isArray(arr) ? arr : []).filter((s) => s === 'AM' || s === 'PM');

function getAvailabilityGrid(prefs) {
  const grid = {};
  if (!prefs) return grid;
  if (prefs.availability && Object.keys(prefs.availability).length > 0) {
    for (const [day, slots] of Object.entries(prefs.availability)) {
      const code = normalizeDay(day);
      const norm = asSlots(slots);
      if (code && norm.length) grid[code] = norm;
    }
    return grid;
  }
  const times = asSlots(prefs.availability_time);
  for (const d of prefs.availability_day ?? []) {
    const code = normalizeDay(d);
    if (code && times.length) grid[code] = [...times];
  }
  return grid;
}

function gridToAvailabilityTags(grid) {
  const weekdays = ['MON', 'TUE', 'WED', 'THU', 'FRI'];
  const weekend = ['SAT', 'SUN'];
  const has = (days, slot) => days.some((d) => grid[d]?.includes(slot));
  const wdAM = has(weekdays, 'AM');
  const wdPM = has(weekdays, 'PM');
  const weAM = has(weekend, 'AM');
  const wePM = has(weekend, 'PM');

  if (wdAM && wdPM && weAM && wePM) return ['anytime'];

  const tags = [];
  if (wdAM && weAM) tags.push('mornings');
  else {
    if (wdAM) tags.push('weekday_mornings');
    if (weAM) tags.push('weekend_mornings');
  }
  if (wdPM && wePM) tags.push('evenings');
  else {
    if (wdPM) tags.push('weekday_evenings');
    if (wePM) tags.push('weekend_evenings');
  }
  return tags;
}

async function main() {
  console.log(dryRun ? '🔍 DRY RUN — no writes\n' : '✏️  LIVE RUN\n');

  const snapshot = await db.collection('preferences').get();
  let updated = 0;
  let skipped = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data();
    if (Array.isArray(data.availability_tags) && data.availability_tags.length > 0) { skipped++; continue; } // already set
    const grid = getAvailabilityGrid(data);
    const tags = gridToAvailabilityTags(grid);
    if (tags.length === 0) continue; // nothing to backfill — leave unset, per plan

    console.log(`  ${data.name || doc.id}: ${JSON.stringify(grid)} → [${tags.join(', ')}]`);
    if (!dryRun) await doc.ref.update({ availability_tags: tags });
    updated++;
  }

  console.log(`\n${updated} document(s) ${dryRun ? 'would be' : ''} updated. ${skipped} already had availability_tags set.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
