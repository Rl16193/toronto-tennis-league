/**
 * Awards `setupComplete` to anyone who has finished every Initiation task.
 *
 * setupComplete is only evaluated inside the taskPoints.js triggers, which fire on a
 * match/event/photo — never on their own. So after the checklist changes, players who already
 * qualify stay unmarked until they happen to trigger something. Worth SETUP_POINTS (25) and
 * unlocks the "Member" badge, derived live from the flag.
 *
 * Idempotent: skips anyone already marked. Admin SDK, so it bypasses owner-write rules.
 *
 * Usage:
 *   node scripts/backfill-setup-complete.mjs --project rands-staging --key serviceAccount.json
 *   node scripts/backfill-setup-complete.mjs --project rands-staging --key serviceAccount.json --apply
 *
 * Dry-run is the default. Production additionally requires the migration confirmation triple.
 */
import { createRequire } from 'module';
import { createMigrationDb, parseMigrationArgs } from './migrations/lib/cli.mjs';

const require = createRequire(import.meta.url);
// Single source of truth — same list the Cloud Functions use.
const { INITIATION_TASK_IDS } = require('../functions/lib/points.js');

const args = process.argv.slice(2);
const options = parseMigrationArgs(args);
if (options.help) {
  console.log('Usage: node scripts/backfill-setup-complete.mjs --project <id> --key <serviceAccount.json> [--apply]');
  process.exit(0);
}
const dryRun = options.dryRun;
const db = createMigrationDb(options);

const run = async () => {
  console.log(`Initiation checklist (${INITIATION_TASK_IDS.length}): ${INITIATION_TASK_IDS.join(', ')}\n`);

  const snap = await db.collection('tasks').get();
  const newlyQualified = [];
  let alreadyDone = 0;

  snap.docs.forEach((d) => {
    const p = d.data();
    if (p.setupComplete) {
      alreadyDone += 1;
      return;
    }
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
        batch.set(
          db.doc(`tasks/${u.id}`),
          {
            setupComplete: true,
            updatedAt: new Date().toISOString(),
          },
          { merge: true },
        );
      });
      await batch.commit();
    }
  }

  console.log(
    `\n${snap.size} player(s) scanned · ${alreadyDone} already complete · ${newlyQualified.length} ${dryRun ? 'would be' : ''} awarded.`,
  );
  process.exit(0);
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
