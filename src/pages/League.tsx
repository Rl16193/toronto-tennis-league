import React from 'react';
import { motion } from 'motion/react';
import { Trophy, Medal, Award } from 'lucide-react';

export const League = () => {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-10 text-center">
        <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight">League Standings</h1>
        <p className="mt-2 text-lg text-slate-500">Players ranked by tournament results.</p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden"
      >
        <div className="p-12 text-center flex flex-col items-center justify-center min-h-[400px]">
          <div className="w-24 h-24 bg-slate-50 rounded-full flex items-center justify-center mb-6 border-2 border-dashed border-slate-200">
            <Trophy className="w-10 h-10 text-slate-300" />
          </div>
          <h3 className="text-2xl font-bold text-slate-900 mb-2">No rankings available yet</h3>
          <p className="text-slate-500 max-w-md mx-auto mb-8">
            The season has just begun! Join an upcoming tournament to earn points and get on the leaderboard.
          </p>
          <button className="inline-flex items-center justify-center px-8 py-3 border border-transparent text-sm font-bold rounded-full text-slate-900 bg-lime-400 hover:bg-lime-500 transition-colors shadow-sm">
            Find a Tournament
          </button>
        </div>
      </motion.div>
    </div>
  );
};
