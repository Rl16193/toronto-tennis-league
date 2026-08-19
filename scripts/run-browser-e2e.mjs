import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const executable = (name) =>
  path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? `${name}.cmd` : name);
const homebrewJava = '/opt/homebrew/opt/openjdk@21';
const freePort = () =>
  new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string')
        return server.close(() => reject(new Error('Could not allocate an emulator port.')));
      server.close((error) => (error ? reject(error) : resolve(address.port)));
    });
  });

const waitForHttp = async (url, child, timeoutMs = 30_000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Vite exited before ${url} became ready.`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The server is still starting; retry until the bounded deadline.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${url}.`);
};

const run = (command, args, options = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: 'inherit', ...options });
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve(code ?? (signal ? 1 : 0)));
  });

const terminate = async (child) => {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]);
  if (child.exitCode === null) child.kill('SIGKILL');
};

const inner = async () => {
  const seedCode = await run(process.execPath, ['tests/fixtures/seed-emulator.mjs'], { env: process.env });
  if (seedCode !== 0) throw new Error('Synthetic emulator seeding failed.');

  const viteEnv = {
    ...process.env,
    VITE_FIREBASE_API_KEY: 'synthetic-api-key',
    VITE_FIREBASE_AUTH_DOMAIN: 'rands-local.firebaseapp.com',
    VITE_FIREBASE_PROJECT_ID: 'rands-local',
    VITE_FIREBASE_STORAGE_BUCKET: 'rands-local.appspot.com',
    VITE_FIREBASE_MESSAGING_SENDER_ID: '1234567890',
    VITE_FIREBASE_APP_ID: '1:1234567890:web:synthetic',
    VITE_USE_FIREBASE_EMULATORS: 'true',
    VITE_FIREBASE_EMULATOR_HOST: '127.0.0.1',
    VITE_FIREBASE_AUTH_EMULATOR_PORT: process.env.RANDS_E2E_AUTH_PORT,
    VITE_FIRESTORE_EMULATOR_PORT: process.env.RANDS_E2E_FIRESTORE_PORT,
    VITE_FUNCTIONS_EMULATOR_PORT: process.env.RANDS_E2E_FUNCTIONS_PORT,
    VITE_FIREBASE_STORAGE_EMULATOR_PORT: process.env.RANDS_E2E_STORAGE_PORT,
  };
  const vite = spawn(executable('vite'), ['--port=3000', '--host=127.0.0.1'], {
    cwd: root,
    env: viteEnv,
    stdio: 'inherit',
  });
  try {
    await waitForHttp('http://127.0.0.1:3000', vite);
    const code = await run(executable('playwright'), ['test'], { env: process.env });
    if (code !== 0) throw new Error('Playwright browser smoke failed.');
  } finally {
    await terminate(vite);
  }
};

const outer = async () => {
  const firebase = executable('firebase');
  if (!existsSync(firebase)) throw new Error('Firebase CLI is missing. Run npm ci.');
  const [authPort, firestorePort, functionsPort, storagePort] = await Promise.all([
    freePort(),
    freePort(),
    freePort(),
    freePort(),
  ]);
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'rands-browser-e2e-'));
  const configPath = path.join(tempDir, 'firebase.json');
  const functionsDir = path.join(tempDir, 'functions');
  await mkdir(functionsDir);
  await symlink(path.join(root, 'functions', 'node_modules'), path.join(functionsDir, 'node_modules'));
  await writeFile(
    path.join(functionsDir, 'package.json'),
    `${JSON.stringify({
      private: true,
      main: 'index.js',
      engines: { node: '22' },
      dependencies: { 'firebase-admin': '^13.10.0', 'firebase-functions': '^6.6.0' },
    })}\n`,
  );
  await writeFile(
    path.join(functionsDir, 'index.js'),
    [
      "require('firebase-admin').initializeApp();",
      `Object.assign(exports, require(${JSON.stringify(path.join(root, 'functions', 'accountLookup.js'))}));`,
      '',
    ].join('\n'),
  );
  await writeFile(
    configPath,
    `${JSON.stringify(
      {
        functions: { source: 'functions' },
        firestore: { rules: path.join(root, 'firestore.rules') },
        storage: { rules: path.join(root, 'storage.rules') },
        emulators: {
          auth: { host: '127.0.0.1', port: authPort },
          firestore: { host: '127.0.0.1', port: firestorePort },
          functions: { host: '127.0.0.1', port: functionsPort },
          storage: { host: '127.0.0.1', port: storagePort },
          ui: { enabled: false },
        },
      },
      null,
      2,
    )}\n`,
  );
  const env = {
    ...process.env,
    FIREBASE_AUTH_EMULATOR_HOST: `127.0.0.1:${authPort}`,
    FIRESTORE_EMULATOR_HOST: `127.0.0.1:${firestorePort}`,
    FIREBASE_STORAGE_EMULATOR_HOST: `127.0.0.1:${storagePort}`,
    FUNCTIONS_EMULATOR_HOST: `127.0.0.1:${functionsPort}`,
    RANDS_E2E_AUTH_PORT: String(authPort),
    RANDS_E2E_FIRESTORE_PORT: String(firestorePort),
    RANDS_E2E_FUNCTIONS_PORT: String(functionsPort),
    RANDS_E2E_STORAGE_PORT: String(storagePort),
    GCLOUD_PROJECT: 'rands-local',
    GOOGLE_CLOUD_PROJECT: 'rands-local',
    PATH: existsSync(path.join(homebrewJava, 'bin', 'java'))
      ? `${path.join(homebrewJava, 'bin')}${path.delimiter}${process.env.PATH || ''}`
      : process.env.PATH,
  };
  const javaHome = path.join(homebrewJava, 'libexec', 'openjdk.jdk', 'Contents', 'Home');
  if (existsSync(path.join(javaHome, 'bin', 'java'))) env.JAVA_HOME = javaHome;
  try {
    const code = await run(
      firebase,
      [
        'emulators:exec',
        '--config',
        configPath,
        '--only',
        'auth,firestore,functions,storage',
        '--project',
        'rands-local',
        `${process.execPath} scripts/run-browser-e2e.mjs --inside-emulators`,
      ],
      { env },
    );
    if (code !== 0) process.exitCode = code;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
};

try {
  if (process.argv.includes('--inside-emulators')) await inner();
  else await outer();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
