import assert from 'node:assert/strict';
import { test } from 'node:test';
import { refreshPool, seededRand } from '../../src/features/matches/matchPool.ts';

const rows = Array.from({ length: 12 }, (_, index) => ({
  user_id: `member-${index}`,
  name: `Member ${index}`,
  league: 'Mens',
  leaguePoints26: index,
  matchesPlayed: index,
}));

test('match pool caps the visible list and is deterministic without browser storage', () => {
  assert.deepEqual(refreshPool('viewer', 'friendlies', rows, new Set()), rows.slice(0, 10));
  assert.equal(seededRand('same-seed'), seededRand('same-seed'));
  assert.notEqual(seededRand('same-seed'), seededRand('different-seed'));
});

test('match pool removes prior-cycle untouched names but keeps requested names eligible', () => {
  const originalStorage = globalThis.localStorage;
  const values = new Map();
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  try {
    values.set(
      'matches_seen_challenges_viewer',
      JSON.stringify({
        cycle: 'old-cycle',
        shownUids: ['member-0', 'member-1'],
        skipUids: [],
      }),
    );
    const second = refreshPool('viewer', 'challenges', rows, new Set(['member-0']));
    assert.equal(second[0]?.user_id, 'member-0');
    assert.ok(!second.some((row) => row.user_id === 'member-1'));
  } finally {
    globalThis.localStorage = originalStorage;
  }
});
