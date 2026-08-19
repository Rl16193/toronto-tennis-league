import { readFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';

export const LOCAL_PROJECT_ID = 'rands-local';
export const EMULATOR_NAMES = ['auth', 'firestore', 'functions', 'storage', 'hosting', 'ui'];

export const parseLauncherArgs = (args) => {
  let configPath = 'firebase.json';
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--config' && args[index + 1]) {
      configPath = args[index + 1];
      index += 1;
      continue;
    }
    throw new Error('Usage: npm run emulators -- [--config path/to/local.firebase.json]');
  }
  return { configPath };
};

export const readEmulatorPorts = async (root, configPath) => {
  const resolved = path.resolve(root, configPath);
  const config = JSON.parse(await readFile(resolved, 'utf8'));
  const ports = EMULATOR_NAMES.flatMap((name) => {
    const port = config.emulators?.[name]?.port;
    return Number.isInteger(port) ? [{ name, port }] : [];
  });
  if (!ports.length) throw new Error(`${configPath} does not define any emulator ports.`);
  return { configPath: resolved, ports };
};

export const isPortAvailable = (port, host = '127.0.0.1') =>
  new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', (error) => {
      if (error.code === 'EADDRINUSE' || error.code === 'EACCES') resolve(false);
      else reject(error);
    });
    server.listen(port, host, () => server.close((error) => (error ? reject(error) : resolve(true))));
  });

export const findPortConflicts = async (ports, check = isPortAvailable) => {
  const results = await Promise.all(ports.map(async (entry) => ({ ...entry, available: await check(entry.port) })));
  return results.filter(({ available }) => !available).map(({ available: _available, ...entry }) => entry);
};

export const portConflictMessage = (conflicts, configPath) => {
  const details = conflicts.map(({ name, port }) => `${name}:${port}`).join(', ');
  return [
    `Cannot start the local Emulator Suite because these ports are unavailable: ${details}.`,
    'Stop the local processes using those ports, or copy firebase.json to a local ignored file and change only emulators.*.port.',
    `Then run: npm run emulators -- --config ${configPath === 'firebase.json' ? 'firebase.local.json' : configPath}`,
    'The launcher still forces the synthetic rands-local project; alternate configs do not change the Firebase target.',
  ].join('\n');
};
