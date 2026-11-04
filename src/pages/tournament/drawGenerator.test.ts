// Table tests for the draw identity. Run: npx tsx --test src/pages/tournament/drawGenerator.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { belongsTo, drawKey, drawOf, planGroupEdit, planRemovePlayer, resolveZoneConfig, sameDraw } from './drawGenerator';
import type { EventParticipant, UserStats } from '../../types';
import type { DrawConfig, TournamentMatch, TournamentPlayer } from './types';
import { BYE, PLAYER_LOADING, PLAYER_LOADING_SENTINEL } from './utils';

const match = (m: Partial<TournamentMatch>) =>
  ({ sub_category: 'singles', division: "Men's", skill_group: 'Masters', zone: '', ...m }) as TournamentMatch;
const draw = (d: Partial<DrawConfig>): DrawConfig =>
  ({ tab: 'mens', label: '', tournamentChoice: 'Singles', division: "Men's", skillGroup: 'Masters', ...d });
const reg = (p: Partial<EventParticipant>) =>
  ({ id: 'r', uid: 'u1', category: 'singles_tournament', division: "Men's", skill: 4, status: 'active', ...p }) as EventParticipant;

test('drawOf / drawKey / sameDraw', () => {
  const cases: [string, boolean, boolean][] = [
    // [case, actual, expected]
    ['pre-zone match is a Downtown-Midtown match', sameDraw(drawOf(match({})), draw({ zone: 'downtown_midtown' })), true],
    ['default zone keeps the short key', drawKey(draw({ zone: 'downtown_midtown' })) === drawKey(draw({})), true],
    ['other zones get their own key', drawKey(draw({ zone: 'north_york' })).endsWith('_north_york'), true],
    ['two zones are two draws', sameDraw(drawOf(match({ zone: 'north_york' })), draw({ zone: 'north_scarborough' })), false],
    ['division is part of the draw', sameDraw(drawOf(match({ division: "Women's" })), draw({})), false],
    ['skill group is part of the draw', sameDraw(drawOf(match({ skill_group: 'Challengers' })), draw({})), false],
    ['doubles is part of the draw', sameDraw(drawOf(match({ sub_category: 'doubles' })), draw({})), false],
  ];
  for (const [name, actual, expected] of cases) assert.equal(actual, expected, name);
});

test('belongsTo', () => {
  const zoneConfig = resolveZoneConfig({ merges: { etobicoke_lakeshore: 'downtown_midtown' } });
  const statsMap = { u1: { skill_level: 2.5 } as UserStats };
  const ny = { zoneMap: { u1: 'North York' }, zoneConfig };
  const cases: [string, boolean, boolean][] = [
    ['active, same division, band and zone', belongsTo(reg({}), draw({ zone: 'north_york' }), ny), true],
    ['withdrawn is out of every draw', belongsTo(reg({ status: 'withdrawn' }), draw({ zone: 'north_york' }), ny), false],
    ['another zone', belongsTo(reg({}), draw({ zone: 'etobicoke' }), ny), false],
    ['stats skill wins over the registration', belongsTo(reg({}), draw({ zone: 'north_york', skillGroup: 'Beginners' }), { ...ny, statsMap }), true],
    ['merged draw takes only its bands', belongsTo(reg({ skill: 2 }), draw({ zone: 'north_york', skillGroup: 'All', mergedFrom: 'Challengers+Masters' }), ny), false],
    ['merged draw takes a listed band', belongsTo(reg({}), draw({ zone: 'north_york', skillGroup: 'All', mergedFrom: 'Challengers+Masters' }), ny), true],
    ['Retired Pro has no skill dimension', belongsTo(reg({ division: "Men's Retired Pro", skill: 2 }), draw({ zone: 'north_york', division: "Men's Retired Pro", skillGroup: 'All' }), ny), true],
    ['a merged zone plays in its target', belongsTo(reg({}), draw({ zone: 'downtown_midtown' }), { zoneMap: { u1: 'Etobicoke - Lakeshore' }, zoneConfig }), true],
    ['no Toronto zone plays in Unassigned', belongsTo(reg({}), draw({ zone: 'unassigned' }), { zoneMap: { u1: 'Markham' }, zoneConfig }), true],
    ['consolidated doubles takes any division', belongsTo(reg({ category: 'doubles_tournament', division: 'Mixed Doubles' }), draw({ tab: 'doubles', tournamentChoice: 'Doubles', division: 'All', skillGroup: 'All' })), true],
    ['singles never joins a doubles draw', belongsTo(reg({}), draw({ tab: 'doubles', tournamentChoice: 'Doubles', division: "Men's", skillGroup: 'All' })), false],
  ];
  for (const [name, actual, expected] of cases) assert.equal(actual, expected, name);
});

test('planRemovePlayer', () => {
  const ms = [
    match({ id: 'a', status: 'accepted', player_1_uid: 'u1', player_1_name: 'U1', player_2_uid: 'u2', player_2_name: 'U2' }),
    match({ id: 'b', status: 'accepted', player_1_uid: 'u3', player_1_name: 'U3', player_2_uid: 'u1', player_2_name: 'U1' }),
    match({ id: 'c', status: 'accepted', player_1_uid: 'u1', player_1_name: 'U1', player_2_uid: '', player_2_name: PLAYER_LOADING }),
    match({ id: 'd', status: 'accepted', player_1_uid: 'u1', player_1_name: 'U1', player_2_uid: '', player_2_name: BYE }),
    match({ id: 'e', status: 'complete', player_1_uid: 'u1', player_1_name: 'U1', player_2_uid: 'u4', player_2_name: 'U4' }),
    match({ id: 'f', status: 'cancelled', player_1_uid: 'u1', player_1_name: 'U1', player_2_uid: 'u5', player_2_name: 'U5' }),
    match({ id: 'g', status: 'accepted', player_1_uid: 'u6', player_1_name: 'U6', player_2_uid: 'u7', player_2_name: 'U7' }),
  ];
  const { walkovers, blanks } = planRemovePlayer('u1', ms);
  assert.deepEqual(walkovers, [{ matchId: 'a', winnerUid: 'u2' }, { matchId: 'b', winnerUid: 'u3' }], 'a real opponent gets a walkover, either side');
  assert.deepEqual(blanks.map((b) => [b.match.id, b.slot]), [['c', 'player_1'], ['d', 'player_1']], 'Player Loading and BYE are blanked');
});

test('planGroupEdit', () => {
  const pl = (uid: string): TournamentPlayer => ({ uid, name: uid.toUpperCase(), participantId: '' });
  const rr = (id: string, label: string, a: string, b: string, status = 'accepted') =>
    match({ id, match_id: id, group_label: label, status, player_1_uid: a, player_1_name: a, player_2_uid: b, player_2_name: b } as Partial<TournamentMatch>);
  const groupA = [rr('rr_g1_m1', 'A', 'u1', 'u2'), rr('rr_g1_m2', 'A', 'u1', 'u3'), rr('rr_g1_m3', 'A', 'u2', 'u3')];
  const groupB = [rr('rr_g2_m1', 'B', 'u4', 'u5')];
  const knockout = match({ id: 'ko1', status: 'accepted', player_1_uid: 'u3', player_2_uid: 'u9' });
  const plan = (bMatches: TournamentMatch[], aMatches: TournamentMatch[], newPlayers: TournamentPlayer[]) => planGroupEdit({
    eventId: 'e1', drawKey: 'k', draw: draw({}), started: true, groupKey: 'A',
    groups: [
      { key: 'A', players: ['u1', 'u2', 'u3'].map(pl), matches: aMatches },
      { key: 'B', players: ['u4', 'u5'].map(pl), matches: bMatches },
    ],
    eventMatches: [...aMatches, ...bMatches, knockout], newPlayers,
  });

  const move = plan(groupB, groupA, ['u1', 'u2', 'u3', 'u4'].map(pl));
  assert.ok(!('error' in move));
  assert.ok(move.toDelete.includes('rr_g2_m1'), 'the source group is rewritten without the mover');
  assert.equal(move.toWrite.filter((w) => w.fields.group_label === 'A').length, 6, 'four players: six pairings');
  assert.deepEqual(move.removedUids, []);

  const refused = plan([rr('rr_g2_m1', 'B', 'u4', 'u5', 'complete')], groupA, ['u1', 'u2', 'u3', 'u4'].map(pl));
  assert.ok('error' in refused, 'no move after playing in the current group');

  const removal = plan(groupB, groupA, [pl('u1'), pl('u2'), pl(PLAYER_LOADING_SENTINEL)]);
  assert.ok(!('error' in removal));
  assert.deepEqual(removal.removedUids, ['u3']);
  assert.ok(removal.toDelete.includes('ko1'), 'a removed player leaves every match in the event');

  const played = plan(groupB, [rr('rr_g1_m1', 'A', 'u1', 'u2', 'complete'), ...groupA.slice(1)], ['u1', 'u2', 'u3'].map(pl));
  assert.ok(!('error' in played));
  assert.ok(!played.toDelete.includes('rr_g1_m1'), 'a played match is kept');
  assert.ok(!played.toWrite.some((w) => [w.fields.player_1_uid, w.fields.player_2_uid].sort().join() === 'u1,u2'), 'and not paired again');
});
