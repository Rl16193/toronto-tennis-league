/**
 * Firestore Export Script
 *
 * Exports users, stats, preferences, and event_participants collections
 * to individual JSON files in ./scripts/exports/
 *
 * Prerequisites:
 *   npm install firebase-admin
 *
 * Usage:
 *   node scripts/export-firestore.js --key path/to/serviceAccountKey.json
 *
 * Get your service account key from:
 *   Firebase Console → Project Settings → Service Accounts → Generate new private key
 */

import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PROJECT_ID = 'toronto-tennis-league';
const COLLECTIONS = ['users', 'stats', 'preferences', 'event_participants', 'events', 'tournament_matches'];
const OUTPUT_DIR = path.join(__dirname, 'exports_fresh');

// ── Parse --key argument ──────────────────────────────────────────────────────

const keyArgIndex = process.argv.indexOf('--key');
if (keyArgIndex === -1 || !process.argv[keyArgIndex + 1]) {
  console.error('Usage: node scripts/export-firestore.js --key path/to/serviceAccountKey.json');
  process.exit(1);
}

const keyPath = path.resolve(process.argv[keyArgIndex + 1]);
if (!fs.existsSync(keyPath)) {
  console.error(`Service account key not found: ${keyPath}`);
  process.exit(1);
}

// ── Initialise Firebase Admin ─────────────────────────────────────────────────

const serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: PROJECT_ID,
});

const db = admin.firestore();

// ── Helpers ───────────────────────────────────────────────────────────────────

const toPlain = (data) => {
  if (data === null || data === undefined) return data;
  if (data instanceof admin.firestore.Timestamp) return data.toDate().toISOString();
  if (Array.isArray(data)) return data.map(toPlain);
  if (typeof data === 'object') {
    return Object.fromEntries(Object.entries(data).map(([k, v]) => [k, toPlain(v)]));
  }
  return data;
};

const toCsv = (rows) => {
  if (rows.length === 0) return '';
  const keys = [...new Set(rows.flatMap(r => Object.keys(r)))];
  const escape = (v) => {
    if (v === null || v === undefined) return '';
    const s = Array.isArray(v) ? v.join(';') : String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [keys.join(','), ...rows.map(r => keys.map(k => escape(r[k])).join(','))].join('\n');
};

const exportCollection = async (collectionName) => {
  console.log(`  Fetching ${collectionName}...`);
  const snapshot = await db.collection(collectionName).get();

  const rows = [];
  snapshot.forEach((doc) => {
    rows.push({ _id: doc.id, ...toPlain(doc.data()) });
  });

  const outPath = path.join(OUTPUT_DIR, `${collectionName}.csv`);
  fs.writeFileSync(outPath, toCsv(rows), 'utf8');
  console.log(`  ✓ ${collectionName}: ${snapshot.size} documents → ${outPath}`);
  return snapshot.size;
};

// ── Main ──────────────────────────────────────────────────────────────────────

const run = async () => {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log(`\nExporting from project: ${PROJECT_ID}`);
  console.log(`Output directory: ${OUTPUT_DIR}\n`);

  let total = 0;
  for (const col of COLLECTIONS) {
    total += await exportCollection(col);
  }

  console.log(`\nDone. ${total} documents exported across ${COLLECTIONS.length} collections.\n`);
  process.exit(0);
};

run().catch((err) => {
  console.error('\nExport failed:', err.message);
  process.exit(1);
});
