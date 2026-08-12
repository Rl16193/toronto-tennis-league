/**
 * Seeds the Services offer catalog — `tasks` docs with `type: 'offer'` — from
 * analysis/RS - Services.xlsx. Idempotent: stable doc ids, so re-running updates in place.
 *
 * Doc ids are the bare `{providerKey}-{slug(offer)}` form and MUST stay stable: issued coupons
 * reference them via `redemptions.reward_id`, and functions/rewards.js resolves `tasks/{rewardId}`
 * directly. Never prefix them.
 *
 * After seeding, link each provider to an account so they can confirm their own coupons:
 *   node scripts/set-stringer.mjs --key serviceAccount.json --uid <uid> --id <provider id>
 *
 * Usage:
 *   node scripts/seed-rewards.mjs --key serviceAccount.json --dry-run
 *   node scripts/seed-rewards.mjs --key serviceAccount.json
 */
import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

const dryRun = process.argv.includes('--dry-run');
const keyArgIndex = process.argv.indexOf('--key');
if (keyArgIndex === -1 || !process.argv[keyArgIndex + 1]) {
  console.error('Usage: node scripts/seed-rewards.mjs --key path/to/serviceAccount.json [--dry-run]');
  process.exit(1);
}
const keyPath = path.resolve(process.argv[keyArgIndex + 1]);
if (!fs.existsSync(keyPath)) { console.error(`Key not found: ${keyPath}`); process.exit(1); }

admin.initializeApp({ credential: admin.credential.cert(JSON.parse(fs.readFileSync(keyPath, 'utf8'))) });
const db = admin.firestore();

// Point costs — keep MIN_REWARD_COST in src/features/services/types.ts equal to the cheapest.
const STRINGING_COST = 15;
const COACHING_COST = 30;

// `name` is the TRADE name shown in the catalog, not the member's own profile name — Karan's shop
// is TIVORYX, he is Karan Tiwari. `uid` links the shop to its owner's account for the profile
// photo; it must match preferences.stringer_id / coach_id on that account.
const PROVIDERS = {
  karan: { name: 'TIVORYX', phone: '4169539281', area: 'Midtown Toronto', uid: 'FYjN50oiPQVseJt0UzD3G9oP6WG3' },
  fortyforty: { name: 'Forty-Forty Tennis', phone: '6479675228', area: 'Downtown Toronto', uid: 'yT3GrDq3bwMGdqHVnGMGjUDXrXx2' },
  pandemic: { name: 'Pandemic Tennis', phone: '6479572367', area: 'Dufferin - West End' },
  archie: { name: 'Archie', phone: '4374362442', area: 'Downtown', certified: true, uid: 'kVloaSUaNPfWqv1NtdW6Xj4YDOP2' },
};

// [providerKey, offer, brands, discount, totalPrice]
const STRINGING = [
  ['karan', 'House Ply/SynGut + Overgrip Replacement', 'Golden Set, Nova Strata, Babolat, Wilson overgrip', 5, 40],
  ['fortyforty', 'Budget Strings Replacement', 'Head, Kirschbaum, MSV', 5, 35],
  ['fortyforty', 'Mid-level Strings Replacement', 'Solinco, Yonex, ReString', 5, 40],
  ['fortyforty', 'Premium Strings Replacement', 'Grapplesnake, Toroline', 5, 50],
  ['pandemic', 'Budget Strings Replacement', 'Head, Kirschbaum, MSV', 5, 35],
  ['pandemic', 'Mid-level Strings Replacement', 'Solinco, Babolat', 5, 40],
  ['pandemic', 'Premium Strings Replacement', 'Luxilon ALU Power, Grapplesnake, Technifibre NRG2', 5, 45],
];

// The free monthly group lesson is not a catalog offer — it costs no points and is capped per
// month, so it lives in `group_lessons/{YYYY-MM}` and is handled by joinGroupLesson().
const COACHING = [
  ['archie', 'Coaching Lessons', 10, 45],
];

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const run = async () => {
  const batch = db.batch();
  const rows = [];

  STRINGING.forEach(([key, offer, brands, discount, total], i) => {
    const p = PROVIDERS[key];
    rows.push([`${key}-${slug(offer)}`.slice(0, 120), {
      category: 'stringing',
      provider_id: key,
      provider_name: p.name,
      ...(p.uid ? { uid: p.uid } : {}),
      contact_phone: p.phone,
      area: p.area,
      offer,
      brands,
      discount,
      total_price: total,
      discounted_price: total - discount,
      points_cost: STRINGING_COST,
      active: true,
      sort: i,
    }]);
  });

  COACHING.forEach(([key, offer, discount, total], i) => {
    const p = PROVIDERS[key];
    rows.push([`${key}-${slug(offer)}`.slice(0, 120), {
      category: 'coaching',
      provider_id: key,
      provider_name: p.name,
      ...(p.uid ? { uid: p.uid } : {}),
      contact_phone: p.phone,
      area: p.area,
      offer,
      discount,
      total_price: total,
      discounted_price: total - discount,
      points_cost: COACHING_COST,
      ...(p.certified ? { certified: true } : {}),
      active: true,
      sort: i,
    }]);
  });

  rows.forEach(([id, data]) => {
    console.log(`${dryRun ? '[dry-run] ' : ''}tasks/${id}`);
    console.log(`    ${data.provider_name} · ${data.offer} · $${data.total_price} → $${data.discounted_price} · ${data.points_cost} pts`);
    if (!dryRun) batch.set(db.doc(`tasks/${id}`), { type: 'offer', ...data }, { merge: true });
  });

  // Retire anything seeded previously that is no longer in the sheet (e.g. offers renamed, or
  // the old 25-point pricing) instead of leaving stale rows live on the Services page.
  const existing = await db.collection('tasks').where('type', '==', 'offer').get();
  const keep = new Set(rows.map(([id]) => id));
  const stale = existing.docs.filter((d) => !keep.has(d.id));
  stale.forEach((d) => {
    console.log(`${dryRun ? '[dry-run] ' : ''}deactivating stale tasks/${d.id}`);
    if (!dryRun) batch.set(d.ref, { active: false }, { merge: true });
  });

  if (!dryRun) await batch.commit();
  console.log(`\n${dryRun ? 'Would seed' : 'Seeded'} ${rows.length} offer(s); ${stale.length} stale row(s) deactivated.`);
  process.exit(0);
};

run().catch((err) => { console.error(err); process.exit(1); });
