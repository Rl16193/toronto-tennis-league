import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, beforeEach, describe, test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';

const here = dirname(fileURLToPath(import.meta.url));
const rules = await readFile(resolve(here, '../../storage.rules'), 'utf8');
const bucket = 'gs://rands-local.appspot.com';
const storageHost = (process.env.STORAGE_EMULATOR_HOST || '127.0.0.1')
  .replace(/^https?:\/\//, '')
  .replace(/:\d+$/, '');
const storagePort = Number(process.env.STORAGE_EMULATOR_PORT || 9199);

let testEnv;

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'rands-local',
    storage: { host: storageHost, port: storagePort, rules },
  });
});

after(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearStorage();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const storage = context.storage(bucket);
    await Promise.all([
      storage.ref('avatars/member-a/avatar.png').putString('avatar', 'raw', { contentType: 'image/png' }),
      storage.ref('listings/member-a/racquet.png').putString('listing', 'raw', { contentType: 'image/png' }),
      storage.ref('court_reports/member-a/report.png').putString('report', 'raw', { contentType: 'image/png' }),
    ]);
  });
});

describe('Cloud Storage authorization boundaries', () => {
  test('known public assets are readable without authentication', async () => {
    const publicContext = testEnv.unauthenticatedContext();

    await assertSucceeds(publicContext.storage(bucket).ref('avatars/member-a/avatar.png').getMetadata());
    await assertSucceeds(publicContext.storage(bucket).ref('listings/member-a/racquet.png').getMetadata());
  });

  test('member reports are readable only by their owner', async () => {
    const owner = testEnv.authenticatedContext('member-a');
    const other = testEnv.authenticatedContext('member-b');
    const unauthenticated = testEnv.unauthenticatedContext();
    const path = 'court_reports/member-a/report.png';

    await assertSucceeds(owner.storage(bucket).ref(path).getMetadata());
    await assertFails(other.storage(bucket).ref(path).getMetadata());
    await assertFails(unauthenticated.storage(bucket).ref(path).getMetadata());
  });

  test('anonymous reporters can write only to the anonymous report prefix', async () => {
    const unauthenticated = testEnv.unauthenticatedContext();
    const storage = unauthenticated.storage(bucket);

    await assertSucceeds(storage.ref('court_reports/anon/report.png').putString('report', 'raw', { contentType: 'image/png' }));
    await assertFails(storage.ref('court_reports/member-a/unauthorized.png').putString('report', 'raw', { contentType: 'image/png' }));
  });

  test('owned uploads require image content and the five megabyte limit', async () => {
    const owner = testEnv.authenticatedContext('member-a');
    const other = testEnv.authenticatedContext('member-b');

    await assertFails(owner.storage(bucket).ref('avatars/member-a/not-an-image.txt').putString('text', 'raw', {
      contentType: 'text/plain',
    }));
    await assertFails(other.storage(bucket).ref('avatars/member-a/not-owned.png').putString('image', 'raw', {
      contentType: 'image/png',
    }));
    await assertFails(owner.storage(bucket).ref('court_reports/member-a/too-large.png').putString(
      'x'.repeat(5 * 1024 * 1024),
      'raw',
      { contentType: 'image/png' },
    ));
  });
});
