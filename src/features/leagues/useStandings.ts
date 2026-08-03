import { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';

// Shared leaderboard model + loader, consumed by the Leagues page and the Home landing
// league section so both read the same public `stats` data (no drift).

export type LeagueRow = {
  user_id: string;
  name: string;
  skill_level: number;
  tournamentsPlayed: number;
  matchesPlayed: number;
  wins: number;
  loses: number;
  leaguePoints26: number;
  league: string;
  pointswon: number;
  totalPointsPlayed: number;
  rankTrend: 'up' | 'down' | 'flat';
  rankMove: number; // places climbed/fallen since the last snapshot (0 for flat/baseline)
};

export type DivTab = 'mens' | 'womens' | 'doubles';

export const DIV_TABS: { id: DivTab; label: string }[] = [
  { id: 'mens', label: "Men's" },
  { id: 'womens', label: "Women's" },
  { id: 'doubles', label: 'Doubles' },
];

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
// From the same single read it also derives community totals for the Home hero (no extra query):
// `activePlayers` = players who have played a match; `matchesOrganized` = Σ matchesPlayed / 2.
export function useStandings(): {
  rows: LeagueRow[];
  loading: boolean;
  activePlayers: number;
  matchesOrganized: number;
} {
  const [rows, setRows] = useState<LeagueRow[]>([]);
  const [activePlayers, setActivePlayers] = useState(0);
  const [matchesOrganized, setMatchesOrganized] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDocs(collection(db, 'stats')).then((snap) => {
      const data: LeagueRow[] = [];
      let players = 0;
      let matchTotal = 0;
      snap.forEach((d) => {
        const s = d.data();
        const mp = s.matchesPlayed ?? 0;
        if (mp > 0) { players += 1; matchTotal += mp; }
        if (!s.leaguePoints26 || s.leaguePoints26 <= 0) return;
        data.push({
          user_id: d.id,
          name: s.name || '',
          skill_level: s.skill_level ?? 0,
          tournamentsPlayed: s.tournamentsPlayed ?? 0,
          matchesPlayed: mp,
          wins: s.wins ?? 0,
          loses: s.loses ?? 0,
          leaguePoints26: s.leaguePoints26,
          league: s.league || '',
          pointswon: s.pointswon ?? 0,
          totalPointsPlayed: s.totalPointsPlayed ?? 0,
          rankTrend: (s.rankTrend === 'up' || s.rankTrend === 'down') ? s.rankTrend : 'flat',
          rankMove: typeof s.rankMove === 'number' ? s.rankMove : 0,
        });
      });
      setRows(data);
      setActivePlayers(players);
      setMatchesOrganized(Math.round(matchTotal / 2));
      setLoading(false);
    });
  }, []);

  return { rows, loading, activePlayers, matchesOrganized };
}
