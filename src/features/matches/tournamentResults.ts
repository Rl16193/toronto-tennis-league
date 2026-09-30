import type { TournamentMatch } from '../../pages/tournament/types';

// Furthest-round derivation for Best Finish / Best Result from a player's tournament matches.
// (The streak is playerRecord in useUserMatches.ts, over every match type.)
// Shared by PlayerProfile and the Player Dash's Your events.
export const ROUND_ORDER = ['R64', 'R32', 'R16', 'QF', 'SF', 'F'];
export const ROUND_LABEL: Record<string, string> = {
  R64: 'Round of 64', R32: 'Round of 32', R16: 'Round of 16', QF: 'Quarterfinal', SF: 'Semifinal', F: 'Final',
};

type ResultMatch = Pick<TournamentMatch, 'round' | 'status' | 'winner_uid'>;

export const deriveResults = (mine: ResultMatch[], uid: string) => {
  let bestIdx = -1;
  let wonFinal = false;
  for (const m of mine) {
    const idx = ROUND_ORDER.indexOf(m.round);
    if (idx < 0) continue;
    if (idx > bestIdx) bestIdx = idx;
    if (m.round === 'F' && m.status === 'complete' && m.winner_uid === uid) wonFinal = true;
  }
  const bestFinish = bestIdx >= 0 ? ROUND_LABEL[ROUND_ORDER[bestIdx]] : '—';
  let bestResult = '—';
  if (wonFinal) bestResult = 'Champion';
  else if (bestIdx >= 0) {
    const r = ROUND_ORDER[bestIdx];
    bestResult = r === 'F' ? 'Finalist' : r === 'SF' ? 'Semifinalist' : r === 'QF' ? 'Quarterfinalist' : ROUND_LABEL[r];
  }
  return { bestFinish, bestResult };
};
