import { Timestamp, addDoc, collection, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';

// League Ladder challenge loop: request, accept or decline, play. Every result, and its +3 / -3,
// goes through the scoreMatch Cloud Function (features/matches/scoring.ts); this file only opens,
// answers and cancels requests. Challenges live in `matches`, tagged category: 'challenge'.

export type LadderDivision = 'mens' | 'womens';
// `declined` is the one word for a turned-down challenge (CLAUDE.md, "One name per thing").
// A played challenge is `complete`; its result is its applied `submissions` entry (results.ts).
export type LadderChallengeStatus = 'open' | 'accepted' | 'declined' | 'complete';

export interface LadderChallenge {
  id: string;
  event_id: string;
  division: LadderDivision;
  player_1_uid: string;
  player_1_name: string;
  player_2_uid: string;
  player_2_name: string;
  status: LadderChallengeStatus;
  /** '' until played; the score itself is on the result entry. */
  winner_uid: string;
  created_at: Timestamp | null;
  responded_at: Timestamp | null;
  updated_at: Timestamp | null;
}

// Days a pair must wait before re-challenging each other, counted from the result's completed_at.
// Computed live, so changing this clears or extends every existing cooldown immediately.
export const LADDER_COOLDOWN_DAYS = 3;
// Max own SENT challenges sitting in 'open' or 'accepted' at once — no time-based reset.
// A challenge stops counting once recorded or declined, or cancelled (cancel deletes the doc).
export const LADDER_ACTIVE_CHALLENGE_CAP = 3;

export async function createChallenge(args: {
  eventId: string;
  division: LadderDivision;
  challenger: { id: string; name: string };
  opponent: { id: string; name: string };
}): Promise<void> {
  const now = Timestamp.now();
  // The full matches shape; tournament-only fields hold typed empties.
  await addDoc(collection(db, 'matches'), {
    category: 'challenge',
    sub_category: 'singles',
    status: 'open',
    player_1_uid: args.challenger.id,
    player_1_name: args.challenger.name,
    player_2_uid: args.opponent.id,
    player_2_name: args.opponent.name,
    participant_uids: [args.challenger.id, args.opponent.id],
    event_id: args.eventId,
    winner_uid: '',
    responded_at: null,
    created_at: now,
    updated_at: now,
    match_id: '', round: '', position: 0, drawsize: 0,
    division: args.division,
    skill_group: '', zone: '', format: '',
    player_1_slot: 0, player_2_slot: 0, next_match_id: '', next_slot: '', started: false,
    group_label: 'challenge',
  });
}

// Opponent accepts or declines an open challenge — same accept/decline gate as rallies.
// Only once accepted does the pair get each other's contact info.
export async function respondChallenge(id: string, accept: boolean): Promise<void> {
  const now = Timestamp.now();
  await updateDoc(doc(db, 'matches', id), { status: accept ? 'accepted' : 'declined', responded_at: now, updated_at: now });
}

// Calls off a challenge with no score yet: the challenger while it's open, either player once it's
// accepted (firestore.rules). Nothing is paid before a result, so there is nothing to reverse.
export async function cancelChallenge(id: string): Promise<void> {
  await deleteDoc(doc(db, 'matches', id));
}
