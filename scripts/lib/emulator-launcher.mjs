import { readFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';

export const LOCAL_PROJECT_ID = 'rands-local';
export const EMULATOR_NAMES = ['auth', 'firestore', 'functions', 'storage', 'hosting', 'ui'];

export const parseLauncherArgs = (args) => {
  let configPath = 'firebase.json';
  // Default is to move around a busy port. `--strict-ports` restores the old behaviour of
  // refusing to start, which is what CI wants: there, a busy port means something is already
  // running that should not be, and silently using a different one hides it.
  let strictPorts = false;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--config' && args[index + 1]) {
      configPath = args[index + 1];
      index += 1;
      continue;
    }
    if (args[index] === '--strict-ports') {
      strictPorts = true;
      continue;
    }
    throw new Error('Usage: npm run emulators -- [--config path/to/local.firebase.json] [--strict-ports]');
  }
  return { configPath, strictPorts };
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

/**
 * First free port at or above `from`, skipping anything in `taken`.
 *
 * `taken` matters: the emulators are resolved as a set, so a port handed to `auth` must not then
 * be handed to `firestore` just because nothing is listening on it yet.
 */
export const findAvailablePort = async (from, taken = new Set(), check = isPortAvailable, span = 200) => {
  for (let port = from; port < from + span; port += 1) {
    if (taken.has(port)) continue;
    // eslint-disable-next-line no-await-in-loop -- probing in parallel would race on `taken`.
    if (await check(port)) return port;
  }
  return null;
};

/**
 * Resolve every emulator onto a port that is actually free, keeping the configured port wherever
 * possible. Returns the full set plus whichever entries had to move, so the caller can report it.
 */
export const resolveEmulatorPorts = async (ports, check = isPortAvailable) => {
  const taken = new Set();
  const resolved = [];
  const moved = [];
  const unresolved = [];
  for (const entry of ports) {
    // eslint-disable-next-line no-await-in-loop -- each decision feeds `taken` for the next.
    const port = (await check(entry.port)) && !taken.has(entry.port) ? entry.port : await findAvailablePort(entry.port + 1, taken, check);
    if (port === null) {
      unresolved.push(entry);
      continue;
    }
    taken.add(port);
    resolved.push({ ...entry, port });
    if (port !== entry.port) moved.push({ name: entry.name, from: entry.port, to: port });
  }
  return { resolved, moved, unresolved };
};

/** Apply resolved ports back onto a parsed firebase.json, leaving everything else untouched. */
export const applyResolvedPorts = (config, resolved) => {
  const next = { ...config, emulators: { ...(config.emulators || {}) } };
  for (const { name, port } of resolved) {
    next.emulators[name] = { ...(next.emulators[name] || {}), port };
  }
  return next;
};

export const portMoveMessage = (moved) =>
  [
    `Some configured emulator ports were busy, so the suite moved to free ones:`,
    ...moved.map(({ name, from, to }) => `  ${name}: ${from} -> ${to}`),
    '',
    'Point other tools at the new ports:',
    ...moved
      .filter(({ name }) => name === 'firestore' || name === 'auth')
      .map(({ name, to }) =>
        name === 'firestore' ? `  FIRESTORE_EMULATOR_HOST=127.0.0.1:${to}` : `  FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:${to}`,
      ),
    'Run with --strict-ports to refuse to start instead of moving.',
  ].join('\n');

export const portConflictMessage = (conflicts, configPath) => {
  const details = conflicts.map(({ name, port }) => `${name}:${port}`).join(', ');
  return [
    `Cannot start the local Emulator Suite because these ports are unavailable: ${details}.`,
    'Stop the local processes using those ports, or copy firebase.json to a local ignored file and change only emulators.*.port.',
    `Then run: npm run emulators -- --config ${configPath === 'firebase.json' ? 'firebase.local.json' : configPath}`,
    'The launcher still forces the synthetic rands-local project; alternate configs do not change the Firebase target.',
  ].join('\n');
};
