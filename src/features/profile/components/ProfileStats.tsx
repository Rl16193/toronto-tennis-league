import React from 'react';
import { useAuth } from '../../../context/AuthContext';
import { Star } from 'lucide-react';

export const ProfileStats: React.FC = () => {
  const { profile } = useAuth();

  if (!profile) return null;

  return (
    <div className="bg-tennis-surface/30 border border-white/5 rounded-[2.5rem] shadow-xl p-6">
      <h2 className="text-lg font-bold text-white flex items-center mb-4">
        <Star className="w-5 h-5 mr-2 text-clay" />
        Match Stats
      </h2>
      <div className="space-y-2">
        <div className="flex justify-between items-center py-2 border-b border-white/5">
          <span className="text-white font-medium">Matches Played</span>
          <span className="text-xl font-black text-white">{profile.stats.matches_played}</span>
        </div>
        <div className="flex justify-between items-center py-2 border-b border-white/5">
          <span className="text-white font-medium">Matches Won</span>
          <span className="text-xl font-black text-green-500">{profile.stats.matches_won}</span>
        </div>
        <div className="flex justify-between items-center py-2">
          <span className="text-clay font-bold">Points Won %</span>
          <span className="text-xl font-black text-clay">{profile.stats.points_won_percentage}%</span>
        </div>
      </div>
    </div>
  );
};