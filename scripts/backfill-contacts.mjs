/**
 * Moves contact PII off the world-readable `users` collection into `contacts/{uid}`.
 *
 * `users` is `allow read: if true`, so one unauthenticated getDocs returned every member's phone,
 * email and WhatsApp. Those fields now live in `contacts`, which requires a sign-in.
 *
 * TWO PHASES, run either side of the client deploy so nothing breaks in the gap:
 *   1. --copy    Write contacts/{uid} from users/{uid}. Repeatable. Run BEFORE deploying.
 *   2. --strip   Delete the PII from users/{uid}. Irreversible. Run AFTER the client is live.
 *
 * `contactable` is set true for anyone with a phone on file, matching how the app behaved before
 * the checkbox existed. Members with no phone get false.
 *
 * Usage:
 *   node scripts/backfill-contacts.mjs --key serviceAccount.json --copy --dry-run
 *   node scripts/backfill-contacts.mjs --key serviceAccount.json --copy
 *   node scripts/backfill-contacts.mjs --key serviceAccount.json --strip --dry-run
 *   node scripts/backfill-contacts.mjs --key serviceAccount.json --strip
 */
import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

const args = process.argv;
const dryRun = args.includes('--dry-run');
const doCopy = args.includes('--copy');
const doStrip = args.includes('--strip');

const keyIdx = args.indexOf('--key');
if (keyIdx === -1 || !args[keyIdx + 1] || (!doCopy && !doStrip) || (doCopy && doStrip)) {
  console.error('Usage: node scripts/backfill-contacts.mjs --key <serviceAccount.json> (--copy | --strip) [--dry-run]');
  process.exit(1);
}
const keyPath = path.resolve(args[keyIdx + 1]);
if (!fs.existsSync(keyPath)) { console.error(`Key not found: ${keyPath}`); process.exit(1); }

admin.initializeApp({ credential: admin.credential.cert(JSON.parse(fs.readFileSync(keyPath, 'utf8'))) });
const db = admin.firestore();

const PII_FIELDS = [
  'email', 'secondary_email', 'phone', 'preferred_mode_of_contact',
  'whatsapp_contact', 'whatsapp_same_as_phone',
];

// Firestore caps a batch at 500 writes.
const commitInChunks = async (items, apply) => {
  for (let i = 0; i < items.length; i += 400) {
    const batch = db.batch();
    items.slice(i, i + 400).forEach((item) => apply(batch, item));
    await batch.commit();
  }
};

const copyPhase = async () => {
  const snap = await db.collection('users').get();
  const todo = [];
  let skipped = 0;

  snap.docs.forEach((d) => {
    const u = d.data();
    const hasPii = PII_FIELDS.some((f) => u[f] !== undefined);
    if (!hasPii) { skipped += 1; return; }

    const contacts = { updated_at: new Date().toISOString() };
    PII_FIELDS.forEach((f) => { if (u[f] !== undefined) contacts[f] = u[f]; });
    // Defaults so the doc matches what the client writes for a new account.
    if (contacts.email === undefined) contacts.email = '';
    if (contacts.phone === undefined) contacts.phone = '';
    if (contacts.preferred_mode_of_contact === undefined) contacts.preferred_mode_of_contact = 'email';
    contacts.contactable = !!String(u.phone || '').trim();

    todo.push({ id: d.id, name: u.name || '(no name)', contacts });
  });

  todo.forEach((t) => {
    console.log(`${dryRun ? '[dry-run] ' : ''}contacts/${t.id} ← ${t.name}  contactable=${t.contacts.contactable}`);
  });

  if (!dryRun && todo.length) {
    // merge:true so a re-run never clobbers edits the member has made since the first pass.
    await commitInChunks(todo, (batch, t) => batch.set(db.doc(`contacts/${t.id}`), t.contacts, { merge: true }));
  }

  const consenting = todo.filter((t) => t.contacts.contactable).length;
  console.log(`\n${snap.size} user(s) scanned · ${skipped} with no contact fields · ${todo.length} ${dryRun ? 'would be ' : ''}written · ${consenting} marked contactable.`);
};

const stripPhase = async () => {
  const [usersSnap, contactsSnap] = await Promise.all([
    db.collection('users').get(),
    db.collection('contacts').get(),
  ]);
  const haveContacts = new Set(contactsSnap.docs.map((d) => d.id));

  const todo = [];
  const unsafe = [];

  usersSnap.docs.forEach((d) => {
    const u = d.data();
    const present = PII_FIELDS.filter((f) => u[f] !== undefined);
    if (present.length === 0) return;
    // Never strip a user whose contacts doc is missing — that would destroy the only copy.
    if (!haveContacts.has(d.id)) { unsafe.push({ id: d.id, name: u.name || '(no name)' }); return; }
    todo.push({ id: d.id, name: u.name || '(no name)', present });
  });

  if (unsafe.length) {
    console.error(`\nREFUSING to strip ${unsafe.length} user(s) with no contacts doc — run --copy first:`);
    unsafe.forEach((u) => console.error(`  ${u.id}  ${u.name}`));
    console.error('');
  }

  todo.forEach((t) => {
    console.log(`${dryRun ? '[dry-run] ' : ''}users/${t.id} − [${t.present.join(', ')}]  ${t.name}`);
  });

  if (!dryRun && todo.length) {
    const del = admin.firestore.FieldValue.delete();
    await commitInChunks(todo, (batch, t) => {
      const patch = {};
      t.present.forEach((f) => { patch[f] = del; });
      batch.update(db.doc(`users/${t.id}`), patch);
    });
  }

  console.log(`\n${usersSnap.size} user(s) scanned · ${todo.length} ${dryRun ? 'would be ' : ''}stripped · ${unsafe.length} skipped as unsafe.`);
  if (unsafe.length) process.exitCode = 1;
};

const run = async () => {
  console.log(`Phase: ${doCopy ? 'COPY users → contacts' : 'STRIP PII from users'}${dryRun ? '  (dry run)' : ''}\n`);
  if (doCopy) await copyPhase(); else await stripPhase();
  process.exit(process.exitCode ?? 0);
};

run().catch((err) => { console.error(err); process.exit(1); });
