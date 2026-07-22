import { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import type { TournamentMatch } from '../../pages/tournament/types';

// A user's completed matches, newest first, from their perspective (their games first).
// Shared by the Profile "Recent Matches" block and the Home "Your Progress" chart.
// Queries a single equality field (auto-indexed) and filters status client-side so no new
// composite index is required.

export type UserMatch = {
  id: string;
  opponentName: string;
  won: boolean;
  completedAt: number; // ms since epoch
  myGames: number;
  oppGames: number;
  scoreLine: string; // e.g. "6-4, 6-3" (user's games first)
};

const num = (v: unknown) => (typeof v === 'number' ? v : 0);

export function useUserMatches(uid?: string): { matches: UserMatch[]; loading: boolean } {
  const [matches, setMatches] = useState<UserMatch[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) { setMatches([]); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const [s1, s2] = await Promise.all([
          getDocs(query(collection(db, 'tournament_matches'), where('player_1_user_id', '==', uid))),
          getDocs(query(collection(db, 'tournament_matches'), where('player_2_user_id', '==', uid))),
        ]);

        const byId = new Map<string, TournamentMatch>();
        [...s1.docs, ...s2.docs].forEach((d) => byId.set(d.id, { id: d.id, ...d.data() } as TournamentMatch));

        const list: UserMatch[] = [];
        for (const m of byId.values()) {
          if (m.status !== 'complete' || !m.winner_user_id) continue;
          const iAmP1 = m.player_1_user_id === uid;
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
            opponentName: (iAmP1 ? m.player_2_name : m.player_1_name) || 'Opponent',
            won: m.winner_user_id === uid,
            completedAt: m.completed_at ? Date.parse(m.completed_at) : 0,
            myGames: parts.reduce((s, [a]) => s + a, 0),
            oppGames: parts.reduce((s, [, b]) => s + b, 0),
            scoreLine: parts.map(([a, b]) => `${a}-${b}`).join(', '),
          });
        }

        list.sort((a, b) => b.completedAt - a.completedAt);
        if (!cancelled) { setMatches(list); setLoading(false); }
      } catch (err) {
        console.error('Failed to load user matches:', err);
        if (!cancelled) { setMatches([]); setLoading(false); }
      }
    })();

    return () => { cancelled = true; };
  }, [uid]);

  return { matches, loading };
}
