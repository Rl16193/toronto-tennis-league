import React, { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '../../components/Button';
import { Sheet } from '../../components/Sheet';
import { ScoreForm, TournamentMatch } from './types';

type Props = {
  match: TournamentMatch;
  scoreForm: ScoreForm;
  onChange: (form: ScoreForm) => void;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => Promise<void> | void;
  isCreatorSubmit?: boolean;
};

export const ScoreModal: React.FC<Props> = ({ match, scoreForm, onChange, onClose, onSubmit, isCreatorSubmit }) => {
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(e);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet onClose={onClose} maxWidthClassName="max-w-xl">
      <form onSubmit={handleSubmit} className="p-6">
        <div className="text-center mb-4 pr-10">
          <p className="text-xs uppercase tracking-widest text-clay font-black mb-2">Submit Score</p>
          <h2 className="text-2xl font-black text-white">{match.round}</h2>
        </div>

        <div className="flex items-center gap-2 mb-5 px-3 py-2.5 text-sm text-orange-500">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {isCreatorSubmit
            ? 'Entering score as event organizer. This will be accepted immediately.'
            : 'Pick the winner, enter the games, and submit — the organizer will confirm it.'}
        </div>

        <label className="block text-sm font-medium text-white mb-2">Winner</label>
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
            <div key={index}>
              <p className="text-white font-bold mb-2">Set {index + 1}</p>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm text-white">
                  <span className="block truncate mb-1">
                    {isCreatorSubmit ? match.player_1_name : 'My score'}
                  </span>
                  <input
                    type="number" min="0" step="1" inputMode="numeric" value={set.mine}
                    onChange={(e) => {
                      const sets = [...scoreForm.sets];
                      sets[index] = { ...set, mine: e.target.value };
                      onChange({ ...scoreForm, sets });
                    }}
                    className="w-full rounded-2xl bg-tennis-dark/70 border border-white/10 px-4 py-3 text-white outline-none focus:border-clay"
                  />
                </label>
                <label className="text-sm text-white">
                  <span className="block truncate mb-1">
                    {isCreatorSubmit ? match.player_2_name : 'Opponent score'}
                  </span>
                  <input
                    type="number" min="0" step="1" inputMode="numeric" value={set.opponent}
                    onChange={(e) => {
                      const sets = [...scoreForm.sets];
                      sets[index] = { ...set, opponent: e.target.value };
                      onChange({ ...scoreForm, sets });
                    }}
                    className="w-full rounded-2xl bg-tennis-dark/70 border border-white/10 px-4 py-3 text-white outline-none focus:border-clay"
                  />
                </label>
              </div>
            </div>
          ))}
        </div>

        <Button type="submit" className="w-full mt-6" isLoading={submitting} disabled={submitting}>
          {isCreatorSubmit ? 'Record Score' : 'Submit Score'}
        </Button>
      </form>
    </Sheet>
  );
};
