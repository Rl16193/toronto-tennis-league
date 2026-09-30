/**
 * One-off: write the points each OLD round-robin group match already paid onto the match
 * (`points_winner` / `points_loser`), so the group table reads stored points only and the copy of
 * the old rules in the app could be deleted. Display fields only: no balance changes, no `stats`
 * writes. The numbers come from functions/lib/scoring.js's table, as the old client paid them
 * (a walkover counted as played; a no show paid 1 to both).
 *
 * PRODUCTION IS THE ONLY ENVIRONMENT. Dry run is the default.
 *
 *   node scripts/stamp-group-points.mjs --key serviceAccount.json
 *   node scripts/stamp-group-points.mjs --key serviceAccount.json --apply
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

// Use the functions' own firebase-admin and points table.
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const admin = require('firebase-admin');
const { POINTS, pointsFor } = require('./lib/scoring');

const args = process.argv.slice(2);
const keyPath = args.includes('--key') ? args[args.indexOf('--key') + 1] : null;
const apply = args.includes('--apply');
if (!keyPath) {
  console.error('Usage: node scripts/stamp-group-points.mjs --key serviceAccount.json [--apply]');
  process.exit(1);
}
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync(keyPath, 'utf8'))) });
const db = admin.firestore();

const run = async () => {
  const snap = await db.collection('matches').where('format', '==', 'rr').where('round', '==', 'RR').get();
  const todo = snap.docs.filter((d) => {
    const m = d.data();
    return m.status === 'complete' && m.points_winner === undefined && (m.winner_uid || m.no_show);
  });
  console.log(`${todo.length} old group match(es) without stored points.\n`);
  let batch = db.batch();
  let n = 0;
  for (const d of todo) {
    const m = d.data();
    const paid = m.no_show ? { winner: POINTS.legacyNoShow, loser: POINTS.legacyNoShow } : pointsFor(m, false);
    console.log(`${d.id}  ${m.player_1_name} vs ${m.player_2_name}  ${m.no_show ? 'no show' : `winner ${m.winner_name || m.winner_uid}`}  -> ${paid.winner}/${paid.loser}`);
    if (!apply) continue;
    batch.update(d.ref, { points_winner: paid.winner, points_loser: paid.loser });
    if (++n % 400 === 0) { await batch.commit(); batch = db.batch(); }
  }
  if (apply) { await batch.commit(); console.log(`\nStamped ${todo.length}.`); }
  else console.log('\nDry run: nothing written. Re-run with --apply.');
};

run().then(() => admin.app().delete()).catch((err) => { console.error(err); process.exit(1); });
