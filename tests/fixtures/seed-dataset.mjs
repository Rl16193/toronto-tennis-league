/**
 * Seed the sample dataset built by `scripts/build-sample-dataset.mjs` into the LOCAL emulator.
 *
 *   npm run seed:dataset
 *   node tests/fixtures/seed-dataset.mjs --dir tests/fixtures/dataset
 *
 * This is the volume tier. `seed-emulator.mjs` seeds the small canonical set from
 * `local-fixtures.mjs`; this seeds ~3,200 documents transformed from the live snapshot, so the UI
 * can be driven against realistic brackets, leaderboards, rosters and notification counts.
 *
 * LOCAL ONLY, BY CONSTRUCTION. The same guards as `seed-emulator.mjs`: the project must be
 * `rands-local` and both emulator hosts must be loopback. There is no flag to point this at a
 * cloud project — seeding `racquets-and-strings` writes to a real Firebase project and is a
 * deliberate act that belongs in a reviewed script, not a convenience default.
 *
 * Auth users are created for every member uid so the UI can be signed in as any of them. Every
 * account shares one local password, printed at the end.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const argOf = (flag, fallback) => {
  const index = process.argv.indexOf(flag);
  return index === -1 ? fallback : process.argv[index + 1];
};
const datasetDir = path.resolve(root, argOf('--dir', 'tests/fixtures/dataset'));
export const LOCAL_PASSWORD = 'local-dataset-123!';

const projectId = process.env.FIREBASE_EMULATOR_PROJECT_ID || process.env.GCLOUD_PROJECT || 'rands-local';
if (projectId !== 'rands-local') throw new Error(`Refusing to seed non-local project: ${projectId}`);

const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
if (!/^(localhost|127\.0\.0\.1):\d+$/.test(authHost))
  throw new Error(`Refusing Auth seed outside localhost: ${authHost}`);
const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
if (!/^(localhost|127\.0\.0\.1):\d+$/.test(firestoreHost))
  throw new Error(`Refusing Firestore seed outside localhost: ${firestoreHost}`);

process.env.FIREBASE_AUTH_EMULATOR_HOST = authHost;
process.env.FIRESTORE_EMULATOR_HOST = firestoreHost;
process.env.GCLOUD_PROJECT = projectId;
process.env.GOOGLE_CLOUD_PROJECT = projectId;

if (!existsSync(datasetDir)) {
  throw new Error(`No dataset at ${datasetDir}. Build it first: node scripts/build-sample-dataset.mjs`);
}

/**
 * Firestore Timestamps survive the JSON export as `{_seconds, _nanoseconds}`. Written back as
 * plain maps they would break every `.toDate()` in the UI, so rehydrate them on the way in.
 */
let rehydrated = 0;
const revive = (value) => {
  if (Array.isArray(value)) return value.map(revive);
  if (value && typeof value === 'object') {
    if (typeof value._seconds === 'number' && typeof value._nanoseconds === 'number') {
      rehydrated += 1;
      return new Timestamp(value._seconds, value._nanoseconds);
    }
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, revive(child)]));
  }
  return value;
};

const app = initializeApp({ projectId }, 'dataset-seed');
const db = getFirestore(app);
const auth = getAuth(app);

try {
  const files = readdirSync(datasetDir).filter((name) => name.endsWith('.json') && !name.startsWith('_'));
  const documents = [];
  for (const file of files) {
    for (const row of JSON.parse(readFileSync(path.join(datasetDir, file), 'utf8'))) {
      documents.push({ path: row.path, data: revive(row.data) });
    }
  }

  // Auth accounts, so the UI can sign in as any seeded member.
  const members = JSON.parse(readFileSync(path.join(datasetDir, 'users.json'), 'utf8'));
  const contacts = new Map(
    JSON.parse(readFileSync(path.join(datasetDir, 'contacts.json'), 'utf8')).map((row) => [row.data.uid, row.data]),
  );
  // An email may only belong to one account. The dataset builder guarantees unique personas, but a
  // live snapshot can still carry two uids sharing one address, and `--real-names` passes those
  // straight through. Fall back to a uid-derived address rather than letting one clash abort the
  // run — and report it, because a member who cannot be signed in as is a hole in the test data.
  let created = 0;
  const emailClashes = [];
  const claimed = new Set();
  for (const { data } of members) {
    const uid = data.uid;
    if (!uid) continue;
    const preferred = contacts.get(uid)?.email || `${uid.toLowerCase()}@example.invalid`;
    let email = preferred;
    if (claimed.has(email)) {
      email = `${uid.toLowerCase()}@example.invalid`;
      emailClashes.push(`${uid} wanted ${preferred}`);
    }
    claimed.add(email);
    const displayName = data.name || uid;
    try {
      await auth.createUser({ uid, email, password: LOCAL_PASSWORD, displayName });
      created += 1;
    } catch (error) {
      if (error?.code !== 'auth/uid-already-exists' && error?.code !== 'auth/email-already-exists') throw error;
      // `updateUser` needs the uid to exist. If the EMAIL was the clash, the uid may never have been
      // created, so fall back to a uid-derived address instead of updating an account that is not there.
      try {
        await auth.updateUser(uid, { email, password: LOCAL_PASSWORD, displayName });
      } catch (retry) {
        if (retry?.code !== 'auth/user-not-found') throw retry;
        const fallback = `${uid.toLowerCase()}@example.invalid`;
        emailClashes.push(`${uid} wanted ${email}`);
        await auth.createUser({ uid, email: fallback, password: LOCAL_PASSWORD, displayName });
        created += 1;
      }
    }
  }

  // Firestore caps a batch at 500 writes.
  const CHUNK = 400;
  for (let index = 0; index < documents.length; index += CHUNK) {
    const batch = db.batch();
    for (const { path: docPath, data } of documents.slice(index, index + CHUNK)) batch.set(db.doc(docPath), data);
    await batch.commit();
  }

  const manifest = JSON.parse(readFileSync(path.join(datasetDir, '_manifest.json'), 'utf8'));
  console.log(`Seeded ${documents.length} documents and ${members.length} Auth accounts into ${projectId}.`);
  console.log(`  source        ${manifest.builtFrom} (${manifest.sourceProject})`);
  console.log(`  pseudonymised ${manifest.pseudonymised}`);
  console.log(`  rehydrated    ${rehydrated} Firestore Timestamps`);
  console.log(`  new accounts  ${created} (${members.length - created} already existed and were updated)`);
  if (emailClashes.length) {
    console.log(
      `  email clashes ${emailClashes.length} fell back to a uid-derived address: ${emailClashes.slice(0, 5).join(', ')}`,
    );
  }
  console.log(`\nSign in as any member with the password: ${LOCAL_PASSWORD}`);
  for (const { data } of members.slice(0, 3)) {
    console.log(`  ${(contacts.get(data.uid)?.email || '—').padEnd(34)} ${data.name}`);
  }
} finally {
  await deleteApp(app);
}
