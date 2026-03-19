import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Activity, Heart, Zap, PlayCircle, Watch } from 'lucide-react';

export const Fitness = () => {
  const [focus, setFocus] = useState<'endurance' | 'explosiveness' | 'recovery'>('endurance');
  const [isGenerating, setIsGenerating] = useState(false);
  const [tip, setTip] = useState<{title: string, content: string} | null>(null);

  const handleGenerateTip = () => {
    setIsGenerating(true);
    setTip(null);
    
    setTimeout(() => {
      const tips = {
        endurance: {
          title: "Baseline Stamina",
          content: "Incorporate 400m intervals into your weekly routine. Sprint the straights, jog the curves. This mimics the stop-and-start nature of long rallies."
        },
        explosiveness: {
          title: "Core Stability",
          content: "Rotational planks build the oblique strength needed for powerful serves. Pair with medicine ball throws against a wall."
        },
        recovery: {
          title: "Active Release",
          content: "Spend 10 minutes foam rolling your IT bands and calves post-match. Hydrate with electrolytes, not just water, within 30 minutes."
        }
      };
      setTip(tips[focus]);
      setIsGenerating(false);
    }, 1500);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-10">
        <h1 className="text-4xl font-extrabold text-white tracking-tight">AI Training & Fitness</h1>
        <p className="mt-2 text-lg text-blue-200">Personalized tips to elevate your game.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: AI Tips */}
        <div className="lg:col-span-2 space-y-8">
          <div className="bg-blue-900 rounded-3xl shadow-sm border border-blue-800 p-8">
            <h2 className="text-2xl font-bold text-white mb-6">Select Training Focus</h2>
            
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
              <button
                onClick={() => setFocus('endurance')}
                className={`p-4 rounded-2xl border-2 text-left transition-all ${
                  focus === 'endurance' ? 'border-lime-500 bg-blue-800' : 'border-blue-800 hover:border-blue-700 bg-blue-900'
                }`}
              >
                <Heart className={`w-6 h-6 mb-3 ${focus === 'endurance' ? 'text-lime-400' : 'text-blue-400'}`} />
                <h3 className="font-bold text-white">Endurance</h3>
                <p className="text-xs text-blue-200 mt-1">Outlast your opponent</p>
              </button>
              
              <button
                onClick={() => setFocus('explosiveness')}
                className={`p-4 rounded-2xl border-2 text-left transition-all ${
                  focus === 'explosiveness' ? 'border-rose-500 bg-blue-800' : 'border-blue-800 hover:border-blue-700 bg-blue-900'
                }`}
              >
                <Zap className={`w-6 h-6 mb-3 ${focus === 'explosiveness' ? 'text-rose-400' : 'text-blue-400'}`} />
                <h3 className="font-bold text-white">Explosiveness</h3>
                <p className="text-xs text-blue-200 mt-1">Power and speed</p>
              </button>

              <button
                onClick={() => setFocus('recovery')}
                className={`p-4 rounded-2xl border-2 text-left transition-all ${
                  focus === 'recovery' ? 'border-cyan-500 bg-blue-800' : 'border-blue-800 hover:border-blue-700 bg-blue-900'
                }`}
              >
                <Activity className={`w-6 h-6 mb-3 ${focus === 'recovery' ? 'text-cyan-400' : 'text-blue-400'}`} />
                <h3 className="font-bold text-white">Recovery</h3>
                <p className="text-xs text-blue-200 mt-1">Heal and prevent injury</p>
              </button>
            </div>

            <button
              onClick={handleGenerateTip}
              disabled={isGenerating}
              className="w-full py-4 rounded-full font-bold text-blue-950 bg-cyan-400 hover:bg-cyan-500 transition-colors disabled:opacity-50"
            >
              Generate AI Tip
            </button>

            <div className="mt-8 min-h-[160px]">
              {isGenerating ? (
                <div className="space-y-4 animate-pulse">
                  <div className="h-6 bg-blue-800 rounded w-1/3"></div>
                  <div className="h-4 bg-blue-800 rounded w-full"></div>
                  <div className="h-4 bg-blue-800 rounded w-5/6"></div>
                  <div className="h-4 bg-blue-800 rounded w-4/6"></div>
                </div>
              ) : tip ? (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-blue-950 text-white p-6 rounded-2xl border border-blue-800"
                >
                  <h3 className="text-xl font-bold text-cyan-400 mb-3">{tip.title}</h3>
                  <p className="text-blue-200 leading-relaxed">{tip.content}</p>
                </motion.div>
              ) : (
                <div className="h-full flex items-center justify-center text-blue-400 italic">
                  Select a focus and generate a tip to see AI recommendations.
                </div>
              )}
            </div>
          </div>

          <div className="bg-blue-900 rounded-3xl shadow-sm border border-blue-800 p-8">
            <h2 className="text-2xl font-bold text-white mb-6">Recommended Drills</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[1, 2].map((i) => (
                <div key={i} className="group cursor-pointer">
                  <div className="relative h-40 rounded-2xl overflow-hidden mb-3 bg-blue-800">
                    <img
                      src={`https://picsum.photos/seed/drill${i}/400/300`}
                      alt="Drill"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 bg-blue-950/40 flex items-center justify-center group-hover:bg-blue-950/60 transition-colors">
                      <PlayCircle className="w-12 h-12 text-white opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all" />
                    </div>
                  </div>
                  <h4 className="font-bold text-white">Footwork Fundamentals</h4>
                  <p className="text-sm text-blue-300">10 mins • Agility</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Wearables */}
        <div className="space-y-8">
          <div className="bg-blue-900 rounded-3xl shadow-sm border border-blue-800 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white">Device Sync</h3>
              <Watch className="w-5 h-5 text-blue-400" />
            </div>
            <div className="space-y-3">
              <button className="w-full flex items-center justify-between p-3 rounded-xl border border-blue-800 hover:border-blue-700 hover:bg-blue-800 transition-colors">
                <span className="font-medium text-white">Apple Health</span>
                <span className="text-xs font-bold text-cyan-950 bg-cyan-400 px-2 py-1 rounded-full">Connected</span>
              </button>
              <button className="w-full flex items-center justify-between p-3 rounded-xl border border-blue-800 hover:border-blue-700 hover:bg-blue-800 transition-colors">
                <span className="font-medium text-white">Fitbit</span>
                <span className="text-xs font-medium text-blue-300">Connect</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
