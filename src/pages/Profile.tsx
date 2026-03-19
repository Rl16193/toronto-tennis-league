import React from 'react';
import { useAuth } from '../context/AuthContext';
import { Navigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { MapPin, Trophy, Activity, Star } from 'lucide-react';

export const Profile = () => {
  const { user } = useAuth();

  if (!user) {
    return <Navigate to="/signup" />;
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Header Profile Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-rg-green rounded-3xl shadow-sm border border-white/10 overflow-hidden mb-8"
      >
        <div className="h-32 bg-gradient-to-r from-clay to-clay-dark" />
        <div className="px-8 pb-8">
          <div className="relative flex justify-between items-end -mt-16 mb-6">
            <img
              src={user.avatar}
              alt={user.name}
              className="w-32 h-32 rounded-full border-4 border-rg-green shadow-md bg-rg-green object-cover"
              referrerPolicy="no-referrer"
            />
            <button className="px-6 py-2 bg-white/10 hover:bg-white/20 text-white font-medium rounded-full transition-colors text-sm">
              Edit Profile
            </button>
          </div>
          
          <div>
            <h1 className="text-3xl font-extrabold text-white">{user.name}</h1>
            <p className="text-slate-400 font-medium">@{user.displayName}</p>
            
            <div className="mt-4 flex flex-wrap gap-4">
              <div className="flex items-center text-sm text-slate-200 bg-rg-deep px-3 py-1.5 rounded-full border border-white/10">
                <Star className="w-4 h-4 mr-2 text-clay" />
                NTRP {user.skillLevel.toFixed(1)}
              </div>
              <div className="flex items-center text-sm text-slate-200 bg-rg-deep px-3 py-1.5 rounded-full border border-white/10">
                <MapPin className="w-4 h-4 mr-2 text-clay" />
                {user.preferredCourts[0]}
              </div>
            </div>

            {user.motto && (
              <div className="mt-6 p-4 bg-clay/10 rounded-2xl border border-clay/20">
                <p className="text-lg font-serif italic text-clay text-center">"{user.motto}"</p>
              </div>
            )}
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Stats Column */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="md:col-span-1 space-y-8"
        >
          <div className="bg-rg-green rounded-3xl shadow-sm border border-white/10 p-6">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center">
              <Activity className="w-5 h-5 mr-2 text-clay" />
              Season Stats
            </h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Wins</span>
                <span className="font-bold text-white text-xl">{user.stats.wins}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Losses</span>
                <span className="font-bold text-white text-xl">{user.stats.losses}</span>
              </div>
              <div className="pt-4 border-t border-white/10">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-slate-400">Win Rate</span>
                  <span className="font-bold text-clay">{user.stats.winRate}%</span>
                </div>
                <div className="w-full bg-rg-deep rounded-full h-2">
                  <div
                    className="bg-clay h-2 rounded-full"
                    style={{ width: `${user.stats.winRate}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="bg-rg-green rounded-3xl shadow-sm border border-white/10 p-6">
            <h3 className="text-lg font-bold text-white mb-4">Contact Info</h3>
            <div className="space-y-3 text-sm">
              <p className="text-slate-300"><span className="font-medium text-white">Email:</span> {user.email}</p>
              <p className="text-slate-300"><span className="font-medium text-white">Phone:</span> {user.phone}</p>
            </div>
          </div>
        </motion.div>

        {/* History Column */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="md:col-span-2 space-y-8"
        >
          <div className="bg-rg-green rounded-3xl shadow-sm border border-white/10 p-6">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center">
              <Trophy className="w-5 h-5 mr-2 text-clay" />
              Playing History
            </h3>
            <ul className="space-y-4">
              {user.playingHistory.map((history, i) => (
                <li key={i} className="flex items-center p-4 bg-rg-deep rounded-2xl border border-white/10">
                  <div className="w-10 h-10 bg-rg-green rounded-full flex items-center justify-center shadow-sm mr-4">
                    <Trophy className="w-5 h-5 text-slate-400" />
                  </div>
                  <span className="font-medium text-slate-200">{history}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="bg-rg-green rounded-3xl shadow-sm border border-white/10 p-6">
            <h3 className="text-lg font-bold text-white mb-4">Favourite Players</h3>
            <div className="flex flex-wrap gap-2">
              {user.favouritePlayers.map((player, i) => (
                <span key={i} className="px-4 py-2 bg-rg-deep text-slate-200 rounded-full text-sm font-medium border border-white/10">
                  {player}
                </span>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};
