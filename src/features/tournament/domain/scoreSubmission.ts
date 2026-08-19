import type { ScoreForm, ScoreSubmission, TournamentMatch } from '../../../pages/tournament/types';

type ScoreIntent = {
  submission: ScoreSubmission;
  isNoShow: boolean;
  isWalkover: boolean;
};

export const buildScoreSubmissionIntent = (
  scoreForm: ScoreForm,
  match: TournamentMatch,
  userUid: string,
  isCreator: boolean,
): { intent?: ScoreIntent; error?: string } => {
  const isNoShow = !!scoreForm.noShow && isCreator && match.format === 'rr' && match.round === 'RR';
  if (!isNoShow && !scoreForm.winnerUserId) return { error: 'Please choose who won the match.' };

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
  const court = scoreForm.court.trim();
  const submission: ScoreSubmission = isNoShow
    ? {
        claimed_winner_name: '',
        claimed_winner_uid: '',
        set_1_player_1: 0,
        set_1_player_2: 0,
        set_2_player_1: 0,
        set_2_player_2: 0,
        set_3_player_1: 0,
        set_3_player_2: 0,
        ...(court ? { court } : {}),
      }
    : {
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
      isNoShow,
      isWalkover: !isNoShow && parsedSets.every((set) => set.mine === 0 && set.opponent === 0),
    },
  };
};
