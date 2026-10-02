// Firestore rules boundaries, run against the emulator only (project `demo-ttl`, which can never
// reach production): `npm run test:rules`. Structure follows Racquets-And-Strings' rules suite.
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, beforeEach, describe, test } from 'node:test';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';

const here = dirname(fileURLToPath(import.meta.url));
const rules = await readFile(resolve(here, '../../firestore.rules'), 'utf8');

let env;
before(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-ttl', firestore: { rules } });
});
after(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });

const as = (uid) => env.authenticatedContext(uid).firestore();
const visitor = () => env.unauthenticatedContext().firestore();
const seed = (path, data) =>
  env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), path), data));

const SUPER = '7PvfzNtDmsOq5GLMieId7QRT7wH3';
const ORGANIZER = 'organizer-1';
const seedOrganizer = (uid = ORGANIZER) => seed(`providers/${uid}`, { roles: ['organizer'] });
const seedEvent = (extra = {}) => seed('events/e1', { title: 'Open', organizer_ids: [ORGANIZER], ...extra });

// A new stats doc: every server-written counter at zero (zeroCounters in the rules).
const ZERO_STATS = {
  leaguePoints: 0, leaguePointsPrev: 0, rsPoints: 0, pointsSpent: 0, matchesPlayed: 0, wins: 0, pointswon: 0,
  totalPointsPlayed: 0, tournamentsPlayed: 0, eventsJoined: 0, challengesPlayed: 0, challengesWon: 0, courtsVisited: 0,
  zoneComplete: 0, suggestions: 0, boardPhotos: 0, queueUpdates: 0, currentStreak: 0, bestStreak: 0, monthsActive: 0,
  volunteerClaimed: 0, volunteerApproved: 0, inviteClaimed: 0, inviteApproved: 0, hostClaimed: 0, hostApproved: 0,
  active_months: [],
};

describe('users: world-readable, so never a contact detail', () => {
  test('a member creates and edits their own profile', async () => {
    await assertSucceeds(setDoc(doc(as('p1'), 'users/p1'), { uid: 'p1', name: 'Pat', created_at: serverTimestamp() }));
    await assertSucceeds(updateDoc(doc(as('p1'), 'users/p1'), { bio: 'Lefty' }));
    await assertFails(setDoc(doc(as('p1'), 'users/p2'), { uid: 'p2', name: 'Other' }));
  });
  test('email and phone can never be written to users', async () => {
    await assertFails(setDoc(doc(as('p1'), 'users/p1'), { uid: 'p1', name: 'Pat', email: 'p@x.com' }));
    await seed('users/p1', { uid: 'p1', name: 'Pat' });
    await assertFails(updateDoc(doc(as('p1'), 'users/p1'), { phone: '555' }));
  });
});

describe('stats: points are never self-written', () => {
  test('a member cannot raise their own league points', async () => {
    await seed('stats/p1', { leaguePoints: 10, skill_level: 3 });
    await assertFails(updateDoc(doc(as('p1'), 'stats/p1'), { leaguePoints: 99 }));
  });
  test('a member can change their own skill level', async () => {
    await seed('stats/p1', { leaguePoints: 10, skill_level: 3 });
    await assertSucceeds(updateDoc(doc(as('p1'), 'stats/p1'), { skill_level: 3.5 }));
  });
  test('an organizer can take back a self-reported task but never write points', async () => {
    await seedOrganizer();
    await seed('stats/p1', { leaguePoints: 10, profilePhoto: true });
    await assertSucceeds(updateDoc(doc(as(ORGANIZER), 'stats/p1'), { profilePhoto: false }));
    await assertFails(updateDoc(doc(as(ORGANIZER), 'stats/p1'), { leaguePoints: 15 }));
    await assertFails(setDoc(doc(as(ORGANIZER), 'stats/p9'), ZERO_STATS));
  });
  test('a new stats doc must start every counter at zero', async () => {
    await assertSucceeds(setDoc(doc(as('p1'), 'stats/p1'), { ...ZERO_STATS, skill_level: 3 }));
    await assertFails(setDoc(doc(as('p2'), 'stats/p2'), { ...ZERO_STATS, leaguePoints: 50 }));
    await assertFails(setDoc(doc(as('p3'), 'stats/p3'), { skill_level: 3 }));
  });
});

describe('contacts: opponents only', () => {
  test('a stranger cannot read a member\'s contacts', async () => {
    await seed('contacts/p1', { phone: '555' });
    await assertFails(getDoc(doc(as('p2'), 'contacts/p1')));
  });
  test('the owner and a connected opponent can read them', async () => {
    await seed('contacts/p1', { phone: '555' });
    await seed('connections/p1__p2', { uids: ['p1', 'p2'], reason: 'challenge' });
    await assertSucceeds(getDoc(doc(as('p1'), 'contacts/p1')));
    await assertSucceeds(getDoc(doc(as('p2'), 'contacts/p1')));
  });
  test('an organizer reads anyone\'s, and anyone reads an organizer\'s', async () => {
    await seedOrganizer();
    await seed('contacts/p1', { phone: '555' });
    await seed(`contacts/${ORGANIZER}`, { phone: '777' });
    await assertSucceeds(getDoc(doc(as(ORGANIZER), 'contacts/p1')));
    await assertSucceeds(getDoc(doc(as('p2'), `contacts/${ORGANIZER}`)));
  });
  test('a marketplace seller\'s public-contact marker opens them to members', async () => {
    await seed('contacts/p1', { phone: '555' });
    await seed('public_contacts/p1', { uid: 'p1' });
    await assertSucceeds(getDoc(doc(as('p2'), 'contacts/p1')));
    await assertFails(getDoc(doc(visitor(), 'contacts/p1')));
  });
  test('an owner writes only the whitelist', async () => {
    await seed('contacts/p1', { phone: '555' });
    await assertSucceeds(updateDoc(doc(as('p1'), 'contacts/p1'), { phone: '556', preferred_mode_of_contact: ['text'] }));
    await assertFails(updateDoc(doc(as('p1'), 'contacts/p1'), { leaguePoints: 5 }));
  });
});

describe('providers and preferences: roles are the super admin\'s', () => {
  test('only the super admin grants a role', async () => {
    await seedOrganizer();
    await assertFails(setDoc(doc(as('p1'), 'providers/p1'), { roles: ['organizer'] }));
    await assertFails(setDoc(doc(as(ORGANIZER), 'providers/p1'), { roles: ['stringer'] }));
    await assertSucceeds(setDoc(doc(as(SUPER), 'providers/p1'), { roles: ['coach'] }));
  });
  test('a role flag cannot be smuggled onto preferences', async () => {
    await seed('preferences/p1', { preferred_courts: [] });
    await assertFails(updateDoc(doc(as('p1'), 'preferences/p1'), { event_creator: true }));
    await assertFails(updateDoc(doc(as('p1'), 'preferences/p1'), { stringer: true }));
  });
  test('a member can edit their courts and zone', async () => {
    await seed('preferences/p1', { preferred_courts: [] });
    await assertSucceeds(updateDoc(doc(as('p1'), 'preferences/p1'), {
      preferred_courts: ['Riverdale Park'], custom_courts: ['My Condo Court'], preferred_zone: 'Downtown - Midtown',
    }));
    await assertFails(updateDoc(doc(as('p1'), 'preferences/p1'), { custom_courts: 'My Condo Court' }));
  });
  test('an organizer may change a member\'s zone and nothing else', async () => {
    await seedOrganizer();
    await seed('preferences/p1', { preferred_courts: [], preferred_zone: 'Scarborough' });
    await assertSucceeds(updateDoc(doc(as(ORGANIZER), 'preferences/p1'), { preferred_zone: 'North York' }));
    await assertFails(updateDoc(doc(as(ORGANIZER), 'preferences/p1'), { preferred_courts: ['Ramsden Park'] }));
  });
});

describe('events: organizers are per event (Racquets-And-Strings ADR-001)', () => {
  const live = { status: 'active', cancelled_at: null };
  test('an organizer creates an event listing only themselves', async () => {
    await seedOrganizer();
    await assertSucceeds(setDoc(doc(as(ORGANIZER), 'events/e2'), { title: 'Mine', organizer_ids: [ORGANIZER], ...live }));
    await assertFails(setDoc(doc(as(ORGANIZER), 'events/e3'), { title: 'X', organizer_ids: [ORGANIZER, 'org-3'], ...live }));
    await assertFails(setDoc(doc(as('p1'), 'events/e4'), { title: 'Y', organizer_ids: ['p1'], ...live }));
    await assertSucceeds(setDoc(doc(as(SUPER), 'events/e5'), { title: 'Z', organizer_ids: [ORGANIZER, 'org-3'], ...live }));
  });
  test('a new event starts active, never cancelled', async () => {
    await seedOrganizer();
    await assertFails(setDoc(doc(as(ORGANIZER), 'events/e6'), { title: 'No status', organizer_ids: [ORGANIZER] }));
    await assertFails(setDoc(doc(as(ORGANIZER), 'events/e7'), { title: 'C', organizer_ids: [ORGANIZER], status: 'cancelled', cancelled_at: null }));
    await assertFails(setDoc(doc(as(ORGANIZER), 'events/e8'), { title: 'C', organizer_ids: [ORGANIZER], status: 'active', cancelled_at: serverTimestamp() }));
  });
  test('only the super admin changes who manages an event', async () => {
    await seedOrganizer();
    await seedOrganizer('org-2');
    await seedEvent();
    await assertSucceeds(updateDoc(doc(as(ORGANIZER), 'events/e1'), { title: 'Open 2026' }));
    await assertFails(updateDoc(doc(as(ORGANIZER), 'events/e1'), { organizer_ids: [ORGANIZER, 'org-2'] }));
    await assertFails(updateDoc(doc(as('org-2'), 'events/e1'), { title: 'Taken over' }));
    await assertSucceeds(updateDoc(doc(as(SUPER), 'events/e1'), { organizer_ids: [ORGANIZER, 'org-2'] }));
  });
  test('round-robin drafts: the subcollection path is written by the event\'s managers only', async () => {
    await seedOrganizer('org-2');
    await seedEvent();
    await assertSucceeds(setDoc(doc(as(ORGANIZER), 'events/e1/rr_drafts/singles_mens'), { groups: [] }));
    await assertFails(setDoc(doc(as('org-2'), 'events/e1/rr_drafts/singles_mens'), { groups: [] }));
    await assertSucceeds(getDoc(doc(as('p1'), 'events/e1/rr_drafts/singles_mens')));
  });
});

describe('event_participants: one active row per member per event', () => {
  const reg = (extra = {}) => ({
    uid: 'p1', user_name: 'Pat', event_id: 'e1', category: 'singles_tournament', sub_category: 'rr', division: "Men's",
    partner_uid: '', partner_name: '', status: 'active', created_at: serverTimestamp(), ...extra,
  });

  test('a player registers themselves on {eventId}_{uid}, doubles with its division suffix', async () => {
    await seedEvent();
    await assertSucceeds(setDoc(doc(as('p1'), 'event_participants/e1_p1'), reg()));
    await assertSucceeds(setDoc(doc(as('p1'), 'event_participants/e1_p1_mensdoubles'), reg({ category: 'doubles_tournament' })));
    // A partner not on the app is a guest_ uid.
    await assertSucceeds(setDoc(doc(as('p1'), 'event_participants/e1_p1_mixeddoubles'),
      reg({ category: 'doubles_tournament', partner_uid: 'guest_abc123def456', partner_name: 'Gus' })));
  });
  test('a wrong id, someone else, a withdrawn status or a non-timestamp is refused', async () => {
    await seedEvent();
    await assertFails(setDoc(doc(as('p1'), 'event_participants/r2'), reg()));
    await assertFails(setDoc(doc(as('p1'), 'event_participants/e1_p1_doubles'), reg()));
    await assertFails(setDoc(doc(as('p1'), 'event_participants/e1_p2'), reg({ uid: 'p2' })));
    await assertFails(setDoc(doc(as('p1'), 'event_participants/e1_p1'), reg({ status: 'withdrawn' })));
    await assertFails(setDoc(doc(as('p1'), 'event_participants/e1_p1'), reg({ created_at: '2026-09-18T00:00:00.000Z' })));
  });
  test('nobody joins a cancelled event, organizers included', async () => {
    await seedEvent({ status: 'cancelled' });
    await assertFails(setDoc(doc(as('p1'), 'event_participants/e1_p1'), reg()));
    await assertFails(setDoc(doc(as(ORGANIZER), 'event_participants/e1_guest_1'), reg({ uid: 'guest_1', user_name: 'Gus' })));
  });
  test('an event manager registers a guest', async () => {
    await seedEvent();
    await assertSucceeds(setDoc(doc(as(ORGANIZER), 'event_participants/e1_guest_1'), reg({ uid: 'guest_1', user_name: 'Gus' })));
  });
  test('a withdrawn player cannot reactivate themselves; they may still edit their partner', async () => {
    await seedEvent();
    await seed('event_participants/e1_p1', { ...reg(), status: 'withdrawn', withdrawn_reason: 'Wrong zone', created_at: new Date() });
    await assertFails(updateDoc(doc(as('p1'), 'event_participants/e1_p1'), { status: 'active' }));
    await assertFails(updateDoc(doc(as('p1'), 'event_participants/e1_p1'), { withdrawn_reason: '' }));
    await assertSucceeds(updateDoc(doc(as('p1'), 'event_participants/e1_p1'), { partner_uid: 'p2', partner_name: 'Sam' }));
    await assertSucceeds(updateDoc(doc(as(ORGANIZER), 'event_participants/e1_p1'), { status: 'active', withdrawn_reason: '' }));
  });
});

describe('matches: only the server writes results', () => {
  const open = (category = 'challenge', extra = {}) => ({
    category, sub_category: 'singles', status: 'open', winner_uid: '', player_1_uid: 'p1', player_2_uid: 'p2',
    participant_uids: ['p1', 'p2'], event_id: category === 'challenge' ? 'ladder' : '', ...extra,
  });
  const fixture = (extra = {}) => ({
    category: 'tournament', sub_category: 'singles', format: 'rr', round: 'RR', group_label: 'Group A', event_id: 'e1',
    status: 'accepted', winner_uid: '', player_1_uid: 'p1', player_2_uid: '', participant_uids: ['p1'], ...extra,
  });

  test('a player opens their own rally or challenge, open and unplayed', async () => {
    await assertSucceeds(setDoc(doc(as('p1'), 'matches/c1'), open()));
    await assertSucceeds(setDoc(doc(as('p1'), 'matches/r1'), open('rally')));
    await assertFails(setDoc(doc(as('p1'), 'matches/c2'), open('challenge', { player_1_uid: 'p3' })));
    await assertFails(setDoc(doc(as('p1'), 'matches/c3'), open('challenge', { status: 'accepted' })));
    await assertFails(setDoc(doc(as('p1'), 'matches/c4'), open('challenge', { winner_uid: 'p1' })));
    await assertFails(setDoc(doc(as('p1'), 'matches/t1'), fixture()));
  });
  test('nobody writes a result directly: players, organizers, not even on create', async () => {
    await seedOrganizer();
    await seedEvent();
    await seed('matches/c1', open('challenge', { status: 'accepted' }));
    await assertFails(setDoc(doc(as('p1'), 'matches/c2'), open('challenge', { status: 'complete', winner_uid: 'p1' })));
    await assertFails(setDoc(doc(as(ORGANIZER), 'matches/t2'), fixture({ status: 'complete', winner_uid: 'p1' })));
    await assertFails(updateDoc(doc(as('p2'), 'matches/c1'), { status: 'complete', winner_uid: 'p2' }));
    await assertFails(updateDoc(doc(as('p1'), 'matches/c1'), { winner_uid: 'p1' }));
  });
  test('the recipient accepts or declines an open request, but cannot accept-and-record it', async () => {
    await seed('matches/c1', open());
    await assertFails(updateDoc(doc(as('p1'), 'matches/c1'), { status: 'accepted' })); // the sender
    await assertFails(updateDoc(doc(as('p2'), 'matches/c1'), { status: 'complete' }));
    await assertFails(updateDoc(doc(as('p2'), 'matches/c1'), { status: 'accepted', winner_uid: 'p2' }));
    await assertSucceeds(updateDoc(doc(as('p2'), 'matches/c1'), { status: 'accepted', responded_at: serverTimestamp() }));
    await seed('matches/r1', open('rally'));
    await assertSucceeds(updateDoc(doc(as('p2'), 'matches/r1'), { status: 'declined', responded_at: serverTimestamp() }));
  });
  test('an organizer builds and edits a draw but cannot write a result or the status', async () => {
    await seedOrganizer();
    await seedEvent();
    await assertSucceeds(setDoc(doc(as(ORGANIZER), 'matches/t1'), fixture()));
    await assertFails(setDoc(doc(as(ORGANIZER), 'matches/t3'), fixture({ status: 'open' })));
    await assertSucceeds(updateDoc(doc(as(ORGANIZER), 'matches/t1'), {
      player_2_uid: 'p2', player_2_name: 'Sam', participant_uids: ['p1', 'p2'],
    }));
    await assertFails(updateDoc(doc(as(ORGANIZER), 'matches/t1'), { status: 'complete' }));
    await assertFails(updateDoc(doc(as(ORGANIZER), 'matches/t1'), { winner_uid: 'p1' }));
  });
  test('a player cannot edit a tournament fixture', async () => {
    await seedEvent();
    await seed('matches/t1', fixture({ player_2_uid: 'p2', participant_uids: ['p1', 'p2'] }));
    await assertFails(updateDoc(doc(as('p1'), 'matches/t1'), { player_2_uid: 'p3' }));
    await assertFails(updateDoc(doc(as('p1'), 'matches/t1'), { status: 'complete', winner_uid: 'p1' }));
  });
  test('the sender retracts an open request; either player calls off an accepted one until a result', async () => {
    await seed('matches/c1', open());
    await assertFails(deleteDoc(doc(as('p2'), 'matches/c1')));
    await assertSucceeds(deleteDoc(doc(as('p1'), 'matches/c1')));
    await seed('matches/c2', open('rally', { status: 'accepted' }));
    await assertSucceeds(deleteDoc(doc(as('p2'), 'matches/c2')));
    await seed('matches/c3', open('rally', { status: 'complete', winner_uid: 'p1' }));
    await assertFails(deleteDoc(doc(as('p1'), 'matches/c3')));
    await assertFails(deleteDoc(doc(as('p3'), 'matches/c3')));
  });
  test("another event's organizer cannot edit this draw; a listed co-organizer can", async () => {
    await seedOrganizer('org-2');
    await seedEvent({ organizer_ids: [ORGANIZER, 'org-3'] });
    await seed('matches/t1', fixture({ player_1_uid: '', participant_uids: [] }));
    await assertFails(updateDoc(doc(as('org-2'), 'matches/t1'), { player_1_uid: 'p1' }));
    await assertSucceeds(updateDoc(doc(as('org-3'), 'matches/t1'), { player_1_uid: 'p1' }));
    await assertFails(deleteDoc(doc(as('org-2'), 'matches/t1')));
    await assertSucceeds(deleteDoc(doc(as('org-3'), 'matches/t1')));
  });
});

describe('courts: visits near the court, reports from anyone', () => {
  const visit = (extra = {}) => ({
    category: 'visit', uid: 'p1', court_key: 'riverdale-park', dist_m: 120, created_at: serverTimestamp(), ...extra,
  });
  const report = (extra = {}) => ({
    category: 'report', sub_category: 'condition', court_key: 'riverdale-park', photo_paths: [], note: 'Net is torn',
    uid: 'p1', user_name: 'Pat', created_at: serverTimestamp(), ...extra,
  });

  test('a member checks in on their own {uid}_{courtKey}_{YYYYMMDD} visit within 400m', async () => {
    await assertSucceeds(setDoc(doc(as('p1'), 'courts/p1_riverdale-park_20260930'), visit()));
    await assertFails(setDoc(doc(as('p1'), 'courts/p1_riverdale-park_20261001'), visit({ dist_m: 900 })));
    await assertFails(setDoc(doc(as('p1'), 'courts/p2_riverdale-park_20260930'), visit()));
    await assertFails(setDoc(doc(as('p1'), 'courts/p1_riverdale-park_20261002'), visit({ uid: 'p2' })));
    await assertFails(setDoc(doc(as('p1'), 'courts/p1_riverdale-park'), visit()));
    await assertFails(setDoc(doc(visitor(), 'courts/p1_riverdale-park_20260930'), visit()));
  });
  test('a member files a report as themselves; a visitor only as not_a_member / anonymous', async () => {
    await assertSucceeds(setDoc(doc(as('p1'), 'courts/rep1'), report()));
    await assertFails(setDoc(doc(as('p1'), 'courts/rep2'), report({ uid: 'p2' })));
    await assertSucceeds(setDoc(doc(visitor(), 'courts/rep3'), report({ uid: 'not_a_member', user_name: 'anonymous' })));
    await assertFails(setDoc(doc(visitor(), 'courts/rep4'), report({ uid: 'p1' })));
    await assertFails(setDoc(doc(visitor(), 'courts/rep5'), report({ uid: 'not_a_member', user_name: 'Pat' })));
  });
  test('a condition report needs a note, at most three photos and a known kind', async () => {
    await assertFails(setDoc(doc(as('p1'), 'courts/rep1'), report({ note: '' })));
    await assertSucceeds(setDoc(doc(as('p1'), 'courts/rep2'), report({ sub_category: 'queue', note: '' })));
    await assertFails(setDoc(doc(as('p1'), 'courts/rep3'), report({ photo_paths: ['a', 'b', 'c', 'd'] })));
    await assertFails(setDoc(doc(as('p1'), 'courts/rep4'), report({ sub_category: 'suggestion' })));
  });
  test('reports and visits are never deleted, and visitors cannot read them', async () => {
    await seed('courts/rep1', report());
    await assertFails(deleteDoc(doc(as('p1'), 'courts/rep1')));
    await assertFails(getDoc(doc(visitor(), 'courts/rep1')));
  });
});

describe('server-only collections', () => {
  test('submissions: members read, nobody writes, not even an organizer', async () => {
    await seedOrganizer();
    await seed('submissions/s1', { match_id: 'm1', status: 'applied', sub_category: 'result', applied_deltas: {} });
    await assertSucceeds(getDoc(doc(as('p1'), 'submissions/s1')));
    await assertFails(getDoc(doc(visitor(), 'submissions/s1')));
    await assertFails(setDoc(doc(as('p1'), 'submissions/s2'), { match_id: 'm1', status: 'applied', winner_uid: 'p1' }));
    await assertFails(updateDoc(doc(as(ORGANIZER), 'submissions/s1'), { status: 'rejected' }));
  });
  test('awards and league seasons are public and never client-written', async () => {
    await seedOrganizer();
    await seed('awards/a1', { category: 'rr_group_bonus', sub_category: 'league', awardees: ['p1'], points_each: 5 });
    await assertSucceeds(getDoc(doc(visitor(), 'awards/a1')));
    await assertFails(setDoc(doc(as(ORGANIZER), 'awards/a2'), { category: 'rr_group_bonus', awardees: ['p1'], points_each: 5 }));
    await assertFails(updateDoc(doc(as('p1'), 'awards/a1'), { awardees: ['p1', 'p2'] }));
    await assertFails(setDoc(doc(as(ORGANIZER), 'league_seasons/2026'), { name: '2026' }));
  });
  test('bookings: the member, the provider and organizers read; nobody writes', async () => {
    await seedOrganizer();
    await seed('bookings/b1', { uid: 'p1', provider_id: 'pv', status: 'lead' });
    await assertSucceeds(getDoc(doc(as('p1'), 'bookings/b1')));
    await assertSucceeds(getDoc(doc(as('pv'), 'bookings/b1')));
    await assertSucceeds(getDoc(doc(as(ORGANIZER), 'bookings/b1')));
    await assertFails(getDoc(doc(as('p2'), 'bookings/b1')));
    await assertFails(setDoc(doc(as('p1'), 'bookings/b2'), { uid: 'p1', provider_id: 'pv', status: 'lead' }));
    await assertFails(updateDoc(doc(as('pv'), 'bookings/b1'), { status: 'complete' }));
  });
  test('connections: readable by the pair, never client-written', async () => {
    await seed('connections/p1__p2', { uids: ['p1', 'p2'], reason: 'rally' });
    await assertSucceeds(getDoc(doc(as('p1'), 'connections/p1__p2')));
    await assertFails(getDoc(doc(as('p3'), 'connections/p1__p2')));
    await assertFails(setDoc(doc(as('p1'), 'connections/p1__p3'), { uids: ['p1', 'p3'], reason: 'rally' }));
    await assertFails(setDoc(doc(as('p1'), 'public_contacts/p1'), { uid: 'p1' }));
  });
  test('notifications: never client-created; the recipient only marks read_at', async () => {
    await seed('notifications/n1', { uid: 'p1', category: 'match', sub_category: 'match_advanced', title: 'You advanced', read_at: null });
    await assertFails(setDoc(doc(as('p1'), 'notifications/n2'), { uid: 'p1', title: 'Fake', read_at: null }));
    await assertFails(getDoc(doc(as('p2'), 'notifications/n1')));
    await assertSucceeds(updateDoc(doc(as('p1'), 'notifications/n1'), { read_at: serverTimestamp() }));
    await assertFails(updateDoc(doc(as('p1'), 'notifications/n1'), { title: 'Edited' }));
    await assertFails(deleteDoc(doc(as('p2'), 'notifications/n1')));
    await assertSucceeds(deleteDoc(doc(as('p1'), 'notifications/n1')));
  });
});

describe('signed-out forms', () => {
  const member = (uid, extra = {}) => ({
    email: `${uid}@x.com`, uid, user_name: 'Pat', member: true, source: 'newsletter', created_at: serverTimestamp(), ...extra,
  });
  const anon = (extra = {}) => ({
    email: 'v@x.com', uid: 'not_a_member', user_name: 'anonymous', member: false, source: 'newsletter', created_at: serverTimestamp(), ...extra,
  });

  test('mailing list: a member owns one row keyed by their uid', async () => {
    await assertSucceeds(setDoc(doc(as('p1'), 'mailing_list/p1'), member('p1')));
    await assertSucceeds(getDoc(doc(as('p1'), 'mailing_list/p1')));
    await assertFails(setDoc(doc(as('p1'), 'mailing_list/p2'), member('p2')));
    await assertFails(setDoc(doc(as('p1'), 'mailing_list/p1x'), member('p1')));
    await assertFails(getDoc(doc(as('p2'), 'mailing_list/p1')));
    await assertFails(setDoc(doc(as('p1'), 'mailing_list/p1'), member('p1', { member: false })));
  });
  test('mailing list: a visitor row is not_a_member / anonymous and cannot forge a member', async () => {
    await assertSucceeds(setDoc(doc(visitor(), 'mailing_list/v1'), anon({ source: 'court report submission' })));
    await assertFails(setDoc(doc(visitor(), 'mailing_list/p1'), member('p1')));
    await assertFails(setDoc(doc(visitor(), 'mailing_list/v2'), anon({ phone: '555' })));
    await assertFails(setDoc(doc(visitor(), 'mailing_list/v3'), anon({ email: '' })));
    await assertFails(setDoc(doc(visitor(), 'mailing_list/v4'), anon({ member: true })));
    await assertFails(getDoc(doc(visitor(), 'mailing_list/v1')));
  });
  test('volunteer sign-ups: members as themselves, visitors anonymously; organizers read', async () => {
    await seedOrganizer();
    const signup = (extra = {}) => ({
      email: 'v@x.com', activity: 'Court host', note: '', uid: 'not_a_member', user_name: 'anonymous', created_at: serverTimestamp(), ...extra,
    });
    await assertSucceeds(setDoc(doc(visitor(), 'volunteer_signups/s1'), signup()));
    await assertSucceeds(setDoc(doc(as('p1'), 'volunteer_signups/s2'), signup({ uid: 'p1', user_name: 'Pat' })));
    await assertFails(setDoc(doc(visitor(), 'volunteer_signups/s3'), signup({ uid: 'p1' })));
    await assertFails(setDoc(doc(visitor(), 'volunteer_signups/s4'), signup({ phone: '555' })));
    await assertFails(getDoc(doc(visitor(), 'volunteer_signups/s1')));
    await assertSucceeds(getDoc(doc(as(ORGANIZER), 'volunteer_signups/s1')));
  });
});

describe('listings and task claims', () => {
  const listing = (extra = {}) => ({
    uid: 'p1', title: 'Racquet', category: 'sell', sub_category: 'sell', status: 'available', ...extra,
  });
  const claim = (extra = {}) => ({ uid: 'p1', category: 'volunteer', sub_category: 'volunteer', status: 'pending', ...extra });

  test('a listing is the member\'s own, available, with a matching category and sub_category', async () => {
    await assertSucceeds(setDoc(doc(as('p1'), 'listings/l1'), listing()));
    await assertSucceeds(setDoc(doc(as('p1'), 'listings/l2'), listing({ category: 'trade', sub_category: 'trade' })));
    await assertFails(setDoc(doc(as('p1'), 'listings/l3'), listing({ sub_category: 'rent' })));
    await assertFails(setDoc(doc(as('p1'), 'listings/l4'), listing({ category: 'giveaway', sub_category: 'giveaway' })));
    await assertFails(setDoc(doc(as('p1'), 'listings/l5'), listing({ status: 'sold' })));
    await assertFails(setDoc(doc(as('p1'), 'listings/l6'), listing({ uid: 'p2' })));
  });
  test('the owner edits a listing but cannot hand it to someone else', async () => {
    await seed('listings/l1', listing());
    await assertSucceeds(updateDoc(doc(as('p1'), 'listings/l1'), { status: 'sold' }));
    await assertFails(updateDoc(doc(as('p1'), 'listings/l1'), { uid: 'p2' }));
    await assertFails(updateDoc(doc(as('p2'), 'listings/l1'), { status: 'sold' }));
  });
  test('a claim is the member\'s own, pending, category == sub_category; only organizers review', async () => {
    await seedOrganizer();
    await assertSucceeds(setDoc(doc(as('p1'), 'task_claims/c1'), claim()));
    await assertFails(setDoc(doc(as('p1'), 'task_claims/c2'), claim({ sub_category: 'host' })));
    await assertFails(setDoc(doc(as('p1'), 'task_claims/c3'), claim({ status: 'approved' })));
    await assertFails(setDoc(doc(as('p1'), 'task_claims/c4'), claim({ category: 'bonus', sub_category: 'bonus' })));
    await assertFails(updateDoc(doc(as('p1'), 'task_claims/c1'), { status: 'approved' }));
    await assertSucceeds(updateDoc(doc(as(ORGANIZER), 'task_claims/c1'), { status: 'approved' }));
  });
});
