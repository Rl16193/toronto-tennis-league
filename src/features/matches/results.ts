import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, onSnapshot, query, where, type Timestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';

/**
 * Match results. A match carries only its lifecycle (`status`, `winner_uid`); the result — sets,
 * walkover, points, who entered it — is its applied `submissions` entry, written only by the
 * scoreMatch function. These helpers are the one way the client reads them.
 */
export interface Submission {
  id: string;
  category: 'tournament' | 'challenge' | 'rally';
  sub_category: 'result' | 'correction' | 'walkover' | 'reset';
  status: 'applied' | 'superseded' | 'disputed' | 'rejected';
  match_id: string;
  event_id: string;
  uid: string;
  user_name: string;
  winner_uid: string;
  winner_name: string;
  set_1_player_1: number;
  set_1_player_2: number;
  set_2_player_1: number;
  set_2_player_2: number;
  set_3_player_1: number;
  set_3_player_2: number;
  court: string;
  replaces_id: string;
  points_winner: number;
  points_loser: number;
  applied_deltas: Record<string, Record<string, number>>;
  applied_at: Timestamp | null;
  completed_at: Timestamp | null;
  resolved_by: string;
  resolved_at: Timestamp | null;
  created_at: Timestamp | null;
  updated_at: Timestamp | null;
}

/** An applied entry that is a match's result (a reset row is history, not a result). */
export const isResultEntry = (s: Pick<Submission, 'status' | 'sub_category'>) =>
  s.status === 'applied' && (s.sub_category === 'result' || s.sub_category === 'correction' || s.sub_category === 'walkover');

export const isWalkover = (s: Pick<Submission, 'sub_category'> | null | undefined) => s?.sub_category === 'walkover';

const toMap = (docs: Submission[]) => new Map(docs.filter(isResultEntry).map((s) => [s.match_id, s]));
const asSubmission = (d: { id: string; data: () => unknown }) => ({ id: d.id, ...(d.data() as Omit<Submission, 'id'>) });

/** Live: match id → result, for every match of an event. */
export function useEventResults(eventId: string | undefined | null): Map<string, Submission> {
  const [results, setResults] = useState<Map<string, Submission>>(new Map());
  useEffect(() => {
    if (!eventId) { setResults(new Map()); return; }
    return onSnapshot(
      query(collection(db, 'submissions'), where('event_id', '==', eventId), where('status', '==', 'applied')),
      (snap) => setResults(toMap(snap.docs.map(asSubmission))),
      () => setResults(new Map()),
    );
  }, [eventId]);
  return results;
}

/** One-off: match id → result for these matches (chunked `in` queries). */
export async function fetchResultsFor(matchIds: string[]): Promise<Map<string, Submission>> {
  const ids = [...new Set(matchIds.filter(Boolean))];
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 30) chunks.push(ids.slice(i, i + 30));
  const snaps = await Promise.all(chunks.map((c) => getDocs(
    query(collection(db, 'submissions'), where('match_id', 'in', c), where('status', '==', 'applied')),
  ).catch(() => null)));
  return toMap(snaps.flatMap((s) => (s ? s.docs.map(asSubmission) : [])));
}

/** Live-ish: results for a changing list of matches (refetched when the ids change). */
export function useResultsFor(matchIds: string[]): Map<string, Submission> {
  const key = useMemo(() => [...new Set(matchIds.filter(Boolean))].sort().join(','), [matchIds]);
  const [results, setResults] = useState<Map<string, Submission>>(new Map());
  useEffect(() => {
    if (!key) { setResults(new Map()); return; }
    let live = true;
    fetchResultsFor(key.split(',')).then((m) => { if (live) setResults(m); });
    return () => { live = false; };
  }, [key]);
  return results;
}

/** "6-4, 6-3" from an entry's absolute per-set fields ('' for a walkover or no games). */
export const scoreLine = (s: Submission | null | undefined, flip = false) => {
  if (!s || isWalkover(s)) return '';
  return [1, 2, 3]
    .map((n) => [s[`set_${n}_player_1` as keyof Submission] as number, s[`set_${n}_player_2` as keyof Submission] as number])
    .filter(([a, b]) => (a ?? 0) > 0 || (b ?? 0) > 0)
    .map(([a, b]) => (flip ? `${b}-${a}` : `${a}-${b}`))
    .join(', ');
};
