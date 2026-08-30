import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyResolvedPorts,
  findPortConflicts,
  LOCAL_PROJECT_ID,
  parseLauncherArgs,
  portConflictMessage,
  portMoveMessage,
  readEmulatorPorts,
  resolveEmulatorPorts,
} from './lib/emulator-launcher.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { configPath, strictPorts } = parseLauncherArgs(process.argv.slice(2));
const { ports } = await readEmulatorPorts(root, configPath);

// A single stale emulator process used to block the whole suite: the launcher refused to start and
// told you to hand-write an alternate config. Now it moves to free ports instead and reports what
// it did. `--strict-ports` keeps the old refusal for CI, where a busy port is a real signal.
let effectiveConfigPath = configPath;
if (strictPorts) {
  const conflicts = await findPortConflicts(ports);
  if (conflicts.length) {
    console.error(portConflictMessage(conflicts, configPath));
    process.exit(1);
  }
} else {
  const { resolved, moved, unresolved } = await resolveEmulatorPorts(ports);
  if (unresolved.length) {
    console.error(portConflictMessage(unresolved, configPath));
    process.exit(1);
  }
  if (moved.length) {
    const source = JSON.parse(await readFile(path.resolve(root, configPath), 'utf8'));
    // MUST live at the repository root. Firebase resolves every relative path inside a config
    // (`storage.rules`, `firestore.rules`, `hosting.public`) against the directory the config sits
    // in — writing this into .firebase/ made the CLI look for .firebase/storage.rules and die.
    const generated = path.join(root, 'firebase.resolved-ports.json');
    await writeFile(generated, `${JSON.stringify(applyResolvedPorts(source, resolved), null, 2)}\n`);
    effectiveConfigPath = path.relative(root, generated).split(path.sep).join('/');
    console.log(portMoveMessage(moved));
    console.log('');
  }
}
const homebrewJava = '/opt/homebrew/opt/openjdk@21';
const javaHome = path.join(homebrewJava, 'libexec/openjdk.jdk/Contents/Home');
const env = {
  ...process.env,
  GCLOUD_PROJECT: LOCAL_PROJECT_ID,
  GOOGLE_CLOUD_PROJECT: LOCAL_PROJECT_ID,
  PATH: existsSync(path.join(homebrewJava, 'bin'))
    ? `${path.join(homebrewJava, 'bin')}${path.delimiter}${process.env.PATH || ''}`
    : process.env.PATH,
};
if (existsSync(path.join(javaHome, 'bin/java'))) env.JAVA_HOME = javaHome;

// Spawn the CLI's JS entrypoint with the running Node binary, NOT the node_modules/.bin
// shim: Node refuses to spawn a .cmd without `shell: true` (CVE-2024-27980), which made
// every emulator command fail with EINVAL on Windows.
const command = path.join(root, 'node_modules', 'firebase-tools', 'lib', 'bin', 'firebase.js');
const child = spawn(
  process.execPath,
  [
    command,
    'emulators:start',
    '--config',
    effectiveConfigPath,
    '--project',
    LOCAL_PROJECT_ID,
    '--only',
    'auth,firestore,functions,storage,hosting',
  ],
  { cwd: root, env, stdio: 'inherit' },
);

const forwardSignal = (signal) => {
  if (!child.killed) child.kill(signal);
};
const onSigint = () => forwardSignal('SIGINT');
const onSigterm = () => forwardSignal('SIGTERM');
process.once('SIGINT', onSigint);
process.once('SIGTERM', onSigterm);
const removeSignalHandlers = () => {
  process.removeListener('SIGINT', onSigint);
  process.removeListener('SIGTERM', onSigterm);
};

child.once('error', (error) => {
  removeSignalHandlers();
  console.error(error.message);
  process.exitCode = 1;
});
child.once('exit', (code, signal) => {
  removeSignalHandlers();
  process.exitCode = code ?? (signal === 'SIGINT' ? 130 : signal === 'SIGTERM' ? 143 : signal ? 1 : 0);
});
