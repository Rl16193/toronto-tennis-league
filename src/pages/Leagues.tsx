import React, { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';

type LeagueRow = {
  user_id: string;
  name: string;
  skill_level: number;
  tournamentsPlayed: number;
  matchesPlayed: number;
  wins: number;
  loses: number;
  leaguePoints26: number;
  league: string;
};

type DivTab = 'mens' | 'womens' | 'doubles';

const DIV_TABS: { id: DivTab; label: string }[] = [
  { id: 'mens', label: "Men's" },
  { id: 'womens', label: "Women's" },
  { id: 'doubles', label: 'Doubles' },
];

const inDivision = (league: string, tab: DivTab): boolean => {
  const l = (league || '').toLowerCase();
  if (tab === 'mens') return (l.includes('men') || l.includes('male')) && !l.includes('women') && !l.includes('female');
  if (tab === 'womens') return l.includes('wom') || l.includes('female');
  if (tab === 'doubles') return l.includes('double') || l.includes('mixed');
  return false;
};

export const Leagues: React.FC = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<LeagueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeDiv, setActiveDiv] = useState<DivTab>('mens');
  const [stillActiveUids, setStillActiveUids] = useState<Set<string>>(new Set());
  const [hasActiveTournament, setHasActiveTournament] = useState(false);

  useEffect(() => { document.title = 'Leagues — Racquets & Strings'; }, []);

  useEffect(() => {
    if (!authLoading && !user) navigate('/login?returnTo=%2Fleagues');
  }, [authLoading, user, navigate]);

  // Load standings — only players with at least one confirmed match score
  useEffect(() => {
    if (!user) return;
    getDocs(collection(db, 'stats')).then((snap) => {
      const data: LeagueRow[] = [];
      snap.forEach((d) => {
        const s = d.data();
        if (!s.matchesPlayed || s.matchesPlayed === 0) return;
        data.push({
          user_id: d.id,
          name: s.name || '',
          skill_level: s.skill_level ?? 0,
          tournamentsPlayed: s.tournamentsPlayed ?? 0,
          matchesPlayed: s.matchesPlayed,
          wins: s.wins ?? 0,
          loses: s.loses ?? 0,
          leaguePoints26: s.leaguePoints26 ?? 0,
          league: s.league || '',
        });
      });
      setRows(data);
      setLoading(false);
    });
  }, [user]);

  // Detect active tournaments and find players still in (not yet eliminated)
  useEffect(() => {
    if (!user) return;
    const fetchActive = async () => {
      const eventsSnap = await getDocs(collection(db, 'events'));
      const now = Date.now();
      const activeIds = eventsSnap.docs
        .filter((d) => {
          const e = d.data();
          if (!e.type?.toLowerCase().includes('tournament')) return false;
          const start = e.startDate || e.start_date || e.date;
          if (!start) return false;
          const startMs = typeof start === 'object' && start.toDate ? start.toDate().getTime() : new Date(start).getTime();
          return startMs <= now;
        })
        .map((d) => d.id);

      if (activeIds.length === 0) return;
      setHasActiveTournament(true);

      const ids = activeIds.slice(0, 30);
      const [participantsSnap, matchesSnap] = await Promise.all([
        getDocs(query(collection(db, 'event_participants'), where('event_id', 'in', ids))),
        getDocs(query(collection(db, 'tournament_matches'), where('event_id', 'in', ids), where('status', '==', 'complete'))),
      ]);

      const allParticipantUids = new Set(participantsSnap.docs.map((d) => d.data().user_id));
      const eliminatedUids = new Set<string>();
      matchesSnap.docs.forEach((d) => {
        const m = d.data();
        const loserUid = m.winner_user_id === m.player_1_user_id ? m.player_2_user_id : m.player_1_user_id;
        if (loserUid) eliminatedUids.add(loserUid);
      });

      setStillActiveUids(new Set([...allParticipantUids].filter((uid) => !eliminatedUids.has(uid))));
    };
    fetchActive();
  }, [user]);

  const filtered = rows
    .filter((r) => inDivision(r.league, activeDiv))
    .sort((a, b) => b.leaguePoints26 - a.leaguePoints26);

  if (authLoading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="w-14 h-14 border-4 border-clay border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20 pt-4 md:pt-6">
      <h1 className="text-3xl font-black text-white mb-6">Leagues</h1>

      {/* Organizer tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        <button className="px-5 py-2 rounded-2xl text-sm font-bold bg-clay text-white border border-clay">
          TBTC
        </button>
      </div>

      {/* Division sub-tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {DIV_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveDiv(tab.id)}
            className={`px-4 py-2 rounded-2xl text-sm font-semibold transition-all border ${
              activeDiv === tab.id
                ? 'bg-clay text-white border-clay'
                : 'bg-tennis-surface/40 text-white border-white/10 hover:border-white/30'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-12 bg-tennis-surface/30 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-xl font-bold text-white">No standings yet</p>
          <p className="text-white/60 mt-1 text-sm">Standings will appear once matches are played.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl bg-tennis-surface/30 border border-white/5">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10">
                <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest text-white/50 w-10">#</th>
                <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-widest text-white/50">Name</th>
                <th className="px-4 py-3 text-center text-xs font-black uppercase tracking-widest text-white/50">Skill</th>
                <th className="px-4 py-3 text-center text-xs font-black uppercase tracking-widest text-white/50">Events</th>
                <th className="px-4 py-3 text-center text-xs font-black uppercase tracking-widest text-clay">Matches</th>
                <th className="px-4 py-3 text-center text-xs font-black uppercase tracking-widest text-white/50">Wins</th>
                <th className="px-4 py-3 text-center text-xs font-black uppercase tracking-widest text-clay">Points</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, i) => (
                <tr
                  key={row.user_id}
                  className={`border-b border-white/5 transition-colors hover:bg-white/[0.04] ${i % 2 !== 0 ? 'bg-white/[0.02]' : ''}`}
                >
                  <td className="px-4 py-3 text-white/40 font-mono text-xs">{i + 1}</td>
                  <td className="px-4 py-3 font-semibold text-white">{row.name}</td>
                  <td className="px-4 py-3 text-center text-white/80">{row.skill_level}</td>
                  <td className="px-4 py-3 text-center text-white/80">
                    {row.tournamentsPlayed}{stillActiveUids.has(row.user_id) ? <span className="text-clay font-black">*</span> : null}
                  </td>
                  <td className="px-4 py-3 text-center font-bold text-clay">{row.matchesPlayed}</td>
                  <td className="px-4 py-3 text-center text-white/80">{row.wins}</td>
                  <td className="px-4 py-3 text-center font-black text-clay text-base">{row.leaguePoints26}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {hasActiveTournament && (
        <p className="mt-3 text-xs text-white/40">
          <span className="text-clay font-black">*</span> — Ongoing Tournament
        </p>
      )}
    </div>
  );
};
