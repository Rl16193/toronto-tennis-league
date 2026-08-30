import type { ScoreForm, ScoreSubmission, TournamentMatch } from '../../../pages/tournament/types';

type ScoreIntent = {
  submission: ScoreSubmission;
  // One name per thing (owner ruling, F-A): the stored match field is `walkover`, so the intent
  // that produces it carries the same name. The old `is_walkover` spelling is retired.
  walkover: boolean;
};

export const validateScorePairs = (
  pairs: Array<[number, number]>,
  winnerIndex: 0 | 1,
  walkover = false,
): string | undefined => {
  const allZero = pairs.every(([p1, p2]) => p1 === 0 && p2 === 0);
  if (walkover) return allZero ? undefined : 'A walkover must have zero scores.';
  if (allZero) return 'Enter at least one scored set or choose Walkover.';
  const wins = [0, 0];
  for (const [p1, p2] of pairs) {
    if (![p1, p2].every((score) => Number.isInteger(score) && score >= 0 && score <= 99)) {
      return 'Scores must be whole numbers from 0 to 99.';
    }
    if (p1 === 0 && p2 === 0) continue;
    if (p1 === p2) return 'A set cannot be tied.';
    const high = Math.max(p1, p2);
    if (high > 10 && Math.abs(p1 - p2) !== 2) {
      return 'Scores above 10 must have a margin of exactly 2.';
    }
    wins[p1 > p2 ? 0 : 1] += 1;
  }
  return wins[winnerIndex] > wins[1 - winnerIndex] ? undefined : 'The winner must take the set majority.';
};

export const buildScoreSubmissionIntent = (
  scoreForm: ScoreForm,
  match: TournamentMatch,
  userUid: string,
  isCreator: boolean,
): { intent?: ScoreIntent; error?: string } => {
  if (scoreForm.noShow) return { error: 'No-show results are no longer supported. Record the played score.' };
  if (!scoreForm.winnerUserId) return { error: 'Please choose who won the match.' };

  const parsedSets = scoreForm.sets.map((set) => ({
    mine: Number(set.mine || 0),
    opponent: Number(set.opponent || 0),
  }));
  if (
    parsedSets.some(
      (set) => !Number.isInteger(set.mine) || !Number.isInteger(set.opponent) || set.mine < 0 || set.opponent < 0,
    )
  ) {
    return { error: 'Scores must be non-negative whole numbers.' };
  }

  const submitterIsP1 = isCreator || userUid === match.player_1_uid;
  const p1 = parsedSets.map((set) => (submitterIsP1 ? set.mine : set.opponent));
  const p2 = parsedSets.map((set) => (submitterIsP1 ? set.opponent : set.mine));
  const winnerIndex = scoreForm.winnerUserId === match.player_1_uid ? 0 : 1;
  const walkover = !!scoreForm.walkover;
  const scoreError = validateScorePairs(
    p1.map((score, index) => [score, p2[index]] as [number, number]),
    winnerIndex as 0 | 1,
    walkover,
  );
  if (scoreError) return { error: scoreError };
  if (walkover && !isCreator) return { error: 'Only the event organizer can record a walkover.' };
  const court = scoreForm.court.trim();
  const submission: ScoreSubmission = {
    claimed_winner_name: scoreForm.winnerUserId === match.player_1_uid ? match.player_1_name : match.player_2_name,
    claimed_winner_uid: scoreForm.winnerUserId,
    set_1_player_1: p1[0],
    set_1_player_2: p2[0],
    set_2_player_1: p1[1],
    set_2_player_2: p2[1],
    set_3_player_1: p1[2],
    set_3_player_2: p2[2],
    ...(court ? { court } : {}),
  };
  return {
    intent: {
      submission,
      walkover,
    },
  };
};
