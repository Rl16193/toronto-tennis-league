import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  increment,
  runTransaction,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';

// Collection backing the League Ladder challenge loop. A challenge is a lightweight,
// organizer-confirmed head-to-head: on confirm the winner gains +3 leaguePoints26 and the
// loser loses 3 (floored at 0) — the same league standings shown on the Leagues page.
// Challenges live in the shared `matches` collection, tagged with category: 'challenge'.
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
  claimed_winner_uid?: string;
  claimed_winner_name?: string;
  score_line?: string;
  court?: string;
  reported_by?: string;
  created_at: string;
  responded_at?: string;
  reported_at?: string;
  confirmed_at?: string;
  applied?: boolean;
  // Set only when this challenge was converted from an already-played Friendly or Tournament
  // match (see proposeConversion) — absent/undefined for a normal, from-scratch challenge.
  source?: 'friendly' | 'tournament';
  source_id?: string;
}

// Points swing per confirmed challenge.
export const LADDER_POINTS = 3;
// Days a pair must wait before re-challenging each other.
export const LADDER_COOLDOWN_DAYS = 7;
// A player may have at most this many of their own SENT challenges sitting in 'open' or
// 'accepted' status at once — no time-based reset. A challenge stops counting once it's reported
// (score submitted, awaiting confirm), confirmed, rejected, or cancelled (cancelling deletes the
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

// Convert an already-played Friendly or Tournament match into a Challenge: one player proposes
// (with the winner/score already known — for a Tournament match it's the real submitted result;
// for a Friendly it's whatever the two players agree happened), the other player confirms via
// confirmConversion, and it then waits for organizer confirmation like any other challenge.
export async function proposeConversion(args: {
  eventId: string;
  division: LadderDivision;
  source: 'friendly' | 'tournament';
  sourceId: string;
  proposer: { id: string; name: string };
  other: { id: string; name: string };
  winner: { id: string; name: string };
  scoreLine: string;
  court?: string;
}): Promise<string> {
  const ref = await addDoc(collection(db, MATCHES_COL), {
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
    claimed_winner_uid: args.winner.id,
    claimed_winner_name: args.winner.name,
    score_line: args.scoreLine,
    ...(args.court ? { court: args.court } : {}),
    created_at: new Date().toISOString(),
  });
  return ref.id;
}

// The other player's single "Confirm" action — accepts the proposed conversion and immediately
// re-reports the same score, landing it in 'reported' so it shows up in the organizer's normal
// confirm queue. Two sequential writes, each already allowed by the existing challenge rules
// (accept while 'open', report while 'accepted') — no rules changes needed.
export async function confirmConversion(
  id: string,
  confirmer: { id: string; name: string },
  winner: { id: string; name: string },
  scoreLine: string,
  court?: string,
): Promise<void> {
  const now = new Date().toISOString();
  await updateDoc(doc(db, MATCHES_COL, id), { status: 'accepted', responded_at: now });
  await updateDoc(doc(db, MATCHES_COL, id), {
    status: 'reported',
    claimed_winner_uid: winner.id,
    claimed_winner_name: winner.name,
    score_line: scoreLine,
    reported_by: confirmer.id,
    ...(court ? { court } : {}),
    reported_at: now,
  });
}

// Either participant reports the result once played; it then waits for organizer confirmation.
export async function reportChallenge(
  id: string,
  winner: { id: string; name: string },
  scoreLine: string,
  reportedBy: string,
  court?: string,
): Promise<void> {
  await updateDoc(doc(db, MATCHES_COL, id), {
    status: 'reported',
    claimed_winner_uid: winner.id,
    claimed_winner_name: winner.name,
    score_line: scoreLine,
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

// Organizer confirm: apply ±3 to leaguePoints26 (loser floored at 0) and tick match counters.
// leaguePoints26 is organizer-gated in firestore.rules, so this must run as the event creator.
// A Tournament-sourced conversion (source: 'tournament') already had matchesPlayed/wins/loses
// counted when the tournament match itself was scored — counting them again here would count the
// same match twice, so that case only adds the ±3 league points, nothing else.
export async function confirmChallenge(ch: LadderChallenge): Promise<void> {
  if (!ch.claimed_winner_uid) throw new Error('No winner reported');
  const winnerId = ch.claimed_winner_uid;
  const loserId = winnerId === ch.player_1_uid ? ch.player_2_uid : ch.player_1_uid;
  const countAsNewMatch = ch.source !== 'tournament';

  const loserRef = doc(db, 'stats', loserId);

  // A transaction, not a batch: the loser's points are floored at 0, which needs a read before
  // the write, and a plain read-then-batch lets two concurrent confirms both read the same
  // starting value and each write the same result — silently dropping one deduction. The
  // transaction re-runs on contention so the second confirm sees the first one's result.
  // Writes are set(merge) rather than update() so a player with no stats doc yet (or a deleted
  // account) can't reject the whole thing and strand the challenge in 'reported'.
  const challengeRef = doc(db, MATCHES_COL, ch.id);

  await runTransaction(db, async (tx) => {
    // Read the challenge INSIDE the transaction and bail if it's already been applied. Without
    // this, two confirms fired close together (a double-tap on mobile) each read a pre-confirm
    // world and both apply ±3 — the winner ends up +6, the loser -6, and those phantom points
    // are spendable on Services. `applied` was already being written here; it just wasn't
    // being read. Reads must precede writes in a transaction, so this goes first.
    const chSnap = await tx.get(challengeRef);
    const chData = chSnap.data();
    if (chData?.applied === true || chData?.status === 'confirmed') return;

    const loserSnap = await tx.get(loserRef);
    const curLoserPts = (loserSnap.data()?.leaguePoints26 as number | undefined) ?? 0;
    const newLoserPts = Math.max(0, curLoserPts - LADDER_POINTS);

    tx.set(doc(db, 'stats', winnerId), {
      leaguePoints26: increment(LADDER_POINTS),
      ...(countAsNewMatch ? { matchesPlayed: increment(1), wins: increment(1) } : {}),
    }, { merge: true });
    tx.set(loserRef, {
      leaguePoints26: newLoserPts,
      ...(countAsNewMatch ? { matchesPlayed: increment(1), loses: increment(1) } : {}),
    }, { merge: true });
    tx.set(challengeRef, {
      status: 'confirmed',
      applied: true,
      confirmed_at: new Date().toISOString(),
    }, { merge: true });
  });
}

