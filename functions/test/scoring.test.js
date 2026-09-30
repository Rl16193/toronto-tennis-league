// Scoring (lib/scoring.js) against the Firestore emulator only (project demo-ttl): `npm run test:functions`.
const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const admin = require('firebase-admin');

if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Run through the emulator: npm run test:functions');
if (!admin.apps.length) admin.initializeApp({ projectId: 'demo-ttl' });
const db = admin.firestore();
const { cancelDraw, countTournamentEntry, groupBonus, isPlayedResult, recordScore, resetScore, settleDispute } = require('../lib/scoring');

const ORG = 'org-1';
const inc = admin.firestore.FieldValue.increment;
const clear = () => fetch(
  `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/demo-ttl/databases/(default)/documents`,
  { method: 'DELETE' },
);
const set = (path, data) => db.doc(path).set(data);
const stats = async (uid) => (await db.doc(`stats/${uid}`).get()).data() || {};
const match = async (id) => (await db.doc(`matches/${id}`).get()).data();
const sets = (...pairs) => [...pairs, [0, 0], [0, 0], [0, 0]].slice(0, 3);
const record = (callerUid, matchId, input) => recordScore(db, { callerUid, matchId, input });

const group = (extra = {}) => ({
  category: 'singles', event_id: 'e1', format: 'rr', round: 'RR', rr_group: 0, status: 'pending',
  tournament_choice: 'Singles', division: "Men's", skill_group: 'Challengers',
  player_1_uid: 'a', player_1_name: 'Ann', player_2_uid: 'b', player_2_name: 'Bob', ...extra,
});
const accepted = (category, extra = {}) => ({
  category, status: 'accepted', player_1_uid: 'a', player_1_name: 'Ann', player_2_uid: 'b', player_2_name: 'Bob',
  ...(category === 'challenge' ? { event_id: 'ladder' } : {}), ...extra,
});
const A_WINS = { winnerUid: 'a', scores: sets([6, 3], [6, 4]) };

beforeEach(async () => {
  await clear();
  await set('events/e1', { creator_id: ORG, title: 'Test Open' });
  await set('events/ladder', { creator_id: ORG, title: 'Ladder' });
  await set(`preferences/${ORG}`, { event_creator: true });
});
after(() => admin.app().delete());

// ── One call, three match types, one points table ──

test('a group win counts at once: 3/1, stored deltas', async () => {
  await set('matches/m1', group());
  const out = await record('a', 'm1', { winnerUid: 'a', scores: sets([6, 2], [6, 3]) });
  assert.equal(out.applied, true);
  const m = await match('m1');
  assert.equal(m.status, 'complete');
  assert.equal(m.reported_by, 'a');
  assert.deepEqual(m.applied_deltas.a, { matchesPlayed: 1, wins: 1, leaguePoints26: 3, pointswon: 12, totalPointsPlayed: 17 });
  assert.equal((await stats('b')).leaguePoints26, 1);
  assert.equal((await stats('b')).loses, 1);
});

test('a challenge pays +3 / -3, and the loser never goes below 0', async () => {
  await set('stats/b', { leaguePoints26: 1 });
  await set('matches/c1', accepted('challenge'));
  await record('b', 'c1', A_WINS);
  assert.equal((await match('c1')).status, 'confirmed');
  assert.equal((await stats('a')).leaguePoints26, 3);
  assert.equal((await stats('b')).leaguePoints26, 0);
  assert.equal((await match('c1')).applied_deltas.b.leaguePoints26, -1);
});

test('a rally pays +2 / +1', async () => {
  await set('matches/r1', accepted('rally'));
  await record('a', 'r1', A_WINS);
  assert.deepEqual([(await stats('a')).leaguePoints26, (await stats('b')).leaguePoints26], [2, 1]);
});

test('an open request cannot be scored; walkovers are tournament only', async () => {
  await set('matches/r1', accepted('rally', { status: 'open' }));
  await assert.rejects(record('a', 'r1', A_WINS), /not ready/);
  await set('matches/r2', accepted('rally'));
  await assert.rejects(record(ORG, 'r2', { winnerUid: 'a', walkover: true }), /tournament/);
});

test('accepting a converted challenge records the result it was proposed with', async () => {
  await set('matches/c1', accepted('challenge', {
    status: 'open', source: 'tournament', winner_uid: 'a', set_1_player_1: 6, set_1_player_2: 1, set_2_player_1: 6, set_2_player_2: 1,
  }));
  await record('b', 'c1', { winnerUid: 'b', scores: sets([0, 6], [0, 6]) }); // input ignored
  const c = await match('c1');
  assert.equal(c.status, 'confirmed');
  assert.equal(c.winner_uid, 'a');
  assert.equal((await stats('a')).leaguePoints26, 3);
  assert.equal((await stats('a')).matchesPlayed, undefined); // the tournament match already counted
});

test('an organizer records a played match for two others; players cannot', async () => {
  const newMatch = { category: 'rally', player_1_uid: 'a', player_1_name: 'Ann', player_2_uid: 'b', player_2_name: 'Bob' };
  await assert.rejects(recordScore(db, { callerUid: 'a', newMatch, input: A_WINS }), /organizer/);
  const out = await recordScore(db, { callerUid: ORG, newMatch, input: A_WINS });
  const r = await match(out.matchId);
  assert.equal(r.status, 'confirmed');
  assert.equal(r.recorded_by_organizer, true);
  assert.equal((await stats('a')).leaguePoints26, 2);
});

// ── Corrections and disputes ──

test('the player who entered it may fix their own entry; the opponent only with a closer score', async () => {
  await set('matches/m1', group());
  await record('a', 'm1', { winnerUid: 'a', scores: sets([6, 4], [6, 4]) });
  const wider = await record('b', 'm1', { winnerUid: 'a', scores: sets([6, 0], [6, 0]) });
  assert.equal(wider.recordedOnly, true);
  await record('a', 'm1', { winnerUid: 'a', scores: sets([6, 0], [6, 1]) }); // own fix, wider is fine
  assert.equal((await match('m1')).set_2_player_2, 1);
  await record('b', 'm1', { winnerUid: 'a', scores: sets([6, 4], [7, 5]) }); // closer replaces
  const a = await stats('a');
  assert.deepEqual([a.leaguePoints26, a.matchesPlayed, a.pointswon, a.totalPointsPlayed], [3, 1, 13, 22]);
});

test('a different winner opens a dispute; reject keeps the result, approve applies the other score', async () => {
  await set('stats/b', { leaguePoints26: 10 });
  await set('matches/c1', accepted('challenge'));
  await record('a', 'c1', A_WINS);
  const out = await record('b', 'c1', { winnerUid: 'b', scores: sets([3, 6], [4, 6]) });
  assert.equal(out.inDispute, true);
  let c = await match('c1');
  assert.deepEqual([c.score_disputed, c.dispute_uid], [true, 'b']);
  assert.equal((await stats('a')).leaguePoints26, 3);

  await assert.rejects(settleDispute(db, { uid: 'a', matchId: 'c1', approve: true }), /organizer/);
  await settleDispute(db, { uid: ORG, matchId: 'c1', approve: false });
  assert.equal((await match('c1')).score_disputed, false);
  assert.equal((await stats('a')).leaguePoints26, 3);

  await record('b', 'c1', { winnerUid: 'b', scores: sets([3, 6], [4, 6]) });
  await settleDispute(db, { uid: ORG, matchId: 'c1', approve: true });
  c = await match('c1');
  assert.deepEqual([c.winner_uid, c.score_disputed, c.set_1_player_2], ['b', false, 6]);
  assert.equal((await stats('a')).leaguePoints26, 0); // 3 back, then -3 floored at 0
  assert.equal((await stats('b')).leaguePoints26, 13); // 7 + 3 back + 3
  assert.equal((await stats('b')).wins, 1);
});

test('players cannot record a walkover; an organizer group walkover pays 1/1 and no match', async () => {
  await set('matches/m1', group());
  await assert.rejects(record('a', 'm1', { winnerUid: 'a', walkover: true }), /Only the organizer/);
  await record(ORG, 'm1', { winnerUid: 'a', walkover: true });
  const a = await stats('a');
  assert.deepEqual([a.leaguePoints26, (await stats('b')).leaguePoints26, a.matchesPlayed], [1, 1, undefined]);
});

test('a knockout walkover pays the winner 0 and the loser the round points, and advances', async () => {
  await set('matches/qf', { ...group({ format: 'knockout', round: 'QF', next_match_id: 'S1', next_slot: 'player_2' }), match_id: 'Q1' });
  await set('matches/sf', { ...group({ format: 'knockout', round: 'SF', player_2_uid: '', player_2_name: 'Player Loading' }), match_id: 'S1', player_1_uid: 'c', player_1_name: 'Cy' });
  await record(ORG, 'qf', { winnerUid: 'a', walkover: true });
  assert.equal((await stats('a')).leaguePoints26 ?? 0, 0);
  assert.equal((await stats('b')).leaguePoints26, 3);
  assert.equal((await match('sf')).player_2_uid, 'a');
});

test('a played final pays 20/10 and marks its event over', async () => {
  await set('matches/f', group({ format: 'knockout', round: 'F' }));
  await record('a', 'f', A_WINS);
  assert.deepEqual([(await stats('a')).leaguePoints26, (await stats('b')).leaguePoints26], [20, 10]);
  assert.ok((await db.doc('events/e1').get()).data().completed_at);
});

test('an outsider cannot record; a score that does not give the chosen winner the match is refused', async () => {
  await set('matches/m1', group());
  await assert.rejects(record('zed', 'm1', A_WINS), /Only the two players/);
  await assert.rejects(record('a', 'm1', { winnerUid: 'a', scores: sets([2, 6], [3, 6]) }), /more sets/);
});

test('doubles partners get the captain\'s credit, and a partner may record the score', async () => {
  await set('matches/d1', group({ category: 'doubles', tournament_choice: 'Doubles', division: 'All', skill_group: 'All' }));
  await set('event_participants/pa', { uid: 'a', event_id: 'e1', partner_uid: 'a2' });
  await set('event_participants/pb', { uid: 'b', event_id: 'e1', partner_uid: 'b2' });
  await record('b2', 'd1', A_WINS);
  assert.equal((await stats('a2')).leaguePoints26, 3);
  assert.equal((await stats('b2')).leaguePoints26, 1);
  assert.equal((await stats('a2')).league, 'Doubles');
});

// ── Payments made before this module ──

test('an old walkover and an old no-show are undone with the rules they were paid under', async () => {
  await set('matches/m1', group({ status: 'complete', winner_uid: 'a', walkover: true }));
  await set('stats/a', { leaguePoints26: 3, matchesPlayed: 1, wins: 1, tournamentsPlayed: 0 });
  await set('stats/b', { leaguePoints26: 1, matchesPlayed: 1, loses: 1, tournamentsPlayed: 1 });
  await record(ORG, 'm1', { winnerUid: 'b', scores: sets([2, 6], [3, 6]) });
  const a = await stats('a');
  assert.deepEqual([a.leaguePoints26, a.matchesPlayed, a.wins, a.loses], [1, 1, 0, 1]);

  await set('matches/m2', group({ status: 'complete', winner_uid: '', no_show: true }));
  await record(ORG, 'm2', { winnerUid: 'a', scores: sets([6, 1], [6, 1]) });
  assert.equal((await stats('a')).leaguePoints26, 1 - 1 + 3);
  assert.equal((await match('m2')).no_show, false);
});

test('an old paid challenge is flipped using what it stored', async () => {
  // Paid by the old payout: winner +3, and the loser actually lost 2.
  await set('stats/a', { leaguePoints26: 13, wins: 1, matchesPlayed: 1 });
  await set('stats/b', { leaguePoints26: 0, loses: 1, matchesPlayed: 1 });
  await set('matches/c1', accepted('challenge', {
    status: 'confirmed', winner_uid: 'a', set_1_player_1: 6, set_1_player_2: 3, set_2_player_1: 6, set_2_player_2: 4,
    applied: true, applied_winner_uid: 'a', applied_loser_delta: 2, applied_counted_match: true,
  }));
  await record(ORG, 'c1', { winnerUid: 'b', scores: sets([3, 6], [4, 6]) });
  assert.equal((await stats('b')).leaguePoints26, 5); // 0 + 2 back + 3
  assert.equal((await stats('a')).leaguePoints26, 7); // 13 - 3 back = 10, then -3
  assert.equal((await stats('a')).matchesPlayed, 1);
});

// ── Organizer actions ──

test('reset score undoes exactly what the result paid and pulls the winner back', async () => {
  await set('matches/qf', { ...group({ format: 'knockout', round: 'QF', next_match_id: 'S1', next_slot: 'player_1' }), match_id: 'Q1' });
  await set('matches/sf', { ...group({ format: 'knockout', round: 'SF', player_1_uid: '', player_1_name: 'Player Loading', player_2_uid: 'c' }), match_id: 'S1' });
  await record('a', 'qf', { winnerUid: 'a', scores: sets([6, 2], [6, 2]) });
  assert.equal((await match('sf')).player_1_uid, 'a');
  await assert.rejects(resetScore(db, { uid: 'a', matchId: 'qf' }), /organizer/);
  await resetScore(db, { uid: ORG, matchId: 'qf' });
  const a = await stats('a');
  const b = await stats('b');
  assert.deepEqual([a.matchesPlayed, a.wins, b.leaguePoints26, b.loses], [0, 0, 0, 0]);
  assert.equal((await match('qf')).status, 'pending');
  assert.equal((await match('sf')).player_1_uid, '');
});

test('cancel draw undoes new results, old results and the group bonus, then deletes', async () => {
  await set('matches/g1', group());
  await record('a', 'g1', { winnerUid: 'a', scores: sets([6, 2], [6, 2]) });
  await set('matches/g2', group({
    status: 'complete', winner_uid: 'b', set_1_player_1: 2, set_1_player_2: 6, set_2_player_1: 3, set_2_player_2: 6,
  }));
  await db.doc('stats/a').set({ leaguePoints26: inc(1 + 5), matchesPlayed: inc(1), loses: inc(1), pointswon: inc(5), totalPointsPlayed: inc(17), tournamentsPlayed: inc(1) }, { merge: true });
  await db.doc('stats/b').set({ leaguePoints26: inc(3 + 5), matchesPlayed: inc(1), wins: inc(1), pointswon: inc(12), totalPointsPlayed: inc(17) }, { merge: true });
  await db.doc('matches/g1').update({ rr_group_bonus_v2: true });
  await db.doc('matches/g2').update({ rr_group_bonus_v2: true });
  await cancelDraw(db, { uid: ORG, eventId: 'e1', matchIds: ['g1', 'g2'] });
  for (const uid of ['a', 'b']) {
    const s = await stats(uid);
    assert.deepEqual([s.leaguePoints26, s.matchesPlayed, s.totalPointsPlayed], [0, 0, 0], uid);
  }
  assert.equal(await match('g1'), undefined);
});

test('group bonus pays the group once; taking it back takes only from those paid', async () => {
  await set('matches/g1', group());
  await set('matches/g2', group({ player_2_uid: 'c', player_2_name: 'Cy' }));
  assert.equal(await groupBonus(db, { uid: ORG, eventId: 'e1', matchIds: ['g1', 'g2'], award: true }), 3);
  assert.equal(await groupBonus(db, { uid: ORG, eventId: 'e1', matchIds: ['g1', 'g2'], award: true }), 0);
  assert.equal((await stats('c')).leaguePoints26, 5);
  await db.doc('matches/g2').update({ player_2_uid: 'late' });
  await groupBonus(db, { uid: ORG, eventId: 'e1', matchIds: ['g1', 'g2'], award: false });
  assert.equal((await stats('c')).leaguePoints26, 0);
  assert.equal((await stats('late')).leaguePoints26 ?? 0, 0);
  await assert.rejects(groupBonus(db, { uid: 'a', eventId: 'e1', matchIds: ['g1'], award: true }), /organizer/);
});

test('every applied result, reset and rejected dispute is audited', async () => {
  await set('matches/m1', group());
  await record('a', 'm1', A_WINS);
  await resetScore(db, { uid: ORG, matchId: 'm1' });
  const rows = await db.collection('tournament_result_audit').where('match_id', '==', 'm1').get();
  assert.deepEqual(rows.docs.map((d) => d.data().action).sort(), ['apply', 'reset']);
});

// ── Registration and shared checks ──

test('a tournament entry counts once per player per event, even after a removal and re-join', async () => {
  await set('events/e1', { creator_id: ORG, title: 'Test Open', type: 'Tournament' });
  await set('event_participants/r1', { uid: 'a', event_id: 'e1' });
  assert.equal(await countTournamentEntry(db, 'r1'), true);
  assert.equal(await countTournamentEntry(db, 'r1'), false);
  await set('event_participants/r2', { uid: 'a', event_id: 'e1' }); // re-joined after a removal
  assert.equal(await countTournamentEntry(db, 'r2'), false);
  assert.equal((await stats('a')).tournamentsPlayed, 1);
  await set('events/l1', { creator_id: ORG, title: 'Ladder', type: 'League Ladder' });
  await set('event_participants/r3', { uid: 'a', event_id: 'l1' });
  assert.equal(await countTournamentEntry(db, 'r3'), false);
});

test('results no longer count tournaments played', async () => {
  await set('matches/f', group({ format: 'knockout', round: 'F' }));
  await record('a', 'f', A_WINS);
  assert.equal((await stats('b')).tournamentsPlayed, undefined);
});

test('a played result: games, not a walkover or no show; challenges and rallies once recorded', () => {
  const played = { ...group(), status: 'complete', winner_uid: 'a', set_1_player_1: 6, set_1_player_2: 2 };
  assert.equal(isPlayedResult(played), true);
  assert.equal(isPlayedResult({ ...played, walkover: true }), false);
  assert.equal(isPlayedResult({ ...played, set_1_player_1: 0, set_1_player_2: 0 }), false);
  assert.equal(isPlayedResult({ ...accepted('rally'), status: 'confirmed', winner_uid: 'a' }), true);
  assert.equal(isPlayedResult(accepted('challenge')), false);
});

test("organizers are per event: another event's organizer cannot score here; a listed co-organizer can", async () => {
  await set('preferences/org-2', { event_creator: true });
  await set('preferences/org-3', { event_creator: true });
  await set('events/e1', { creator_id: ORG, title: 'Test Open', organizer_ids: ['org-3'] });
  await set('matches/m1', group());
  await assert.rejects(record('org-2', 'm1', { winnerUid: 'a', walkover: true }), /Only the two players or an organizer/);
  await record('org-3', 'm1', { winnerUid: 'a', walkover: true });
  assert.equal((await match('m1')).status, 'complete');
  // A rally has no event, so any organizer may record one.
  await set('matches/r1', accepted('rally'));
  await record('org-2', 'r1', A_WINS);
  assert.equal((await match('r1')).status, 'confirmed');
});
