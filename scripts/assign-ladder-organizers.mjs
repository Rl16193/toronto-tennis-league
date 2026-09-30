/**
 * One-off, for the switch to per-event organizers (Racquets-And-Strings ADR-001: an event is
 * managed by its creator, its `organizer_ids` and the super admin).
 *
 * Until now any organizer could record and settle challenges on the League Ladder, although only
 * its creator created it. This lists every current organizer (`preferences.event_creator`) on each
 * League Ladder event, so nobody loses that. Tournaments need nothing: the tournament page already
 * gave its controls to the creator only. New events start with their creator only.
 *
 * PRODUCTION IS THE ONLY ENVIRONMENT. Dry run is the default.
 *
 *   node scripts/assign-ladder-organizers.mjs --key serviceAccount.json
 *   node scripts/assign-ladder-organizers.mjs --key serviceAccount.json --apply
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../functions/package.json', import.meta.url));
const admin = require('firebase-admin');

const args = process.argv.slice(2);
const keyPath = args.includes('--key') ? args[args.indexOf('--key') + 1] : null;
const apply = args.includes('--apply');
if (!keyPath) {
  console.error('Usage: node scripts/assign-ladder-organizers.mjs --key serviceAccount.json [--apply]');
  process.exit(1);
}
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync(keyPath, 'utf8'))) });
const db = admin.firestore();

const run = async () => {
  const [events, organizers] = await Promise.all([
    db.collection('events').get(),
    db.collection('preferences').where('event_creator', '==', true).get(),
  ]);
  const organizerIds = organizers.docs.map((d) => d.id);
  console.log(`${organizerIds.length} organizer account(s).\n`);
  const ladders = events.docs.filter((d) => String(d.data().type || '').toLowerCase().includes('league ladder'));
  for (const d of ladders) {
    const e = d.data();
    const current = Array.isArray(e.organizer_ids) ? e.organizer_ids : [];
    const next = [...new Set([...current, ...organizerIds])].filter((uid) => uid !== e.creator_id);
    const added = next.filter((uid) => !current.includes(uid));
    console.log(`${d.id}  ${e.title || ''}  creator ${e.creator_id || '(none)'}  +${added.length} organizer(s)`);
    if (apply && added.length) await d.ref.update({ organizer_ids: next });
  }
  if (!apply) console.log('\nDry run: nothing written. Re-run with --apply.');
};

run().then(() => admin.app().delete()).catch((err) => { console.error(err); process.exit(1); });
