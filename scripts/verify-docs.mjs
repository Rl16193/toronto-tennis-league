import { access, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requiredDocs = [
  'docs/architecture/README.md',
  'docs/architecture/SYSTEM_ARCHITECTURE.md',
  'docs/architecture/DATA_FLOW.md',
  'docs/architecture/DATA_MODEL.md',
  'docs/architecture/AUTHORIZATION_MODEL.md',
  'docs/architecture/FIRESTORE_SCHEMA_ASSESSMENT.md',
  'docs/architecture/ENVIRONMENTS_AND_DEPLOYMENT.md',
  'docs/architecture/ADR-001-role-authorization-model.md',
  'docs/architecture/ADR-002-environment-isolation.md',
  'docs/engineering/AGENT_SKILLS.md',
  'docs/engineering/MAINTAINABILITY.md',
  'docs/engineering/SECURITY_BASELINE.md',
  'docs/runbooks/FIRESTORE_BACKUP_AND_RECOVERY.md',
  'docs/domain/TOURNAMENT_RULES.md',
  'docs/domain/ROUND_ROBIN_RULES.md',
  'docs/domain/SCORING_AND_POINTS.md',
  'docs/domain/REWARDS_RULES.md',
  'docs/domain/CONTACT_PRIVACY.md',
];

const documentationRequirements = [
  {
    paths: ['firebase.json', '.firebaserc', 'scripts/run-emulator-test.mjs', 'scripts/deploy-hosting.mjs'],
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
];

const changedFiles = () => {
  const base = process.env.ARCHITECTURE_BASE_SHA || 'origin/dev-anuj';
  const names = new Set();
  const addGitNames = (args) => {
    try {
      execFileSync('git', args, { cwd: root, encoding: 'utf8' })
        .split('\n')
        .filter(Boolean)
        .forEach((file) => names.add(file));
    } catch {
      // A shallow checkout may not have the comparison base; the fallback below still checks docs.
    }
  };
  addGitNames(['diff', '--name-only', `${base}...HEAD`]);
  addGitNames(['diff', '--name-only', 'HEAD']);
  addGitNames(['diff', '--cached', '--name-only']);
  addGitNames(['ls-files', '--others', '--exclude-standard']);
  if (names.size > 0) return [...names];
  try {
    return execFileSync('git', ['diff', '--name-only', 'HEAD~1...HEAD'], { cwd: root, encoding: 'utf8' })
      .split('\n')
      .filter(Boolean);
  } catch {
    return [];
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
    throw new Error(`Missing required architecture/runbook docs:\n${missing.map((item) => `- ${item}`).join('\n')}`);
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

  const reviewed = sensitiveChanges.length
    ? `${sensitiveChanges.length} sensitive path(s) with mapped docs`
    : 'no sensitive paths';
  console.log(`docs:verify passed (${changed.length} changed files; ${reviewed}).`);
};

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
