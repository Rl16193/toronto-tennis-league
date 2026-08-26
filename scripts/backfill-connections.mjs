/**
 * Backfills `connections` from existing relationships, and (with --strip) removes contact PII from
 * the world-readable `users` collection.
 *
 * Gating `contacts` is pointless without the strip: `users` is `allow read: if true` and still
 * carries email / phone / whatsapp_contact, readable by anyone via the REST API. The strip refuses
 * any user with no contacts doc, so it only ever removes duplicated fields.
 *
 * ORDER MATTERS — deploy the rules LAST, or the gate goes live before the connections exist and
 * every contact read fails for everyone:
 *
 *   1. Deploy the reviewed Functions using the explicit-project, approval-gated workflow in
 *      docs/archive/architecture/ENVIRONMENTS_AND_DEPLOYMENT.md.
 *   2. node scripts/backfill-connections.mjs --project rands-staging --key serviceAccount.json
 *      node scripts/backfill-connections.mjs --project rands-staging --key serviceAccount.json --apply
 *   3. Deploy the reviewed Rules using the same explicit-project, approval-gated workflow.
 *   4. node scripts/backfill-connections.mjs --project rands-staging --key serviceAccount.json --strip
 *      node scripts/backfill-connections.mjs --project rands-staging --key serviceAccount.json --strip --apply
 *
 * Dry-run is the default. Production additionally requires the migration confirmation triple.
 */
import admin from 'firebase-admin';
import { createMigrationDb, parseMigrationArgs } from './migrations/lib/cli.mjs';

const args = process.argv.slice(2);
const options = parseMigrationArgs(args);
if (options.help) {
  console.log(
    'Usage: node scripts/backfill-connections.mjs --project <id> --key <serviceAccount.json> [--strip] [--apply]',
  );
  process.exit(0);
}
const dryRun = options.dryRun;
const strip = args.includes('--strip');
const db = createMigrationDb(options);

// Must match pairId() in functions/connections.js and firestore.rules.
const pairId = (a, b) => (a < b ? `${a}__${b}` : `${b}__${a}`);

// Fields that moved to `contacts` and must not remain on the public `users` doc.
const PII_FIELDS = [
  'email',
  'phone',
  'whatsapp_contact',
  'whatsapp_same_as_phone',
  'secondary_email',
  'preferred_mode_of_contact',
  'contactable',
];

const backfillConnections = async () => {
  const matches = await db.collection('matches').get();
  const pairs = new Map(); // pairId -> { uids, reason }

  matches.docs.forEach((d) => {
    const m = d.data();
    const a = m.player_1_uid;
    const b = m.player_2_uid;
    if (!a || !b || a === b) return;
    if (m.category === 'score_submission') return;
    // Same rule as the trigger: an unanswered request earns nothing.
    if ((m.category === 'rally' || m.category === 'challenge') && m.status !== 'accepted') return;
    const id = pairId(a, b);
    if (!pairs.has(id)) {
      pairs.set(id, {
        uids: [a, b].sort(),
        reason: m.category === 'rally' || m.category === 'challenge' ? m.category : 'tournament',
      });
    }
  });

  console.log(`${matches.size} match docs -> ${pairs.size} distinct connections`);

  const existing = await db.collection('connections').get();
  const have = new Set(existing.docs.map((d) => d.id));
  const missing = [...pairs.entries()].filter(([id]) => !have.has(id));
  console.log(`${have.size} already recorded; ${missing.length} to create`);

  let batch = db.batch();
  let n = 0;
  for (const [id, data] of missing) {
    console.log(`  ${dryRun ? '[dry-run] ' : ''}connections/${id}  (${data.reason})`);
    if (!dryRun) {
      batch.set(db.doc(`connections/${id}`), { ...data, created_at: new Date().toISOString(), backfilled: true });
      if (++n % 400 === 0) {
        await batch.commit();
        batch = db.batch();
      }
    }
  }
  if (!dryRun && n % 400 !== 0) await batch.commit();
  console.log(`${dryRun ? 'Would create' : 'Created'} ${missing.length} connection(s).`);
};

const stripUsers = async () => {
  const [users, contacts] = await Promise.all([db.collection('users').get(), db.collection('contacts').get()]);
  const haveContacts = new Set(contacts.docs.map((d) => d.id));

  let stripped = 0;
  let skipped = 0;
  let batch = db.batch();
  let n = 0;

  for (const d of users.docs) {
    const u = d.data();
    const present = PII_FIELDS.filter((f) => u[f] !== undefined);
    if (present.length === 0) continue;
    // Never strip someone whose details aren't safely in `contacts` — that would destroy the
    // only copy. These need the --copy step run for them first.
    if (!haveContacts.has(d.id)) {
      console.log(`  SKIP users/${d.id} — no contacts doc (fields: ${present.join(', ')})`);
      skipped++;
      continue;
    }
    console.log(`  ${dryRun ? '[dry-run] ' : ''}users/${d.id} — removing ${present.join(', ')}`);
    if (!dryRun) {
      batch.update(d.ref, Object.fromEntries(present.map((f) => [f, admin.firestore.FieldValue.delete()])));
      if (++n % 400 === 0) {
        await batch.commit();
        batch = db.batch();
      }
    }
    stripped++;
  }
  if (!dryRun && n % 400 !== 0) await batch.commit();
  console.log(
    `\n${dryRun ? 'Would strip' : 'Stripped'} ${stripped} user doc(s); ${skipped} skipped for missing contacts.`,
  );
};

// The onListingContact trigger only fires on future listing writes, so existing sellers need
// their marker seeded or the Contact button vanishes from listings already on the board.
const backfillPublicContacts = async () => {
  const listings = await db.collection('listings').get();
  const uids = [...new Set(listings.docs.map((d) => d.data().uid).filter(Boolean))];
  console.log(`\n${listings.size} listing(s) from ${uids.length} seller(s)`);
  for (const uid of uids) {
    console.log(`  ${dryRun ? '[dry-run] ' : ''}public_contacts/${uid}`);
    if (!dryRun) {
      await db.doc(`public_contacts/${uid}`).set({ uid, reason: 'listing', updated_at: new Date().toISOString() });
    }
  }
};

const run = async () => {
  if (strip) await stripUsers();
  else {
    await backfillConnections();
    await backfillPublicContacts();
  }
  process.exit(0);
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
