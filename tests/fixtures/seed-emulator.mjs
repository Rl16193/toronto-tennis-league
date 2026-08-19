import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import { LOCAL_AUTH_FIXTURES, LOCAL_FIXTURES } from './local-fixtures.mjs';

const projectId = process.env.FIREBASE_EMULATOR_PROJECT_ID || 'rands-local';
if (projectId !== 'rands-local') throw new Error(`Refusing to seed non-local project: ${projectId}`);

// Admin SDK must be pinned to the Auth emulator before initialization. Without this guard, a
// missing emulator variable could turn a convenient local seed command into a cloud write.
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
if (!/^(localhost|127\.0\.0\.1):\d+$/.test(authHost)) {
  throw new Error(`Refusing Auth seed outside localhost: ${authHost}`);
}
process.env.FIREBASE_AUTH_EMULATOR_HOST = authHost;
process.env.GCLOUD_PROJECT = projectId;
process.env.GOOGLE_CLOUD_PROJECT = projectId;

const here = fileURLToPath(new URL('.', import.meta.url));
const rules = await readFile(resolve(here, '../../firestore.rules'), 'utf8');
const testEnv = await initializeTestEnvironment({
  projectId,
  firestore: { host: '127.0.0.1', port: 8080, rules },
});
const authApp = initializeApp({ projectId }, 'local-seed');
const auth = getAuth(authApp);

try {
  await Promise.all(LOCAL_AUTH_FIXTURES.map(async (fixture) => {
    try {
      await auth.createUser(fixture);
    } catch (error) {
      if (error?.code !== 'auth/uid-already-exists') throw error;
      await auth.updateUser(fixture.uid, fixture);
    }
  }));
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all(LOCAL_FIXTURES.map(({ path, data }) => setDoc(doc(db, path), data)));
  });
  console.log(`Seeded ${LOCAL_AUTH_FIXTURES.length} synthetic Auth users and ${LOCAL_FIXTURES.length} Firestore documents into ${projectId}.`);
} finally {
  await testEnv.cleanup();
  await deleteApp(authApp);
}
