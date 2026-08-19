import { spawnSync } from 'node:child_process';
import process from 'node:process';

const checks = [
  ['typecheck', ['run', 'typecheck']],
  ['lint', ['run', 'lint']],
  ['format check', ['run', 'format:check']],
  ['documentation freshness', ['run', 'docs:verify']],
  ['Functions syntax', ['run', 'functions:syntax']],
  ['root unit tests', ['test']],
  ['Functions unit tests', ['--prefix', 'functions', 'test']],
  ['Firestore Rules tests', ['run', 'test:rules']],
  ['Storage Rules tests', ['run', 'test:storage']],
  ['emulator fixture smoke', ['run', 'test:fixtures']],
  ['Functions emulator integration tests', ['run', 'test:functions:integration']],
  ['browser emulator smoke tests', ['run', 'test:e2e']],
  ['production build', ['run', 'build']],
];

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const failures = [];

for (const [label, args] of checks) {
  console.log(`\n=== ${label} ===`);
  const result = spawnSync(npm, args, { stdio: 'inherit', env: process.env });
  if (result.error || result.status !== 0) {
    failures.push(label);
    console.error(`${label} failed${result.error ? `: ${result.error.message}` : '.'}`);
  }
}

console.log('\n=== diff check ===');
const diffChecks = [['working tree', ['diff', '--check']]];
const comparisonBase = process.env.ARCHITECTURE_BASE_SHA;
if (comparisonBase) diffChecks.push(['committed change set', ['diff', '--check', `${comparisonBase}...HEAD`]]);
for (const [label, args] of diffChecks) {
  console.log(`-- ${label}`);
  const diffCheck = spawnSync('git', args, { stdio: 'inherit' });
  if (diffCheck.error || diffCheck.status !== 0) failures.push(`git diff --check (${label})`);
}

console.log('\n=== generated artifact freshness ===');
const generatedCheck = spawnSync('git', ['diff', '--exit-code', 'HEAD', '--', 'public/programs-tennis.csv'], {
  stdio: 'inherit',
});
if (generatedCheck.error || generatedCheck.status !== 0) failures.push('generated artifact freshness');

if (failures.length) {
  console.error(`\nverify failed: ${failures.join(', ')}`);
  process.exitCode = 1;
} else {
  console.log('\nverify passed: all configured local quality gates are green.');
}
