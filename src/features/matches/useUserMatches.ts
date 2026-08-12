import { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import type { TournamentMatch } from '../../pages/tournament/types';

// A user's completed matches, newest first, from their perspective (their games first).
// Shared by the Profile "Recent Matches" block and the Home "Your Progress" chart.
// Single array-contains query on the shared `matches` collection, with category filter in JS
// so tournament, rally, and challenge rows load together without per-source queries.

export type UserMatch = {
  id: string;
  opponentId: string;
  opponentName: string;
  eventId: string;
  won: boolean;
  completedAt: number; // ms since epoch
  myGames: number;
  oppGames: number;
  scoreLine: string; // e.g. "6-4, 6-3" (user's games first)
};

// A match the user is in that hasn't been played/scored yet (status !== 'complete'). Also covers
// accepted Friendlies rallies and accepted League Ladder challenges — neither has a real match
// doc until it's played, but both represent an "upcoming" game the same way a generated-but-
// unplayed tournament match does. `source` distinguishes them for display; `eventId` is only
// ever set for tournament matches.
export type UpcomingMatch = {
  id: string;
  opponentId: string;
  opponentName: string;
  opponentContact: string;
  eventId: string;
  source: 'tournament' | 'rally' | 'challenge';
};

const num = (v: unknown) => (typeof v === 'number' ? v : 0);

// Opponent slots that aren't a real, contactable person yet.
const PLACEHOLDER_NAMES = new Set(['bye', 'player loading', '']);
const isRealOpponent = (name: string) =>
  !PLACEHOLDER_NAMES.has(name.trim().toLowerCase()) && !name.toLowerCase().startsWith('winner of ');

const isTournamentMatch = (category?: string) => category === 'singles' || category === 'doubles';

export function useUserMatches(uid?: string): { matches: UserMatch[]; upcoming: UpcomingMatch[]; loading: boolean } {
  const [matches, setMatches] = useState<UserMatch[]>([]);
  const [upcoming, setUpcoming] = useState<UpcomingMatch[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Clear BOTH lists on sign-out — leaving `upcoming` populated kept the previous user's
    // opponent names and contact strings on screen until the next remount.
    if (!uid) { setMatches([]); setUpcoming([]); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const [s1, s2] = await Promise.all([
          getDocs(query(collection(db, 'matches'), where('player_1_uid', '==', uid))),
          getDocs(query(collection(db, 'matches'), where('player_2_uid', '==', uid))),
        ]);

        const list: UserMatch[] = [];
        const pending: UpcomingMatch[] = [];

        [...s1.docs, ...s2.docs].forEach((d) => {
          const raw = d.data();
          const category = raw.category as string | undefined;

          if (isTournamentMatch(category)) {
            const m = { id: d.id, ...raw } as TournamentMatch;
            const iAmP1First = m.player_1_uid === uid;
            // Upcoming = not yet completed / no score submitted, against a real opponent.
            if (m.status !== 'complete') {
              const oppName = (iAmP1First ? m.player_2_name : m.player_1_name) || '';
              if (isRealOpponent(oppName)) {
                pending.push({
                  id: m.id,
                  opponentId: (iAmP1First ? m.player_2_uid : m.player_1_uid) || '',
                  opponentName: oppName,
                  opponentContact: '',
                  eventId: m.event_id || '',
                  source: 'tournament',
                });
              }
              return;
            }
            if (!m.winner_uid) return;
            const iAmP1 = m.player_1_uid === uid;
            const mySets = iAmP1
              ? [num(m.set_1_player_1), num(m.set_2_player_1), num(m.set_3_player_1)]
              : [num(m.set_1_player_2), num(m.set_2_player_2), num(m.set_3_player_2)];
            const oppSets = iAmP1
              ? [num(m.set_1_player_2), num(m.set_2_player_2), num(m.set_3_player_2)]
              : [num(m.set_1_player_1), num(m.set_2_player_1), num(m.set_3_player_1)];
            const parts = mySets
              .map((a, i) => [a, oppSets[i]] as [number, number])
              .filter(([a, b]) => a > 0 || b > 0);

            list.push({
              id: m.id,
              opponentId: (iAmP1 ? m.player_2_uid : m.player_1_uid) || '',
              opponentName: (iAmP1 ? m.player_2_name : m.player_1_name) || 'Opponent',
              eventId: m.event_id || '',
              won: m.winner_uid === uid,
              completedAt: m.completed_at ? Date.parse(m.completed_at) : 0,
              myGames: parts.reduce((s, [a]) => s + a, 0),
              oppGames: parts.reduce((s, [, b]) => s + b, 0),
              scoreLine: parts.map(([a, b]) => `${a}-${b}`).join(', '),
            });
            return;
          }

          if (category === 'rally') {
            if (raw.status !== 'accepted') return;
            const iAmP1 = raw.player_1_uid === uid;
            pending.push({
              id: d.id,
              opponentId: (iAmP1 ? raw.player_2_uid : raw.player_1_uid) || '',
              opponentName: (iAmP1 ? raw.player_2_name : raw.player_1_name) || 'Opponent',
              opponentContact: '',
              eventId: '',
              source: 'rally',
            });
            return;
          }

          if (category === 'challenge') {
            if (raw.status !== 'accepted') return;
            const iAmP1 = raw.player_1_uid === uid;
            pending.push({
              id: d.id,
              opponentId: (iAmP1 ? raw.player_2_uid : raw.player_1_uid) || '',
              opponentName: (iAmP1 ? raw.player_2_name : raw.player_1_name) || 'Opponent',
              opponentContact: '',
              eventId: '',
              source: 'challenge',
            });
          }
        });

        list.sort((a, b) => b.completedAt - a.completedAt);
        if (!cancelled) { setMatches(list); setUpcoming(pending); setLoading(false); }
      } catch (err) {
        console.error('Failed to load user matches:', err);
        if (!cancelled) { setMatches([]); setUpcoming([]); setLoading(false); }
      }
    })();

    return () => { cancelled = true; };
  }, [uid]);

  return { matches, upcoming, loading };
}
