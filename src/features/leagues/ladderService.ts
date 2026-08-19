import { addDoc, collection, deleteDoc, doc, increment, runTransaction, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
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
  // Set only when this challenge was converted from an already-played Friendly or Tournament
  // match (see proposeConversion) — absent/undefined for a normal, from-scratch challenge.
  source?: 'friendly' | 'tournament';
  source_id?: string;
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

// Convert an already-played Tournament match into a Challenge (Tournament.tsx's "Also count as a
// Challenge"): proposed with the winner/score already known, then confirmed like any other
// challenge. Friendlies no longer convert — they record themselves via reportRally.
export async function proposeConversion(args: {
  eventId: string;
  division: LadderDivision;
  source: 'friendly' | 'tournament';
  sourceId: string;
  proposer: { id: string; name: string };
  other: { id: string; name: string };
  winner: { id: string; name: string };
  /** Ordered [proposer games, other games] — the proposer becomes player_1 below. */
  sets: [number, number][];
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
    winner_uid: args.winner.id,
    winner_name: args.winner.name,
    ...setFieldsFrom(args.sets),
    ...(args.court ? { court: args.court } : {}),
    created_at: new Date().toISOString(),
  });
  return ref.id;
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

// Organizer confirm: ±3 leaguePoints26 (loser floored at 0) and tick match counters.
// leaguePoints26 is organizer-gated in firestore.rules, so this must run as the event creator.
// A tournament-sourced conversion already counted matchesPlayed/wins/loses when the tournament
// match was scored, so that case adds only the ±3 — counting again would double the same match.
export async function confirmChallenge(ch: LadderChallenge): Promise<void> {
  if (!ch.winner_uid) throw new Error('No winner reported');
  const winnerId = ch.winner_uid;
  const loserId = winnerId === ch.player_1_uid ? ch.player_2_uid : ch.player_1_uid;
  const countAsNewMatch = ch.source !== 'tournament';

  const loserRef = doc(db, 'stats', loserId);

  // A transaction, not a batch: the loser's floor-at-0 needs a read before the write, and a
  // read-then-batch lets two concurrent confirms read the same value and silently drop one
  // deduction. Writes are set(merge), not update(), so a player with no stats doc can't reject the
  // whole thing and strand the challenge in 'reported'.
  const challengeRef = doc(db, MATCHES_COL, ch.id);

  await runTransaction(db, async (tx) => {
    // Read the challenge INSIDE the transaction and bail if already applied. Without this, two
    // confirms fired close together (a mobile double-tap) each read a pre-confirm world and both
    // apply ±3 — winner +6, loser -6, and those phantom points are spendable on Services.
    // Reads must precede writes in a transaction, so this goes first.
    const chSnap = await tx.get(challengeRef);
    const chData = chSnap.data();
    if (chData?.applied === true || chData?.status === 'confirmed') return;

    const loserSnap = await tx.get(loserRef);
    const curLoserPts = (loserSnap.data()?.leaguePoints26 as number | undefined) ?? 0;
    const newLoserPts = Math.max(0, curLoserPts - LADDER_POINTS);

    tx.set(
      doc(db, 'stats', winnerId),
      {
        leaguePoints26: increment(LADDER_POINTS),
        ...(countAsNewMatch ? { matchesPlayed: increment(1), wins: increment(1) } : {}),
      },
      { merge: true },
    );
    tx.set(
      loserRef,
      {
        leaguePoints26: newLoserPts,
        ...(countAsNewMatch ? { matchesPlayed: increment(1), loses: increment(1) } : {}),
      },
      { merge: true },
    );
    tx.set(
      challengeRef,
      {
        status: 'confirmed',
        applied: true,
        confirmed_at: new Date().toISOString(),
        // Same field a tournament match stamps, so history sorts every result on one key.
        completed_at: new Date().toISOString(),
      },
      { merge: true },
    );
  });
}
