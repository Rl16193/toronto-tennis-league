// Firestore rules boundaries, run against the emulator only (project `demo-ttl`, which can never
// reach production): `npm run test:rules`. Structure follows Racquets-And-Strings' rules suite.
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, beforeEach, describe, test } from 'node:test';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

const here = dirname(fileURLToPath(import.meta.url));
const rules = await readFile(resolve(here, '../../firestore.rules'), 'utf8');

let env;
before(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-ttl', firestore: { rules } });
});
after(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });

const as = (uid) => env.authenticatedContext(uid).firestore();
const seed = (path, data) =>
  env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), path), data));

const ORGANIZER = 'organizer-1';
const seedOrganizer = () => seed(`preferences/${ORGANIZER}`, { event_creator: true });

describe('stats: points are never self-written', () => {
  test('a member cannot raise their own league points', async () => {
    await seed('stats/p1', { leaguePoints26: 10, skill_level: 3 });
    await assertFails(updateDoc(doc(as('p1'), 'stats/p1'), { leaguePoints26: 99 }));
  });
  test('a member can change their own skill level', async () => {
    await seed('stats/p1', { leaguePoints26: 10, skill_level: 3 });
    await assertSucceeds(updateDoc(doc(as('p1'), 'stats/p1'), { skill_level: 3.5 }));
  });
  test('not even an organizer can write points', async () => {
    await seedOrganizer();
    await seed('stats/p1', { leaguePoints26: 10 });
    await assertFails(updateDoc(doc(as(ORGANIZER), 'stats/p1'), { leaguePoints26: 15 }));
    await assertFails(setDoc(doc(as(ORGANIZER), 'stats/p9'), { leaguePoints26: 5 }));
  });
  test('a member cannot create a stats doc with points', async () => {
    await assertFails(setDoc(doc(as('p1'), 'stats/p1'), {
      leaguePoints26: 50, wins: 0, loses: 0, matchesPlayed: 0, tournamentsPlayed: 0,
    }));
  });
});

describe('contacts: opponents only', () => {
  test('a stranger cannot read a member\'s contacts', async () => {
    await seed('contacts/p1', { phone: '555' });
    await seed('preferences/p1', { event_creator: false });
    await assertFails(getDoc(doc(as('p2'), 'contacts/p1')));
  });
  test('a connected opponent can read them', async () => {
    await seed('contacts/p1', { phone: '555' });
    await seed('preferences/p1', { event_creator: false });
    await seed('connections/p1__p2', { a: 'p1', b: 'p2' });
    await assertSucceeds(getDoc(doc(as('p2'), 'contacts/p1')));
  });
  test('an owner cannot write a field outside the whitelist', async () => {
    await seed('contacts/p1', { phone: '555' });
    await assertFails(updateDoc(doc(as('p1'), 'contacts/p1'), { leaguePoints26: 5 }));
  });
});

describe('preferences: roles are the super admin\'s', () => {
  test('a member cannot make themselves an organizer', async () => {
    await seed('preferences/p1', { event_creator: false });
    await assertFails(updateDoc(doc(as('p1'), 'preferences/p1'), { event_creator: true }));
  });
  test('a member cannot make themselves a stringer', async () => {
    await seed('preferences/p1', { event_creator: false });
    await assertFails(updateDoc(doc(as('p1'), 'preferences/p1'), { stringer: true, stringer_id: 'x' }));
  });
  test('a member can edit their courts and zone', async () => {
    await seed('preferences/p1', { event_creator: false, preferred_courts: [] });
    await assertSucceeds(updateDoc(doc(as('p1'), 'preferences/p1'), {
      preferred_courts: ['Riverdale Park'], preferred_zone: 'Downtown - Midtown',
    }));
  });
});

describe('matches: only the server writes results', () => {
  const accepted = {
    category: 'challenge', status: 'accepted', player_1_uid: 'p1', player_2_uid: 'p2',
  };

  test('a player can open their own challenge', async () => {
    await assertSucceeds(setDoc(doc(as('p1'), 'matches/c1'), { ...accepted, status: 'open' }));
    await assertFails(setDoc(doc(as('p1'), 'matches/c9'), { ...accepted, status: 'open', applied: true }));
  });
  test('nobody writes a result directly: players, organizers, not even on create', async () => {
    await seedOrganizer();
    await seed('matches/c1', accepted);
    await assertFails(setDoc(doc(as('p1'), 'matches/c2'), {
      ...accepted, status: 'confirmed', winner_uid: 'p1', set_1_player_1: 6, set_1_player_2: 0,
    }));
    await assertFails(setDoc(doc(as(ORGANIZER), 'matches/c3'), {
      ...accepted, status: 'confirmed', winner_uid: 'p1', set_1_player_1: 6, set_1_player_2: 2,
    }));
    await assertFails(updateDoc(doc(as('p2'), 'matches/c1'), {
      status: 'confirmed', winner_uid: 'p2', set_1_player_1: 2, set_1_player_2: 6,
    }));
    await assertFails(updateDoc(doc(as('p2'), 'matches/c1'), { score_disputed: true }));
  });
  test('the opponent can accept an open challenge, but not accept-and-record it', async () => {
    await seed('matches/c1', { ...accepted, status: 'open' });
    await assertFails(updateDoc(doc(as('p2'), 'matches/c1'), { status: 'confirmed' }));
    await assertSucceeds(updateDoc(doc(as('p2'), 'matches/c1'), { status: 'accepted', responded_at: 'now' }));
  });
  test('an organizer edits a draw but cannot write a result or points', async () => {
    await seed('events/e1', { creator_id: ORGANIZER });
    await seed('matches/t1', { category: 'singles', player_1_uid: 'p1', player_2_uid: '', event_id: 'e1', status: 'pending' });
    await assertSucceeds(updateDoc(doc(as(ORGANIZER), 'matches/t1'), { player_2_uid: 'p2', player_2_name: 'Pat' }));
    await assertFails(updateDoc(doc(as(ORGANIZER), 'matches/t1'), { status: 'complete', winner_uid: 'p1' }));
    await assertFails(updateDoc(doc(as(ORGANIZER), 'matches/t1'), { rr_group_bonus_v2: true }));
    await assertSucceeds(setDoc(doc(as(ORGANIZER), 'matches/t2'), { category: 'singles', event_id: 'e1', status: 'pending' }));
    await assertFails(setDoc(doc(as(ORGANIZER), 'matches/t3'), { category: 'singles', event_id: 'e1', status: 'complete' }));
  });
  test('a player can ask their opponent to schedule, and clear it', async () => {
    await seed('matches/t1', { category: 'singles', player_1_uid: 'p1', player_2_uid: 'p2', event_id: 'e1' });
    await assertSucceeds(updateDoc(doc(as('p1'), 'matches/t1'), {
      schedule_requested: true, schedule_requested_by: 'p1',
    }));
    await assertSucceeds(updateDoc(doc(as('p2'), 'matches/t1'), { schedule_requested: false }));
  });
  test('a player cannot write a tournament result directly', async () => {
    await seed('events/e1', { creator_id: ORGANIZER });
    await seed('preferences/p1', { event_creator: false });
    await seed('matches/t1', { category: 'singles', player_1_uid: 'p1', player_2_uid: 'p2', event_id: 'e1' });
    await assertFails(updateDoc(doc(as('p1'), 'matches/t1'), { status: 'complete', winner_uid: 'p1' }));
  });
});

describe('event_participants: players cannot undo a removal', () => {
  test('a removed player cannot clear their own removal', async () => {
    await seed('events/e1', { creator_id: ORGANIZER });
    await seed('preferences/p1', { event_creator: false });
    await seed('event_participants/r1', { uid: 'p1', event_id: 'e1', removal: true });
    await assertFails(updateDoc(doc(as('p1'), 'event_participants/r1'), { removal: false }));
  });
  test('a player can register themselves', async () => {
    await assertSucceeds(setDoc(doc(as('p1'), 'event_participants/r2'), {
      uid: 'p1', event_id: 'e1', created_at: '2026-09-18T00:00:00.000Z',
    }));
  });
});

describe('partner pool', () => {
  test('a player can list only themselves', async () => {
    await assertSucceeds(setDoc(doc(as('p1'), 'partner_pool/e1/members/p1'), {
      uid: 'p1', name: 'Pat', category: 'mens', skill: 3, created_at: '2026-09-18T00:00:00.000Z',
    }));
    await assertFails(setDoc(doc(as('p1'), 'partner_pool/e1/members/p2'), {
      uid: 'p2', name: 'Other', category: 'mens', skill: 3, created_at: '2026-09-18T00:00:00.000Z',
    }));
  });
  test('only pool members can read contact cards, and nobody can write them', async () => {
    await seed('partner_pool/e1/contacts/p2', { phone: '555' });
    await assertFails(getDoc(doc(as('p1'), 'partner_pool/e1/contacts/p2')));
    await seed('partner_pool/e1/members/p1', { uid: 'p1', category: 'mens' });
    await assertSucceeds(getDoc(doc(as('p1'), 'partner_pool/e1/contacts/p2')));
    await assertFails(setDoc(doc(as('p1'), 'partner_pool/e1/contacts/p1'), { phone: '1' }));
  });
});

describe('tournament results are server-only', () => {
  test('the audit log is not readable by players or writable by anyone', async () => {
    await seed('tournament_result_audit/x', { match_id: 'm1' });
    await seed('preferences/p1', { event_creator: false });
    await assertFails(getDoc(doc(as('p1'), 'tournament_result_audit/x')));
    await seedOrganizer();
    await assertSucceeds(getDoc(doc(as(ORGANIZER), 'tournament_result_audit/x')));
    await assertFails(setDoc(doc(as(ORGANIZER), 'tournament_result_audit/y'), { match_id: 'm1' }));
  });
  test('a player cannot write their own points onto a tournament match', async () => {
    await seed('events/e1', { creator_id: ORGANIZER });
    await seed('preferences/p1', { event_creator: false });
    await seed('matches/t1', { category: 'singles', player_1_uid: 'p1', player_2_uid: 'p2', event_id: 'e1' });
    await assertFails(updateDoc(doc(as('p1'), 'matches/t1'), { applied_deltas: { p1: { leaguePoints26: 50 } } }));
  });
});

describe('organizers are per event (Racquets-And-Strings ADR-001)', () => {
  test("another event's organizer cannot edit this draw; a listed co-organizer can", async () => {
    await seed('preferences/org-2', { event_creator: true });
    await seed('preferences/org-3', { event_creator: true });
    await seed('events/e1', { creator_id: ORGANIZER, organizer_ids: ['org-3'] });
    await seed('matches/t1', { category: 'singles', event_id: 'e1', status: 'pending', player_1_uid: '' });
    await assertFails(updateDoc(doc(as('org-2'), 'matches/t1'), { player_1_uid: 'p1' }));
    await assertSucceeds(updateDoc(doc(as('org-3'), 'matches/t1'), { player_1_uid: 'p1' }));
  });
  test('only the super admin changes who manages an event', async () => {
    await seed('preferences/org-2', { event_creator: true });
    await seed('events/e1', { creator_id: ORGANIZER, title: 'Open' });
    await assertFails(updateDoc(doc(as('org-2'), 'events/e1'), { organizer_ids: ['org-2'] }));
    await assertFails(updateDoc(doc(as('org-2'), 'events/e1'), { creator_id: 'org-2' }));
    await assertSucceeds(updateDoc(doc(as('org-2'), 'events/e1'), { title: 'Open 2026' }));
    await assertFails(setDoc(doc(as('org-2'), 'events/e2'), { creator_id: ORGANIZER, title: 'X' }));
    await assertSucceeds(setDoc(doc(as('org-2'), 'events/e3'), { creator_id: 'org-2', title: 'Mine' }));
  });
});
