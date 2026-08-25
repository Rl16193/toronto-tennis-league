import { addDoc, collection, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../lib/firebase';
import { setFieldsFrom } from '../tournament/domain/scoring';

// League Ladder challenge loop: an organizer-confirmed head-to-head. On confirm the winner gains
// +3 leaguePoints26 and the loser loses 3 (floored at 0). Challenges live in the shared `matches`
// collection, tagged category: 'challenge'.
export const MATCHES_COL = 'matches';

export type LadderDivision = 'mens' | 'womens';
export type LadderChallengeStatus = 'open' | 'accepted' | 'reported' | 'confirmed' | 'rejected';

export interface LadderChallenge {
  id: string;
  event_id: string;
  division: LadderDivision;
  player_1_uid: string;
  player_1_name: string;
  player_2_uid: string;
  player_2_name: string;
  status: LadderChallengeStatus;
  // Result fields are the SAME shape a tournament match uses — winner_uid/name plus absolute
  // per-set games — so one formatter and one history mapping serve every kind of result.
  winner_uid?: string;
  winner_name?: string;
  set_1_player_1?: number;
  set_1_player_2?: number;
  set_2_player_1?: number;
  set_2_player_2?: number;
  set_3_player_1?: number;
  set_3_player_2?: number;
  court?: string;
  reported_by?: string;
  created_at: string;
  responded_at?: string;
  reported_at?: string;
  confirmed_at?: string;
  /** Stamped on confirm, matching a tournament match, so history sorts on one field. */
  completed_at?: string;
  applied?: boolean;
}

// Points swing per confirmed challenge.
export const LADDER_POINTS = 3;
// Days a pair must wait before re-challenging each other.
export const LADDER_COOLDOWN_DAYS = 7;
// Max own SENT challenges sitting in 'open' or 'accepted' at once — no time-based reset.
// A challenge stops counting once reported, confirmed, rejected, or cancelled (cancel deletes the
// doc outright).
export const LADDER_ACTIVE_CHALLENGE_CAP = 3;

export async function createChallenge(args: {
  eventId: string;
  division: LadderDivision;
  challenger: { id: string; name: string };
  opponent: { id: string; name: string };
}): Promise<void> {
  await addDoc(collection(db, MATCHES_COL), {
    category: 'challenge',
    event_id: args.eventId,
    division: args.division,
    player_1_uid: args.challenger.id,
    player_1_name: args.challenger.name,
    player_2_uid: args.opponent.id,
    player_2_name: args.opponent.name,
    status: 'open',
    created_at: new Date().toISOString(),
  });
}

// Opponent accepts or declines an open challenge — same accept/decline gate as Friendlies
// rallies. Only once accepted does the pair get each other's contact info.
export async function respondChallenge(id: string, accept: boolean): Promise<void> {
  await updateDoc(doc(db, MATCHES_COL, id), {
    status: accept ? 'accepted' : 'rejected',
    responded_at: new Date().toISOString(),
  });
}

// Either participant reports the result once played; it then waits for organizer confirmation.
// `sets` are ordered [player_1 games, player_2 games] — absolute, never the reporter's viewpoint.
export async function reportChallenge(
  id: string,
  winner: { id: string; name: string },
  sets: [number, number][],
  reportedBy: string,
  court?: string,
): Promise<void> {
  await updateDoc(doc(db, MATCHES_COL, id), {
    status: 'reported',
    winner_uid: winner.id,
    winner_name: winner.name,
    ...setFieldsFrom(sets),
    reported_by: reportedBy,
    ...(court ? { court } : {}),
    reported_at: new Date().toISOString(),
  });
}

export async function rejectChallenge(id: string): Promise<void> {
  await updateDoc(doc(db, MATCHES_COL, id), { status: 'rejected' });
}

// Challenger may retract an open (not yet reported) challenge.
export async function cancelChallenge(id: string): Promise<void> {
  await deleteDoc(doc(db, MATCHES_COL, id));
}

// Organizer confirm delegates the points/stat mutation to the server-authoritative callable.
export async function confirmChallenge(ch: LadderChallenge): Promise<void> {
  if (!ch.winner_uid) throw new Error('No winner reported');
  const callable = httpsCallable<{ matchId: string }, { applied: boolean; duplicate?: boolean }>(
    functions,
    'challengeResults',
  );
  await callable({ matchId: ch.id });
}
