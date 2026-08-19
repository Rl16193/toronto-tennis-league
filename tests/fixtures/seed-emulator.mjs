import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import { LOCAL_FIXTURES } from './local-fixtures.mjs';

const projectId = process.env.FIREBASE_EMULATOR_PROJECT_ID || 'rands-local';
if (projectId !== 'rands-local') throw new Error(`Refusing to seed non-local project: ${projectId}`);

const here = fileURLToPath(new URL('.', import.meta.url));
const rules = await readFile(resolve(here, '../../firestore.rules'), 'utf8');
const testEnv = await initializeTestEnvironment({
  projectId,
  firestore: { host: '127.0.0.1', port: 8080, rules },
});

try {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all(LOCAL_FIXTURES.map(({ path, data }) => setDoc(doc(db, path), data)));
  });
  console.log(`Seeded ${LOCAL_FIXTURES.length} synthetic Firestore documents into ${projectId}.`);
} finally {
  await testEnv.cleanup();
}
