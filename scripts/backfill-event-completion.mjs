/**
 * One-off: stamp `completed_at` on events whose final was already played.
 *
 * `recordScore` in functions/lib/scoring.js handles this going forward, but only for finals played AFTER it
 * deploys. Every tournament that finished before then has no stamp, so the client falls back to a
 * 30-day grace window past the end date and those events linger. This closes that gap once.
 *
 * PRODUCTION IS THE ONLY ENVIRONMENT and there are no backups — run the dry run first and read it.
 *
 *   node scripts/backfill-event-completion.mjs --key serviceAccount.json --dry-run
 *   node scripts/backfill-event-completion.mjs --key serviceAccount.json
 *
 * Safe to run twice: an event that already carries `completed_at` is skipped, so a second pass
 * cannot move a timestamp that is already correct.
 */

import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const keyIndex = args.indexOf('--key');
const keyPath = keyIndex >= 0 ? args[keyIndex + 1] : null;

if (!keyPath) {
  console.error('Usage: node scripts/backfill-event-completion.mjs --key serviceAccount.json [--dry-run]');
  process.exit(1);
}

initializeApp({ credential: cert(JSON.parse(readFileSync(keyPath, 'utf8'))) });
const db = getFirestore();

/** The same test the app uses everywhere else: round F, complete, and an actual winner. */
const isPlayedFinal = (m) => m.round === 'F' && m.status === 'complete' && !!m.winner_uid;

const run = async () => {
  const [eventsSnap, finalsSnap] = await Promise.all([
    db.collection('events').get(),
    db.collection('matches').where('round', '==', 'F').where('status', '==', 'complete').get(),
  ]);

  // Latest played final per event — an event runs several draws, and it is over when the last
  // one finishes, not the first. Mirrors the overwrite behaviour of the live trigger.
  const finishedAt = new Map();
  for (const doc of finalsSnap.docs) {
    const m = doc.data();
    if (!isPlayedFinal(m) || !m.event_id) continue;
    const when = m.completed_at || m.created_at || null;
    const prev = finishedAt.get(m.event_id);
    if (!prev || (when && when > prev)) finishedAt.set(m.event_id, when);
  }

  let stamped = 0;
  let skipped = 0;
  const batch = db.batch();

  for (const doc of eventsSnap.docs) {
    const when = finishedAt.get(doc.id);
    if (!when) continue;
    if (doc.data().completed_at) { skipped += 1; continue; }
    console.log(`${dryRun ? '[dry-run] ' : ''}${doc.data().title || doc.id} -> completed_at ${when}`);
    if (!dryRun) batch.set(doc.ref, { completed_at: when }, { merge: true });
    stamped += 1;
  }

  if (!dryRun && stamped > 0) await batch.commit();

  console.log('');
  console.log(`events: ${eventsSnap.size}  played finals: ${finishedAt.size}`);
  console.log(`${dryRun ? 'would stamp' : 'stamped'}: ${stamped}   already stamped: ${skipped}`);
};

run().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
