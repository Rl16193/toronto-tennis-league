/**
 * Permanently deletes every catalog offer belonging to one provider.
 *
 * Production has no backups, so this is unrecoverable: it prints what it would delete and exits
 * unless --apply is passed. It refuses to run while any booking, redemption or coupon still points
 * at one of those offers, because deleting the offer out from under a live job would leave the
 * booking with nothing to resolve.
 *
 *   node scripts/remove-provider-offers.mjs --key serviceAccount.json --provider pandemic
 *   node scripts/remove-provider-offers.mjs --key serviceAccount.json --provider pandemic --apply
 */
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import admin from 'firebase-admin';

const { values } = parseArgs({
  options: {
    key: { type: 'string' },
    provider: { type: 'string' },
    apply: { type: 'boolean', default: false },
  },
});

if (!values.key || !values.provider) {
  console.error('Usage: node scripts/remove-provider-offers.mjs --key serviceAccount.json --provider <id> [--apply]');
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync(values.key, 'utf8'))) });
const db = admin.firestore();

const offers = (await db.collection('tasks').where('type', '==', 'offer').get()).docs
  .filter((d) => d.data().provider_id === values.provider);

if (offers.length === 0) {
  console.log(`No offers found for provider "${values.provider}".`);
  process.exit(0);
}

console.log(`${offers.length} offer(s) for "${values.provider}":`);
offers.forEach((d) => console.log(`  ${d.id}  ${d.data().provider_name} — ${d.data().offer}  $${d.data().total_price}`));

// A LIVE booking or coupon blocks the delete. A finished one does not: bookings and redemptions
// snapshot the offer name and prices when they are created, so their history survives the offer
// doc going away.
const LIVE = ['lead', 'in_progress', 'active', 'pending', 'cancel_requested'];
const ids = offers.map((d) => d.id);
const blockers = [];
const finished = [];
for (const [col, field] of [['bookings', 'service_id'], ['redemptions', 'reward_id']]) {
  const snap = await db.collection(col).get();
  snap.docs.filter((d) => ids.includes(d.data()[field])).forEach((d) => {
    const row = `${col}/${d.id} (status ${d.data().status})`;
    (LIVE.includes(d.data().status) ? blockers : finished).push(row);
  });
}

if (blockers.length) {
  console.error(`\nREFUSING: ${blockers.length} live document(s) still reference these offers:`);
  blockers.forEach((b) => console.error('  ' + b));
  process.exit(1);
}
console.log(finished.length
  ? `\n${finished.length} finished reference(s), which keep their own snapshot of the offer:\n  ${finished.join('\n  ')}`
  : '\nNothing references these offers.');

if (!values.apply) {
  console.log('\nDRY RUN — nothing was deleted. Re-run with --apply to delete permanently.');
  process.exit(0);
}

const batch = db.batch();
offers.forEach((d) => batch.delete(d.ref));
await batch.commit();
console.log(`\nDeleted ${offers.length} offer(s).`);
