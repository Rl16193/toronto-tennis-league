import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getRoundState } from '../../src/pages/tournament/BracketView.tsx';

const match = (overrides = {}) => ({
  id: 'final',
  player_1_name: '',
  player_2_name: '',
  ...overrides,
});

test('an empty final is not reported as started before advancement fills both slots', () => {
  assert.equal(getRoundState([match()]), 'preview');
  assert.equal(getRoundState([match({ player_1_name: 'Winner A' })]), 'preview');
  assert.equal(getRoundState([match({ player_1_name: 'Winner A', player_2_name: 'Winner B' })]), 'started');
});
