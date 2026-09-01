import { access, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { comparisonBaseError, resolveComparisonBase } from './lib/comparison-base.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requiredDocs = [
  'docs/README.md',
  'docs/architecture/README.md',
  'docs/architecture/SYSTEM_ARCHITECTURE.md',
  'docs/architecture/DATA_FLOW.md',
  'docs/architecture/DATA_MODEL.md',
  'docs/architecture/AUTHORIZATION_MODEL.md',
  'docs/architecture/FIRESTORE_SCHEMA_ASSESSMENT.md',
  'docs/architecture/ENVIRONMENTS_AND_DEPLOYMENT.md',
  'docs/architecture/ADR-001-role-authorization-model.md',
  'docs/architecture/ADR-002-environment-isolation.md',
  'docs/architecture/MOBILE_PATH_RECOMMENDATION.md',
  'docs/architecture/diagrams/authorization-boundaries.md',
  'docs/architecture/diagrams/core-data-flow.md',
  'docs/architecture/diagrams/current-system-architecture.md',
  'docs/architecture/diagrams/firestore-data-model.md',
  'docs/architecture/diagrams/modernization-before-after.md',
  'docs/architecture/diagrams/target-safe-delivery-architecture.md',
  'docs/domain/README.md',
  'docs/engineering/AGENT_SKILLS.md',
  'docs/engineering/README.md',
  'docs/engineering/MAINTAINABILITY.md',
  'docs/engineering/SECURITY_BASELINE.md',
  'docs/engineering/LOCAL_DEVELOPMENT.md',
  'docs/engineering/TAKEOVER_STABILIZATION_LOG.md',
  'docs/runbooks/README.md',
  'docs/runbooks/FIRESTORE_BACKUP_AND_RECOVERY.md',
  'docs/runbooks/RESEND_DOMAIN_VERIFICATION.md',
  'docs/domain/TOURNAMENT_RULES.md',
  'docs/domain/ROUND_ROBIN_RULES.md',
  'docs/domain/SCORING_AND_POINTS.md',
  'docs/domain/REWARDS_RULES.md',
  'docs/domain/CONTACT_PRIVACY.md',
];

const documentationRequirements = [
  {
    paths: [
      'firebase.json',
      '.firebaserc',
      'scripts/run-emulator-test.mjs',
      'scripts/run-emulator-fixture-test.mjs',
      'scripts/start-emulators.mjs',
      'scripts/deploy-hosting.mjs',
    ],
    docs: ['docs/architecture/ENVIRONMENTS_AND_DEPLOYMENT.md', 'docs/architecture/SYSTEM_ARCHITECTURE.md'],
  },
  {
    paths: ['firestore.rules', 'storage.rules'],
    docs: [
      'docs/architecture/AUTHORIZATION_MODEL.md',
      'docs/architecture/DATA_MODEL.md',
      'docs/engineering/SECURITY_BASELINE.md',
    ],
  },
  {
    paths: ['functions/lib', 'functions/rewards.js', 'functions/accountLookup.js', 'functions/connections.js'],
    docs: [
      'docs/architecture/AUTHORIZATION_MODEL.md',
      'docs/engineering/SECURITY_BASELINE.md',
      'docs/engineering/MAINTAINABILITY.md',
    ],
  },
  {
    paths: [
      'src/features/signup',
      'src/features/courts',
      'src/features/events/services',
      'src/features/matches',
      'src/features/tournament',
      'src/pages/tournament',
    ],
    docs: ['docs/architecture/DATA_FLOW.md', 'docs/architecture/DATA_MODEL.md', 'docs/engineering/MAINTAINABILITY.md'],
  },
  {
    paths: ['scripts/migrations'],
    docs: [
      'docs/architecture/ENVIRONMENTS_AND_DEPLOYMENT.md',
      'docs/engineering/MAINTAINABILITY.md',
      'docs/runbooks/FIRESTORE_BACKUP_AND_RECOVERY.md',
    ],
  },
  {
    paths: [
      'scripts/backfill-contacts.mjs',
      'scripts/backfill-connections.mjs',
      'scripts/backfill-doubles-partners.mjs',
      'scripts/backfill-setup-complete.mjs',
      'scripts/backfill-zone-change-requests.mjs',
      'scripts/delete-stale-docs.mjs',
      'scripts/fix-offer-providers.cjs',
      'scripts/fix-zephyr-doubles.mjs',
      'scripts/restore-2025-season.mjs',
      'scripts/set-stringer.mjs',
      'scripts/seed-rewards.mjs',
      'scripts/snapshot-ranks.mjs',
    ],
    docs: [
      'docs/architecture/ENVIRONMENTS_AND_DEPLOYMENT.md',
      'docs/engineering/SECURITY_BASELINE.md',
      'docs/engineering/MAINTAINABILITY.md',
      'docs/runbooks/FIRESTORE_BACKUP_AND_RECOVERY.md',
    ],
  },
];

let comparisonBase = null;
const changedFiles = () => {
  const base = resolveComparisonBase(root);
  if (!base) throw new Error(comparisonBaseError(root));
  comparisonBase = base;
  const names = new Set();
  const addGitNames = (args, required = false) => {
    try {
      execFileSync('git', args, { cwd: root, encoding: 'utf8' })
        .split('\n')
        .filter(Boolean)
        .forEach((file) => names.add(file));
    } catch (error) {
      // Working-tree and staged listings are best-effort. The baseline comparison is not: if it
      // cannot run, this gate must fail rather than silently reviewing an unbounded file set.
      if (required) throw error;
    }
  };
  addGitNames(['diff', '--name-only', `${base}...HEAD`], true);
  addGitNames(['diff', '--name-only', 'HEAD']);
  addGitNames(['diff', '--cached', '--name-only']);
  addGitNames(['ls-files', '--others', '--exclude-standard']);
  if (names.size > 0) return [...names];
  try {
    return execFileSync('git', ['diff', '--name-only', 'HEAD~1...HEAD'], { cwd: root, encoding: 'utf8' })
      .split('\n')
      .filter(Boolean);
  } catch (error) {
    throw new Error(
      'Could not determine changed files for docs:verify. Use a full Git checkout or set ARCHITECTURE_BASE_SHA.',
      { cause: error },
    );
  }
};

const matchesPath = (file, prefix) => file === prefix || file.startsWith(`${prefix}/`);
const requirementFor = (file) =>
  documentationRequirements.find(({ paths }) => paths.some((prefix) => matchesPath(file, prefix)));
const isSensitive = (file) => Boolean(requirementFor(file));

const main = async () => {
  const missing = [];
  for (const relativePath of requiredDocs) {
    try {
      await access(path.join(root, relativePath));
    } catch {
      missing.push(relativePath);
    }
  }

  if (missing.length) {
    throw new Error(`Missing required active documentation:\n${missing.map((item) => `- ${item}`).join('\n')}`);
  }

  const changed = changedFiles();
  const sensitiveChanges = changed.filter(isSensitive);
  const missingReviews = sensitiveChanges.flatMap((file) => {
    const requirement = requirementFor(file);
    if (!requirement || requirement.docs.some((doc) => changed.includes(doc))) return [];
    return [`${file} requires one of: ${requirement.docs.join(', ')}`];
  });
  if (missingReviews.length) {
    throw new Error(
      'Architecture-sensitive files changed without a directly relevant documentation review:\n' +
        missingReviews.map((item) => `- ${item}`).join('\n'),
    );
  }

  const readme = await readFile(path.join(root, 'docs/architecture/README.md'), 'utf8');
  for (const requiredLink of ['SYSTEM_ARCHITECTURE.md', 'DATA_FLOW.md', 'ENVIRONMENTS_AND_DEPLOYMENT.md']) {
    if (!readme.includes(requiredLink)) throw new Error(`Architecture README does not link ${requiredLink}.`);
  }

  const docsIndex = await readFile(path.join(root, 'docs/README.md'), 'utf8');
  for (const requiredLink of [
    'architecture/README.md',
    'domain/README.md',
    'engineering/README.md',
    'runbooks/README.md',
    'archive/README.md',
  ]) {
    if (!docsIndex.includes(requiredLink)) throw new Error(`Documentation index does not link ${requiredLink}.`);
  }

  const reviewed = sensitiveChanges.length
    ? `${sensitiveChanges.length} sensitive path(s) with mapped docs`
    : 'no sensitive paths';
  console.log(`docs:verify passed (base ${comparisonBase}; ${changed.length} changed files; ${reviewed}).`);
};

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
