/**
 * Awards `setupComplete` to anyone who has finished every Community Member Initiation task.
 *
 * Needed because setupComplete is only evaluated inside the Cloud Function triggers
 * (functions/taskPoints.js) — it fires when a match/event/photo lands, never on its own. So
 * after the checklist itself changes (e.g. 'ladderMatch' was removed from INITIATION_TASK_IDS),
 * players who already qualify stay unmarked until they happen to trigger something.
 *
 * setupComplete is worth SETUP_POINTS (25) and unlocks the "Member" badge, which is derived
 * live from the flag — no separate badge write is needed.
 *
 * Idempotent: skips anyone already marked. Admin SDK, so it bypasses the owner-write rules.
 *
 * Usage:
 *   node scripts/backfill-setup-complete.mjs --key serviceAccount.json --dry-run
 *   node scripts/backfill-setup-complete.mjs --key serviceAccount.json
 */
import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
// Single source of truth — same list the Cloud Functions use.
const { INITIATION_TASK_IDS } = require('../functions/lib/points.js');

const dryRun = process.argv.includes('--dry-run');
const keyArgIndex = process.argv.indexOf('--key');
if (keyArgIndex === -1 || !process.argv[keyArgIndex + 1]) {
  console.error('Usage: node scripts/backfill-setup-complete.mjs --key path/to/serviceAccount.json [--dry-run]');
  process.exit(1);
}
const keyPath = path.resolve(process.argv[keyArgIndex + 1]);
if (!fs.existsSync(keyPath)) { console.error(`Key not found: ${keyPath}`); process.exit(1); }

admin.initializeApp({ credential: admin.credential.cert(JSON.parse(fs.readFileSync(keyPath, 'utf8'))) });
const db = admin.firestore();

const run = async () => {
  console.log(`Initiation checklist (${INITIATION_TASK_IDS.length}): ${INITIATION_TASK_IDS.join(', ')}\n`);

  const snap = await db.collection('tasks').get();
  const newlyQualified = [];
  let alreadyDone = 0;

  snap.docs.forEach((d) => {
    const p = d.data();
    if (p.setupComplete) { alreadyDone += 1; return; }
    if (!INITIATION_TASK_IDS.every((id) => p[id])) return;
    newlyQualified.push({ id: d.id, name: p.name || '(no name)' });
  });

  newlyQualified.forEach((u) => {
    console.log(`${dryRun ? '[dry-run] ' : ''}setupComplete → ${u.name} (${u.id})`);
  });

  if (!dryRun && newlyQualified.length > 0) {
    // Chunked: Firestore caps a batch at 500 writes.
    for (let i = 0; i < newlyQualified.length; i += 400) {
      const batch = db.batch();
      newlyQualified.slice(i, i + 400).forEach((u) => {
        batch.set(db.doc(`tasks/${u.id}`), {
          setupComplete: true,
          updatedAt: new Date().toISOString(),
        }, { merge: true });
      });
      await batch.commit();
    }
  }

  console.log(`\n${snap.size} player(s) scanned · ${alreadyDone} already complete · ${newlyQualified.length} ${dryRun ? 'would be' : ''} awarded.`);
  process.exit(0);
};

run().catch((err) => { console.error(err); process.exit(1); });
