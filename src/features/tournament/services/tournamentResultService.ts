import { httpsCallable } from 'firebase/functions';
import { functions } from '../../../lib/firebase';

export type TournamentResultIntent = {
  matchId: string;
  winnerUid?: string;
  scores: [[number, number], [number, number], [number, number]];
  walkover?: boolean;
  noShow?: boolean;
  court?: string;
  submissionId?: string;
};

export type TournamentResultResponse = {
  applied: boolean;
  duplicate: boolean;
  advanced: boolean;
  needsManual: boolean;
};

/** Apply one organizer-approved result through the server-authoritative transaction. */
export async function applyTournamentResult(intent: TournamentResultIntent) {
  const callable = httpsCallable<TournamentResultIntent, TournamentResultResponse>(functions, 'applyTournamentResult');
  const response = await callable(intent);
  return response.data;
}
