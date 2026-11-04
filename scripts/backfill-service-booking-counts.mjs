/**
 * One-off: set `booking_count` on every `services` doc from the bookings that already exist.
 *
 * `booking_count` is every booking ever made for an offer (Book or Redeem) — a cancelled or declined
 * one still counts, it was still demand. From the functions deploy on, `bookService` and
 * `redeemReward` add 1 in the same transaction that creates the booking. This seeds what came
 * before. It writes an ABSOLUTE count, so it is safe to run after the functions are live (any
 * increments already applied are simply replaced by the full recount) and safe to re-run.
 *
 * Every service gets the field, 0 included: every doc in a collection carries every field.
 *
 * PRODUCTION IS THE ONLY ENVIRONMENT. Dry run is the default.
 *
 *   node scripts/backfill-service-booking-counts.mjs --key serviceAccount.json
 *   node scripts/backfill-service-booking-counts.mjs --key serviceAccount.json --apply
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../functions/package.json', import.meta.url));
const admin = require('firebase-admin');

const args = process.argv.slice(2);
const keyPath = args.includes('--key') ? args[args.indexOf('--key') + 1] : null;
const apply = args.includes('--apply');
if (!keyPath) {
  console.error('Usage: node scripts/backfill-service-booking-counts.mjs --key serviceAccount.json [--apply]');
  process.exit(1);
}
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync(keyPath, 'utf8'))) });
const db = admin.firestore();

async function main() {
  const [services, bookings] = await Promise.all([
    db.collection('services').get(),
    db.collection('bookings').get(),
  ]);

  const counts = new Map();
  let orphans = 0;
  bookings.forEach((d) => {
    const id = d.get('service_id');
    if (!id) { orphans += 1; return; }
    counts.set(id, (counts.get(id) || 0) + 1);
  });

  const known = new Set(services.docs.map((d) => d.id));
  const missing = [...counts.keys()].filter((id) => !known.has(id));

  console.log(`${services.size} services, ${bookings.size} bookings${orphans ? `, ${orphans} with no service_id` : ''}\n`);
  console.log(apply ? 'APPLYING — service: current → new' : 'DRY RUN — service: current → new');

  const rows = services.docs
    .map((d) => ({ ref: d.ref, id: d.id, d: d.data(), next: counts.get(d.id) || 0 }))
    .sort((a, b) => String(a.d.category).localeCompare(String(b.d.category)) || b.next - a.next);

  for (const r of rows) {
    const cur = r.d.booking_count === undefined ? '(absent)' : r.d.booking_count;
    const live = r.d.active === false ? '  [inactive]' : '';
    console.log(`  ${String(r.d.category).padEnd(10)} ${String(r.d.provider_name || '').padEnd(20)} ${String(r.d.offer || r.id).slice(0, 38).padEnd(38)} ${cur} → ${r.next}${live}`);
  }
  if (missing.length) {
    console.log(`\nBookings point at ${missing.length} service id(s) that no longer exist (counted nowhere):`);
    missing.forEach((id) => console.log(`  ${id} (${counts.get(id)})`));
  }

  if (!apply) { console.log(`\n${rows.length} services would be written. Re-run with --apply.`); return; }

  for (let i = 0; i < rows.length; i += 400) {
    const batch = db.batch();
    rows.slice(i, i + 400).forEach((r) => batch.update(r.ref, { booking_count: r.next }));
    await batch.commit();
  }
  console.log(`\nUpdated ${rows.length} services.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
