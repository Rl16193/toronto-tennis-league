import { addDoc, collection, deleteDoc, doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { setFieldsFrom } from '../../pages/tournament/utils';
import { recordScore } from '../matches/scoring';

// League Ladder challenge loop: request, accept or decline, play. Every result, and its +3 / -3,
// goes through the scoreMatch Cloud Function (features/matches/scoring.ts); this file only opens,
// answers and cancels requests. Challenges live in `matches`, tagged category: 'challenge'.

export type LadderDivision = 'mens' | 'womens';
// `declined` is the one word for a turned-down challenge — `rejected` was a second name for the
// same thing and is gone (CLAUDE.md, "One name per thing"). `reported` is gone with the handshake.
export type LadderChallengeStatus = 'open' | 'accepted' | 'declined' | 'confirmed';

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
  set_1_player_1?: number; set_1_player_2?: number;
  set_2_player_1?: number; set_2_player_2?: number;
  set_3_player_1?: number; set_3_player_2?: number;
  court?: string;
  /** Who recorded the result. Kept so a second submission can tell the two apart. */
  reported_by?: string;
  created_at: string;
  responded_at?: string;
  reported_at?: string;
  confirmed_at?: string;
  /** Stamped when the result lands, matching a tournament match, so history sorts on one field. */
  completed_at?: string;
  /**
   * Both players submitted and named different winners. The first result stays applied and
   * showing; an organizer resolves it. Never set by the same player submitting twice.
   */
  score_disputed?: boolean;
  /** Stamped by the server when it pays the result. Never written by a client. */
  applied?: boolean;
  // Set only when this challenge was converted from an already-played tournament match (see
  // proposeConversion); absent for a normal challenge. Conversions from before rallies stopped
  // converting carry the old stored value 'friendly'.
  source?: 'tournament' | 'friendly';
  source_id?: string;
}

// Days a pair must wait before re-challenging each other. Computed live from confirmed_at, so
// changing this clears or extends every existing cooldown immediately, with no data change.
export const LADDER_COOLDOWN_DAYS = 3;
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
  await addDoc(collection(db, 'matches'), {
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

// Opponent accepts or declines an open challenge — same accept/decline gate as Rallies
// rallies. Only once accepted does the pair get each other's contact info.
//
// Accepting a CONVERSION records it: it arrives with the winner and score already on the doc,
// because the match was played before anyone proposed it, and the server records exactly that.
export async function respondChallenge(id: string, accept: boolean): Promise<void> {
  const ref = doc(db, 'matches', id);
  if (accept) {
    const data = (await getDoc(ref)).data();
    if (data?.source && data.winner_uid) { await recordScore({ matchId: id }); return; }
  }
  await updateDoc(ref, { status: accept ? 'accepted' : 'declined', responded_at: new Date().toISOString() });
}

// Convert an already-played Tournament match into a Challenge (Tournament.tsx's "Also count as a
// Challenge"): proposed with the winner/score already known, then confirmed like any other
// challenge. Rallies don't convert.
export async function proposeConversion(args: {
  eventId: string;
  division: LadderDivision;
  source: 'tournament';
  sourceId: string;
  proposer: { id: string; name: string };
  other: { id: string; name: string };
  winner: { id: string; name: string };
  /** Ordered [proposer games, other games] — the proposer becomes player_1 below. */
  sets: [number, number][];
  court?: string;
}): Promise<string> {
  const ref = await addDoc(collection(db, 'matches'), {
    category: 'challenge',
    event_id: args.eventId,
    division: args.division,
    player_1_uid: args.proposer.id,
    player_1_name: args.proposer.name,
    player_2_uid: args.other.id,
    player_2_name: args.other.name,
    status: 'open',
    source: args.source,
    source_id: args.sourceId,
    winner_uid: args.winner.id,
    winner_name: args.winner.name,
    ...setFieldsFrom(args.sets),
    ...(args.court ? { court: args.court } : {}),
    created_at: new Date().toISOString(),
  });
  return ref.id;
}

// Calls off a challenge with no score yet: the challenger while it's open, either player once it's
// accepted (firestore.rules). Nothing is paid before a result, so there is nothing to reverse.
export async function cancelChallenge(id: string): Promise<void> {
  await deleteDoc(doc(db, 'matches', id));
}
