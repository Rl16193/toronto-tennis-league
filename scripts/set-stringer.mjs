/**
 * Links a player's account to a rewards-catalog stringer, so they can confirm their own
 * coupons (mark used / flag) from the Marketplace → Rewards tab.
 *
 * Sets `stringer: true` and `stringer_id: <id>` on `preferences/{uid}`. The stringer id must
 * match `stringer_id` on that shop's `rewards` docs — see scripts/seed-rewards.mjs
 * (currently: karan, fortyforty, pandemic).
 *
 * The flag grants nothing points-related: it only reveals coupons issued against that shop's
 * offers. Marking used / flagging still runs through the Cloud Functions in functions/rewards.js.
 *
 * Usage:
 *   node scripts/set-stringer.mjs --key serviceAccount.json --list            # find accounts
 *   node scripts/set-stringer.mjs --key serviceAccount.json --uid <uid> --id karan --dry-run
 *   node scripts/set-stringer.mjs --key serviceAccount.json --uid <uid> --id karan
 *   node scripts/set-stringer.mjs --key serviceAccount.json --uid <uid> --remove
 */
import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? null : process.argv[i + 1] ?? true;
};
const dryRun = process.argv.includes('--dry-run');
const list = process.argv.includes('--list');
const remove = process.argv.includes('--remove');

const keyPath = arg('key');
if (!keyPath || keyPath === true) {
  console.error('Usage: node scripts/set-stringer.mjs --key serviceAccount.json [--list | --uid <uid> --id <stringerId>] [--dry-run] [--remove]');
  process.exit(1);
}
const resolved = path.resolve(keyPath);
if (!fs.existsSync(resolved)) { console.error(`Key not found: ${resolved}`); process.exit(1); }

admin.initializeApp({ credential: admin.credential.cert(JSON.parse(fs.readFileSync(resolved, 'utf8'))) });
const db = admin.firestore();

const run = async () => {
  // --list: search accounts by name/email so you can copy the right uid.
  if (list) {
    const needle = (arg('search') && arg('search') !== true ? String(arg('search')) : '').toLowerCase();
    // Email lives on `contacts` now, not `users` — without joining it the search-by-email and
    // the email column here would both silently go blank.
    const [users, prefs, contacts] = await Promise.all([
      db.collection('users').get(),
      db.collection('preferences').get(),
      db.collection('contacts').get(),
    ]);
    const prefById = new Map(prefs.docs.map((d) => [d.id, d.data()]));
    const contactById = new Map(contacts.docs.map((d) => [d.id, d.data()]));
    const rows = users.docs
      .map((d) => ({ uid: d.id, ...d.data(), ...(contactById.get(d.id) || {}) }))
      .filter((u) => !needle || `${u.name || ''} ${u.email || ''}`.toLowerCase().includes(needle))
      .map((u) => {
        const p = prefById.get(u.uid) || {};
        const tag = p.stringer === true ? `  [stringer: ${p.stringer_id || '?'}]` : '';
        return `${u.uid}  ${(u.name || '(no name)').padEnd(28)} ${u.email || ''}${tag}`;
      })
      .sort();
    console.log(rows.join('\n') || 'No matching accounts.');
    console.log(`\n${rows.length} account(s)${needle ? ` matching "${needle}"` : ''}.`);
    process.exit(0);
  }

  const uid = arg('uid');
  if (!uid || uid === true) { console.error('Missing --uid. Run with --list to find one.'); process.exit(1); }

  const userSnap = await db.doc(`users/${uid}`).get();
  if (!userSnap.exists) { console.error(`No users/${uid} — check the uid.`); process.exit(1); }
  const name = userSnap.data().name || '(no name)';

  if (remove) {
    console.log(`${dryRun ? '[dry-run] ' : ''}Clearing provider role from ${name} (${uid})`);
    if (!dryRun) {
      await db.doc(`preferences/${uid}`).set({
        stringer: false,
        stringer_id: admin.firestore.FieldValue.delete(),
        coach: false,
        coach_id: admin.firestore.FieldValue.delete(),
      }, { merge: true });
    }
    process.exit(0);
  }

  const id = arg('id');
  if (!id || id === true) { console.error('Missing --id (e.g. karan, fortyforty, pandemic, archie).'); process.exit(1); }

  // Warn if the id matches no catalog entry — a typo here silently shows them nothing.
  const offers = await db.collection('tasks')
    .where('type', '==', 'offer')
    .where('provider_id', '==', id)
    .get();
  if (offers.empty) {
    console.warn(`Warning: no offers found with provider_id "${id}". Seed the catalog first, or check the spelling.`);
  } else {
    console.log(`"${id}" has ${offers.size} offer(s): ${offers.docs.map((d) => d.data().offer).join(' · ')}`);
  }

  // Role follows the catalog's own category, so a coach can't accidentally be flagged a
  // stringer (the two use different preference fields).
  const roleArg = arg('role');
  const category = offers.empty ? null : offers.docs[0].data().category;
  const role = roleArg && roleArg !== true ? String(roleArg)
    : category === 'coaching' ? 'coach' : 'stringer';
  if (role !== 'coach' && role !== 'stringer') {
    console.error(`--role must be "coach" or "stringer", got "${role}".`);
    process.exit(1);
  }

  const payload = role === 'coach'
    ? { coach: true, coach_id: id }
    : { stringer: true, stringer_id: id };

  console.log(`${dryRun ? '[dry-run] ' : ''}Setting ${name} (${uid}) → ${role} "${id}"`);
  if (!dryRun) {
    await db.doc(`preferences/${uid}`).set(payload, { merge: true });
    console.log('Done.');
  }
  process.exit(0);
};

run().catch((err) => { console.error(err); process.exit(1); });
