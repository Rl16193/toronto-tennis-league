/**
 * Rewrites court names members typed by hand to the name in the courts list, in
 * `preferences.preferred_courts`. Only the pairs in FIXES are touched — nothing is guessed.
 * Add a pair when an organizer is alerted about a typed court (onCustomCourtEntered).
 *
 * Runs monthly from a Windows scheduled task ("R&S fix court names").
 *
 * Usage:
 *   node scripts/fix-court-names.mjs --key serviceAccount.json --dry-run
 *   node scripts/fix-court-names.mjs --key serviceAccount.json
 */
import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

// typed name → name in public/Tennis Courts Facilities - 4326.csv (Dropdown column)
const FIXES = {
  'Sorauren Park': 'Sorauren Avenue Park',
};

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? null : process.argv[i + 1] ?? true;
};
const dryRun = process.argv.includes('--dry-run');
const keyPath = arg('key');
if (!keyPath || keyPath === true) {
  console.error('Usage: node scripts/fix-court-names.mjs --key serviceAccount.json [--dry-run]');
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(fs.readFileSync(path.resolve(keyPath), 'utf8'))),
});
const db = admin.firestore();

const snap = await db.collection('preferences').get();
let changed = 0;
for (const doc of snap.docs) {
  const courts = doc.get('preferred_courts');
  if (!Array.isArray(courts) || !courts.some((c) => FIXES[c])) continue;
  const fixed = [...new Set(courts.map((c) => FIXES[c] || c))];
  console.log(`${doc.id}: ${JSON.stringify(courts)} → ${JSON.stringify(fixed)}`);
  if (!dryRun) await doc.ref.update({ preferred_courts: fixed });
  changed += 1;
}
console.log(`${new Date().toISOString()} ${dryRun ? '[dry run] would fix' : 'fixed'} ${changed} member(s).`);
