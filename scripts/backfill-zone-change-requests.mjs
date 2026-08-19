/**
 * Flags players in the live event whose profile zone isn't Downtown - Midtown, so the organizer
 * sees them in the Zone Change Requests panel. Zones didn't exist when they registered, so their
 * draw doesn't match their recorded zone.
 *
 * For every participant in the event's matches whose zone is NOT Downtown - Midtown, sets:
 *   req_zone_change: true
 *   new_zone: 'Downtown - Midtown'
 *
 * Nothing else is touched — no match is moved, no draw is regenerated.
 * Requires Node >=22.6 (native TypeScript stripping for the zones.ts import).
 *
 * Usage:
 *   node scripts/backfill-zone-change-requests.mjs --project rands-staging --key serviceAccount.json --event <eventId>
 *   node scripts/backfill-zone-change-requests.mjs --project rands-staging --key serviceAccount.json --event <eventId> --apply
 *
 * Dry-run is the default. Production additionally requires the migration confirmation triple.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { zoneFromCourts } from '../src/utils/zones.ts';
import { extractCourtsWithCoords } from '../src/features/signup/utils/courtSearch.ts';
import { createMigrationDb, parseMigrationArgs } from './migrations/lib/cli.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const options = parseMigrationArgs(args);
if (options.help) {
  console.log(
    'Usage: node scripts/backfill-zone-change-requests.mjs --project <id> --key <serviceAccount.json> --event <eventId> [--apply]',
  );
  process.exit(0);
}
const dryRun = options.dryRun;
const TARGET_ZONE = 'Downtown - Midtown';

const arg = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? null : args[i + 1];
};

const eventId = arg('--event');
if (!eventId) {
  console.error(
    'Usage: node scripts/backfill-zone-change-requests.mjs --project <id> --key <serviceAccount.json> --event <eventId> [--apply]',
  );
  process.exit(1);
}
const db = createMigrationDb(options);

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
    const zone =
      (prefs.preferred_zone || '').trim() ||
      zoneFromCourts(Array.isArray(prefs.preferred_courts) ? prefs.preferred_courts : [], courtCoords);

    if (!zone) {
      noZone.push(name);
      continue;
    }
    if (zone === TARGET_ZONE) {
      alreadyDowntown.push(name);
      continue;
    }

    flagged.push({ name, zone });
    if (!dryRun) {
      batch.update(doc.ref, { req_zone_change: true, new_zone: TARGET_ZONE });
      pending++;
      if (pending === 400) {
        await batch.commit();
        batch = db.batch();
        pending = 0;
      }
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

  console.log(
    `\nSUMMARY: ${flagged.length} flagged · ${alreadyDowntown.length} already correct · ${noZone.length} unknown`,
  );
  if (dryRun) console.log('(dry run — nothing written)');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
