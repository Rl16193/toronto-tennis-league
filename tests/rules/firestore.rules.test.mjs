import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, beforeEach, describe, test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

const here = dirname(fileURLToPath(import.meta.url));
const rules = await readFile(resolve(here, '../../firestore.rules'), 'utf8');

let testEnv;

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'rands-local',
    firestore: { rules },
  });
});

after(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

const dbFor = (uid) => testEnv.authenticatedContext(uid).firestore();

describe('Firestore authorization boundaries', () => {
  test('a member cannot self-assign event_creator on preferences', async () => {
    const db = dbFor('member-a');
    const preferences = doc(db, 'preferences/member-a');

    await assertSucceeds(setDoc(preferences, { uid: 'member-a', event_creator: false }));
    await assertSucceeds(updateDoc(preferences, { preferred_zone: 'north' }));
    await assertFails(updateDoc(preferences, { event_creator: true }));
    await assertFails(updateDoc(preferences, { stringer: true, stringer_id: 'provider-a' }));
    await assertFails(updateDoc(preferences, { coach: true, coach_id: 'coach-a' }));
  });

  test('member preference creation rejects role and UID fields', async () => {
    const db = dbFor('member-a');

    await assertFails(setDoc(doc(db, 'preferences/member-a'), {
      uid: 'member-a',
      event_creator: false,
      stringer: true,
      stringer_id: 'provider-a',
    }));
    await assertFails(setDoc(doc(db, 'preferences/member-a'), {
      uid: 'other-member',
      event_creator: false,
    }));
  });

  test('contact documents require owner writes and protected reads', async () => {
    const ownerDb = dbFor('owner-a');
    const otherDb = dbFor('other-b');
    const contacts = doc(ownerDb, 'contacts/owner-a');
    const contactData = {
      email: 'owner-a@example.invalid',
      phone: '+14165550100',
      preferred_mode_of_contact: 'email',
      contactable: true,
      updated_at: '2026-01-01T00:00:00.000Z',
    };

    await assertSucceeds(setDoc(contacts, contactData));
    await assertFails(getDoc(doc(otherDb, 'contacts/owner-a')));
    await assertFails(updateDoc(doc(otherDb, 'contacts/owner-a'), { phone: '+14165550101' }));
  });

  test('clients cannot create server-maintained connection markers', async () => {
    const db = dbFor('member-a');

    await assertFails(setDoc(doc(db, 'connections/member-a__member-b'), {
      uids: ['member-a', 'member-b'],
      reason: 'test',
    }));
  });

  test('task owners can write allowlisted progress but cannot mint points', async () => {
    const db = dbFor('member-a');
    const tasks = doc(db, 'tasks/member-a');

    await assertSucceeds(setDoc(tasks, {
      uid: 'member-a',
      name: 'Member A',
      updatedAt: '2026-01-01T00:00:00.000Z',
      profileComplete: true,
    }));
    await assertFails(updateDoc(tasks, { bonusPoints: 99 }));
  });

  test('member-owned stats cannot be used to write league points', async () => {
    const db = dbFor('member-a');
    const stats = doc(db, 'stats/member-a');

    await assertSucceeds(setDoc(stats, {
      uid: 'member-a',
      leaguePoints26: 0,
      wins: 0,
      loses: 0,
      matchesPlayed: 0,
      tournamentsPlayed: 0,
    }));
    await assertFails(updateDoc(stats, { leaguePoints26: 1 }));
  });

  test('member-owned stats cannot substitute another UID', async () => {
    const db = dbFor('member-a');
    const stats = doc(db, 'stats/member-a');

    await assertSucceeds(setDoc(stats, {
      uid: 'member-a',
      leaguePoints26: 0,
      wins: 0,
      loses: 0,
      matchesPlayed: 0,
      tournamentsPlayed: 0,
    }));
    await assertFails(updateDoc(stats, { uid: 'other-member' }));
    await assertFails(setDoc(doc(db, 'stats/other-member'), {
      uid: 'member-a',
      leaguePoints26: 0,
      wins: 0,
      loses: 0,
      matchesPlayed: 0,
      tournamentsPlayed: 0,
    }));
  });

  test('admin metrics are not readable by a normal member', async () => {
    const memberDb = dbFor('member-a');
    const adminDb = dbFor('7PvfzNtDmsOq5GLMieId7QRT7wH3');
    const metrics = doc(memberDb, 'admin_stats/current');

    await assertFails(getDoc(metrics));
    await assertSucceeds(getDoc(doc(adminDb, 'admin_stats/current')));
  });
});
