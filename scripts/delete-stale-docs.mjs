/**
 * Deletes the two groups of genuinely dead documents found by the stale-doc audit:
 *
 *   1. _archive_database_consolidation/{source}/docs/{id}
 *      Pre-deletion snapshots taken during the collection consolidation. Admin-SDK only,
 *      unreachable from the app, referenced by no code.
 *
 *   2. tasks/{id} where type == 'offer' AND active == false
 *      Retired Services catalog rows. Filtered out of the catalog by `active !== false`, so they
 *      never render.
 *
 * DELIBERATELY REFUSES to touch anything else. In particular it will not delete:
 *   - matches with no players     -> knockout/bracket structure ("Winner of QF1", PLAYER_LOADING,
 *                                    BYE). Removing them tears a live draw apart.
 *   - event_participants.removal  -> the soft-delete row is what stops a removed player being
 *                                    re-seated by the placement effects.
 *   - notifications               -> all are under 30 days old; nothing is stale.
 *   - claimed_winner_uid / score_line -> legacy result fields the Cloud Functions still read as a
 *                                    fallback. Strip only after functions AND hosting are deployed.
 *
 * PRODUCTION HAS NO BACKUPS. Run --dry-run first and read the list.
 *
 *   node scripts/delete-stale-docs.mjs --project rands-staging --key serviceAccount.json
 *   node scripts/delete-stale-docs.mjs --project rands-staging --key serviceAccount.json --apply
 *
 * Add --archive-only or --offers-only to do one group at a time.
 * Dry-run is the default; production additionally requires the migration confirmation triple.
 */
import { createMigrationDb, parseMigrationArgs } from './migrations/lib/cli.mjs';

const args = process.argv.slice(2);
const options = parseMigrationArgs(args);
if (options.help) {
  console.log(
    'Usage: node scripts/delete-stale-docs.mjs --project <id> --key <serviceAccount.json> [--apply] [--archive-only|--offers-only]',
  );
  process.exit(0);
}
const dryRun = options.dryRun;
const archiveOnly = args.includes('--archive-only');
const offersOnly = args.includes('--offers-only');

if (archiveOnly && offersOnly) {
  console.error('Choose only one of --archive-only or --offers-only.');
  process.exit(1);
}
const db = createMigrationDb(options);

const tag = dryRun ? '[dry-run] ' : '';
let planned = 0;
let deleted = 0;

/** Commits in chunks — a Firestore batch caps at 500 writes. */
async function deleteAll(refs, label) {
  planned += refs.length;
  for (const r of refs) console.log(`  ${tag}delete ${label}: ${r.path}`);
  if (dryRun || refs.length === 0) return;
  for (let i = 0; i < refs.length; i += 400) {
    const batch = db.batch();
    refs.slice(i, i + 400).forEach((r) => batch.delete(r));
    await batch.commit();
    deleted += Math.min(400, refs.length - i);
  }
}

// ── 1. consolidation archive ────────────────────────────────────────────────
if (!offersOnly) {
  console.log('\n1. _archive_database_consolidation');
  const sources = await db.collection('_archive_database_consolidation').listDocuments();
  for (const source of sources) {
    const docs = await source.collection('docs').listDocuments();
    console.log(`   ${source.id}: ${docs.length} archived doc(s)`);
    await deleteAll(docs, 'archive');
    // The parent is a container with no fields of its own once `docs` is gone. `listDocuments()`
    // returns it whether or not it exists as a real document, so delete() here is a no-op when it
    // was only ever a path segment.
    if (!dryRun) await source.delete().catch(() => {});
  }
  if (sources.length === 0) console.log('   (nothing to do — already clean)');
}

// ── 2. retired offer rows ───────────────────────────────────────────────────
if (!archiveOnly) {
  console.log('\n2. tasks type=offer, active=false');
  const offers = await db.collection('tasks').where('type', '==', 'offer').get();
  const dead = offers.docs.filter((d) => d.data().active === false);
  // Guard: never touch an offer that a coupon still points at, or the redemption loses its offer.
  const reds = await db.collection('redemptions').get();
  const referenced = new Set(reds.docs.map((d) => String(d.data().reward_id || '')));
  const safe = [];
  for (const d of dead) {
    if (referenced.has(d.id)) {
      console.log(`   SKIP ${d.id} — a redemption still references it`);
      continue;
    }
    console.log(`   "${d.data().provider_name ?? d.data().stringer_name ?? '?'}" · ${d.data().offer ?? ''}`);
    safe.push(d.ref);
  }
  await deleteAll(safe, 'offer');
  if (dead.length === 0) console.log('   (nothing to do — already clean)');
}

console.log(`\n${dryRun ? 'Would delete' : 'Deleted'} ${dryRun ? planned : deleted} document(s).`);
if (dryRun) console.log('Re-run with --apply to apply.');
process.exit(0);
