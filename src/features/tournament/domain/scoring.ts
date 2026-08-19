/**
 * Tournament scoring decisions are pure domain logic.
 *
 * Keep this module free of React and Firestore so the same rule can drive the stats writer,
 * Round Robin standings, and focused regression tests. In particular, no-show must be evaluated
 * before winner/loser logic because both players receive the established no-show award and there
 * is intentionally no winner to advance.
 */

export type ScoringMatch = {
  format?: string;
  round: string;
  no_show?: boolean;
  winner_uid?: string;
  player_1_uid: string;
  player_2_uid: string;
};

/** Paid to both players when an organizer marks a group match as a no-show. */
export const NO_SHOW_POINTS = 1;

/** Absolute player_1/player_2 score fields for tournament, ladder, and friendly results. */
export const setFieldsFrom = (pairs: [number, number][]) => ({
  set_1_player_1: pairs[0]?.[0] ?? 0,
  set_1_player_2: pairs[0]?.[1] ?? 0,
  set_2_player_1: pairs[1]?.[0] ?? 0,
  set_2_player_2: pairs[1]?.[1] ?? 0,
  set_3_player_1: pairs[2]?.[0] ?? 0,
  set_3_player_2: pairs[2]?.[1] ?? 0,
});

/**
 * Return the points and result participants for one completed match.
 *
 * The winner points rule is intentionally different for Round Robin group stage and knockout:
 * group winners score immediately, while a knockout winner scores only in the final. The loser
 * award still follows the established round table. See tests/unit/domain.test.mjs.
 */
export const matchAward = (m: ScoringMatch) => {
  const isRRGroupStage = m.format === 'rr' && m.round === 'RR';
  const isFinal = m.round === 'F';

  if (m.no_show) {
    return {
      noShow: true,
      isRRGroupStage,
      isFinal,
      winnerUid: null as string | null,
      loserUid: null as string | null,
      winnerPts: NO_SHOW_POINTS,
      loserPts: NO_SHOW_POINTS,
      winnerPointsApply: true,
    };
  }

  const LOSER_PTS: Record<string, number> = { R32: 1, R16: 2, QF: 3, RR: 1, SF: 5, F: 10 };
  const winnerUid = m.winner_uid || null;
  const loserUid = winnerUid ? (winnerUid === m.player_1_uid ? m.player_2_uid : m.player_1_uid) || null : null;
  return {
    noShow: false,
    isRRGroupStage,
    isFinal,
    winnerUid,
    loserUid,
    winnerPts: isRRGroupStage ? 3 : 20,
    loserPts: LOSER_PTS[m.round] ?? 1,
    winnerPointsApply: isFinal || isRRGroupStage,
  };
};
