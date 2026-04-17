import React from 'react';
import { useAuth } from '../../../context/AuthContext';
import { Star } from 'lucide-react';

export const ProfileStats: React.FC = () => {
  const { profile } = useAuth();

  if (!profile) return null;

  return (
    <div className="bg-tennis-surface/30 border border-white/5 rounded-[2.5rem] shadow-xl p-8">
      <h2 className="text-2xl font-bold text-white flex items-center mb-8">
        <Star className="w-6 h-6 mr-3 text-clay" />
        Match Stats
      </h2>
      <div className="grid grid-cols-1 gap-4">
        <div className="bg-white/5 p-6 rounded-3xl border border-white/5 flex justify-between items-center">
          <span className="text-gray-400 font-medium">Matches Played</span>
          <span className="text-2xl font-black text-white">{profile.stats.matches_played}</span>
        </div>
        <div className="bg-white/5 p-6 rounded-3xl border border-white/5 flex justify-between items-center">
          <span className="text-gray-400 font-medium">Matches Won</span>
          <span className="text-2xl font-black text-green-500">{profile.stats.matches_won}</span>
        </div>
        <div className="bg-clay/10 p-6 rounded-3xl border border-clay/20 flex justify-between items-center">
          <span className="text-clay font-bold">Points Won %</span>
          <span className="text-2xl font-black text-clay">{profile.stats.points_won_percentage}%</span>
        </div>
      </div>
    </div>
  );
};