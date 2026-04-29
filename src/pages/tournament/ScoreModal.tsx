import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '../../components/Button';
import { ScoreForm, TournamentMatch } from './types';

type Props = {
  match: TournamentMatch;
  scoreForm: ScoreForm;
  onChange: (form: ScoreForm) => void;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
};

export const ScoreModal: React.FC<Props> = ({ match, scoreForm, onChange, onClose, onSubmit }) => (
  <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
    <form onSubmit={onSubmit} className="w-full max-w-xl rounded-[2rem] bg-tennis-surface border border-white/10 p-6 shadow-2xl">
      <div className="relative text-center mb-4">
        <p className="text-xs uppercase tracking-widest text-clay font-black mb-2">Submit Score</p>
        <h2 className="text-2xl font-black text-white">{match.round}</h2>
        <button
          type="button"
          onClick={onClose}
          className="absolute right-0 top-0 text-gray-400 hover:text-white font-semibold text-sm"
        >
          Close
        </button>
      </div>

      <div className="flex items-center gap-2 mb-5 px-3 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs font-semibold">
        <AlertTriangle className="w-4 h-4 shrink-0" />
        You can only submit the score once.
      </div>

      <label className="block text-sm font-medium text-gray-300 mb-2">Winner</label>
      <select
        value={scoreForm.winnerUserId}
        onChange={(e) => onChange({ ...scoreForm, winnerUserId: e.target.value })}
        className="w-full rounded-2xl bg-tennis-dark/70 border border-white/10 px-4 py-3 text-white outline-none focus:border-clay mb-5"
      >
        <option value={match.player_1_user_id}>{match.player_1_name}</option>
        <option value={match.player_2_user_id}>{match.player_2_name}</option>
      </select>

      <div className="space-y-4">
        {scoreForm.sets.map((set, index) => (
          <div key={index} className="grid grid-cols-[90px_1fr_1fr] gap-3 items-end">
            <p className="text-gray-300 font-bold pb-3">Set {index + 1}</p>
            <label className="text-sm text-gray-400">
              My score
              <input
                type="number" min="0" step="1" inputMode="numeric" value={set.mine}
                onChange={(e) => {
                  const sets = [...scoreForm.sets];
                  sets[index] = { ...set, mine: e.target.value };
                  onChange({ ...scoreForm, sets });
                }}
                className="mt-1 w-full rounded-2xl bg-tennis-dark/70 border border-white/10 px-4 py-3 text-white outline-none focus:border-clay"
              />
            </label>
            <label className="text-sm text-gray-400">
              Opponent score
              <input
                type="number" min="0" step="1" inputMode="numeric" value={set.opponent}
                onChange={(e) => {
                  const sets = [...scoreForm.sets];
                  sets[index] = { ...set, opponent: e.target.value };
                  onChange({ ...scoreForm, sets });
                }}
                className="mt-1 w-full rounded-2xl bg-tennis-dark/70 border border-white/10 px-4 py-3 text-white outline-none focus:border-clay"
              />
            </label>
          </div>
        ))}
      </div>

      <Button type="submit" className="w-full mt-6">Submit Score</Button>
    </form>
  </div>
);
