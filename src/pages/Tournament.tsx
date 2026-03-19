import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Trophy, Upload, Info } from 'lucide-react';
import { mockChallengersBracket, mockMastersBracket } from '../data/mockData';

export const Tournament = () => {
  const [activeTab, setActiveTab] = useState<'challengers' | 'masters'>('challengers');
  const bracket = activeTab === 'challengers' ? mockChallengersBracket : mockMastersBracket;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="flex flex-col md:flex-row md:items-end justify-between mb-10 gap-6">
        <div>
          <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight">Spring Classic</h1>
          <p className="mt-2 text-lg text-slate-500">Trinity Bellwoods • April 5 – April 30</p>
        </div>
        <div className="flex gap-4">
          <button className="inline-flex items-center justify-center px-6 py-3 border border-transparent text-sm font-bold rounded-full text-slate-900 bg-lime-400 hover:bg-lime-500 transition-colors shadow-sm">
            Join Tournament
          </button>
          <button className="inline-flex items-center justify-center px-6 py-3 border-2 border-slate-200 text-sm font-bold rounded-full text-slate-700 bg-white hover:bg-slate-50 transition-colors">
            <Upload className="w-4 h-4 mr-2" />
            Submit Score
          </button>
        </div>
      </div>

      {/* Points Info */}
      <div className="bg-rose-50 rounded-2xl p-6 mb-10 border border-rose-100 flex items-start gap-4">
        <Info className="w-6 h-6 text-rose-500 flex-shrink-0 mt-1" />
        <div>
          <h3 className="text-lg font-bold text-rose-900 mb-2">Ranking Points</h3>
          <div className="flex flex-wrap gap-4 text-sm text-rose-700">
            <span className="bg-white px-3 py-1 rounded-full shadow-sm">Winner: 20 pts</span>
            <span className="bg-white px-3 py-1 rounded-full shadow-sm">Finalist: 10 pts</span>
            <span className="bg-white px-3 py-1 rounded-full shadow-sm">Semifinalist: 5 pts</span>
            <span className="bg-white px-3 py-1 rounded-full shadow-sm">Quarterfinalist: 2 pts</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex space-x-4 mb-8 border-b border-slate-200">
        <button
          onClick={() => setActiveTab('challengers')}
          className={`pb-4 px-2 text-lg font-bold transition-colors relative ${
            activeTab === 'challengers' ? 'text-slate-900' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          Challengers (&lt; 3.5)
          {activeTab === 'challengers' && (
            <motion.div
              layoutId="activeTab"
              className="absolute bottom-0 left-0 right-0 h-1 bg-lime-400 rounded-t-full"
            />
          )}
        </button>
        <button
          onClick={() => setActiveTab('masters')}
          className={`pb-4 px-2 text-lg font-bold transition-colors relative ${
            activeTab === 'masters' ? 'text-slate-900' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          Masters (&ge; 3.5)
          {activeTab === 'masters' && (
            <motion.div
              layoutId="activeTab"
              className="absolute bottom-0 left-0 right-0 h-1 bg-lime-400 rounded-t-full"
            />
          )}
        </button>
      </div>

      {/* Bracket Visualization */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-8 overflow-x-auto">
        <div className="flex min-w-max gap-12">
          {bracket.map((round, roundIndex) => (
            <div key={round.id} className="flex flex-col justify-around w-64 space-y-8">
              <h3 className="text-center font-bold text-slate-400 uppercase tracking-wider text-sm mb-4">
                {round.round}
              </h3>
              {round.matches.map((match, matchIndex) => (
                <motion.div
                  key={match.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: roundIndex * 0.2 + matchIndex * 0.1 }}
                  className="relative"
                >
                  <div className="bg-slate-50 border border-slate-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                    <div className={`p-3 border-b border-slate-200 flex justify-between items-center ${match.winner === match.player1 ? 'bg-lime-50 font-bold' : ''}`}>
                      <span className="text-sm truncate pr-2 group relative cursor-help">
                        {match.player1}
                        <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block w-48 bg-slate-900 text-white text-xs rounded-lg p-2 z-10">
                          Contact info available for registered players.
                        </div>
                      </span>
                      {match.winner === match.player1 && <Trophy className="w-4 h-4 text-lime-600" />}
                    </div>
                    <div className={`p-3 flex justify-between items-center ${match.winner === match.player2 ? 'bg-lime-50 font-bold' : ''}`}>
                      <span className="text-sm truncate pr-2 group relative cursor-help">
                        {match.player2}
                        <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block w-48 bg-slate-900 text-white text-xs rounded-lg p-2 z-10">
                          Contact info available for registered players.
                        </div>
                      </span>
                      {match.winner === match.player2 && <Trophy className="w-4 h-4 text-lime-600" />}
                    </div>
                    <div className="bg-slate-100 p-2 text-center text-xs font-mono text-slate-600 border-t border-slate-200">
                      {match.score}
                    </div>
                  </div>
                  
                  {/* Connector Lines (simplified for demo) */}
                  {roundIndex < bracket.length - 1 && (
                    <div className="absolute top-1/2 -right-6 w-6 h-px bg-slate-300" />
                  )}
                  {roundIndex > 0 && (
                    <div className="absolute top-1/2 -left-6 w-6 h-px bg-slate-300" />
                  )}
                </motion.div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
