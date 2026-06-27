/**
 * One-time fix: rename "stanley park" → "Stanley Park South - Toronto"
 * in preferred_courts for all preferences docs.
 *
 * Usage:
 *   node scripts/fix-stanley-park.js --key serviceAccount.json
 *   node scripts/fix-stanley-park.js --key serviceAccount.json --dry-run
 */

import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dryRun = process.argv.includes('--dry-run');

const keyArgIndex = process.argv.indexOf('--key');
if (keyArgIndex === -1 || !process.argv[keyArgIndex + 1]) {
  console.error('Usage: node scripts/fix-stanley-park.js --key path/to/serviceAccount.json [--dry-run]');
  process.exit(1);
}
const keyPath = path.resolve(process.argv[keyArgIndex + 1]);
if (!fs.existsSync(keyPath)) { console.error(`Key not found: ${keyPath}`); process.exit(1); }

admin.initializeApp({ credential: admin.credential.cert(JSON.parse(fs.readFileSync(keyPath, 'utf8'))) });
const db = admin.firestore();

const OLD = 'stanley park';
const NEW = 'Stanley Park South - Toronto';

async function main() {
  console.log(dryRun ? '🔍 DRY RUN — no writes\n' : '✏️  LIVE RUN\n');

  const snapshot = await db.collection('preferences').get();
  let updated = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const courts = Array.isArray(data.preferred_courts) ? data.preferred_courts : [];
    const fixed = courts.map((c) => c.trim().toLowerCase() === OLD ? NEW : c);
    const changed = fixed.some((c, i) => c !== courts[i]);

    if (!changed) continue;

    const name = data.name || doc.id;
    console.log(`  ${name}: ${courts.join(', ')} → ${fixed.join(', ')}`);
    if (!dryRun) await doc.ref.update({ preferred_courts: fixed });
    updated++;
  }

  console.log(`\n${updated} document(s) ${dryRun ? 'would be' : ''} updated.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
