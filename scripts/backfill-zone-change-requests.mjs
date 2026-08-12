/**
 * Zone Change Request Backfill
 *
 * The live tournament runs in the Downtown - Midtown zone, but zones didn't exist when players
 * registered — so anyone whose profile zone is something else is playing in a draw that doesn't
 * match their recorded zone. This flags those players so the organizer sees them in the Zone
 * Change Requests panel and can reconcile them.
 *
 * For every participant who appears in the event's matches and whose zone is NOT
 * Downtown - Midtown, sets:
 *   req_zone_change: true
 *   new_zone: 'Downtown - Midtown'
 *
 * Nothing else is touched — no match is moved, no draw is regenerated.
 *
 * Requires Node >=22.6 (native TypeScript stripping for the zones.ts import).
 *
 * Usage:
 *   node scripts/backfill-zone-change-requests.mjs --key serviceAccount.json --event <eventId> --dry-run
 *   node scripts/backfill-zone-change-requests.mjs --key serviceAccount.json --event <eventId>
 */

import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { zoneFromCourts } from '../src/utils/zones.ts';
import { extractCourtsWithCoords } from '../src/features/signup/utils/courtSearch.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dryRun = process.argv.includes('--dry-run');
const TARGET_ZONE = 'Downtown - Midtown';

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? null : process.argv[i + 1];
};

const keyPath = arg('--key');
const eventId = arg('--event');
if (!keyPath || !eventId) {
  console.error('Usage: node scripts/backfill-zone-change-requests.mjs --key serviceAccount.json --event <eventId> [--dry-run]');
  process.exit(1);
}
if (!fs.existsSync(path.resolve(keyPath))) { console.error(`Key not found: ${keyPath}`); process.exit(1); }

admin.initializeApp({ credential: admin.credential.cert(JSON.parse(fs.readFileSync(path.resolve(keyPath), 'utf8'))) });
const db = admin.firestore();

async function main() {
  console.log(dryRun ? '🔍 DRY RUN — no writes\n' : '✏️  LIVE RUN — writing to Firestore\n');

  const courtCoords = extractCourtsWithCoords(
    fs.readFileSync(path.join(__dirname, '..', 'public', 'Tennis Courts Facilities - 4326.csv'), 'utf-8'),
  );

  const [participantsSnap, matchesSnap] = await Promise.all([
    db.collection('event_participants').where('event_id', '==', eventId).get(),
    db.collection('matches').where('event_id', '==', eventId).get(),
  ]);
  console.log(`Event ${eventId}: ${participantsSnap.size} participants, ${matchesSnap.size} matches\n`);

  // Only players actually seated in a match — someone registered but never placed isn't "in the draw".
  const inDraw = new Set();
  matchesSnap.docs.forEach((d) => {
    const m = d.data();
    if (m.player_1_uid) inDraw.add(m.player_1_uid);
    if (m.player_2_uid) inDraw.add(m.player_2_uid);
  });

  const flagged = [];
  const alreadyDowntown = [];
  const noZone = [];
  let batch = db.batch();
  let pending = 0;

  for (const doc of participantsSnap.docs) {
    const p = doc.data();
    const name = p.user_name || p.uid;
    if (!p.uid || !inDraw.has(p.uid)) continue;
    if (p.removal) continue;

    // Prefer the stored zone; fall back to deriving it from their preferred courts.
    const prefSnap = await db.collection('preferences').doc(p.uid).get();
    const prefs = prefSnap.data() || {};
    const zone = (prefs.preferred_zone || '').trim()
      || zoneFromCourts(Array.isArray(prefs.preferred_courts) ? prefs.preferred_courts : [], courtCoords);

    if (!zone) { noZone.push(name); continue; }
    if (zone === TARGET_ZONE) { alreadyDowntown.push(name); continue; }

    flagged.push({ name, zone });
    if (!dryRun) {
      batch.update(doc.ref, { req_zone_change: true, new_zone: TARGET_ZONE });
      pending++;
      if (pending === 400) { await batch.commit(); batch = db.batch(); pending = 0; }
    }
  }
  if (!dryRun && pending > 0) await batch.commit();

  console.log('═══════════════════════════════════════════════════════');
  console.log(`🔄 FLAGGED — req_zone_change: true, new_zone: ${TARGET_ZONE} (${flagged.length})`);
  console.log('═══════════════════════════════════════════════════════');
  flagged.forEach((r) => console.log(`  ${String(r.name).padEnd(28)} currently: ${r.zone}`));

  console.log(`\nAlready ${TARGET_ZONE} — untouched (${alreadyDowntown.length})`);
  console.log(`No zone resolvable — untouched (${noZone.length})`);
  noZone.forEach((n) => console.log(`  ${n}`));

  console.log(`\nSUMMARY: ${flagged.length} flagged · ${alreadyDowntown.length} already correct · ${noZone.length} unknown`);
  if (dryRun) console.log('(dry run — nothing written)');
}

main().catch((e) => { console.error(e); process.exit(1); });
