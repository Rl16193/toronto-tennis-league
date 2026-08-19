import assert from 'node:assert/strict';
import test from 'node:test';
import { findPortConflicts, parseLauncherArgs, portConflictMessage } from '../../scripts/lib/emulator-launcher.mjs';

test('launcher accepts only an alternate local config path', () => {
  assert.deepEqual(parseLauncherArgs([]), { configPath: 'firebase.json' });
  assert.deepEqual(parseLauncherArgs(['--config', 'firebase.local.json']), {
    configPath: 'firebase.local.json',
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
