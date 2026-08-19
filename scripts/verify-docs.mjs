import { access, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requiredDocs = [
  'docs/architecture/README.md',
  'docs/architecture/SYSTEM_ARCHITECTURE.md',
  'docs/architecture/DATA_FLOW.md',
  'docs/architecture/ENVIRONMENTS_AND_DEPLOYMENT.md',
  'docs/engineering/AGENT_SKILLS.md',
  'docs/runbooks/FIRESTORE_BACKUP_AND_RECOVERY.md',
];

const architectureSensitivePaths = [
  'firebase.json',
  '.firebaserc',
  'firestore.rules',
  'storage.rules',
  'functions/lib/callable.js',
  'src/features/tournament/domain',
  'scripts/migrations',
];

const documentationPaths = ['docs/architecture', 'docs/engineering', 'docs/runbooks', 'docs/domain'];

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

const isSensitive = (file) =>
  architectureSensitivePaths.some((prefix) => file === prefix || file.startsWith(`${prefix}/`));
const isDocumentation = (file) => documentationPaths.some((prefix) => file === prefix || file.startsWith(`${prefix}/`));

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
  const docsChanged = changed.some(isDocumentation);
  if (sensitiveChanges.length && !docsChanged) {
    throw new Error(
      'Architecture-sensitive files changed without a documentation review. ' +
        `Changed: ${sensitiveChanges.join(', ')}. Update docs/architecture, docs/domain, ` +
        'docs/engineering, or docs/runbooks in the same change set.',
    );
  }

  const readme = await readFile(path.join(root, 'docs/architecture/README.md'), 'utf8');
  for (const requiredLink of ['SYSTEM_ARCHITECTURE.md', 'DATA_FLOW.md', 'ENVIRONMENTS_AND_DEPLOYMENT.md']) {
    if (!readme.includes(requiredLink)) throw new Error(`Architecture README does not link ${requiredLink}.`);
  }

  console.log(`docs:verify passed (${changed.length} tracked files differ from the architecture base).`);
};

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
