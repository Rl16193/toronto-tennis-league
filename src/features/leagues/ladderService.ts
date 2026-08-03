import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';

// Collection backing the League Ladder challenge loop. A challenge is a lightweight,
// organizer-confirmed head-to-head: on confirm the winner gains +3 leaguePoints26 and the
// loser loses 3 (floored at 0) — the same league standings shown on the Leagues page.
export const LADDER_COL = 'ladder_challenges';

export type LadderDivision = 'mens' | 'womens';
export type LadderChallengeStatus = 'open' | 'accepted' | 'reported' | 'confirmed' | 'rejected';

export interface LadderChallenge {
  id: string;
  event_id: string;
  division: LadderDivision;
  challenger_id: string;
  challenger_name: string;
  opponent_id: string;
  opponent_name: string;
  status: LadderChallengeStatus;
  claimed_winner_id?: string;
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
// A player may open at most this many challenges per calendar week (Mon–Sun). Counted from the
// live challenge docs (cancelling deletes the doc, so a cancelled challenge refunds the slot).
export const LADDER_CHALLENGES_PER_WEEK = 3;

export async function createChallenge(args: {
  eventId: string;
  division: LadderDivision;
  challenger: { id: string; name: string };
  opponent: { id: string; name: string };
}): Promise<void> {
  await addDoc(collection(db, LADDER_COL), {
    event_id: args.eventId,
    division: args.division,
    challenger_id: args.challenger.id,
    challenger_name: args.challenger.name,
    opponent_id: args.opponent.id,
    opponent_name: args.opponent.name,
    status: 'open',
    created_at: new Date().toISOString(),
  });
}

// Opponent accepts or declines an open challenge — same accept/decline gate as Friendlies
// rallies. Only once accepted does the pair get each other's contact info.
export async function respondChallenge(id: string, accept: boolean): Promise<void> {
  await updateDoc(doc(db, LADDER_COL, id), {
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
  const ref = await addDoc(collection(db, LADDER_COL), {
    event_id: args.eventId,
    division: args.division,
    challenger_id: args.proposer.id,
    challenger_name: args.proposer.name,
    opponent_id: args.other.id,
    opponent_name: args.other.name,
    status: 'open',
    source: args.source,
    source_id: args.sourceId,
    claimed_winner_id: args.winner.id,
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
  await updateDoc(doc(db, LADDER_COL, id), { status: 'accepted', responded_at: now });
  await updateDoc(doc(db, LADDER_COL, id), {
    status: 'reported',
    claimed_winner_id: winner.id,
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
  await updateDoc(doc(db, LADDER_COL, id), {
    status: 'reported',
    claimed_winner_id: winner.id,
    claimed_winner_name: winner.name,
    score_line: scoreLine,
    reported_by: reportedBy,
    ...(court ? { court } : {}),
    reported_at: new Date().toISOString(),
  });
}

export async function rejectChallenge(id: string): Promise<void> {
  await updateDoc(doc(db, LADDER_COL, id), { status: 'rejected' });
}

// Challenger may retract an open (not yet reported) challenge.
export async function cancelChallenge(id: string): Promise<void> {
  await deleteDoc(doc(db, LADDER_COL, id));
}

// Organizer confirm: apply ±3 to leaguePoints26 (loser floored at 0) and tick match counters.
// leaguePoints26 is organizer-gated in firestore.rules, so this must run as the event creator.
// A Tournament-sourced conversion (source: 'tournament') already had matchesPlayed/wins/loses
// counted when the tournament match itself was scored — counting them again here would count the
// same match twice, so that case only adds the ±3 league points, nothing else.
export async function confirmChallenge(ch: LadderChallenge): Promise<void> {
  if (!ch.claimed_winner_id) throw new Error('No winner reported');
  const winnerId = ch.claimed_winner_id;
  const loserId = winnerId === ch.challenger_id ? ch.opponent_id : ch.challenger_id;
  const countAsNewMatch = ch.source !== 'tournament';

  const loserRef = doc(db, 'stats', loserId);
  const loserSnap = await getDoc(loserRef);
  const curLoserPts = (loserSnap.data()?.leaguePoints26 as number | undefined) ?? 0;
  const newLoserPts = Math.max(0, curLoserPts - LADDER_POINTS);

  const batch = writeBatch(db);
  batch.update(doc(db, 'stats', winnerId), {
    leaguePoints26: increment(LADDER_POINTS),
    ...(countAsNewMatch ? { matchesPlayed: increment(1), wins: increment(1) } : {}),
  });
  batch.update(loserRef, {
    leaguePoints26: newLoserPts,
    ...(countAsNewMatch ? { matchesPlayed: increment(1), loses: increment(1) } : {}),
  });
  batch.update(doc(db, LADDER_COL, ch.id), {
    status: 'confirmed',
    applied: true,
    confirmed_at: new Date().toISOString(),
  });
  await batch.commit();

  // Record how many places the winner climbed — best-effort, never blocks the confirm. Only
  // ladder-driven movement counts toward the "climb N spots" tasks, which is why it's measured
  // here rather than from the standings at large (a tournament result must not move it).
  recordLadderClimb(ch, winnerId).catch(() => { /* climb tracking is not worth failing over */ });
}

// Places gained = how many players in the same division the winner leapfrogged by gaining 3
// points. Counted from the standings as they were before this result was applied.
async function recordLadderClimb(ch: LadderChallenge, winnerId: string): Promise<void> {
  const snap = await getDocs(collection(db, 'stats'));
  const winnerDoc = snap.docs.find((d) => d.id === winnerId);
  if (!winnerDoc) return;
  const winner = winnerDoc.data();
  const league = (winner.league || '').toString().toLowerCase();
  const isWomens = league.includes('wom') || league.includes('female');

  // Same-division players, with the winner's points rolled back to their pre-match value.
  const before = snap.docs
    .map((d) => {
      const s = d.data();
      const pts = d.id === winnerId
        ? ((s.leaguePoints26 as number) ?? 0) - LADDER_POINTS
        : ((s.leaguePoints26 as number) ?? 0);
      return { id: d.id, league: (s.league || '').toString().toLowerCase(), pts };
    })
    .filter((r) => {
      const l = r.league;
      const w = l.includes('wom') || l.includes('female');
      const m = (l.includes('men') || l.includes('male')) && !w;
      return isWomens ? w : m;
    });

  const winnerBefore = before.find((r) => r.id === winnerId);
  if (!winnerBefore) return;
  // Anyone the winner was behind, but has now caught or passed.
  const climbed = before.filter(
    (r) => r.id !== winnerId && r.pts > winnerBefore.pts && r.pts <= winnerBefore.pts + LADDER_POINTS,
  ).length;
  if (climbed <= 0) return;

  await setDoc(
    doc(db, 'task_progress', winnerId),
    {
      user_id: winnerId,
      name: ch.claimed_winner_name || '',
      climbSpots: increment(climbed),
      updatedAt: new Date().toISOString(),
    },
    { merge: true },
  );
}
