import { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import type { LeagueRow } from './types';

export type { LeagueRow } from './types';

// Shared leaderboard model + loader, consumed by the Leagues page and the Home landing
// league section so both read the same public `stats` data (no drift).

// Points-or-games win rate. Shared because every player row in the app now shows this same tile —
// leaderboard, challenges, friendlies, upcoming matches and the RR groups.
export const pgWinPct = (r: { pointswon?: number; totalPointsPlayed?: number }) =>
  (r.totalPointsPlayed ?? 0) > 0 ? `${Math.round(((r.pointswon ?? 0) / (r.totalPointsPlayed ?? 1)) * 100)}%` : '—';

export type DivTab = 'mens' | 'womens' | 'doubles';

export const toTitleCase = (s: string) =>
  s.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());

export const inDivision = (league: string, tab: DivTab): boolean => {
  const l = (league || '').toLowerCase();
  if (tab === 'mens') return (l.includes('men') || l.includes('male')) && !l.includes('women') && !l.includes('female');
  if (tab === 'womens') return l.includes('wom') || l.includes('female');
  if (tab === 'doubles') return l.includes('double') || l.includes('mixed');
  return false;
};

// Public leaderboard — `stats` is world-readable, so this loads with or without an account.
export function useStandings(): { rows: LeagueRow[]; loading: boolean } {
  const [rows, setRows] = useState<LeagueRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getDocs(collection(db, 'stats'))
      .then((snap) => {
        if (cancelled) return;
        const data: LeagueRow[] = [];
        snap.forEach((d) => {
          const s = d.data();
          const mp = s.matchesPlayed ?? 0;
          // Everyone with a name is returned, including brand-new members on 0 points. This used
          // to skip them, which meant a new signup was invisible to the whole app — including the
          // "New" filter on Matches, whose entire job is to surface them. Consumers that only want
          // ranked players (the Leaderboard) filter on points themselves.
          if (!(s.name || '').trim()) return;
          data.push({
            user_id: d.id,
            name: s.name || '',
            skill_level: s.skill_level ?? 0,
            tournamentsPlayed: s.tournamentsPlayed ?? 0,
            matchesPlayed: mp,
            wins: s.wins ?? 0,
            loses: s.loses ?? 0,
            leaguePoints26: s.leaguePoints26 ?? 0,
            league: s.league || '',
            pointswon: s.pointswon ?? 0,
            totalPointsPlayed: s.totalPointsPlayed ?? 0,
            rankTrend: s.rankTrend === 'up' || s.rankTrend === 'down' ? s.rankTrend : 'flat',
            rankMove: typeof s.rankMove === 'number' ? s.rankMove : 0,
          });
        });
        setRows(data);
        setLoading(false);
      })
      .catch((err) => {
        // Without this the promise rejects unhandled and `loading` stays true forever — offline,
        // or before the stats rules are deployed, the leaderboard and the Home league panel just
        // spun indefinitely with no error and no retry.
        if (cancelled) return;
        console.error('Standings load failed:', err);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { rows, loading };
}
