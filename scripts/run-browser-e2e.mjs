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
const freePorts = async (count) => {
  const ports = [];
  while (ports.length < count) {
    const port = await freePort();
    if (!ports.includes(port)) ports.push(port);
  }
  return ports;
};

const waitForHttp = async (url, timeoutMs = 30_000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
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

const waitForCallable = async (url, timeoutMs = 30_000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ data: { email: 'readiness@example.invalid' } }),
      });
      if (response.status < 500) return;
    } catch {
      // The callable container is still starting; retry until the bounded deadline.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for callable ${url}.`);
};

const run = (command, args, options = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: 'inherit', ...options });
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve(code ?? (signal ? 1 : 0)));
  });

const inner = async () => {
  const seedCode = await run(process.execPath, ['tests/fixtures/seed-emulator.mjs'], { env: process.env });
  if (seedCode !== 0) throw new Error('Synthetic emulator seeding failed.');

  await waitForHttp(process.env.PLAYWRIGHT_BASE_URL);
  await waitForCallable(process.env.RANDS_E2E_SIGNUP_LOOKUP_URL);
  const code = await run(executable('playwright'), ['test'], { env: process.env });
  if (code !== 0) throw new Error('Playwright browser smoke failed.');
};

const outer = async () => {
  const firebase = executable('firebase');
  if (!existsSync(firebase)) throw new Error('Firebase CLI is missing. Run npm ci.');
  const [
    authPort,
    firestorePort,
    functionsPort,
    storagePort,
    hostingPort,
    hubPort,
    loggingPort,
    eventarcPort,
    tasksPort,
  ] = await freePorts(9);
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
      dependencies: { 'firebase-admin': '12.7.0', 'firebase-functions': '7.3.2' },
    })}\n`,
  );
  const buildEnv = {
    ...process.env,
    VITE_FIREBASE_API_KEY: 'synthetic-api-key',
    VITE_FIREBASE_AUTH_DOMAIN: 'rands-local.firebaseapp.com',
    VITE_FIREBASE_PROJECT_ID: 'rands-local',
    VITE_FIREBASE_STORAGE_BUCKET: 'rands-local.appspot.com',
    VITE_FIREBASE_MESSAGING_SENDER_ID: '1234567890',
    VITE_FIREBASE_APP_ID: '1:1234567890:web:synthetic',
    VITE_USE_FIREBASE_EMULATORS: 'true',
    VITE_FIREBASE_EMULATOR_HOST: '127.0.0.1',
    VITE_FIREBASE_AUTH_EMULATOR_PORT: String(authPort),
    VITE_FIRESTORE_EMULATOR_PORT: String(firestorePort),
    VITE_FUNCTIONS_EMULATOR_PORT: String(functionsPort),
    VITE_FIREBASE_STORAGE_EMULATOR_PORT: String(storagePort),
  };
  const buildCode = await run(executable('vite'), ['build'], { env: buildEnv });
  if (buildCode !== 0) throw new Error('Browser emulator build failed.');
  await symlink(path.join(root, 'dist'), path.join(tempDir, 'dist'));
  await writeFile(
    path.join(functionsDir, 'index.js'),
    [
      "require('firebase-admin').initializeApp();",
      `Object.assign(exports, require(${JSON.stringify(path.join(root, 'functions', 'accountLookup.js'))}));`,
      `Object.assign(exports, require(${JSON.stringify(path.join(root, 'functions', 'tournamentResults.js'))}));`,
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
        hosting: {
          public: 'dist',
          headers: [
            {
              source: '**',
              headers: [
                { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
                { key: 'Cache-Control', value: 'no-cache' },
              ],
            },
            { source: '/assets/**', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
          ],
          rewrites: [{ source: '**', destination: '/index.html' }],
        },
        emulators: {
          auth: { host: '127.0.0.1', port: authPort },
          firestore: { host: '127.0.0.1', port: firestorePort },
          functions: { host: '127.0.0.1', port: functionsPort },
          storage: { host: '127.0.0.1', port: storagePort },
          hosting: { host: '127.0.0.1', port: hostingPort },
          hub: { host: '127.0.0.1', port: hubPort },
          logging: { host: '127.0.0.1', port: loggingPort },
          eventarc: { host: '127.0.0.1', port: eventarcPort },
          tasks: { host: '127.0.0.1', port: tasksPort },
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
    PLAYWRIGHT_BASE_URL: `http://127.0.0.1:${hostingPort}`,
    RANDS_E2E_SIGNUP_LOOKUP_URL: `http://127.0.0.1:${functionsPort}/rands-local/us-central1/checkSignupEmail`,
    RANDS_E2E_EVIDENCE_DIR: process.env.RANDS_E2E_EVIDENCE_DIR || path.join(root, 'test-results', 'browser-evidence'),
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
        'auth,firestore,functions,storage,hosting',
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
