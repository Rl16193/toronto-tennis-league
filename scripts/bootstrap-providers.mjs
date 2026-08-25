#!/usr/bin/env node

/**
 * Admin-SDK provider bootstrap. Dry-run is the default; apply requires an explicit project and
 * confirmation so this script cannot be mistaken for an in-app role toggle.
 */
import fs from 'node:fs';
import process from 'node:process';

const args = new Set(process.argv.slice(2));
const input = process.argv[process.argv.indexOf('--input') + 1];
if (!input || !fs.existsSync(input)) {
  console.error(
    'Usage: node scripts/bootstrap-providers.mjs --input providers.json [--apply --project PROJECT_ID --confirm PROVIDERS]',
  );
  process.exit(2);
}
const rows = JSON.parse(fs.readFileSync(input, 'utf8'));
if (!Array.isArray(rows)) throw new Error('Provider input must be an array.');
const validRoles = new Set(['stringer', 'coach', 'other']);
for (const row of rows) {
  if (
    !row ||
    typeof row.id !== 'string' ||
    !row.id.trim() ||
    typeof row.name !== 'string' ||
    !row.name.trim() ||
    !Array.isArray(row.roles) ||
    row.roles.length === 0 ||
    row.roles.some((role) => !validRoles.has(role))
  ) {
    throw new Error(`Invalid provider row: ${JSON.stringify(row)}`);
  }
}
console.log(`${args.has('--apply') ? 'apply' : 'dry-run'}: ${rows.length} provider rows validated`);
if (!args.has('--apply')) process.exit(0);
const projectIndex = process.argv.indexOf('--project');
const projectId = projectIndex >= 0 ? process.argv[projectIndex + 1] : '';
if (!projectId) throw new Error('Apply requires --project PROJECT_ID.');
if (process.env.FIREBASE_CONFIG?.includes('toronto-tennis-league') || projectId === 'toronto-tennis-league') {
  throw new Error('Production project is not an allowed bootstrap target.');
}
if (
  !args.has('--confirm') ||
  !process.argv.includes('--confirm') ||
  process.argv[process.argv.indexOf('--confirm') + 1] !== 'PROVIDERS'
) {
  throw new Error('Apply requires --confirm PROVIDERS.');
}
const { applicationDefault, initializeApp } = await import('firebase-admin/app');
const { getFirestore } = await import('firebase-admin/firestore');
initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore();
for (const row of rows)
  await db.doc(`providers/${row.id}`).set({ ...row, updated_at: new Date().toISOString() }, { merge: true });
console.log(`applied ${rows.length} provider rows`);
