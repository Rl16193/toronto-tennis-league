/**
 * Runs a test file inside the Firestore emulator (project demo-ttl, which can never reach
 * production), then stops any demo-ttl emulator left running. On Windows `emulators:exec` can
 * leave the Java process alive, which blocks the next run with "port taken".
 *
 *   node scripts/run-emulator-tests.mjs tests/rules/firestore.rules.test.mjs
 */
import { execSync, spawnSync } from 'node:child_process';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/run-emulator-tests.mjs <test file>');
  process.exit(1);
}

const stopLeftovers = () => {
  try {
    if (process.platform === 'win32') {
      execSync(
        'powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name=\'java.exe\'\\" | '
          + 'Where-Object { $_.CommandLine -match \'project_id demo-ttl\' } | '
          + 'ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"',
        { stdio: 'ignore' },
      );
    } else {
      execSync("pkill -f 'project_id demo-ttl' || true", { stdio: 'ignore' });
    }
  } catch { /* nothing to stop */ }
};

stopLeftovers();
const run = spawnSync(
  `npx firebase emulators:exec --only firestore --project demo-ttl "node --test --test-concurrency=1 ${file}"`,
  { stdio: 'inherit', shell: true },
);
stopLeftovers();
process.exit(run.status ?? 1);
