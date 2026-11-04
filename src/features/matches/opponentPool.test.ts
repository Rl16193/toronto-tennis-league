// Table tests for the opponent pool. Run: npx tsx --test src/features/matches/opponentPool.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { RAND_SLOTS_PER_WEEK, byActivity, mixPool, rerollSlot, resetSlot, seededRand, weekKey } from './opponentPool';
import type { LeagueRow } from '../leagues/useStandings';

const row = (user_id: string, matchesPlayed: number) => ({ user_id, name: user_id, matchesPlayed }) as LeagueRow;

test('weekKey turns over on Thursday 8:00am', () => {
  // Winter dates: the cycle is a fixed 7 x 24h from an EST anchor, so under DST it turns at 9:00am.
  const wed = new Date(2027, 0, 6, 12).getTime(); // Wed 6 Jan 2027
  const thuEarly = new Date(2027, 0, 7, 7, 59).getTime();
  const thu = new Date(2027, 0, 7, 8, 0).getTime();
  assert.equal(weekKey(wed), weekKey(thuEarly));
  assert.notEqual(weekKey(thuEarly), weekKey(thu));
});

test('seededRand is stable and in [0, 1)', () => {
  assert.equal(seededRand('cycle-1u1'), seededRand('cycle-1u1'));
  for (const seed of ['', 'a', 'cycle-99zzz']) assert.ok(seededRand(seed) >= 0 && seededRand(seed) < 1);
});

test('mixPool', () => {
  const pool = [row('busy', 20), row('mid', 5), row('fresh', 0), row('near', 3), row('old', 4), row('quiet', 1)];
  const { list, tags } = mixPool(pool, {
    isNearby: (r) => r.user_id === 'near',
    lastPlayedByUid: new Map([['old', 100]]),
    joinedAtByUid: {},
    byActivity: byActivity('cycle-1'),
  });
  assert.deepEqual(tags.get('fresh'), ['new']);
  assert.deepEqual(tags.get('busy'), ['played'], 'top quarter by matches played');
  assert.deepEqual(tags.get('near'), ['nearby']);
  assert.deepEqual(tags.get('old'), ['rematch']);
  assert.deepEqual(list.slice(0, 4).map((r) => r.user_id), ['fresh', 'near', 'busy', 'old'], 'one from each pill in turn');
  assert.deepEqual(list.slice(4).map((r) => r.user_id), ['mid', 'quiet'], 'then the rest by activity');
});

test('rerollSlot / resetSlot', () => {
  const source = [row('a', 1), row('b', 1), row('c', 1)];
  const none = { slots: [], overrides: {} };
  const once = rerollSlot(none, 3, source, new Set(['a']), new Set(['b']), () => 0);
  assert.deepEqual(once, { slots: [3], overrides: { 3: 'c' } }, 'skips shown and excluded people');
  assert.equal(rerollSlot(none, 3, source, new Set(['a', 'b', 'c']), new Set()), null, 'nobody left');
  const full = { slots: Array.from({ length: RAND_SLOTS_PER_WEEK }, (_, i) => i), overrides: {} };
  assert.equal(rerollSlot(full, 9, source, new Set(), new Set()), null, 'the week\'s budget is spent');
  assert.ok(rerollSlot(full, 0, source, new Set(), new Set()), 'a randomized slot re-rolls for free');
  assert.deepEqual(resetSlot({ slots: [3], overrides: { 3: 'c' } }, 3), none);
});
