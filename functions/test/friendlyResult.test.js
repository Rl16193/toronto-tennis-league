const assert = require('node:assert/strict');
const { test } = require('node:test');
const { isValidFriendlyResult, isValidFriendlyTransition, winnerFor } = require('../lib/friendlyResult');

const valid = {
  player_1_uid: 'member-a',
  player_2_uid: 'member-b',
  winner_uid: 'member-a',
  set_1_player_1: 6,
  set_1_player_2: 4,
  set_2_player_1: 6,
  set_2_player_2: 2,
  set_3_player_1: 0,
  set_3_player_2: 0,
};

test('friendly result accepts a player winner and bounded set scores', () => {
  assert.equal(isValidFriendlyResult(valid), true);
  assert.equal(winnerFor(valid), 'member-a');
});

test('friendly result rejects a winner outside the match', () => {
  assert.equal(isValidFriendlyResult({ ...valid, winner_uid: 'outsider' }), false);
});

test('friendly result rejects non-integer or oversized set scores', () => {
  assert.equal(isValidFriendlyResult({ ...valid, set_1_player_1: 8 }), false);
  assert.equal(isValidFriendlyResult({ ...valid, set_1_player_2: 4.5 }), false);
});

test('legacy claimed winner remains supported when the current field is absent', () => {
  const legacy = { ...valid, winner_uid: undefined, claimed_winner_uid: 'member-b' };
  assert.equal(isValidFriendlyResult(legacy), true);
  assert.equal(winnerFor(legacy), 'member-b');
});

test('friendly payout requires a genuine second-party reported-to-confirmed transition', () => {
  const before = {
    ...valid,
    category: 'rally',
    event_id: 'event-a',
    status: 'reported',
    reported_by: 'member-a',
  };
  const after = {
    ...before,
    status: 'confirmed',
    confirmed_by: 'member-b',
  };

  assert.equal(isValidFriendlyTransition(before, after), true);
  assert.equal(isValidFriendlyTransition({ ...before, category: 'singles' }, after), false);
  assert.equal(isValidFriendlyTransition(before, { ...after, player_2_uid: 'outsider' }), false);
  assert.equal(isValidFriendlyTransition(before, { ...after, confirmed_by: 'member-a' }), false);
  assert.equal(isValidFriendlyTransition({ ...before, status: 'scheduled' }, after), false);
});
