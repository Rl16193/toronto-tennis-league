import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const freePort = () =>
  new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Could not determine an available emulator port.')));
        return;
      }
      server.close((error) => (error ? reject(error) : resolve(address.port)));
    });
  });
const freePorts = async (count) => {
  const ports = [];
  while (ports.length < count) {
    const port = await freePort();
    if (!ports.includes(port)) ports.push(port);
  }
  return ports;
};

const withJavaOnPath = () => {
  const homebrewJava = '/opt/homebrew/opt/openjdk@21/bin';
  if (existsSync(path.join(homebrewJava, 'java'))) return `${homebrewJava}${path.delimiter}${process.env.PATH || ''}`;
  const javaHomeBin = process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin') : '';
  if (javaHomeBin && existsSync(path.join(javaHomeBin, 'java')))
    return `${javaHomeBin}${path.delimiter}${process.env.PATH || ''}`;
  return process.env.PATH;
};

const main = async () => {
  const [authPort, firestorePort] = await freePorts(2);
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'rands-fixture-emulator-'));
  const configPath = path.join(tempDir, 'firebase.json');
  const config = {
    emulators: {
      auth: { host: '127.0.0.1', port: authPort },
      firestore: { host: '127.0.0.1', port: firestorePort },
    },
    firestore: { rules: path.join(root, 'firestore.rules') },
  };

  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
  const env = {
    ...process.env,
    FIREBASE_AUTH_EMULATOR_HOST: `127.0.0.1:${authPort}`,
    FIREBASE_EMULATOR_PROJECT_ID: 'rands-local',
    FIRESTORE_EMULATOR_HOST: `127.0.0.1:${firestorePort}`,
    GCLOUD_PROJECT: 'rands-local',
    GOOGLE_CLOUD_PROJECT: 'rands-local',
    PATH: withJavaOnPath(),
  };
  if (existsSync('/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home/bin/java')) {
    env.JAVA_HOME = '/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home';
  }

  const command = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'firebase.cmd' : 'firebase');
  const child = spawn(
    command,
    [
      'emulators:exec',
      '--config',
      configPath,
      '--only',
      'auth,firestore',
      '--project',
      'rands-local',
      'node tests/fixtures/seed-emulator.mjs',
    ],
    { cwd: root, env, stdio: 'inherit' },
  );

  try {
    const exitCode = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code, signal) => resolve(code ?? (signal ? 1 : 0)));
    });
    process.exitCode = exitCode;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
};

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
