import React from 'react';
import { motion } from 'motion/react';
import { Scale, Clock, AlertTriangle, CheckCircle2 } from 'lucide-react';

export const Rules = () => {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-10">
        <h1 className="text-4xl font-extrabold text-white tracking-tight">League Rules</h1>
        <p className="mt-2 text-lg text-slate-200">Please read the rules carefully before participating.</p>
      </div>

      <div className="space-y-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-rg-green rounded-3xl shadow-sm border border-white/10 p-8"
        >
          <div className="flex items-center mb-4">
            <div className="w-10 h-10 bg-clay/20 rounded-full flex items-center justify-center mr-4">
              <TrophyIcon className="w-5 h-5 text-clay" />
            </div>
            <h2 className="text-2xl font-bold text-white">Match Format</h2>
          </div>
          <ul className="space-y-3 text-slate-200 ml-14 list-disc">
            <li>Matches will be best-of-3 tie-breaks.</li>
            <li>If the set score is 1-1, the final tie-break will be a race to 10 points.</li>
            <li>Whoever wins the 10th point will win the match.</li>
          </ul>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-rg-green rounded-3xl shadow-sm border border-white/10 p-8"
        >
          <div className="flex items-center mb-4">
            <div className="w-10 h-10 bg-clay/20 rounded-full flex items-center justify-center mr-4">
              <Clock className="w-5 h-5 text-clay" />
            </div>
            <h2 className="text-2xl font-bold text-white">Timing & Warm-up</h2>
          </div>
          <ul className="space-y-3 text-slate-200 ml-14 list-disc">
            <li>Court timings are strictly 40 minutes.</li>
            <li>A 10-minute warm-up is allowed before the match begins.</li>
          </ul>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-rg-green rounded-3xl shadow-sm border border-white/10 p-8"
        >
          <div className="flex items-center mb-4">
            <div className="w-10 h-10 bg-clay/20 rounded-full flex items-center justify-center mr-4">
              <Scale className="w-5 h-5 text-clay" />
            </div>
            <h2 className="text-2xl font-bold text-white">Challenges & Disputes</h2>
          </div>
          <ul className="space-y-3 text-slate-200 ml-14 list-disc">
            <li>Each player can replay/challenge one point in a set.</li>
            <li>A challenge <strong>cannot</strong> be used on a deciding point (where the opponent would win the set or get set point/match point).</li>
          </ul>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="bg-rg-green rounded-3xl shadow-sm border border-white/10 p-8"
        >
          <div className="flex items-center mb-4">
            <div className="w-10 h-10 bg-clay/20 rounded-full flex items-center justify-center mr-4">
              <TrophyIcon className="w-5 h-5 text-clay" />
            </div>
            <h2 className="text-2xl font-bold text-white">Save Tournament Points</h2>
          </div>
          <ul className="space-y-3 text-slate-200 ml-14 list-disc">
            <li>Players who win their matches advance to the league stage automatically.</li>
            <li>Players who do not advance can still convert their tournament progress into league points by paying the entry fee.</li>
          </ul>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-rg-green rounded-3xl shadow-sm border border-white/10 p-8"
        >
          <div className="flex items-center mb-4">
            <div className="w-10 h-10 bg-clay/20 rounded-full flex items-center justify-center mr-4">
              <AlertTriangle className="w-5 h-5 text-clay" />
            </div>
            <h2 className="text-2xl font-bold text-white">Court Rules & Liability</h2>
          </div>
          <ul className="space-y-3 text-slate-200 ml-14 list-disc">
            <li>Players must follow all public court rules.</li>
            <li>We are not responsible for any injuries or the condition of the court. Play at your own risk.</li>
          </ul>
        </motion.div>
      </div>
    </div>
  );
};

function TrophyIcon(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </svg>
  );
}
