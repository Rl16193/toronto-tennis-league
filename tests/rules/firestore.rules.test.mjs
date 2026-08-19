import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, beforeEach, describe, test } from 'node:test';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore';

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

    await assertSucceeds(
      setDoc(doc(db, 'users/member-a'), {
        uid: 'member-a',
        name: 'Member A',
        avatar: '',
        created_at: '2026-01-01T00:00:00.000Z',
      }),
    );

    await assertFails(
      setDoc(doc(db, 'users/public-leak'), {
        uid: 'member-a',
        name: 'Leaky Profile',
        event_creator: true,
        email: 'private@example.invalid',
      }),
    );

    await assertSucceeds(
      setDoc(doc(db, 'preferences/member-a'), {
        uid: 'member-a',
        event_creator: false,
        preferred_courts: ['synthetic-court'],
        preferred_zone: 'north',
        email_notifications: true,
      }),
    );

    await assertSucceeds(
      setDoc(doc(db, 'stats/member-a'), {
        uid: 'member-a',
        name: 'Member A',
        leaguePoints26: 0,
        wins: 0,
        loses: 0,
        matchesPlayed: 0,
        tournamentsPlayed: 0,
      }),
    );

    await assertSucceeds(
      setDoc(doc(db, 'tasks/member-a'), {
        uid: 'member-a',
        name: 'Member A',
        profileComplete: true,
        updatedAt: '2026-01-01T00:00:00.000Z',
      }),
    );

    await assertSucceeds(
      setDoc(doc(db, 'contacts/member-a'), {
        email: 'member-a@example.invalid',
        phone: '+14165550100',
        preferred_mode_of_contact: 'email',
        contactable: true,
        updated_at: '2026-01-01T00:00:00.000Z',
      }),
    );

    await assertFails(
      setDoc(doc(db, 'users/member-b'), {
        uid: 'member-b',
        name: 'Member B',
        avatar: '',
        created_at: '2026-01-01T00:00:00.000Z',
      }),
    );
  });

  test('public profiles reject private fields and participant managers cannot rewrite identity', async () => {
    const ownerDb = dbFor('member-a');
    await assertFails(
      setDoc(doc(ownerDb, 'users/member-a'), {
        uid: 'member-a',
        name: 'Member A',
        created_at: '2026-01-01',
        email: 'private@example.invalid',
      }),
    );
    await seedDoc('users/member-a', { uid: 'member-a', name: 'Member A', created_at: '2026-01-01' });
    await assertFails(updateDoc(doc(ownerDb, 'users/member-a'), { email_notifications: true }));

    await seedDoc('events/event-a', { creator_id: 'manager-a' });
    await seedDoc('events/event-b', { creator_id: 'manager-b' });
    await seedDoc('event_participants/participant-a', {
      uid: 'member-a',
      event_id: 'event-a',
      created_at: '2026-01-01',
      user_name: 'Member A',
    });
    const managerDb = dbFor('manager-a');
    await assertFails(updateDoc(doc(managerDb, 'event_participants/participant-a'), { event_id: 'event-b' }));
    await assertFails(updateDoc(doc(managerDb, 'event_participants/participant-a'), { uid: 'manager-a' }));
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

  test('private preferences are owner-only and public projections cannot expose private or role fields', async () => {
    await seedDoc('preferences/member-a', {
      uid: 'member-a',
      event_creator: false,
      preferred_courts: ['synthetic-court'],
      preferred_zone: 'north',
      availability_tags: ['weekday-evenings'],
      email_notifications: false,
    });
    await seedDoc('public_preferences/member-a', {
      uid: 'member-a',
      preferred_courts: ['synthetic-court'],
      preferred_zone: 'north',
    });

    await assertSucceeds(getDoc(doc(dbFor('member-a'), 'preferences/member-a')));
    await assertFails(getDoc(doc(dbFor('member-b'), 'preferences/member-a')));
    await assertFails(getDoc(doc(anonDb(), 'preferences/member-a')));
    await assertFails(getDocs(collection(dbFor('member-b'), 'preferences')));
    await assertFails(getDoc(doc(anonDb(), 'public_preferences/member-a')));
    await assertFails(getDoc(doc(dbFor('member-b'), 'public_preferences/member-a')));
    await assertFails(
      setDoc(doc(dbFor('member-a'), 'public_preferences/member-a'), {
        uid: 'member-a',
        event_creator: true,
      }),
    );
  });

  test('event_creator is scoped to owned or explicitly assigned events', async () => {
    await seedDoc('preferences/organizer-a', { uid: 'organizer-a', event_creator: true });
    await seedDoc('preferences/organizer-b', { uid: 'organizer-b', event_creator: true });
    await seedDoc('events/owned-a', {
      id: 'owned-a',
      creator_id: 'organizer-a',
      organizer_ids: ['organizer-b'],
      title: 'Owned A',
    });
    await seedDoc('events/owned-b', {
      id: 'owned-b',
      creator_id: 'organizer-b',
      title: 'Owned B',
    });

    await assertSucceeds(updateDoc(doc(dbFor('organizer-a'), 'events/owned-a'), { title: 'Updated' }));
    await assertSucceeds(updateDoc(doc(dbFor('organizer-b'), 'events/owned-a'), { title: 'Assigned update' }));
    await assertFails(
      updateDoc(doc(dbFor('organizer-b'), 'events/owned-a'), {
        organizer_ids: ['organizer-b', 'member-a'],
      }),
    );
    await assertFails(
      updateDoc(doc(dbFor('organizer-b'), 'events/owned-a'), {
        assigned_organizer_uids: ['organizer-b', 'member-a'],
      }),
    );
    await assertFails(
      updateDoc(doc(dbFor('organizer-b'), 'events/owned-a'), {
        organizer_uids: ['organizer-b', 'member-a'],
      }),
    );
    await assertSucceeds(
      updateDoc(doc(dbFor('organizer-a'), 'events/owned-a'), {
        organizer_ids: ['organizer-b', 'member-a'],
      }),
    );
    await assertFails(updateDoc(doc(dbFor('organizer-a'), 'events/owned-b'), { title: 'Cross-event update' }));
    await assertSucceeds(
      setDoc(doc(dbFor('organizer-a'), 'events/new-a'), {
        id: 'new-a',
        creator_id: 'organizer-a',
        title: 'New A',
      }),
    );
    await assertFails(
      setDoc(doc(dbFor('organizer-a'), 'events/forged-owner'), {
        id: 'forged-owner',
        creator_id: 'organizer-b',
        title: 'Forged',
      }),
    );
  });

  test('event_creator cannot use event role for rewards, economics, metrics, or task moderation', async () => {
    await seedDoc('preferences/organizer-a', { uid: 'organizer-a', event_creator: true });
    await seedDoc('tasks/member-a', { uid: 'member-a', profileComplete: true, bonusPoints: 0 });
    await seedDoc('offers/member-a', { uid: 'member-a', pointsSpent: 0 });
    await seedDoc('admin_stats/current', { members: 10 });
    await seedDoc('task_claims/claim-a', { uid: 'member-a', type: 'host', status: 'pending' });

    await assertFails(updateDoc(doc(dbFor('organizer-a'), 'tasks/member-a'), { bonusPoints: 100 }));
    await assertFails(updateDoc(doc(dbFor('organizer-a'), 'offers/member-a'), { pointsSpent: -100 }));
    await assertFails(getDoc(doc(dbFor('organizer-a'), 'offers/member-a')));
    await assertFails(getDoc(doc(dbFor('organizer-a'), 'admin_stats/current')));
    await assertFails(updateDoc(doc(dbFor('organizer-a'), 'task_claims/claim-a'), { status: 'approved' }));
  });

  test('member preference creation rejects role and UID fields', async () => {
    const db = dbFor('member-a');

    await assertFails(
      setDoc(doc(db, 'preferences/member-a'), {
        uid: 'member-a',
        event_creator: false,
        stringer: true,
        stringer_id: 'provider-a',
      }),
    );
    await assertFails(
      setDoc(doc(db, 'preferences/member-a'), {
        uid: 'other-member',
        event_creator: false,
      }),
    );
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

  test('contacts become readable to a connected opponent and public listing viewers, not an unrelated organizer', async () => {
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
    await assertFails(getDoc(doc(dbFor('organizer-a'), 'contacts/member-a')));
    await assertFails(getDoc(doc(dbFor('member-c'), 'contacts/member-a')));

    await seedDoc('public_contacts/member-a', {
      uid: 'member-a',
      email: 'member-a@example.invalid',
      phone: '+14165550100',
      preferred_mode_of_contact: 'email',
    });
    await assertFails(getDoc(doc(dbFor('member-c'), 'contacts/member-a')));
    const projected = await assertSucceeds(getDoc(doc(dbFor('member-c'), 'public_contacts/member-a')));
    assert.equal(projected.data().email, 'member-a@example.invalid');
    assert.equal(projected.data().secondary_email, undefined);
    await assertFails(getDoc(doc(anonDb(), 'contacts/member-a')));
  });

  test('clients cannot create server-maintained connection markers', async () => {
    const db = dbFor('member-a');

    await assertFails(
      setDoc(doc(db, 'connections/member-a__member-b'), {
        uids: ['member-a', 'member-b'],
        reason: 'test',
      }),
    );
  });

  test('task owners can write allowlisted progress but cannot mint points', async () => {
    const db = dbFor('member-a');
    const tasks = doc(db, 'tasks/member-a');

    await assertSucceeds(
      setDoc(tasks, {
        uid: 'member-a',
        name: 'Member A',
        updatedAt: '2026-01-01T00:00:00.000Z',
        profileComplete: true,
      }),
    );
    await assertFails(updateDoc(tasks, { bonusPoints: 99 }));
  });

  test('member-owned stats cannot be used to write league points', async () => {
    const db = dbFor('member-a');
    const stats = doc(db, 'stats/member-a');

    await assertSucceeds(
      setDoc(stats, {
        uid: 'member-a',
        leaguePoints26: 0,
        wins: 0,
        loses: 0,
        matchesPlayed: 0,
        tournamentsPlayed: 0,
      }),
    );
    await assertFails(updateDoc(stats, { leaguePoints26: 1 }));
  });

  test('member-owned stats cannot substitute another UID', async () => {
    const db = dbFor('member-a');
    const stats = doc(db, 'stats/member-a');

    await assertSucceeds(
      setDoc(stats, {
        uid: 'member-a',
        leaguePoints26: 0,
        wins: 0,
        loses: 0,
        matchesPlayed: 0,
        tournamentsPlayed: 0,
      }),
    );
    await assertFails(updateDoc(stats, { uid: 'other-member' }));
    await assertFails(
      setDoc(doc(db, 'stats/other-member'), {
        uid: 'member-a',
        leaguePoints26: 0,
        wins: 0,
        loses: 0,
        matchesPlayed: 0,
        tournamentsPlayed: 0,
      }),
    );
  });

  test('organizers cannot directly apply protected statistics or points', async () => {
    await seedDoc('preferences/organizer-a', {
      uid: 'organizer-a',
      event_creator: true,
    });
    await seedDoc('stats/member-a', {
      uid: 'member-a',
      name: 'Member A',
      leaguePoints26: 10,
      wins: 1,
      loses: 1,
      matchesPlayed: 2,
      tournamentsPlayed: 1,
    });
    const organizerDb = dbFor('organizer-a');
    const stats = doc(organizerDb, 'stats/member-a');

    await assertFails(updateDoc(stats, { uid: 'organizer-a' }));
    await assertFails(updateDoc(stats, { private_note: 'not a stats field' }));
    await assertFails(updateDoc(stats, { leaguePoints26: 999 }));
    await assertFails(updateDoc(stats, { leaguePoints26: 15, league: "Men's" }));
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

    await assertSucceeds(
      setDoc(doc(memberDb, 'event_participants/join-a'), {
        id: 'join-a',
        event_id: 'synthetic-event',
        uid: 'member-a',
        created_at: '2026-01-01T00:00:00.000Z',
        tournament_choice: 'Singles',
        division: "Men's",
      }),
    );

    await assertSucceeds(
      updateDoc(doc(memberDb, 'event_participants/join-a'), {
        dateselected: ['2026-08-19'],
        skill: 3,
      }),
    );

    await assertFails(
      setDoc(doc(otherDb, 'event_participants/join-b'), {
        id: 'join-b',
        event_id: 'synthetic-event',
        uid: 'member-a',
        created_at: '2026-01-01T00:00:00.000Z',
      }),
    );

    await assertFails(
      updateDoc(doc(memberDb, 'event_participants/join-a'), {
        tournament_choice: 'Doubles',
      }),
    );

    await assertSucceeds(
      setDoc(doc(organizerDb, 'event_participants/join-c'), {
        id: 'join-c',
        event_id: 'synthetic-event',
        uid: 'member-b',
        created_at: '2026-01-01T00:00:00.000Z',
        division: "Men's",
      }),
    );
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
      category: 'singles',
      tournament_choice: 'Singles',
      player_1_uid: 'member-a',
      player_2_uid: 'member-b',
      status: 'scheduled',
    });

    await assertFails(
      updateDoc(doc(dbFor('member-a'), 'matches/tournament-a'), {
        status: 'reported',
        winner_uid: 'member-a',
      }),
    );
    await assertSucceeds(
      updateDoc(doc(dbFor('member-a'), 'matches/tournament-a'), {
        schedule_requested: true,
      }),
    );
    await assertFails(
      updateDoc(doc(dbFor('member-a'), 'matches/tournament-a'), {
        schedule_status: 'scheduled',
        proposed_date: '2026-09-01',
        proposed_slot: 'PM',
        proposed_by: 'organizer-a',
      }),
    );
    await assertFails(
      updateDoc(doc(dbFor('member-a'), 'matches/tournament-a'), {
        schedule_requested: false,
      }),
    );

    await assertFails(
      updateDoc(doc(dbFor('organizer-a'), 'matches/tournament-a'), {
        status: 'reported',
        winner_uid: 'member-a',
        winner_name: 'Member A',
        set_1_player_1: 6,
        set_1_player_2: 4,
      }),
    );

    await assertFails(
      updateDoc(doc(dbFor('organizer-a'), 'matches/tournament-a'), {
        category: 'rally',
        player_1_uid: 'organizer-a',
      }),
    );
    await assertFails(
      updateDoc(doc(dbFor('organizer-a'), 'matches/tournament-a'), {
        event_id: 'unrelated-event',
      }),
    );

    await assertSucceeds(
      setDoc(doc(dbFor('member-a'), 'matches/submission-a'), {
        id: 'submission-a',
        category: 'score_submission',
        event_id: 'synthetic-event',
        submitted_by: 'member-a',
        match_id: 'tournament-a',
        status: 'open',
        player_1_uid: 'member-a',
        player_2_uid: 'member-b',
        claimed_winner_uid: 'member-a',
        set_1_player_1: 6,
        set_1_player_2: 4,
        set_2_player_1: 6,
        set_2_player_2: 3,
      }),
    );

    await assertFails(
      setDoc(doc(dbFor('member-b'), 'matches/submission-b'), {
        id: 'submission-b',
        category: 'score_submission',
        submitted_by: 'member-a',
        match_id: 'tournament-a',
        status: 'open',
      }),
    );
  });

  test('friendly reports bind the reporter and winner to the match players', async () => {
    await seedDoc('matches/rally-a', {
      id: 'rally-a',
      category: 'rally',
      player_1_uid: 'member-a',
      player_2_uid: 'member-b',
      status: 'accepted',
    });

    const validReport = {
      status: 'reported',
      winner_uid: 'member-a',
      winner_name: 'Member A',
      set_1_player_1: 6,
      set_1_player_2: 4,
      set_2_player_1: 6,
      set_2_player_2: 2,
      set_3_player_1: 0,
      set_3_player_2: 0,
      reported_by: 'member-a',
      reported_at: '2026-08-19T00:00:00.000Z',
    };

    await assertFails(
      updateDoc(doc(dbFor('member-a'), 'matches/rally-a'), {
        ...validReport,
        reported_by: 'member-b',
      }),
    );
    await assertFails(
      updateDoc(doc(dbFor('member-a'), 'matches/rally-a'), {
        ...validReport,
        winner_uid: 'outsider',
      }),
    );
    await assertFails(
      updateDoc(doc(dbFor('member-a'), 'matches/rally-a'), {
        ...validReport,
        set_1_player_1: 8,
      }),
    );

    await assertSucceeds(updateDoc(doc(dbFor('member-a'), 'matches/rally-a'), validReport));
    await assertFails(updateDoc(doc(dbFor('member-a'), 'matches/rally-a'), { status: 'confirmed' }));
    await assertSucceeds(
      updateDoc(doc(dbFor('member-b'), 'matches/rally-a'), {
        status: 'confirmed',
        confirmed_by: 'member-b',
        confirmed_at: '2026-08-19T00:01:00.000Z',
        completed_at: '2026-08-19T00:01:00.000Z',
      }),
    );
  });

  test('round-robin drafts are readable but writable only by the event creator', async () => {
    await seedDoc('events/synthetic-event', {
      id: 'synthetic-event',
      creator_id: 'organizer-a',
      title: 'Synthetic Event',
    });
    await seedDoc('preferences/organizer-a', {
      uid: 'organizer-a',
      event_creator: true,
    });

    const draft = doc(dbFor('organizer-a'), 'events/synthetic-event/rr_drafts/draw-a');
    await assertSucceeds(
      setDoc(draft, {
        event_id: 'synthetic-event',
        draw_key: 'draw-a',
        status: 'draft',
        groups: [],
      }),
    );
    await assertSucceeds(getDoc(doc(dbFor('member-a'), 'events/synthetic-event/rr_drafts/draw-a')));
    await assertFails(
      setDoc(doc(dbFor('member-a'), 'events/synthetic-event/rr_drafts/draw-b'), {
        event_id: 'synthetic-event',
        draw_key: 'draw-b',
        status: 'draft',
        groups: [],
      }),
    );
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
    await assertFails(
      setDoc(doc(dbFor('member-a'), 'redemption_locks/synthetic-lock'), {
        uid: 'member-a',
        reward_id: 'synthetic-offer',
        status: 'active',
      }),
    );
  });
});
