import React from 'react';
import { useAuth } from '../../../context/AuthContext';
import { Star } from 'lucide-react';

export const ProfileStats: React.FC = () => {
  const { profile } = useAuth();
  if (!profile) return null;

  const wins = profile.stats.wins ?? 0;
  const loses = profile.stats.loses ?? 0;
  const matchesPlayed = profile.stats.matchesPlayed ?? 0;
  const pointswon = profile.stats.pointswon ?? 0;
  const totalPointsPlayed = profile.stats.totalPointsPlayed ?? 0;
  const pwPct = totalPointsPlayed > 0 ? `${Math.round((pointswon / totalPointsPlayed) * 100)}%` : '—';

  const tiles = [
    { label: 'Streak (W–L)', value: `${wins}–${loses}`, accent: 'text-white' },
    { label: 'PW %', value: pwPct, accent: 'text-clay' },
    { label: 'MP', value: `${matchesPlayed}`, accent: 'text-white' },
  ];

  return (
    <div className="bg-tennis-surface/30 border border-white/5 rounded-[2.5rem] shadow-xl p-6">
      <h2 className="text-lg font-bold text-white flex items-center mb-4">
        <Star className="w-5 h-5 mr-2 text-clay" />
        Match Stats
      </h2>
      <div className="grid grid-cols-3 gap-3">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-2xl bg-white/[0.03] border border-white/5 px-3 py-4 text-center">
            <p className={`text-2xl font-black ${t.accent}`}>{t.value}</p>
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/40 mt-1">{t.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
};
