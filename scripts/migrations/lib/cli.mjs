import admin from 'firebase-admin';
import fs from 'node:fs';
import path from 'node:path';

export const PRODUCTION_PROJECT = 'toronto-tennis-league';
const PRODUCTION_CONFIRMATION = 'I_UNDERSTAND_PRODUCTION_MIGRATION';

const valueAfter = (argv, flag) => {
  const index = argv.indexOf(flag);
  if (index === -1) return null;
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value.`);
  return value;
};

export const usage = () =>
  [
    'Usage: node scripts/migrations/<migration>.mjs --project <id> [--key <service-account.json>]',
    '       [--dry-run] [--apply] [--limit <n>] [--resume <document-id>]',
    '       production additionally requires --allow-production and',
    `       ALLOW_PRODUCTION_MIGRATION=true plus --confirm-production ${PRODUCTION_CONFIRMATION}`,
  ].join('\n');

/** Parse the common safety contract before any Firebase client is initialized. */
export const parseMigrationArgs = (argv = process.argv.slice(2)) => {
  if (argv.includes('--help')) return { help: true };

  const project = valueAfter(argv, '--project')?.trim();
  if (!project) throw new Error(`Missing explicit --project.\n${usage()}`);

  const dryRun = !argv.includes('--apply') || argv.includes('--dry-run');
  const limitValue = valueAfter(argv, '--limit');
  const limit = limitValue === null ? null : Number(limitValue);
  if (limit !== null && (!Number.isInteger(limit) || limit <= 0)) {
    throw new Error('--limit must be a positive integer.');
  }

  const resume = valueAfter(argv, '--resume');
  const key = valueAfter(argv, '--key');
  const allowProduction = argv.includes('--allow-production');
  const confirmation = valueAfter(argv, '--confirm-production');
  if (
    project === PRODUCTION_PROJECT &&
    (!allowProduction || process.env.ALLOW_PRODUCTION_MIGRATION !== 'true' || confirmation !== PRODUCTION_CONFIRMATION)
  ) {
    throw new Error(
      `Refusing migration against production project ${PRODUCTION_PROJECT}. ` +
        'Use an approved environment with explicit production confirmation.',
    );
  }

  return { project, key, dryRun, apply: !dryRun, limit, resume, help: false };
};

/** Initialize Admin SDK only after the explicit target has passed the safety checks. */
export const createMigrationDb = ({ project, key }) => {
  if (!key) throw new Error('A service-account --key is required for a Firebase migration.');
  const keyPath = path.resolve(key);
  if (!fs.existsSync(keyPath)) throw new Error(`Service-account key not found: ${keyPath}`);

  const serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
  if (serviceAccount.project_id && serviceAccount.project_id !== project) {
    throw new Error(`Service-account project ${serviceAccount.project_id} does not match --project ${project}.`);
  }

  const app = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: project,
  });
  return app.firestore();
};

/** Read a bounded, document-ID ordered page suitable for a repeatable migration cursor. */
export const scanCollection = async (db, collectionName, { limit = null, resume = null } = {}) => {
  let query = db.collection(collectionName).orderBy(admin.firestore.FieldPath.documentId());
  if (resume) query = query.startAfter(resume);
  if (limit) query = query.limit(limit);
  return query.get();
};

export const emptyReport = () => ({ scanned: 0, eligible: 0, changed: 0, skipped: 0, failed: 0, planned: 0 });

export const printReport = (report, { dryRun }) => {
  console.log(`scanned: ${report.scanned}`);
  console.log(`eligible: ${report.eligible}`);
  console.log(`changed: ${report.changed}`);
  console.log(`skipped: ${report.skipped}`);
  console.log(`failed: ${report.failed}`);
  if (dryRun) console.log(`planned: ${report.planned}`);
};
