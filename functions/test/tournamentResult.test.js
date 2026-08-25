const assert = require('node:assert/strict');
const { test } = require('node:test');

const {
  mergeStatDeltas,
  normalizeTournamentResult,
  statDeltasForResult,
  storedTournamentResult,
  tournamentAward,
} = require('../lib/tournamentResult');

const match = {
  event_id: 'event-1',
  tournament_choice: 'Singles',
  division: "Men's",
  format: 'rr',
  round: 'RR',
  status: 'pending',
  player_1_uid: 'player-a',
  player_1_name: 'Player A',
  player_2_uid: 'player-b',
  player_2_name: 'Player B',
};

test('stored results produce exact inverse deltas for reset and cancellation', () => {
  const stored = {
    ...match,
    winner_uid: 'player-a',
    set_1_player_1: 6,
    set_1_player_2: 4,
    set_2_player_1: 6,
    set_2_player_2: 2,
    status: 'complete',
  };
  const reversed = mergeStatDeltas(new Map(), statDeltasForResult(stored, storedTournamentResult(stored)), -1);
  assert.equal(reversed.get('player-a').leaguePoints26, -3);
  assert.equal(reversed.get('player-a').wins, -1);
  assert.equal(reversed.get('player-b').leaguePoints26, -1);
  assert.equal(reversed.get('player-b').tournamentsPlayed, -1);
});

test('normalizes a bounded result whose winner belongs to the match', () => {
  const result = normalizeTournamentResult(
    {
      winnerUid: 'player-a',
      scores: [
        [6, 4],
        [6, 2],
        [0, 0],
      ],
    },
    match,
  );
  assert.deepEqual(result.scores, [
    [6, 4],
    [6, 2],
    [0, 0],
  ]);
  assert.equal(result.winnerUid, 'player-a');
  assert.equal(result.walkover, false);
});

test('rejects an unrelated winner and malformed or unbounded scores', () => {
  assert.throws(
    () =>
      normalizeTournamentResult(
        {
          winnerUid: 'outsider',
          scores: [
            [6, 4],
            [6, 2],
            [0, 0],
          ],
        },
        match,
      ),
    (error) => error.code === 'invalid-argument',
  );
  assert.throws(
    () =>
      normalizeTournamentResult(
        {
          winnerUid: 'player-a',
          scores: [
            [100, 0],
            [0, 0],
            [0, 0],
          ],
        },
        match,
      ),
    (error) => error.code === 'invalid-argument',
  );
  assert.throws(
    () =>
      normalizeTournamentResult(
        {
          winnerUid: 'player-b',
          scores: [
            [6, 4],
            [6, 2],
            [0, 0],
          ],
        },
        match,
      ),
    (error) => error.code === 'invalid-argument',
  );
});

test('accepts organizer walkovers and rejects no-show results', () => {
  const walkover = normalizeTournamentResult(
    {
      winnerUid: 'player-b',
      walkover: true,
      scores: [
        [0, 0],
        [0, 0],
        [0, 0],
      ],
    },
    match,
  );
  assert.equal(walkover.walkover, true);
  assert.equal(walkover.noShow, false);

  assert.throws(
    () =>
      normalizeTournamentResult(
        {
          noShow: true,
          scores: [
            [0, 0],
            [0, 0],
            [0, 0],
          ],
        },
        match,
      ),
    (error) => error.code === 'invalid-argument',
  );
});

test('preserves established tournament point awards', () => {
  assert.deepEqual(tournamentAward({ ...match, winner_uid: 'player-a' }), {
    winnerPoints: 3,
    loserPoints: 1,
    winnerPointsApply: true,
    isFinal: false,
  });
  assert.deepEqual(tournamentAward({ ...match, format: 'bracket', round: 'SF', winner_uid: 'player-a' }), {
    winnerPoints: 20,
    loserPoints: 5,
    winnerPointsApply: false,
    isFinal: false,
  });
});

test('builds first-application stat deltas and walkover awards', () => {
  const scored = statDeltasForResult(
    match,
    normalizeTournamentResult(
      {
        winnerUid: 'player-a',
        scores: [
          [6, 4],
          [6, 2],
          [0, 0],
        ],
      },
      match,
    ),
  );
  assert.equal(scored.get('player-a').leaguePoints26, 3);
  assert.equal(scored.get('player-a').matchesPlayed, 1);
  assert.equal(scored.get('player-a').pointswon, undefined);
  assert.equal(scored.get('player-b').leaguePoints26, 1);
  assert.equal(scored.get('player-b').loses, 1);

  const walkover = statDeltasForResult(
    match,
    normalizeTournamentResult(
      {
        winnerUid: 'player-a',
        walkover: true,
        scores: [
          [0, 0],
          [0, 0],
          [0, 0],
        ],
      },
      match,
    ),
  );
  assert.deepEqual(walkover.get('player-a'), { leaguePoints26: 1, league: "Men's" });
  assert.deepEqual(walkover.get('player-b'), { leaguePoints26: 1, league: "Men's" });
});
