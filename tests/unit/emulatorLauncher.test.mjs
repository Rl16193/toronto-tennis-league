import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyResolvedPorts,
  findPortConflicts,
  parseLauncherArgs,
  portConflictMessage,
  resolveEmulatorPorts,
} from '../../scripts/lib/emulator-launcher.mjs';

test('launcher accepts only an alternate local config path', () => {
  assert.deepEqual(parseLauncherArgs([]), { configPath: 'firebase.json', strictPorts: false });
  assert.deepEqual(parseLauncherArgs(['--config', 'firebase.local.json']), {
    configPath: 'firebase.local.json',
    strictPorts: false,
  });
  assert.throws(() => parseLauncherArgs(['--project', 'production-project']), /Usage:/);
});

test('port conflict detection reports every unavailable emulator port', async () => {
  const ports = [
    { name: 'auth', port: 9099 },
    { name: 'firestore', port: 8080 },
  ];
  const conflicts = await findPortConflicts(ports, async (port) => port !== 8080);
  assert.deepEqual(conflicts, [{ name: 'firestore', port: 8080 }]);
});

test('port conflict guidance preserves the synthetic Firebase target', () => {
  const message = portConflictMessage([{ name: 'auth', port: 9099 }], 'firebase.json');
  assert.match(message, /auth:9099/);
  assert.match(message, /firebase\.local\.json/);
  assert.match(message, /rands-local/);
});

test('busy emulator ports resolve to free ones instead of blocking the suite', async () => {
  // 8080 and 9099 busy — the exact situation a stale emulator process leaves behind.
  const busy = new Set([8080, 9099]);
  const check = async (port) => !busy.has(port);
  const { resolved, moved, unresolved } = await resolveEmulatorPorts(
    [
      { name: 'auth', port: 9099 },
      { name: 'firestore', port: 8080 },
      { name: 'functions', port: 5001 },
    ],
    check,
  );
  assert.deepEqual(unresolved, []);
  assert.deepEqual(
    resolved.map((entry) => entry.name),
    ['auth', 'firestore', 'functions'],
  );
  assert.deepEqual(moved, [
    { name: 'auth', from: 9099, to: 9100 },
    { name: 'firestore', from: 8080, to: 8081 },
  ]);
  // An untouched port keeps its configured value.
  assert.equal(resolved.find((entry) => entry.name === 'functions').port, 5001);
});

test('two emulators never resolve onto the same port', async () => {
  // Both configured on 5000, nothing listening. Without the taken-set the second would be
  // handed 5000 as well, and the suite would fail to bind after the launcher said it was fine.
  const { resolved, moved } = await resolveEmulatorPorts(
    [
      { name: 'hosting', port: 5000 },
      { name: 'ui', port: 5000 },
    ],
    async () => true,
  );
  assert.deepEqual(
    resolved.map((entry) => entry.port),
    [5000, 5001],
  );
  assert.deepEqual(moved, [{ name: 'ui', from: 5000, to: 5001 }]);
});

test('resolved ports are written back onto the config without disturbing anything else', () => {
  const config = { hosting: { public: 'dist' }, emulators: { firestore: { port: 8080 }, ui: { enabled: true, port: 4000 } } };
  const next = applyResolvedPorts(config, [{ name: 'firestore', port: 8081 }]);
  assert.equal(next.emulators.firestore.port, 8081);
  assert.equal(next.emulators.ui.port, 4000, 'untouched emulator keeps its port');
  assert.equal(next.emulators.ui.enabled, true, 'sibling keys survive');
  assert.deepEqual(next.hosting, { public: 'dist' }, 'non-emulator config is untouched');
  assert.equal(config.emulators.firestore.port, 8080, 'the source object is not mutated');
});

test('--strict-ports keeps the old refuse-to-start behaviour for CI', () => {
  assert.equal(parseLauncherArgs([]).strictPorts, false);
  assert.equal(parseLauncherArgs(['--strict-ports']).strictPorts, true);
  assert.equal(parseLauncherArgs(['--config', 'firebase.local.json', '--strict-ports']).configPath, 'firebase.local.json');
});
