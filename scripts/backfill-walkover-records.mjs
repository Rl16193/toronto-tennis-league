/**
 * One-off: take back the played/won/lost record that OLD walkovers added to `stats`.
 *
 * A walkover is nobody's match — no one played, so no one won or lost. `scoring.js` already works
 * this way (`resultDeltas` sets `played = !walkover`), and the 50 walkovers it paid carry only
 * `leaguePoints26`. The 41 older ones were paid by the client that came before it, which counted a
 * walkover as played and so added `matchesPlayed` and a `wins`/`loses` to both players.
 *
 * Removes ONLY those three fields. League points, `pointswon`, `totalPointsPlayed` and
 * `tournamentsPlayed` are left exactly as they are: points already paid never move (see "Scoring is
 * one module" in CLAUDE.md), and changing them would reshuffle standings retroactively.
 *
 * Every match it touches is singles, complete and has a winner — checked, not assumed; it skips
 * anything else, and skips any match carrying `applied_deltas` (those were paid correctly).
 *
 * PRODUCTION IS THE ONLY ENVIRONMENT. Dry run is the default.
 *
 *   node scripts/backfill-walkover-records.mjs --key serviceAccount.json
 *   node scripts/backfill-walkover-records.mjs --key serviceAccount.json --apply
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../functions/package.json', import.meta.url));
const admin = require('firebase-admin');

const args = process.argv.slice(2);
const keyPath = args.includes('--key') ? args[args.indexOf('--key') + 1] : null;
const apply = args.includes('--apply');
if (!keyPath) {
  console.error('Usage: node scripts/backfill-walkover-records.mjs --key serviceAccount.json [--apply]');
  process.exit(1);
}
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync(keyPath, 'utf8'))) });
const db = admin.firestore();

const RECORD_FIELDS = ['matchesPlayed', 'wins', 'loses'];

async function main() {
  const snap = await db.collection('matches').where('walkover', '==', true).get();

  // Per uid: what the old client added across every legacy walkover they were in.
  const owed = new Map(); // uid → { matchesPlayed, wins, loses }
  const skipped = [];
  let counted = 0;

  for (const doc of snap.docs) {
    const m = doc.data();
    if (m.applied_deltas) continue;                       // paid by scoring.js — already correct
    if (m.status !== 'complete' || !m.winner_uid) { skipped.push([doc.id, 'no result']); continue; }
    if (m.category !== 'singles') { skipped.push([doc.id, `category ${m.category} — partners not handled`]); continue; }

    const winner = m.winner_uid;
    const loser = winner === m.player_1_uid ? m.player_2_uid : m.player_1_uid;
    if (!loser) { skipped.push([doc.id, 'no opponent']); continue; }

    const add = (uid, field) => {
      const row = owed.get(uid) || { matchesPlayed: 0, wins: 0, loses: 0 };
      row.matchesPlayed += 1;
      row[field] += 1;
      owed.set(uid, row);
    };
    add(winner, 'wins');
    add(loser, 'loses');
    counted += 1;
  }

  console.log(`${snap.size} walkovers, ${counted} legacy (no applied_deltas), ${owed.size} players affected`);
  if (skipped.length) {
    console.log(`\nSkipped ${skipped.length}:`);
    skipped.forEach(([id, why]) => console.log(`  ${id} — ${why}`));
  }

  const uids = [...owed.keys()];
  const [statDocs, userDocs] = await Promise.all([
    Promise.all(uids.map((u) => db.doc(`stats/${u}`).get())),
    Promise.all(uids.map((u) => db.doc(`users/${u}`).get())),
  ]);

  const writes = [];
  const floored = [];
  console.log(`\n${apply ? 'APPLYING' : 'DRY RUN'} — per player, current → proposed:\n`);

  uids.forEach((uid, i) => {
    const cur = statDocs[i].exists ? statDocs[i].data() : {};
    const name = userDocs[i].exists ? userDocs[i].data().name || uid : uid;
    const take = owed.get(uid);
    const patch = {};
    const parts = [];

    RECORD_FIELDS.forEach((f) => {
      const now = Number(cur[f]) || 0;
      const next = now - take[f];
      if (take[f] === 0) return;
      // Never write a negative: if a player's stored count is already lower than what the old
      // walkovers added, something else has moved it. Floor at 0 and list it for a human.
      if (next < 0) floored.push(`${name}: ${f} ${now} − ${take[f]} would be ${next}`);
      patch[f] = Math.max(0, next);
      parts.push(`${f} ${now} → ${patch[f]}`);
    });

    if (parts.length === 0) return;
    console.log(`  ${name.padEnd(24)} ${parts.join(', ')}`);
    writes.push([uid, patch]);
  });

  if (floored.length) {
    console.log(`\nFloored at 0 (check these by hand):`);
    floored.forEach((f) => console.log(`  ${f}`));
  }

  if (!apply) {
    console.log(`\n${writes.length} stats docs would change. Re-run with --apply to write.`);
    return;
  }

  // Batched in 400s; a stats doc is tiny and there are well under a thousand of them.
  for (let i = 0; i < writes.length; i += 400) {
    const batch = db.batch();
    writes.slice(i, i + 400).forEach(([uid, patch]) => batch.set(db.doc(`stats/${uid}`), patch, { merge: true }));
    await batch.commit();
  }
  console.log(`\nUpdated ${writes.length} stats docs.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
