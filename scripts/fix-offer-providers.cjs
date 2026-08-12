#!/usr/bin/env node
/**
 * Fix offer provider IDs in the tasks collection.
 *
 * - Links each offer to the correct user UID
 * - Renames Karan Tiwari's business to Tivoryx
 * - Ensures Pandemic Tennis offer exists with uid: 'pandemic-tennis'
 * - Removes the partner_id field from all offer docs
 *
 * Usage:
 *   node scripts/fix-offer-providers.cjs --key serviceAccount.json [--dry-run]
 */

const admin = require('firebase-admin');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const keyFile = args.find((_, i, a) => a[i - 1] === '--key');

if (!keyFile) {
  console.error('Usage: node scripts/fix-offer-providers.cjs --key serviceAccount.json [--dry-run]');
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(keyFile) });
const db = admin.firestore();

// ─── Provider UID map ────────────────────────────────────────────────────
const PROVIDER_UIDS = {
  'yujin':                'yT3GrDq3bwMGdqHVnGMGjUDXrXx2',
  'forty-forty tennis':   'yT3GrDq3bwMGdqHVnGMGjUDXrXx2',
  'karan tiwari':         'FYjN50oiPQVseJt0UzD3G9oP6WG3',
  'tivoryx':              'FYjN50oiPQVseJt0UzD3G9oP6WG3',
  'archie':               'kVloaSUaNPfWqv1NtdW6Xj4YDOP2',
  'pandemic tennis':      'pandemic-tennis',
};

// Display names per provider UID
const DISPLAY_NAMES = {
  'yT3GrDq3bwMGdqHVnGMGjUDXrXx2': 'Forty-Forty Tennis',
  'FYjN50oiPQVseJt0UzD3G9oP6WG3': 'Tivoryx',
  'kVloaSUaNPfWqv1NtdW6Xj4YDOP2': 'Archie',
  'pandemic-tennis':               'Pandemic Tennis',
};

async function main() {
  console.log(`Fixing offer providers ${DRY_RUN ? '(DRY RUN)' : '(LIVE)'}\n`);

  const updates = [];
  const removals = [];
  const partnerIdRemovals = [];

  // 1. Read all offer docs
  const offersSnap = await db.collection('tasks')
    .where('type', '==', 'offer')
    .get();
  console.log(`Found ${offersSnap.size} offer docs\n`);

  for (const doc of offersSnap.docs) {
    const data = doc.data();
    const providerName = (data.provider_name || '').trim().toLowerCase();
    const currentId = data.uid || data.provider_id || '';

    // Find matching UID
    const matchedUid = PROVIDER_UIDS[providerName];
    if (!matchedUid) {
      console.log(`  [SKIP] ${doc.id} — "${data.provider_name}" not in provider map`);
      continue;
    }

    const updatesForDoc = {};

    // Fix uid if wrong
    if (matchedUid !== currentId) {
      updatesForDoc.uid = matchedUid;
      console.log(`  [UPDATE] ${doc.id}: uid "${currentId}" → "${matchedUid}" (${data.provider_name})`);
    }

    // Fix display name if set
    const expectedName = DISPLAY_NAMES[matchedUid];
    if (expectedName && data.provider_name !== expectedName) {
      updatesForDoc.provider_name = expectedName;
      console.log(`  [UPDATE] ${doc.id}: provider_name "${data.provider_name}" → "${expectedName}"`);
    }

    // Remove partner_id if present
    if (data.partner_id !== undefined) {
      updatesForDoc.partner_id = admin.firestore.FieldValue.delete();
      console.log(`  [DELETE] ${doc.id}: removing partner_id`);
    }

    if (Object.keys(updatesForDoc).length > 0) {
      updates.push({ id: doc.id, data: updatesForDoc });
    }
  }

  // 3. Check if Pandemic Tennis offer exists, create if not
  const pandemicExists = offersSnap.docs.some(
    (d) => (d.data().uid === 'pandemic-tennis'),
  );
  if (!pandemicExists) {
    const pandemicDoc = {
      type: 'offer',
      category: 'stringing',
      uid: 'pandemic-tennis',
      provider_id: 'pandemic',
      provider_name: 'Pandemic Tennis',
      area: 'Dufferin - West End',
      offer: 'Stringing Service',
      discount: 0,
      total_price: 0,
      discounted_price: 0,
      points_cost: 15,
      active: true,
      created_at: new Date().toISOString(),
    };
    updates.push({ id: 'pandemic-stringing-service', data: pandemicDoc, create: true });
    console.log(`\n  [CREATE] offer_pandemic-tennis — Pandemic Tennis`);
  }

  console.log(`\nTotal operations: ${updates.length}`);

  if (DRY_RUN) {
    console.log('\n[DRY RUN] No changes written.');
    return;
  }

  // 4. Apply updates
  let batch = db.batch();
  let batchCount = 0;
  for (const u of updates) {
    if (u.create) {
      batch.set(db.collection('tasks').doc(u.id), u.data, { merge: true });
    } else {
      batch.update(db.collection('tasks').doc(u.id), u.data);
    }
    batchCount++;
    if (batchCount % 450 === 0) {
      await batch.commit();
      batch = db.batch();
    }
  }
  if (batchCount % 450 !== 0) await batch.commit();

  console.log(`\nDone: ${updates.length} docs processed.`);
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
