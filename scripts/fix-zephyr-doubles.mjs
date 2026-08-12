/**
 * One-off repair for "Zephyr Open 2026 Doubles".
 *
 * Four players registered for this Doubles-only event, but their registrations were saved with
 * `tournament_choice: 'Singles'` (see the comment in JoinEventSheet.tsx for how that happened).
 * A Doubles event hides every Singles draw and the participant filter matches the format with
 * exact string equality, so all four matched no draw at all and the tournament showed 0 players.
 *
 * This flips them to 'Doubles', keeping division, skill and created_at untouched. They then
 * appear in the draw unpaired, and each can finish the pairing from the "Add your teammate"
 * panel on the Tournament page.
 *
 * HARD-SCOPED to one event id. It will not read or write any other event — the two similarly
 * affected registrations in "The Summer Gauntlet - Doubles" are deliberately left alone.
 *
 * Usage:
 *   node scripts/fix-zephyr-doubles.mjs --key serviceAccount.json --dry-run
 *   node scripts/fix-zephyr-doubles.mjs --key serviceAccount.json
 */
import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

const EVENT_ID = 'Yu8QDT9ZgDQdpuqTN0iW';
const EXPECTED_TITLE = 'Zephyr Open 2026 Doubles';

const args = process.argv;
const dryRun = args.includes('--dry-run');
const keyIdx = args.indexOf('--key');
if (keyIdx === -1 || !args[keyIdx + 1]) {
  console.error('Usage: node scripts/fix-zephyr-doubles.mjs --key <serviceAccount.json> [--dry-run]');
  process.exit(1);
}
const keyPath = path.resolve(args[keyIdx + 1]);
if (!fs.existsSync(keyPath)) { console.error(`Key not found: ${keyPath}`); process.exit(1); }

admin.initializeApp({ credential: admin.credential.cert(JSON.parse(fs.readFileSync(keyPath, 'utf8'))) });
const db = admin.firestore();

const run = async () => {
  const eventSnap = await db.doc(`events/${EVENT_ID}`).get();
  if (!eventSnap.exists) { console.error(`Event ${EVENT_ID} not found.`); process.exit(1); }
  const event = eventSnap.data();

  // Guard against running this against the wrong event after a copy/paste.
  if (event.title !== EXPECTED_TITLE) {
    console.error(`Refusing to run: expected "${EXPECTED_TITLE}", found ${JSON.stringify(event.title)}.`);
    process.exit(1);
  }
  if (event.tournament_choice !== 'Doubles') {
    console.error(`Refusing to run: event.tournament_choice is ${JSON.stringify(event.tournament_choice)}, not "Doubles".`);
    process.exit(1);
  }

  const snap = await db.collection('event_participants').where('event_id', '==', EVENT_ID).get();
  const todo = [];
  let alreadyDoubles = 0;

  snap.docs.forEach((d) => {
    const p = d.data();
    if (p.tournament_choice === 'Doubles') { alreadyDoubles += 1; return; }
    todo.push({ id: d.id, name: p.user_name || '(no name)', from: p.tournament_choice, division: p.division });
  });

  todo.forEach((t) => {
    console.log(`${dryRun ? '[dry-run] ' : ''}${t.name.padEnd(20)} ${JSON.stringify(t.from)} -> "Doubles"   (division ${JSON.stringify(t.division)} kept)`);
  });

  if (!dryRun && todo.length) {
    const batch = db.batch();
    todo.forEach((t) => {
      // Only the format changes. `doubles` stays empty on purpose — the player names their
      // partner themselves via the Add-your-teammate panel.
      batch.update(db.doc(`event_participants/${t.id}`), { tournament_choice: 'Doubles' });
    });
    await batch.commit();
  }

  console.log(`\n${snap.size} registration(s) on "${event.title}" · ${alreadyDoubles} already Doubles · ${todo.length} ${dryRun ? 'would be ' : ''}converted.`);
  process.exit(0);
};

run().catch((err) => { console.error(err); process.exit(1); });
