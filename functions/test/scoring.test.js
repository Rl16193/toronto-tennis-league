// Scoring (lib/scoring.js) against the Firestore emulator only (project demo-ttl): `npm run test:functions`.
const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const admin = require('firebase-admin');

if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Run through the emulator: npm run test:functions');
if (!admin.apps.length) admin.initializeApp({ projectId: 'demo-ttl' });
const db = admin.firestore();
const { Timestamp } = require('firebase-admin/firestore');
const {
  POINTS, RESULT_KINDS, awardIdForGroup, cancelDraw, closeStaleRequests, groupBonus, isPlayedResult, pairDraw, pointsFor,
  recordScore, recountEntries, resetScore, settleDispute,
} = require('../lib/scoring');

const ORG = 'org-1';
const SUPER = '7PvfzNtDmsOq5GLMieId7QRT7wH3';
const DRAW = 'singles_mens_challengers';
const clear = () => fetch(
  `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/demo-ttl/databases/(default)/documents`,
  { method: 'DELETE' },
);
const set = (path, data) => db.doc(path).set(data);
const stats = async (uid) => (await db.doc(`stats/${uid}`).get()).data() || {};
const match = async (id) => (await db.doc(`matches/${id}`).get()).data();
const entries = async (matchId) => (await db.collection('submissions').where('match_id', '==', matchId).get())
  .docs.map((d) => ({ id: d.id, ...d.data() }))
  .sort((a, b) => a.created_at.toMillis() - b.created_at.toMillis());
const current = async (matchId) =>
  (await entries(matchId)).find((e) => e.status === 'applied' && RESULT_KINDS.includes(e.sub_category));
const sets = (...pairs) => [...pairs, [0, 0], [0, 0], [0, 0]].slice(0, 3);
const record = (callerUid, matchId, input) => recordScore(db, { callerUid, matchId, input });

const group = (extra = {}) => ({
  category: 'tournament', sub_category: 'singles', event_id: 'e1', format: 'rr', round: 'RR', group_label: 'Group A',
  status: 'accepted', division: "Men's", skill_group: 'Challengers', zone: '', match_id: '', winner_uid: '',
  player_1_uid: 'a', player_1_name: 'Ann', player_2_uid: 'b', player_2_name: 'Bob', participant_uids: ['a', 'b'], ...extra,
});
const knockout = (extra = {}) => group({ format: 'knockout', group_label: '', ...extra });
const accepted = (category, extra = {}) => ({
  category, sub_category: 'singles', status: 'accepted', winner_uid: '',
  player_1_uid: 'a', player_1_name: 'Ann', player_2_uid: 'b', player_2_name: 'Bob', participant_uids: ['a', 'b'],
  event_id: category === 'challenge' ? 'ladder' : '', ...extra,
});
const A_WINS = { winnerUid: 'a', scores: sets([6, 3], [6, 4]) };

beforeEach(async () => {
  await clear();
  await set('events/e1', { title: 'Test Open', organizer_ids: [ORG] });
  await set('events/ladder', { title: 'Ladder', organizer_ids: [ORG] });
  await set(`providers/${ORG}`, { roles: ['organizer'] });
});
after(() => admin.app().delete());

// ── One call, three match types, one points table ──

test('a group win counts at once: 3/1, the entry stores what it paid', async () => {
  await set('matches/m1', group());
  const out = await record('a', 'm1', { winnerUid: 'a', scores: sets([6, 2], [6, 3]) });
  assert.equal(out.applied, true);
  const m = await match('m1');
  assert.deepEqual([m.status, m.winner_uid], ['complete', 'a']);
  const e = await current('m1');
  assert.deepEqual([e.uid, e.sub_category, e.points_winner, e.points_loser], ['a', 'result', 3, 1]);
  assert.deepEqual([e.set_1_player_1, e.set_1_player_2, e.set_2_player_1, e.set_2_player_2], [6, 2, 6, 3]);
  assert.equal(e.applied_deltas, undefined); // points_winner/points_loser are the record
  const a = await stats('a');
  assert.deepEqual([a.leaguePoints, a.matchesPlayed, a.wins, a.pointswon, a.totalPointsPlayed], [3, 1, 1, 12, 17]);
  assert.ok(e.completed_at);
  const b = await stats('b');
  assert.deepEqual([b.leaguePoints, b.matchesPlayed, b.wins], [1, 1, undefined]);
  assert.equal(b.loses, undefined); // losses derive as matchesPlayed - wins
});

test('a challenge pays +3 / -3, and the loser never goes below 0', async () => {
  await set('stats/b', { leaguePoints: 1 });
  await set('matches/c1', accepted('challenge'));
  await record('b', 'c1', A_WINS);
  assert.equal((await match('c1')).status, 'complete');
  assert.equal((await stats('a')).leaguePoints, 3);
  assert.equal((await stats('b')).leaguePoints, 0);
  const e = await current('c1');
  assert.deepEqual([e.points_winner, e.points_loser], [3, -1]);
});

test('undo reverses what the entry stored, not the table: a capped challenge loss comes back as 1', async () => {
  await set('stats/b', { leaguePoints: 1 });
  await set('matches/c1', accepted('challenge'));
  await record('b', 'c1', A_WINS);
  await resetScore(db, { uid: ORG, matchId: 'c1' });
  const [a, b] = [await stats('a'), await stats('b')];
  assert.deepEqual([a.leaguePoints, a.matchesPlayed, a.wins, b.leaguePoints, b.matchesPlayed], [0, 0, 0, 1, 0]);
  const reset = (await entries('c1')).find((e) => e.sub_category === 'reset');
  assert.deepEqual([reset.points_winner, reset.points_loser], [-3, 1]);
});

test('a rally pays +2 / +1 and no games tally', async () => {
  await set('matches/r1', accepted('rally'));
  await record('a', 'r1', A_WINS);
  const a = await stats('a');
  assert.deepEqual([a.leaguePoints, (await stats('b')).leaguePoints], [2, 1]);
  assert.equal(a.pointswon, undefined);
});

test('an open request cannot be scored; walkovers are tournament only', async () => {
  await set('matches/r1', accepted('rally', { status: 'open' }));
  await assert.rejects(record('a', 'r1', A_WINS), /not ready/);
  await set('matches/r2', accepted('rally'));
  await assert.rejects(record(ORG, 'r2', { winnerUid: 'a', walkover: true }), /tournament/);
});

test('an organizer records a played match for two others; players cannot', async () => {
  const newMatch = { category: 'rally', player_1_uid: 'a', player_1_name: 'Ann', player_2_uid: 'b', player_2_name: 'Bob' };
  await assert.rejects(recordScore(db, { callerUid: 'a', newMatch, input: A_WINS }), /organizer/);
  const out = await recordScore(db, { callerUid: ORG, newMatch, input: A_WINS });
  const r = await match(out.matchId);
  assert.deepEqual([r.category, r.status, r.winner_uid], ['rally', 'complete', 'a']);
  assert.deepEqual(r.participant_uids, ['a', 'b']);
  assert.equal((await current(out.matchId)).uid, ORG);
  assert.equal((await stats('a')).leaguePoints, 2);
  assert.equal(r.position, undefined);
});

test('a recorded challenge/rally takes its division and the lower skill band from both players', async () => {
  const newMatch = { category: 'rally', player_1_uid: 'a', player_1_name: 'Ann', player_2_uid: 'b', player_2_name: 'Bob' };
  await set('stats/a', { league: "Men's", skill_level: 4 });
  await set('stats/b', { league: "Men's", skill_level: 3 });
  let r = await match((await recordScore(db, { callerUid: ORG, newMatch, input: A_WINS })).matchId);
  assert.deepEqual([r.division, r.skill_group], ["Men's", 'Challengers']);
  await set('stats/b', { league: "Women's", skill_level: 2.5 });
  r = await match((await recordScore(db, { callerUid: ORG, newMatch, input: A_WINS })).matchId);
  assert.deepEqual([r.division, r.skill_group], ['Mixed', 'Beginners']);
  await set('stats/b', {});
  r = await match((await recordScore(db, { callerUid: ORG, newMatch, input: A_WINS })).matchId);
  assert.deepEqual([r.division, r.skill_group], ['Mixed', 'Masters']);
  assert.equal(pairDraw({ league: "Men's Retired Pro" }, { league: "Men's" }).division, "Men's");
  assert.deepEqual(pairDraw(), { division: 'Mixed', skill_group: '' });
});

// ── Corrections and disputes ──

test('the player who entered it may fix their own entry; the opponent only with a closer score', async () => {
  await set('matches/m1', group());
  await record('a', 'm1', { winnerUid: 'a', scores: sets([6, 4], [6, 4]) });
  const first = await current('m1');
  assert.equal((await record('a', 'm1', { winnerUid: 'a', scores: sets([6, 4], [6, 4]) })).duplicate, true);
  const wider = await record('b', 'm1', { winnerUid: 'a', scores: sets([6, 0], [6, 0]) });
  assert.equal(wider.recordedOnly, true);
  assert.equal((await current('m1')).id, first.id);
  await record('a', 'm1', { winnerUid: 'a', scores: sets([6, 0], [6, 1]) }); // own fix, wider is fine
  const fixed = await current('m1');
  assert.deepEqual([fixed.sub_category, fixed.replaces_id, fixed.set_2_player_2], ['correction', first.id, 1]);
  await record('b', 'm1', { winnerUid: 'a', scores: sets([6, 4], [7, 5]) }); // closer replaces
  const last = await current('m1');
  assert.deepEqual([last.uid, last.replaces_id], ['b', fixed.id]);
  assert.ok(last.completed_at.isEqual(first.completed_at)); // pinned to the first scoring
  const a = await stats('a');
  assert.deepEqual([a.leaguePoints, a.matchesPlayed, a.pointswon, a.totalPointsPlayed], [3, 1, 13, 22]);
  const all = await entries('m1');
  assert.equal(all.filter((e) => e.status === 'applied').length, 1);
  assert.equal(all.filter((e) => e.status === 'superseded').length, all.length - 1);
});

test('a different winner opens a dispute; reject keeps the result, approve applies the other score', async () => {
  await set('stats/b', { leaguePoints: 10 });
  await set('matches/c1', accepted('challenge'));
  await record('a', 'c1', A_WINS);
  const out = await record('b', 'c1', { winnerUid: 'b', scores: sets([3, 6], [4, 6]) });
  assert.equal(out.inDispute, true);
  const disputed = (await entries('c1')).filter((e) => e.status === 'disputed');
  assert.deepEqual(disputed.map((e) => [e.uid, e.winner_uid]), [['b', 'b']]);
  assert.equal((await match('c1')).winner_uid, 'a');
  assert.equal((await stats('a')).leaguePoints, 3);

  await assert.rejects(settleDispute(db, { uid: 'a', matchId: 'c1', approve: true }), /organizer/);
  await settleDispute(db, { uid: ORG, matchId: 'c1', approve: false });
  const rejected = (await entries('c1')).find((e) => e.id === disputed[0].id);
  assert.deepEqual([rejected.status, rejected.resolved_by], ['rejected', ORG]);
  assert.ok(rejected.resolved_at);
  assert.equal((await stats('a')).leaguePoints, 3);
  await assert.rejects(settleDispute(db, { uid: ORG, matchId: 'c1', approve: true }), /not disputed/);

  await record('b', 'c1', { winnerUid: 'b', scores: sets([3, 6], [4, 6]) });
  await settleDispute(db, { uid: ORG, matchId: 'c1', approve: true });
  assert.equal((await match('c1')).winner_uid, 'b');
  const approved = await current('c1');
  assert.deepEqual([approved.uid, approved.winner_uid, approved.sub_category, approved.resolved_by, approved.set_1_player_2], ['b', 'b', 'correction', ORG, 6]);
  assert.equal((await stats('a')).leaguePoints, 0); // 3 back, then -3 floored at 0
  assert.equal((await stats('b')).leaguePoints, 13); // 7 + 3 back + 3
  assert.equal((await stats('b')).wins, 1);
});

test('players cannot record a walkover; an organizer group walkover pays 1/1 and no match', async () => {
  await set('matches/m1', group());
  await assert.rejects(record('a', 'm1', { winnerUid: 'a', walkover: true }), /Only the organizer/);
  await record(ORG, 'm1', { winnerUid: 'a', walkover: true });
  const a = await stats('a');
  assert.deepEqual([a.leaguePoints, (await stats('b')).leaguePoints, a.matchesPlayed], [1, 1, undefined]);
  const e = await current('m1');
  assert.deepEqual([e.sub_category, e.points_winner, e.points_loser], ['walkover', 1, 1]);
  assert.equal(isPlayedResult(e), false);
  await assert.rejects(record('a', 'm1', { winnerUid: 'a', scores: sets([6, 0], [6, 0]) }), /Only the organizer/);
});

test('a knockout walkover pays the winner 0 and the loser the round points, and advances', async () => {
  await set('matches/qf', knockout({ round: 'QF', match_id: 'Q1', next_match_id: 'S1', next_slot: 'player_2' }));
  await set('matches/sf', knockout({
    round: 'SF', match_id: 'S1', player_1_uid: 'c', player_1_name: 'Cy', player_2_uid: '', player_2_name: 'Player Loading', participant_uids: ['c'],
  }));
  await record(ORG, 'qf', { winnerUid: 'a', walkover: true });
  assert.equal((await stats('a')).leaguePoints ?? 0, 0);
  assert.equal((await stats('b')).leaguePoints, 3);
  const sf = await match('sf');
  assert.deepEqual([sf.player_2_uid, sf.player_2_name], ['a', 'Ann']);
  assert.deepEqual([...sf.participant_uids].sort(), ['a', 'c']);
});

test('with no next_slot, the side comes from the number in match_id', async () => {
  const qf = (id, extra) => knockout({ round: 'QF', match_id: id, next_match_id: 'S1', ...extra });
  await set('matches/q10', qf('m10', { player_1_uid: 'c', player_1_name: 'Cy', player_2_uid: 'd', player_2_name: 'Di' }));
  await set('matches/q9', qf('m9'));
  await set('matches/sf', knockout({
    round: 'SF', match_id: 'S1', player_1_uid: '', player_1_name: 'Player Loading', player_2_uid: '', player_2_name: 'Player Loading', participant_uids: [],
  }));
  await record('a', 'q9', A_WINS);
  await record('c', 'q10', { winnerUid: 'c', scores: sets([6, 0], [6, 0]) });
  const sf = await match('sf');
  assert.deepEqual([sf.player_1_uid, sf.player_2_uid], ['a', 'c']); // m9 before m10, not '10' < '9'
});

test('a played final pays 20/10 and marks its event over', async () => {
  await set('matches/f', knockout({ round: 'F' }));
  await record('a', 'f', A_WINS);
  assert.deepEqual([(await stats('a')).leaguePoints, (await stats('b')).leaguePoints], [20, 10]);
  assert.ok((await db.doc('events/e1').get()).data().completed_at);
});

test('an outsider cannot record; a score that does not give the chosen winner the match is refused', async () => {
  await set('matches/m1', group());
  await assert.rejects(record('zed', 'm1', A_WINS), /Only the two players/);
  await assert.rejects(record('a', 'm1', { winnerUid: 'a', scores: sets([2, 6], [3, 6]) }), /more sets/);
  await assert.rejects(record('a', 'm1', { winnerUid: '', scores: sets([6, 2], [6, 3]) }), /who won/);
  await set('matches/m2', group({ player_2_uid: '', player_2_name: 'Player Loading' }));
  await assert.rejects(record('a', 'm2', A_WINS), /Both players/);
});

test('doubles partners get the captain\'s credit, and a partner may record the score', async () => {
  await set('matches/d1', group({ sub_category: 'doubles', skill_group: 'All', participant_uids: ['a', 'a2', 'b', 'b2'] }));
  const reg = (uid, partner) => ({
    uid, event_id: 'e1', category: 'doubles_tournament', sub_category: 'rr', division: "Men's", partner_uid: partner, status: 'active',
  });
  await set('event_participants/e1_a_mensdoubles', reg('a', 'a2'));
  await set('event_participants/e1_b_mensdoubles', reg('b', 'b2'));
  await record('b2', 'd1', A_WINS);
  assert.equal((await stats('a2')).leaguePoints, 3);
  const b2 = await stats('b2');
  assert.deepEqual([b2.leaguePoints, b2.matchesPlayed, b2.pointswon], [1, 1, 7]);
  await resetScore(db, { uid: ORG, matchId: 'd1' }); // partners are reversed too
  for (const uid of ['a', 'a2', 'b', 'b2']) {
    const s = await stats(uid);
    assert.deepEqual([s.leaguePoints, s.matchesPlayed, s.wins ?? 0, s.pointswon, s.totalPointsPlayed], [0, 0, 0, 0, 0], uid);
  }
});

test('a guest partner gets a stats doc only once paid, with the full shape, and is reversed like a member', async () => {
  await set('matches/d1', group({ sub_category: 'doubles', skill_group: 'All', participant_uids: ['a', 'b', 'b2'] }));
  const reg = (uid, partner, partner_name = '') => ({
    uid, event_id: 'e1', category: 'doubles_tournament', sub_category: 'rr', division: "Men's", partner_uid: partner, partner_name, status: 'active',
  });
  await set('event_participants/e1_a_mensdoubles', reg('a', 'guest_g1', 'Gus'));
  await set('event_participants/e1_b_mensdoubles', reg('b', 'b2'));
  assert.equal((await db.doc('stats/guest_g1').get()).exists, false); // named, not paid
  await record(ORG, 'd1', { winnerUid: 'a', walkover: true });
  const g = await stats('guest_g1');
  assert.deepEqual([g.uid, g.name, g.leaguePoints, g.matchesPlayed, g.rsPoints, g.rankTrend], ['guest_g1', 'Gus', 1, 0, 0, 'flat']);
  assert.deepEqual(g.active_months, []);
  await record(ORG, 'd1', { winnerUid: 'a', scores: sets([6, 1], [6, 1]) }); // organizer replaces the walkover
  const g2 = await stats('guest_g1');
  assert.deepEqual([g2.leaguePoints, g2.matchesPlayed, g2.wins, g2.name], [3, 1, 1, 'Gus']);
  await resetScore(db, { uid: ORG, matchId: 'd1' });
  const g3 = await stats('guest_g1');
  assert.deepEqual([g3.leaguePoints, g3.matchesPlayed, g3.wins], [0, 0, 0]);
});

// ── Organizer actions ──

test('reset score undoes exactly what the result paid, records it, and pulls the winner back', async () => {
  await set('matches/qf', knockout({ round: 'QF', match_id: 'Q1', next_match_id: 'S1', next_slot: 'player_1' }));
  await set('matches/sf', knockout({
    round: 'SF', match_id: 'S1', player_1_uid: '', player_1_name: 'Player Loading', player_2_uid: 'c', player_2_name: 'Cy', participant_uids: ['c'],
  }));
  await record('a', 'qf', { winnerUid: 'a', scores: sets([6, 2], [6, 2]) });
  const result = await current('qf');
  assert.equal((await match('sf')).player_1_uid, 'a');
  await assert.rejects(resetScore(db, { uid: 'a', matchId: 'qf' }), /organizer/);
  assert.equal(await resetScore(db, { uid: ORG, matchId: 'qf' }), true);
  const a = await stats('a');
  const b = await stats('b');
  assert.deepEqual([a.matchesPlayed, a.wins, a.pointswon, b.leaguePoints, b.matchesPlayed], [0, 0, 0, 0, 0]);
  const qf = await match('qf');
  assert.deepEqual([qf.status, qf.winner_uid], ['accepted', '']);
  const sf = await match('sf');
  assert.deepEqual([sf.player_1_uid, sf.player_1_name, sf.participant_uids], ['', 'Player Loading', ['c']]);
  const all = await entries('qf');
  assert.equal(all.find((e) => e.id === result.id).status, 'superseded');
  const reset = all.find((e) => e.sub_category === 'reset');
  assert.deepEqual([reset.status, reset.uid, reset.replaces_id], ['applied', ORG, result.id]);
  assert.deepEqual([reset.points_winner, reset.points_loser], [0, -3]);
  assert.equal(await current('qf'), undefined);
  assert.equal(await resetScore(db, { uid: ORG, matchId: 'qf' }), false); // nothing left to reset
});

test('every entry is kept: a rally result and its reset, and the rally is playable again', async () => {
  await set('matches/r1', accepted('rally'));
  await record('a', 'r1', A_WINS);
  await resetScore(db, { uid: ORG, matchId: 'r1' });
  const r = await match('r1');
  assert.deepEqual([r.status, r.winner_uid], ['accepted', '']);
  assert.deepEqual([(await stats('a')).leaguePoints, (await stats('b')).leaguePoints], [0, 0]);
  const rows = (await entries('r1')).map((e) => `${e.sub_category}:${e.status}`);
  assert.deepEqual(rows, ['result:superseded', 'reset:applied']);
});

test('cancel draw undoes results and the group bonus, then deletes', async () => {
  const g1 = `e1_${DRAW}_G1`;
  const g2 = `e1_${DRAW}_G2`;
  await set(`matches/${g1}`, group({ match_id: 'G1' }));
  await set(`matches/${g2}`, group({ match_id: 'G2' }));
  await record('a', g1, { winnerUid: 'a', scores: sets([6, 2], [6, 2]) });
  await record('b', g2, { winnerUid: 'b', scores: sets([2, 6], [3, 6]) });
  await groupBonus(db, { uid: ORG, eventId: 'e1', matchIds: [g1, g2], award: true });
  assert.equal((await stats('a')).leaguePoints, 3 + 1 + 5);
  await assert.rejects(cancelDraw(db, { uid: 'a', eventId: 'e1', matchIds: [g1, g2] }), /organizer/);
  assert.equal(await cancelDraw(db, { uid: ORG, eventId: 'e1', matchIds: [g1, g2] }), 2);
  for (const uid of ['a', 'b']) {
    const s = await stats(uid);
    assert.deepEqual([s.leaguePoints, s.matchesPlayed, s.totalPointsPlayed], [0, 0, 0], uid);
  }
  assert.equal(await match(g1), undefined);
  assert.equal((await db.doc(`awards/${awardIdForGroup('e1', DRAW, 'Group A')}`).get()).exists, false);
  assert.equal(await current(g1), undefined);
});

test('group bonus pays the group once; taking it back takes only from those paid', async () => {
  const g1 = `e1_${DRAW}_G1`;
  const g2 = `e1_${DRAW}_G2`;
  await set(`matches/${g1}`, group({ match_id: 'G1' }));
  await set(`matches/${g2}`, group({ match_id: 'G2', player_2_uid: 'c', player_2_name: 'Cy' }));
  assert.equal(await groupBonus(db, { uid: ORG, eventId: 'e1', matchIds: [g1, g2], award: true }), 3);
  assert.equal(await groupBonus(db, { uid: ORG, eventId: 'e1', matchIds: [g1, g2], award: true }), 0);
  assert.equal((await stats('c')).leaguePoints, 5);
  const award = (await db.doc(`awards/${awardIdForGroup('e1', DRAW, 'Group A')}`).get()).data();
  assert.deepEqual([award.category, award.sub_category, award.points_each], ['rr_group_bonus', 'league', POINTS.groupBonus]);
  assert.deepEqual([...award.awardees].sort(), ['a', 'b', 'c']);
  await db.doc(`matches/${g2}`).update({ player_2_uid: 'late' });
  assert.equal(await groupBonus(db, { uid: ORG, eventId: 'e1', matchIds: [g1, g2], award: false }), 3);
  assert.equal((await stats('c')).leaguePoints, 0);
  assert.equal((await stats('late')).leaguePoints ?? 0, 0);
  await assert.rejects(groupBonus(db, { uid: 'a', eventId: 'e1', matchIds: [g1], award: true }), /organizer/);
  await set(`matches/e1_${DRAW}_G3`, group({ match_id: 'G3', group_label: 'Group B' }));
  await assert.rejects(groupBonus(db, { uid: ORG, eventId: 'e1', matchIds: [g1, `e1_${DRAW}_G3`], award: true }), /exactly one group/);
});

// ── Registration and shared checks ──

test('entries are recounted from active registrations: distinct events, tournaments among them', async () => {
  const reg = (event_id, category, status = 'active') => ({ uid: 'a', event_id, category, status });
  await set('event_participants/e1_a', reg('e1', 'singles_tournament'));
  await set('event_participants/e1_a_mensdoubles', reg('e1', 'doubles_tournament'));
  await set('event_participants/e2_a', reg('e2', 'social'));
  await set('event_participants/e3_a', reg('e3', 'singles_tournament', 'withdrawn'));
  assert.deepEqual(await recountEntries(db, 'a'), { eventsJoined: 2, tournamentsPlayed: 1 });
  assert.deepEqual(await recountEntries(db, 'a'), { eventsJoined: 2, tournamentsPlayed: 1 }); // set, never incremented
  const s = await stats('a');
  assert.deepEqual([s.eventsJoined, s.tournamentsPlayed], [2, 1]);
  assert.equal(typeof s.rsPoints, 'number');
  assert.equal(await recountEntries(db, 'guest_x'), null);
});

test('results no longer count tournaments played', async () => {
  await set('matches/f', knockout({ round: 'F' }));
  await record('a', 'f', A_WINS);
  assert.equal((await stats('b')).tournamentsPlayed, undefined);
});

test('a played result: an applied entry with games, not a walkover or reset; challenges and rallies once applied', () => {
  const played = { category: 'tournament', sub_category: 'result', status: 'applied', winner_uid: 'a', set_1_player_1: 6, set_1_player_2: 2 };
  assert.equal(isPlayedResult(played), true);
  assert.equal(isPlayedResult({ ...played, sub_category: 'correction' }), true);
  assert.equal(isPlayedResult({ ...played, sub_category: 'walkover' }), false);
  assert.equal(isPlayedResult({ ...played, sub_category: 'reset' }), false);
  assert.equal(isPlayedResult({ ...played, status: 'superseded' }), false);
  assert.equal(isPlayedResult({ ...played, set_1_player_1: 0, set_1_player_2: 0 }), false);
  assert.equal(isPlayedResult({ category: 'rally', sub_category: 'result', status: 'applied', winner_uid: 'a' }), true);
  assert.equal(isPlayedResult({ category: 'challenge', sub_category: 'result', status: 'disputed', winner_uid: 'a' }), false);
});

test('the points table: knockout by round, group, walkovers, challenge, rally', () => {
  const ko = (round) => ({ category: 'tournament', format: 'knockout', round });
  assert.deepEqual(['R32', 'R16', 'QF', 'SF', 'F'].map((r) => pointsFor(ko(r), false).loser), [1, 2, 3, 5, 10]);
  assert.deepEqual(pointsFor(ko('SF'), false), { winner: 0, loser: 5 });
  assert.deepEqual(pointsFor(ko('F'), false), { winner: 20, loser: 10 });
  assert.deepEqual(pointsFor(ko('F'), true), { winner: 0, loser: 10 });
  const grp = { category: 'tournament', format: 'rr', round: 'RR' };
  assert.deepEqual(pointsFor(grp, false), { winner: 3, loser: 1 });
  assert.deepEqual(pointsFor(grp, true), { winner: 1, loser: 1 });
  assert.deepEqual(pointsFor({ category: 'challenge' }, false), { winner: 3, loser: -3 });
  assert.deepEqual(pointsFor({ category: 'rally' }, false), { winner: 2, loser: 1 });
});

test("organizers are per event: another event's organizer cannot score here; a listed co-organizer can", async () => {
  await set('providers/org-2', { roles: ['organizer'] });
  await set('events/e1', { title: 'Test Open', organizer_ids: [ORG, 'org-3'] });
  await set('matches/m1', group());
  await assert.rejects(record('org-2', 'm1', { winnerUid: 'a', walkover: true }), /Only the two players or an organizer/);
  await record('org-3', 'm1', { winnerUid: 'a', walkover: true });
  assert.equal((await match('m1')).status, 'complete');
  await set('matches/m2', group());
  await record(SUPER, 'm2', { winnerUid: 'b', walkover: true }); // the super admin manages every event
  assert.equal((await match('m2')).winner_uid, 'b');
  // A rally has no event: anyone with the organizer role may record one, a per-event organizer may not.
  await set('matches/r1', accepted('rally'));
  await assert.rejects(record('org-3', 'r1', A_WINS), /Only the two players or an organizer/);
  await record('org-2', 'r1', A_WINS);
  assert.equal((await match('r1')).status, 'complete');
});

test('stale requests close: rallies after 30 days become played, open challenges after 40 are declined', async () => {
  const daysAgo = (n) => Timestamp.fromMillis(Date.now() - n * 24 * 60 * 60 * 1000);
  await set('matches/r_open', accepted('rally', { status: 'open', created_at: daysAgo(31) }));
  await set('matches/r_acc', accepted('rally', { created_at: daysAgo(31) }));
  await set('matches/r_new', accepted('rally', { status: 'open', created_at: daysAgo(29) }));
  await set('matches/r_done', accepted('rally', { status: 'complete', created_at: daysAgo(60) }));
  await set('matches/c_old', accepted('challenge', { status: 'open', created_at: daysAgo(41) }));
  await set('matches/c_new', accepted('challenge', { status: 'open', created_at: daysAgo(39) }));
  await set('matches/c_acc', accepted('challenge', { created_at: daysAgo(50) }));
  assert.deepEqual(await closeStaleRequests(db), { rallies: 2, challenges: 1 });
  const status = async (id) => (await match(id)).status;
  assert.deepEqual(
    await Promise.all(['r_open', 'r_acc', 'r_new', 'r_done', 'c_old', 'c_new', 'c_acc'].map(status)),
    ['played', 'played', 'open', 'complete', 'declined', 'open', 'accepted'],
  );
  assert.deepEqual(await closeStaleRequests(db), { rallies: 0, challenges: 0 });
});
