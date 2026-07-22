import React from 'react';
import { Swords } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { useUserMatches } from '../../matches/useUserMatches';

// The player's three most recent completed matches — opponent, result and score — shown on the
// Profile page in place of the old aggregate stat tiles.
export const RecentMatches: React.FC = () => {
  const { user, profile } = useAuth();
  const { matches, loading } = useUserMatches(user?.uid);
  const recent = matches.slice(0, 3);

  const wins = profile?.stats.wins ?? 0;
  const loses = profile?.stats.loses ?? 0;

  // Current streak: consecutive same results counted from the most recent match.
  const streak = (() => {
    if (matches.length === 0) return null;
    const won = matches[0].won;
    let n = 0;
    for (const m of matches) { if (m.won === won) n += 1; else break; }
    return { won, n };
  })();

  return (
    <div className="bg-tennis-surface/30 border border-white/5 rounded-[2.5rem] shadow-xl p-6">
      <h2 className="text-lg font-bold text-white flex items-center mb-4">
        <Swords className="w-5 h-5 mr-2 text-clay" />
        Recent Matches
      </h2>

      {/* Overall record + current streak */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <span className="text-xs font-bold text-white/70 px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/5">
          Record <span className="text-white">{wins}–{loses}</span>
        </span>
        {streak ? (
          <span className={`text-xs font-bold px-2.5 py-1 rounded-lg border ${
            streak.won ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'
          }`}>
            {streak.won ? 'Won' : 'Lost'} {streak.n} in a row
          </span>
        ) : (
          <span className="text-xs font-bold text-white/40 px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/5">No streak yet</span>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="h-14 bg-white/[0.03] rounded-2xl animate-pulse" />)}
        </div>
      ) : recent.length === 0 ? (
        <p className="text-white/50 text-sm">No matches played yet — join an event to get started.</p>
      ) : (
        <div className="space-y-2.5">
          {recent.map((m) => (
            <div key={m.id} className="flex items-center justify-between gap-3 rounded-2xl bg-white/[0.03] border border-white/5 px-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded ${
                    m.won ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'
                  }`}>
                    {m.won ? 'Won' : 'Lost'}
                  </span>
                  <span className="text-white font-semibold text-sm truncate">vs {m.opponentName}</span>
                </div>
                {m.completedAt > 0 && (
                  <p className="text-white/40 text-xs mt-0.5">
                    {new Date(m.completedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                )}
              </div>
              <span className="text-white/80 font-mono text-sm shrink-0">
                {m.scoreLine || `${m.myGames}–${m.oppGames}`}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
