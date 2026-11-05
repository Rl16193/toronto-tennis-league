/**
 * One-off: move `lastActive` from the world-readable `users` doc to the private `contacts` doc.
 *
 * Each contacts doc gets the later of its own `lastActive` (written on sign-in once the client is
 * live) and the users one, or null when neither exists: every doc in a collection carries every
 * field. The field is then deleted from `users`. Safe to re-run.
 *
 * Run after the rules deploy. PRODUCTION IS THE ONLY ENVIRONMENT. Dry run is the default.
 *
 *   node scripts/move-last-active.mjs --key serviceAccount.json
 *   node scripts/move-last-active.mjs --key serviceAccount.json --apply
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../functions/package.json', import.meta.url));
const admin = require('firebase-admin');

const args = process.argv.slice(2);
const keyPath = args.includes('--key') ? args[args.indexOf('--key') + 1] : null;
const apply = args.includes('--apply');
if (!keyPath) {
  console.error('Usage: node scripts/move-last-active.mjs --key serviceAccount.json [--apply]');
  process.exit(1);
}
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync(keyPath, 'utf8'))) });
const db = admin.firestore();
const { FieldValue } = admin.firestore;

const ms = (t) => (t && typeof t.toMillis === 'function' ? t.toMillis() : 0);

async function main() {
  const [users, contacts] = await Promise.all([db.collection('users').get(), db.collection('contacts').get()]);
  const fromUsers = new Map(users.docs.map((d) => [d.id, d.get('lastActive') || null]));

  const contactWrites = contacts.docs.map((d) => {
    const own = d.get('lastActive') || null;
    const old = fromUsers.get(d.id) || null;
    return { ref: d.ref, value: ms(old) > ms(own) ? old : own };
  });
  const userWrites = users.docs.filter((d) => d.get('lastActive') !== undefined).map((d) => d.ref);
  const contactIds = new Set(contacts.docs.map((d) => d.id));
  const orphans = users.docs.filter((d) => d.get('lastActive') && !contactIds.has(d.id)).length;

  console.log(`${contacts.size} contacts docs get lastActive (${contactWrites.filter((w) => w.value).length} with a date).`);
  console.log(`${userWrites.length} users docs lose lastActive.${orphans ? ` ${orphans} have no contacts doc (value dropped).` : ''}`);
  if (!apply) { console.log('\nDRY RUN. Re-run with --apply.'); return; }

  const ops = [
    ...contactWrites.map((w) => (b) => b.update(w.ref, { lastActive: w.value })),
    ...userWrites.map((ref) => (b) => b.update(ref, { lastActive: FieldValue.delete() })),
  ];
  for (let i = 0; i < ops.length; i += 400) {
    const batch = db.batch();
    ops.slice(i, i + 400).forEach((op) => op(batch));
    await batch.commit();
  }
  console.log(`\nDone: ${ops.length} writes.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
