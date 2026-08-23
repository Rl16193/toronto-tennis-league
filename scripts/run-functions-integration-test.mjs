import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
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
      if (!address || typeof address === 'string')
        return server.close(() => reject(new Error('Could not allocate emulator port.')));
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

const main = async () => {
  const [authPort, firestorePort, functionsPort, hubPort, loggingPort, eventarcPort, tasksPort] = await freePorts(7);
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'rands-functions-integration-'));
  const sourceDir = path.join(tempDir, 'functions');
  const configPath = path.join(tempDir, 'firebase.json');
  await mkdir(sourceDir);
  await symlink(path.join(root, 'functions', 'node_modules'), path.join(sourceDir, 'node_modules'));
  await writeFile(
    path.join(sourceDir, 'package.json'),
    `${JSON.stringify({ private: true, main: 'index.js', engines: { node: '22' } })}\n`,
  );
  await writeFile(
    path.join(sourceDir, 'index.js'),
    [
      "const admin = require('firebase-admin');",
      'admin.initializeApp();',
      `Object.assign(exports, require(${JSON.stringify(path.join(root, 'functions', 'rewards.js'))}));`,
      `Object.assign(exports, require(${JSON.stringify(path.join(root, 'functions', 'friendlyPoints.js'))}));`,
      `Object.assign(exports, require(${JSON.stringify(path.join(root, 'functions', 'taskPoints.js'))}));`,
      `Object.assign(exports, require(${JSON.stringify(path.join(root, 'functions', 'accountLookup.js'))}));`,
      ...(existsSync(path.join(root, 'functions', 'tournamentResults.js'))
        ? [`Object.assign(exports, require(${JSON.stringify(path.join(root, 'functions', 'tournamentResults.js'))}));`]
        : []),
      '',
    ].join('\n'),
  );
  await writeFile(
    configPath,
    `${JSON.stringify(
      {
        functions: { source: 'functions' },
        firestore: { rules: path.join(root, 'firestore.rules') },
        emulators: {
          auth: { host: '127.0.0.1', port: authPort },
          firestore: { host: '127.0.0.1', port: firestorePort },
          functions: { host: '127.0.0.1', port: functionsPort },
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
  const homebrewJava = '/opt/homebrew/opt/openjdk@21';
  const javaHome = path.join(homebrewJava, 'libexec/openjdk.jdk/Contents/Home');
  const env = {
    ...process.env,
    FIREBASE_AUTH_EMULATOR_HOST: `127.0.0.1:${authPort}`,
    FIREBASE_EMULATOR_PROJECT_ID: 'rands-functions-test',
    FIRESTORE_EMULATOR_HOST: `127.0.0.1:${firestorePort}`,
    FUNCTIONS_EMULATOR_HOST: `127.0.0.1:${functionsPort}`,
    GCLOUD_PROJECT: 'rands-functions-test',
    GOOGLE_CLOUD_PROJECT: 'rands-functions-test',
    PATH: existsSync(path.join(homebrewJava, 'bin/java'))
      ? `${path.join(homebrewJava, 'bin')}${path.delimiter}${process.env.PATH || ''}`
      : process.env.PATH,
  };
  if (existsSync(path.join(javaHome, 'bin/java'))) env.JAVA_HOME = javaHome;
  const firebase = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'firebase.cmd' : 'firebase');
  const child = spawn(
    firebase,
    [
      'emulators:exec',
      '--config',
      configPath,
      '--only',
      'auth,firestore,functions',
      '--project',
      'rands-functions-test',
      'node --test --test-concurrency=1 tests/integration/functions.emulator.test.mjs',
    ],
    { cwd: root, env, stdio: 'inherit' },
  );
  try {
    process.exitCode = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code, signal) => resolve(code ?? (signal ? 1 : 0)));
    });
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
