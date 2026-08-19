import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildScoreSubmissionIntent } from '../../src/features/tournament/domain/scoreSubmission.ts';

const match = {
  id: 'm1',
  event_id: 'e1',
  match_id: 'M1',
  category: 'singles',
  tournament_choice: 'Singles',
  division: "Men's",
  skill_group: 'Challengers',
  drawsize: 4,
  round: 'RR',
  position: 0,
  player_1_slot: 1,
  player_2_slot: 2,
  player_1_uid: 'p1',
  player_1_name: 'One',
  player_2_uid: 'p2',
  player_2_name: 'Two',
  status: 'pending',
  started: true,
  format: 'rr',
};
const form = (overrides = {}) => ({
  matchDocId: 'm1',
  winnerUserId: 'p2',
  court: '',
  noShow: false,
  sets: [
    { mine: '6', opponent: '4' },
    { mine: '6', opponent: '3' },
    { mine: '', opponent: '' },
  ],
  ...overrides,
});

test('score intent validates winner and maps player perspective to official slots', () => {
  assert.equal(
    buildScoreSubmissionIntent(form({ winnerUserId: '' }), match, 'p2', false).error,
    'Please choose who won the match.',
  );
  const built = buildScoreSubmissionIntent(form(), match, 'p2', false).intent;
  assert.equal(built.submission.set_1_player_1, 4);
  assert.equal(built.submission.set_1_player_2, 6);
  assert.equal(built.submission.claimed_winner_uid, 'p2');
});

test('organizer-only RR no-show clears winner and stays distinct from walkover', () => {
  const built = buildScoreSubmissionIntent(form({ winnerUserId: '', noShow: true }), match, 'owner', true).intent;
  assert.equal(built.isNoShow, true);
  assert.equal(built.isWalkover, false);
  assert.equal(built.submission.claimed_winner_uid, '');
});
