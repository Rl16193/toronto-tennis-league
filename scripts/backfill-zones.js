/**
 * Zone Backfill Script
 *
 * Reads all preferences docs, derives preferred_zone from the first preferred_court,
 * and writes it back for any user missing a zone.
 *
 * Usage:
 *   node scripts/backfill-zones.js --key serviceAccount.json
 *   node scripts/backfill-zones.js --key serviceAccount.json --dry-run
 */

import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dryRun = process.argv.includes('--dry-run');

// ── Service account ───────────────────────────────────────────────────────────

const keyArgIndex = process.argv.indexOf('--key');
if (keyArgIndex === -1 || !process.argv[keyArgIndex + 1]) {
  console.error('Usage: node scripts/backfill-zones.js --key path/to/serviceAccount.json [--dry-run]');
  process.exit(1);
}
const keyPath = path.resolve(process.argv[keyArgIndex + 1]);
if (!fs.existsSync(keyPath)) { console.error(`Key not found: ${keyPath}`); process.exit(1); }

admin.initializeApp({ credential: admin.credential.cert(JSON.parse(fs.readFileSync(keyPath, 'utf8'))) });
const db = admin.firestore();

// ── Zone logic (mirrors src/utils/zones.ts) ───────────────────────────────────

function getZone(lat, lng) {
  if (lng < -79.435) {
    if (lat > 43.722) return 'York West';
    if (lat > 43.653) return 'Etobicoke';
    return 'Etobicoke - Lakeshore';
  } else if (lng <= -79.345) {
    return lat > 43.710 ? 'North York' : 'Downtown - Midtown';
  } else {
    return lat > 43.755 ? 'North Scarborough' : 'East York and South Scarborough';
  }
}

// ── CSV court lookup ──────────────────────────────────────────────────────────

function buildCourtMap() {
  const csvPath = path.join(__dirname, '..', 'public', 'Tennis Courts Facilities - 4326.csv');
  const lines = fs.readFileSync(csvPath, 'utf-8').split(/\r?\n/).filter(Boolean);
  const headers = lines[0].split(',');
  const iDropdown = headers.indexOf('Dropdown');
  const iName = headers.indexOf('Name');
  const iGeom = headers.indexOf('geometry');

  const map = new Map(); // lowercase court name → { lat, lng }

  for (let i = 1; i < lines.length; i++) {
    // geometry column is JSON with commas, so split carefully on the last quoted block
    const line = lines[i];
    const geomStart = line.indexOf('"{');
    if (geomStart === -1) continue;
    const before = line.slice(0, geomStart).split(',');
    const geomRaw = line.slice(geomStart).replace(/^"|"$/g, '').replace(/""/g, '"');

    const dropdown = (before[iDropdown] || before[iName] || '').trim().toLowerCase();
    const name = (before[iName] || '').trim().toLowerCase();
    if (!dropdown && !name) continue;

    try {
      const geom = JSON.parse(geomRaw);
      const [lng, lat] = geom.coordinates[0];
      if (!lat || !lng) continue;
      if (dropdown) map.set(dropdown, { lat, lng });
      if (name && name !== dropdown) map.set(name, { lat, lng });
    } catch { /* skip malformed */ }
  }

  return map;
}

function findCourtCoords(courtName, courtMap) {
  const key = courtName.trim().toLowerCase();
  if (courtMap.has(key)) return courtMap.get(key);
  // prefix match fallback
  for (const [k, v] of courtMap) {
    if (k.startsWith(key) || key.startsWith(k)) return v;
  }
  return null;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(dryRun ? '🔍 DRY RUN — no writes will be made\n' : '✏️  LIVE RUN — writing to Firestore\n');

  const courtMap = buildCourtMap();
  console.log(`Loaded ${courtMap.size} court entries from CSV\n`);

  const snapshot = await db.collection('preferences').get();
  console.log(`Found ${snapshot.size} preferences documents\n`);

  const results = { updated: [], skipped: [], noCourts: [], alreadySet: [] };

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const userId = doc.id;
    const name = data.name || data.user_name || userId;
    const courts = Array.isArray(data.preferred_courts) ? data.preferred_courts : [];
    const existingZone = data.preferred_zone || '';

    if (existingZone) {
      results.alreadySet.push({ userId, name, zone: existingZone });
      continue;
    }

    if (courts.length === 0) {
      results.noCourts.push({ userId, name });
      continue;
    }

    // Tally zone votes across all matched courts; pick the most common
    const zoneCounts = new Map();
    const matchedCourts = [];
    for (const court of courts) {
      const coords = findCourtCoords(court, courtMap);
      if (!coords) continue;
      const z = getZone(coords.lat, coords.lng);
      zoneCounts.set(z, (zoneCounts.get(z) ?? 0) + 1);
      matchedCourts.push(court);
    }

    let assigned = null;
    let matchedCourt = matchedCourts.join(', ') || null;
    if (zoneCounts.size > 0) {
      assigned = [...zoneCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    }

    if (!assigned) {
      results.noCourts.push({ userId, name, courts, reason: 'courts not found in CSV' });
      continue;
    }

    if (!dryRun) {
      await doc.ref.update({ preferred_zone: assigned });
    }

    results.updated.push({ userId, name, court: matchedCourt, zone: assigned });
  }

  // ── Report ────────────────────────────────────────────────────────────────

  console.log('═══════════════════════════════════════════════════════');
  console.log(`✅ UPDATED (${results.updated.length})`);
  console.log('═══════════════════════════════════════════════════════');
  for (const r of results.updated) {
    console.log(`  ${r.name.padEnd(30)} → ${r.zone}  (via "${r.court}")`);
  }

  console.log('\n═══════════════════════════════════════════════════════');
  console.log(`⚠️  NO COURTS / COURT NOT MATCHED (${results.noCourts.length})`);
  console.log('═══════════════════════════════════════════════════════');
  for (const r of results.noCourts) {
    const courtList = r.courts?.length ? r.courts.join(', ') : '—';
    console.log(`  ${r.name.padEnd(30)}  courts: ${courtList}  ${r.reason ? `(${r.reason})` : ''}`);
  }

  console.log('\n═══════════════════════════════════════════════════════');
  console.log(`ℹ️  ALREADY HAD A ZONE (${results.alreadySet.length})`);
  console.log('═══════════════════════════════════════════════════════');
  for (const r of results.alreadySet) {
    console.log(`  ${r.name.padEnd(30)}  ${r.zone}`);
  }

  console.log('\n═══════════════════════════════════════════════════════');
  console.log(`SUMMARY: ${results.updated.length} updated · ${results.noCourts.length} no zone possible · ${results.alreadySet.length} already set`);
  if (dryRun) console.log('(dry run — nothing written)');
}

main().catch((e) => { console.error(e); process.exit(1); });
