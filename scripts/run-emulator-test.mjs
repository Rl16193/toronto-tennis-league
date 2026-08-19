import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const service = process.argv[2];
const testFiles = {
  firestore: 'tests/rules/firestore.rules.test.mjs',
  storage: 'tests/rules/storage.rules.test.mjs',
};

if (!testFiles[service]) {
  console.error('Usage: node scripts/run-emulator-test.mjs <firestore|storage>');
  process.exit(2);
}

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

const withJavaOnPath = () => {
  const homebrewJava = '/opt/homebrew/opt/openjdk@21/bin';
  if (existsSync(path.join(homebrewJava, 'java'))) return `${homebrewJava}${path.delimiter}${process.env.PATH || ''}`;
  const javaHomeBin = process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin') : '';
  if (javaHomeBin && existsSync(path.join(javaHomeBin, 'java')))
    return `${javaHomeBin}${path.delimiter}${process.env.PATH || ''}`;
  return process.env.PATH;
};

const main = async () => {
  const port = await freePort();
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'rands-emulator-'));
  const configPath = path.join(tempDir, 'firebase.json');
  const config = {
    emulators: {
      [service]: { host: '127.0.0.1', port },
    },
    firestore: { rules: path.join(root, 'firestore.rules') },
    storage: { rules: path.join(root, 'storage.rules') },
  };

  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);

  const env = {
    ...process.env,
    PATH: withJavaOnPath(),
  };
  if (existsSync('/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home/bin/java')) {
    env.JAVA_HOME = '/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home';
  }
  if (service === 'storage') {
    env.STORAGE_EMULATOR_HOST = '127.0.0.1';
    env.STORAGE_EMULATOR_PORT = String(port);
  }

  const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const child = spawn(
    command,
    [
      '-y',
      'firebase-tools@latest',
      'emulators:exec',
      '--config',
      configPath,
      '--only',
      service,
      '--project',
      'rands-local',
      `node --test ${testFiles[service]}`,
    ],
    { cwd: root, env, stdio: 'inherit' },
  );

  const exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve(code ?? (signal ? 1 : 0)));
  });
  await rm(tempDir, { recursive: true, force: true });
  process.exitCode = exitCode;
};

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
