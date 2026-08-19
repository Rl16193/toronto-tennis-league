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
const anonDb = () => testEnv.unauthenticatedContext().firestore();

const seedDoc = async (path, data) => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), path), data);
  });
};

describe('Firestore authorization boundaries', () => {
  test('profile bootstrap can create the expected owner-scoped documents but not protected fields', async () => {
    const db = dbFor('member-a');

    await assertSucceeds(setDoc(doc(db, 'users/member-a'), {
      uid: 'member-a',
      name: 'Member A',
      avatar: '',
      created_at: '2026-01-01T00:00:00.000Z',
    }));

    await assertSucceeds(setDoc(doc(db, 'preferences/member-a'), {
      uid: 'member-a',
      event_creator: false,
      preferred_courts: ['synthetic-court'],
      preferred_zone: 'north',
      email_notifications: true,
    }));

    await assertSucceeds(setDoc(doc(db, 'stats/member-a'), {
      uid: 'member-a',
      name: 'Member A',
      leaguePoints26: 0,
      wins: 0,
      loses: 0,
      matchesPlayed: 0,
      tournamentsPlayed: 0,
    }));

    await assertSucceeds(setDoc(doc(db, 'tasks/member-a'), {
      uid: 'member-a',
      name: 'Member A',
      profileComplete: true,
      updatedAt: '2026-01-01T00:00:00.000Z',
    }));

    await assertSucceeds(setDoc(doc(db, 'contacts/member-a'), {
      email: 'member-a@example.invalid',
      phone: '+14165550100',
      preferred_mode_of_contact: 'email',
      contactable: true,
      updated_at: '2026-01-01T00:00:00.000Z',
    }));

    await assertFails(setDoc(doc(db, 'users/member-b'), {
      uid: 'member-b',
      name: 'Member B',
      avatar: '',
      created_at: '2026-01-01T00:00:00.000Z',
    }));
  });

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

  test('contacts become readable to a connected opponent, organizer, and public listing viewers only', async () => {
    await seedDoc('preferences/organizer-a', {
      uid: 'organizer-a',
      event_creator: true,
      preferred_courts: [],
      preferred_zone: '',
    });
    await seedDoc('contacts/member-a', {
      email: 'member-a@example.invalid',
      phone: '+14165550100',
      preferred_mode_of_contact: 'email',
      contactable: true,
      updated_at: '2026-01-01T00:00:00.000Z',
    });
    await seedDoc('connections/member-a__member-b', {
      uids: ['member-a', 'member-b'],
      reason: 'tournament fixture',
    });

    await assertSucceeds(getDoc(doc(dbFor('member-b'), 'contacts/member-a')));
    await assertSucceeds(getDoc(doc(dbFor('organizer-a'), 'contacts/member-a')));
    await assertFails(getDoc(doc(dbFor('member-c'), 'contacts/member-a')));

    await seedDoc('public_contacts/member-a', { uid: 'member-a' });
    await assertSucceeds(getDoc(doc(dbFor('member-c'), 'contacts/member-a')));
    await assertFails(getDoc(doc(anonDb(), 'contacts/member-a')));
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

  test('members can join their own event slots but cannot impersonate another participant', async () => {
    await seedDoc('events/synthetic-event', {
      id: 'synthetic-event',
      title: 'Synthetic Event',
      creator_id: 'organizer-a',
      created_at: '2026-01-01T00:00:00.000Z',
    });
    await seedDoc('preferences/organizer-a', {
      uid: 'organizer-a',
      event_creator: true,
      preferred_courts: [],
      preferred_zone: '',
    });

    const memberDb = dbFor('member-a');
    const otherDb = dbFor('member-b');
    const organizerDb = dbFor('organizer-a');

    await assertSucceeds(setDoc(doc(memberDb, 'event_participants/join-a'), {
      id: 'join-a',
      event_id: 'synthetic-event',
      uid: 'member-a',
      created_at: '2026-01-01T00:00:00.000Z',
      tournament_choice: 'Singles',
      division: "Men's",
    }));

    await assertSucceeds(updateDoc(doc(memberDb, 'event_participants/join-a'), {
      dateselected: ['2026-08-19'],
      skill: 3,
    }));

    await assertFails(setDoc(doc(otherDb, 'event_participants/join-b'), {
      id: 'join-b',
      event_id: 'synthetic-event',
      uid: 'member-a',
      created_at: '2026-01-01T00:00:00.000Z',
    }));

    await assertFails(updateDoc(doc(memberDb, 'event_participants/join-a'), {
      tournament_choice: 'Doubles',
    }));

    await assertSucceeds(setDoc(doc(organizerDb, 'event_participants/join-c'), {
      id: 'join-c',
      event_id: 'synthetic-event',
      uid: 'member-b',
      created_at: '2026-01-01T00:00:00.000Z',
      division: "Men's",
    }));
  });

  test('tournament matches stay organizer-controlled while player-authored score submissions remain self-scoped', async () => {
    await seedDoc('preferences/organizer-a', {
      uid: 'organizer-a',
      event_creator: true,
      preferred_courts: [],
      preferred_zone: '',
    });
    await seedDoc('events/synthetic-event', {
      id: 'synthetic-event',
      title: 'Synthetic Event',
      creator_id: 'organizer-a',
      created_at: '2026-01-01T00:00:00.000Z',
    });
    await seedDoc('matches/tournament-a', {
      id: 'tournament-a',
      event_id: 'synthetic-event',
      category: 'tournament',
      player_1_uid: 'member-a',
      player_2_uid: 'member-b',
      status: 'scheduled',
    });

    await assertFails(updateDoc(doc(dbFor('member-a'), 'matches/tournament-a'), {
      status: 'reported',
      winner_uid: 'member-a',
    }));

    await assertSucceeds(updateDoc(doc(dbFor('organizer-a'), 'matches/tournament-a'), {
      status: 'reported',
      winner_uid: 'member-a',
      winner_name: 'Member A',
      set_1_player_1: 6,
      set_1_player_2: 4,
    }));

    await assertSucceeds(setDoc(doc(dbFor('member-a'), 'matches/submission-a'), {
      id: 'submission-a',
      category: 'score_submission',
      submitted_by: 'member-a',
      match_id: 'tournament-a',
      status: 'open',
    }));

    await assertFails(setDoc(doc(dbFor('member-b'), 'matches/submission-b'), {
      id: 'submission-b',
      category: 'score_submission',
      submitted_by: 'member-a',
      match_id: 'tournament-a',
      status: 'open',
    }));
  });

  test('redemptions are readable by the player and the assigned provider but not unrelated members', async () => {
    await seedDoc('preferences/provider-a', {
      uid: 'provider-a',
      event_creator: false,
      stringer: true,
      stringer_id: 'synthetic-stringer',
    });
    await seedDoc('preferences/member-b', {
      uid: 'member-b',
      event_creator: false,
      preferred_courts: [],
      preferred_zone: '',
    });
    await seedDoc('redemptions/SYNTHETIC-001', {
      uid: 'member-a',
      stringer_id: 'synthetic-stringer',
      stringer_name: 'Synthetic Stringer',
      status: 'active',
      offer: 'Synthetic restring',
    });

    await assertSucceeds(getDoc(doc(dbFor('member-a'), 'redemptions/SYNTHETIC-001')));
    await assertSucceeds(getDoc(doc(dbFor('provider-a'), 'redemptions/SYNTHETIC-001')));
    await assertFails(getDoc(doc(dbFor('member-b'), 'redemptions/SYNTHETIC-001')));
    await assertFails(updateDoc(doc(dbFor('provider-a'), 'redemptions/SYNTHETIC-001'), { status: 'used' }));
    await assertFails(setDoc(doc(dbFor('member-a'), 'redemption_locks/synthetic-lock'), {
      uid: 'member-a',
      reward_id: 'synthetic-offer',
      status: 'active',
    }));
  });
});
