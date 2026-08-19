import { spawnSync } from 'node:child_process';

const PRODUCTION_PROJECT = 'toronto-tennis-league';
const mode = process.argv[2] ?? 'deploy';
const projectId = process.env.FIREBASE_DEPLOY_PROJECT_ID?.trim();
const productionApproval = process.env.ALLOW_PRODUCTION_DEPLOY === 'true';
const productionConfirmation = process.env.FIREBASE_DEPLOY_CONFIRM === 'I_UNDERSTAND_PRODUCTION';

if (!['deploy', 'preview'].includes(mode)) {
  console.error('Usage: node scripts/deploy-hosting.mjs [deploy|preview]');
  process.exit(2);
}

if (!projectId) {
  console.error('Refusing Hosting operation: set FIREBASE_DEPLOY_PROJECT_ID explicitly.');
  process.exit(2);
}

if (projectId === PRODUCTION_PROJECT && (!productionApproval || !productionConfirmation)) {
  console.error(
    `Refusing operation against production project ${PRODUCTION_PROJECT}. ` +
      'For an explicitly approved production action, set ALLOW_PRODUCTION_DEPLOY=true and ' +
      'FIREBASE_DEPLOY_CONFIRM=I_UNDERSTAND_PRODUCTION in the approved execution environment.',
  );
  process.exit(2);
}

const args = mode === 'preview'
  ? ['-y', 'firebase-tools@latest', 'hosting:channel:deploy', 'preview', '--project', projectId]
  : ['-y', 'firebase-tools@latest', 'deploy', '--only', 'hosting', '--project', projectId];

console.log(`Running Firebase Hosting ${mode} for explicitly selected project ${projectId}.`);
const result = spawnSync('npx', args, { stdio: 'inherit' });
if (result.error) {
  console.error(`Firebase CLI could not be started: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
