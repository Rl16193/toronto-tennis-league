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

function validateSetScores(scores) {
  const nonEmpty = scores.filter(([p1, p2]) => p1 !== 0 || p2 !== 0);
  if (nonEmpty.length === 0) fail('A played result must contain at least one scored set.');
  for (const [p1, p2] of nonEmpty) {
    if (p1 === p2) fail('A set cannot be tied.');
    const high = Math.max(p1, p2);
    if (high > 10 && Math.abs(p1 - p2) !== 2) {
      fail('Scores above 10 must have a margin of exactly 2.');
    }
  }
  return nonEmpty;
}

function resultMargin(scores, winnerUid, match) {
  const winnerIndex = winnerUid === match.player_1_uid ? 0 : 1;
  return scores.reduce((total, [p1, p2]) => total + (winnerIndex === 0 ? p1 - p2 : p2 - p1), 0);
}

function normalizeTournamentResult(input, match) {
  if (!input || typeof input !== 'object') fail('Missing result.');
  const noShow = false;
  const walkover = input.walkover === true;
  const scores = normalizeScores(input.scores);
  const allZero = scores.every(([p1, p2]) => p1 === 0 && p2 === 0);
  if (walkover && !allZero) fail('A walkover must have zero scores.');
  if (!walkover) validateSetScores(scores);

  const players = [match.player_1_uid, match.player_2_uid];
  const winnerUid = typeof input.winnerUid === 'string' ? input.winnerUid.trim() : '';
  if (!players.includes(winnerUid)) fail('Winner must be one of the match participants.');
  if (!walkover) {
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
  const margin = resultMargin(scores, winnerUid, match);
  return { winnerUid, scores, noShow, walkover, court, margin };
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
  if (result.walkover) {
    const award = tournamentAward(match);
    const winnerIsP1 = result.winnerUid === match.player_1_uid;
    const loserUid = winnerIsP1 ? match.player_2_uid : match.player_1_uid;
    const winnerPoints = match.format === 'rr' && match.round === 'RR' ? 1 : 0;
    for (const uid of creditedUids(result.winnerUid)) {
      addDelta(deltas, uid, { ...(winnerPoints ? { leaguePoints26: winnerPoints } : {}), league });
    }
    for (const uid of creditedUids(loserUid)) {
      addDelta(deltas, uid, { leaguePoints26: award.loserPoints, league });
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
  const result = {
    winnerUid: match.winner_uid || '',
    scores: SCORE_FIELDS.map(([p1, p2]) => [match[p1] ?? 0, match[p2] ?? 0]),
    noShow: false,
    walkover: match.walkover === true,
    court: typeof match.court === 'string' ? match.court : '',
  };
  return { ...result, margin: resultMargin(result.scores, result.winnerUid, match) };
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
  resultMargin,
  validateSetScores,
  scoreFieldPatch,
  statDeltasForResult,
  storedTournamentResult,
  tournamentAward,
};
