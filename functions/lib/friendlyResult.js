const SCORE_FIELDS = [
  'set_1_player_1',
  'set_1_player_2',
  'set_2_player_1',
  'set_2_player_2',
  'set_3_player_1',
  'set_3_player_2',
];

const scoreIsBounded = (value) => value === undefined || (Number.isInteger(value) && value >= 0 && value <= 7);

const winnerFor = (match) => match.winner_uid || match.claimed_winner_uid;

/**
 * Friendly payouts are triggered by a client-visible status transition. Keep the trigger
 * defensive even though Rules validate normal client writes: imported legacy documents and
 * Admin SDK writes do not pass through those Rules.
 */
const isValidFriendlyResult = (match) => {
  const winner = winnerFor(match);
  const players = [match.player_1_uid, match.player_2_uid];
  return Boolean(
    match.player_1_uid &&
    match.player_2_uid &&
    match.player_1_uid !== match.player_2_uid &&
    winner &&
    players.includes(winner) &&
    SCORE_FIELDS.every((field) => scoreIsBounded(match[field])),
  );
};

const isValidFriendlyTransition = (before, after) => {
  const confirmer = after.confirmed_by;
  return Boolean(
    before.category === 'rally' &&
    after.category === 'rally' &&
    before.status === 'reported' &&
    after.status === 'confirmed' &&
    before.event_id === after.event_id &&
    before.player_1_uid === after.player_1_uid &&
    before.player_2_uid === after.player_2_uid &&
    before.reported_by &&
    confirmer &&
    confirmer !== before.reported_by &&
    [after.player_1_uid, after.player_2_uid].includes(confirmer) &&
    isValidFriendlyResult(after),
  );
};

module.exports = { SCORE_FIELDS, winnerFor, isValidFriendlyResult, isValidFriendlyTransition };
