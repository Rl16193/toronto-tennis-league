const MAX_GAME_SCORE = 99;
const SCORE_FIELDS = [
  ['set_1_player_1', 'set_1_player_2'],
  ['set_2_player_1', 'set_2_player_2'],
  ['set_3_player_1', 'set_3_player_2'],
];

class TournamentResultError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function fail(message, code = 'invalid-argument') {
  throw new TournamentResultError(code, message);
}

function normalizeScores(value) {
  if (value === undefined)
    return [
      [0, 0],
      [0, 0],
      [0, 0],
    ];
  if (!Array.isArray(value) || value.length !== 3) fail('Exactly three score pairs are required.');
  return value.map((pair) => {
    if (!Array.isArray(pair) || pair.length !== 2) fail('Each set must contain two scores.');
    return pair.map((score) => {
      if (!Number.isInteger(score) || score < 0 || score > MAX_GAME_SCORE) {
        fail(`Scores must be whole numbers from 0 to ${MAX_GAME_SCORE}.`);
      }
      return score;
    });
  });
}

function normalizeTournamentResult(input, match) {
  if (!input || typeof input !== 'object') fail('Missing result.');
  const noShow = input.noShow === true;
  const walkover = input.walkover === true;
  if (noShow && walkover) fail('A result cannot be both a no-show and a walkover.');
  if (noShow && (match.format !== 'rr' || match.round !== 'RR')) {
    fail('No-show is available only for Round Robin group matches.');
  }

  const scores = noShow
    ? [
        [0, 0],
        [0, 0],
        [0, 0],
      ]
    : normalizeScores(input.scores);
  const allZero = scores.every(([p1, p2]) => p1 === 0 && p2 === 0);
  if (walkover && !allZero) fail('A walkover must have zero scores.');
  if (!noShow && !walkover && allZero) fail('Use walkover for a zero-score result.');

  const players = [match.player_1_uid, match.player_2_uid];
  const winnerUid = noShow ? '' : typeof input.winnerUid === 'string' ? input.winnerUid.trim() : '';
  if (!noShow && !players.includes(winnerUid)) fail('Winner must be one of the match participants.');
  if (!noShow && !walkover) {
    const setWins = scores.reduce(
      (wins, [p1, p2]) => {
        if (p1 > p2) wins[0] += 1;
        if (p2 > p1) wins[1] += 1;
        return wins;
      },
      [0, 0],
    );
    const winnerIndex = winnerUid === match.player_1_uid ? 0 : 1;
    if (setWins[winnerIndex] <= setWins[1 - winnerIndex]) {
      fail('Winner must have won more recorded sets than the opponent.');
    }
  }

  const court = typeof input.court === 'string' ? input.court.trim() : '';
  if (court.length > 200) fail('Court name is too long.');
  return { winnerUid, scores, noShow, walkover, court };
}

function tournamentAward(match) {
  const rr = match.format === 'rr' && match.round === 'RR';
  const isFinal = match.round === 'F';
  const loserPoints = { R32: 1, R16: 2, QF: 3, RR: 1, SF: 5, F: 10 }[match.round] ?? 1;
  return {
    winnerPoints: rr ? 3 : 20,
    loserPoints,
    winnerPointsApply: rr || isFinal,
    isFinal,
  };
}

function addDelta(target, uid, delta) {
  if (!uid) return;
  const current = target.get(uid) || {};
  for (const [key, value] of Object.entries(delta)) {
    current[key] = typeof value === 'number' && typeof current[key] === 'number' ? current[key] + value : value;
  }
  target.set(uid, current);
}

function statDeltasForResult(match, result, partnerUidByCaptain = new Map()) {
  const deltas = new Map();
  const league = match.tournament_choice === 'Doubles' ? 'Doubles' : match.division;
  const creditedUids = (uid) => {
    const partner = partnerUidByCaptain.get(uid);
    return partner && partner !== uid ? [uid, partner] : [uid];
  };
  if (result.noShow) {
    for (const uid of [match.player_1_uid, match.player_2_uid]) {
      addDelta(deltas, uid, { leaguePoints26: 1, league });
    }
    return deltas;
  }

  const winnerIsP1 = result.winnerUid === match.player_1_uid;
  const loserUid = winnerIsP1 ? match.player_2_uid : match.player_1_uid;
  const award = tournamentAward(match);
  for (const uid of creditedUids(result.winnerUid)) {
    addDelta(deltas, uid, {
      matchesPlayed: 1,
      wins: 1,
      ...(award.winnerPointsApply ? { leaguePoints26: award.winnerPoints } : {}),
      ...(award.isFinal ? { tournamentsPlayed: 1 } : {}),
      league,
    });
  }
  for (const uid of creditedUids(loserUid)) {
    addDelta(deltas, uid, {
      matchesPlayed: 1,
      loses: 1,
      leaguePoints26: award.loserPoints,
      tournamentsPlayed: 1,
      league,
    });
  }
  return deltas;
}

function scoreFieldPatch(scores) {
  return Object.fromEntries(
    SCORE_FIELDS.flatMap(([p1, p2], index) => [
      [p1, scores[index][0]],
      [p2, scores[index][1]],
    ]),
  );
}

function storedTournamentResult(match) {
  return {
    winnerUid: match.winner_uid || '',
    scores: SCORE_FIELDS.map(([p1, p2]) => [match[p1] ?? 0, match[p2] ?? 0]),
    noShow: match.no_show === true,
    walkover: match.walkover === true,
    court: typeof match.court === 'string' ? match.court : '',
  };
}

function mergeStatDeltas(target, source, multiplier = 1) {
  for (const [uid, delta] of source) {
    const adjusted = Object.fromEntries(
      Object.entries(delta).map(([key, value]) => [key, typeof value === 'number' ? value * multiplier : value]),
    );
    addDelta(target, uid, adjusted);
  }
  return target;
}

module.exports = {
  MAX_GAME_SCORE,
  TournamentResultError,
  mergeStatDeltas,
  normalizeTournamentResult,
  scoreFieldPatch,
  statDeltasForResult,
  storedTournamentResult,
  tournamentAward,
};
