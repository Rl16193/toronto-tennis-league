import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  findPortConflicts,
  LOCAL_PROJECT_ID,
  parseLauncherArgs,
  portConflictMessage,
  readEmulatorPorts,
} from './lib/emulator-launcher.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { configPath } = parseLauncherArgs(process.argv.slice(2));
const { ports } = await readEmulatorPorts(root, configPath);
const conflicts = await findPortConflicts(ports);
if (conflicts.length) {
  console.error(portConflictMessage(conflicts, configPath));
  process.exit(1);
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

const command = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'firebase.cmd' : 'firebase');
const child = spawn(
  command,
  [
    'emulators:start',
    '--config',
    configPath,
    '--project',
    LOCAL_PROJECT_ID,
    '--only',
    'auth,firestore,functions,storage,hosting',
  ],
  { cwd: root, env, stdio: 'inherit' },
);

child.once('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.once('exit', (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
