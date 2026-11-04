/**
 * One-off: save `events.skill_merges[drawKey]` for merged singles draws generated before Generate
 * started saving it. The page no longer guesses a merge from players' bands, so without this those
 * draws disappear. A merged draw holds the bands the organizer did not give their own draw in the
 * same division and zone. Draws that already have a saved merge are left alone.
 *
 * PRODUCTION IS THE ONLY ENVIRONMENT. Dry run is the default.
 *
 *   node scripts/backfill-skill-merges.mjs --key serviceAccount.json
 *   node scripts/backfill-skill-merges.mjs --key serviceAccount.json --apply
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../functions/package.json', import.meta.url));
const admin = require('firebase-admin');

const args = process.argv.slice(2);
const keyPath = args.includes('--key') ? args[args.indexOf('--key') + 1] : null;
const apply = args.includes('--apply');
if (!keyPath) {
  console.error('Usage: node scripts/backfill-skill-merges.mjs --key serviceAccount.json [--apply]');
  process.exit(1);
}
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync(keyPath, 'utf8'))) });
const db = admin.firestore();

const BANDS = ['Beginners', 'Challengers', 'Masters'];
const VALID = new Set(['Beginners+Challengers', 'Challengers+Masters', 'Beginners+Challengers+Masters']);

// The drawKey prefix of a match id `{eventId}_{drawKey}_{matchId}`: everything between the event
// id and the trailing match id (`m12`, `rr_g1_m3`, …).
const drawKeyOf = (docId, eventId) =>
  docId.slice(eventId.length + 1).replace(/_(rr_g\d+_m\d+|rr_ko_m\d+|m\d+|ko_m\d+)$/, '');

async function main() {
  const merged = await db.collection('matches')
    .where('category', '==', 'tournament').where('sub_category', '==', 'singles').where('skill_group', '==', 'All').get();

  const draws = new Map(); // eventId|division|zone → { eventId, division, zone, drawKeys }
  merged.forEach((d) => {
    const m = d.data();
    if (m.status === 'cancelled') return;
    const k = `${m.event_id}|${m.division}|${m.zone || ''}`;
    if (!draws.has(k)) draws.set(k, { eventId: m.event_id, division: m.division, zone: m.zone || '', drawKeys: new Set() });
    draws.get(k).drawKeys.add(drawKeyOf(d.id, m.event_id));
  });

  console.log(apply ? 'APPLYING' : 'DRY RUN');
  const writes = [];
  for (const { eventId, division, zone, drawKeys } of draws.values()) {
    const event = await db.doc(`events/${eventId}`).get();
    const title = event.get('title');
    if (drawKeys.size !== 1) { console.log(`  SKIP ${title} | ${division}: more than one draw key (${[...drawKeys].join(', ')})`); continue; }
    const drawKey = [...drawKeys][0];
    const saved = event.get('skill_merges')?.[drawKey];
    if (saved) { console.log(`  keep ${title} | ${division} | ${drawKey} = ${saved} (already saved)`); continue; }

    const siblings = await db.collection('matches')
      .where('event_id', '==', eventId).where('sub_category', '==', 'singles').where('division', '==', division).get();
    const own = new Set();
    siblings.forEach((d) => {
      const m = d.data();
      if (m.status !== 'cancelled' && (m.zone || '') === zone && m.skill_group !== 'All') own.add(m.skill_group);
    });
    const pair = BANDS.filter((b) => !own.has(b)).join('+');
    if (!VALID.has(pair)) { console.log(`  SKIP ${title} | ${division} | ${drawKey}: bands left "${pair}" is not a merge`); continue; }
    console.log(`  ${title} | ${division} | ${drawKey} → ${pair}${own.size ? `  (own draws: ${[...own].join(', ')})` : ''}`);
    writes.push({ ref: event.ref, drawKey, pair });
  }

  if (!apply) { console.log(`\n${writes.length} merge(s) would be saved. Re-run with --apply.`); return; }
  for (const w of writes) await w.ref.set({ skill_merges: { [w.drawKey]: w.pair } }, { merge: true });
  console.log(`\nSaved ${writes.length} merge(s).`);
}

main().catch((err) => { console.error(err); process.exit(1); });
