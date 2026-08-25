import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSafeGroupRewrite, computeGroupStandings } from '../../src/pages/tournament/rrGeneration.ts';
import { generateGroupPairings, splitEvenly } from '../../src/features/tournament/domain/roundRobin.ts';
import { matchAward, setFieldsFrom } from '../../src/features/tournament/domain/scoring.ts';
import { skillBand, zoneBucketFor } from '../../src/features/tournament/domain/placement.ts';

const player = (uid, name = uid) => ({ uid, name, skillLevel: 3 });

test('splitEvenly keeps round-robin groups balanced and within the target size', () => {
  assert.deepEqual(splitEvenly(0), []);
  assert.deepEqual(splitEvenly(5), [5]);
  assert.deepEqual(splitEvenly(6), [3, 3]);
  assert.deepEqual(splitEvenly(11), [4, 4, 3]);
  assert.ok(splitEvenly(17).every((size) => size >= 3 && size <= 5));
});

test('generateGroupPairings produces every unique pairing once', () => {
  for (const size of [2, 3, 4, 5, 6]) {
    const pairs = generateGroupPairings(size);
    const keys = pairs.map(([a, b]) => `${a}:${b}`);
    assert.equal(new Set(keys).size, pairs.length);
    assert.equal(pairs.length, (size * (size - 1)) / 2);
    assert.ok(pairs.every(([a, b]) => a >= 0 && b < size && a < b));
  }
});

test('round-robin standings use the same points award as match scoring', () => {
  const matches = [
    {
      id: 'm1',
      format: 'rr',
      round: 'RR',
      status: 'complete',
      winner_uid: 'a',
      player_1_uid: 'a',
      player_2_uid: 'b',
      player_1_name: 'A',
      player_2_name: 'B',
      set_1_player_1: 6,
      set_1_player_2: 2,
    },
    {
      id: 'm2',
      format: 'rr',
      round: 'RR',
      status: 'complete',
      walkover: true,
      winner_uid: 'b',
      player_1_uid: 'b',
      player_2_uid: 'c',
      player_1_name: 'B',
      player_2_name: 'C',
    },
  ];
  const rows = computeGroupStandings(matches);
  assert.deepEqual(
    rows.map((row) => [row.userId, row.points]),
    [
      ['a', 3],
      ['b', 2],
      ['c', 1],
    ],
  );
  assert.equal(rows[0].gamesWon, 6);
  assert.equal(rows[0].gamesLost, 2);
});

test('matchAward gives walkover points to both RR players', () => {
  const award = matchAward({
    format: 'rr',
    round: 'RR',
    walkover: true,
    winner_uid: 'a',
    player_1_uid: 'a',
    player_2_uid: 'b',
  });
  assert.equal(award.walkover, true);
  assert.equal(award.winnerUid, 'a');
  assert.equal(award.winnerPts, 1);
  assert.equal(award.loserPts, 1);
});

test('score field construction clears unused sets', () => {
  assert.deepEqual(setFieldsFrom([[6, 4]]), {
    set_1_player_1: 6,
    set_1_player_2: 4,
    set_2_player_1: 0,
    set_2_player_2: 0,
    set_3_player_1: 0,
    set_3_player_2: 0,
  });
});

test('skill bands keep the established draw thresholds', () => {
  assert.equal(skillBand(2.99), 'Beginners');
  assert.equal(skillBand(3), 'Challengers');
  assert.equal(skillBand(3.99), 'Challengers');
  assert.equal(skillBand(4), 'Masters');
});

test('zone placement follows merges and preserves the default fallback', () => {
  const config = {
    enabled: true,
    buckets: [
      { id: 'north', label: 'North', zones: ['North'] },
      { id: 'downtown', label: 'Downtown - Midtown', zones: ['Downtown - Midtown'] },
    ],
    includeUnassigned: true,
    merges: { north: 'downtown' },
  };
  assert.equal(zoneBucketFor('North', config), 'downtown');
  assert.equal(zoneBucketFor(undefined, config), 'downtown');
  assert.equal(zoneBucketFor('North', { ...config, enabled: false }), undefined);
});

test('safe RR rewrite preserves completed pairings and replaces pending matches', () => {
  const draw = { tournamentChoice: 'Singles', division: 'Mens', skillGroup: 'Challengers' };
  const result = buildSafeGroupRewrite({
    eventId: 'event-1',
    drawKey: 'mens',
    draw,
    groupIndex: 0,
    oldMatches: [
      { id: 'played', status: 'complete', position: 1, player_1_uid: 'a', player_2_uid: 'b' },
      { id: 'pending', status: 'pending', position: 2, player_1_uid: 'a', player_2_uid: 'c' },
    ],
    newPlayers: [player('a'), player('b'), player('c'), player('d')],
    advancementCount: 2,
    started: true,
  });
  assert.deepEqual(result.toDelete, ['pending']);
  assert.ok(
    result.toWrite.every(
      (write) => !['a|b', 'b|a'].includes(`${write.fields.player_1_uid}|${write.fields.player_2_uid}`),
    ),
  );
  assert.ok(result.toWrite.length > 0);
});
