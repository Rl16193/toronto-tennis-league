import { httpsCallable } from 'firebase/functions';
import { functions } from '../../../lib/firebase';

export type TournamentResultIntent = {
  matchId: string;
  winnerUid?: string;
  scores: [[number, number], [number, number], [number, number]];
  walkover?: boolean;
  court?: string;
  submissionId?: string;
};

export type TournamentResultResponse = {
  applied: boolean;
  duplicate: boolean;
  advanced: boolean;
  needsManual: boolean;
  disputed?: boolean;
  reconciled?: boolean;
};

/** Apply one organizer-approved result through the server-authoritative transaction. */
export async function applyTournamentResult(intent: TournamentResultIntent) {
  const callable = httpsCallable<TournamentResultIntent, TournamentResultResponse>(functions, 'applyTournamentResult');
  const response = await callable(intent);
  return response.data;
}

export async function setGroupBonus(args: {
  eventId: string;
  rrGroup: number;
  award: boolean;
  tournamentChoice?: string;
  division?: string;
  skillGroup?: string;
  zone?: string | null;
}) {
  const callable = httpsCallable<typeof args, { applied: boolean; awarded: boolean }>(functions, 'setGroupBonus');
  const response = await callable(args);
  return response.data;
}
