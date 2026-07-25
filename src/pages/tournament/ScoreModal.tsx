import React, { useState } from 'react';
import { AlertTriangle, Check } from 'lucide-react';
import { Button } from '../../components/Button';
import { Sheet } from '../../components/Sheet';
import { Stepper } from '../../components/Stepper';
import { ScoreForm, TournamentMatch } from './types';

type Props = {
  match: TournamentMatch;
  scoreForm: ScoreForm;
  onChange: (form: ScoreForm) => void;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => Promise<void> | void;
  isCreatorSubmit?: boolean;
};

// Mobile-first score entry (wireframe 1d): winner picked with two large tap-cards instead of a
// native dropdown, games entered with +/− steppers instead of the number keyboard. Set values
// stay strings in ScoreForm ('' means untouched → 0 downstream), so submit semantics — including
// the all-0-0 walkover convention — are unchanged.
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

  const setSetValue = (index: number, side: 'mine' | 'opponent', v: number) => {
    const sets = [...scoreForm.sets];
    sets[index] = { ...sets[index], [side]: String(v) };
    onChange({ ...scoreForm, sets });
  };

  const winnerOptions = [
    { uid: match.player_1_user_id, name: match.player_1_name },
    { uid: match.player_2_user_id, name: match.player_2_name },
  ];

  const mineLabel = isCreatorSubmit ? match.player_1_name : 'My score';
  const oppLabel = isCreatorSubmit ? match.player_2_name : 'Opponent';

  return (
    <Sheet onClose={onClose} maxWidthClassName="max-w-xl">
      <form onSubmit={handleSubmit} className="p-6">
        <div className="text-center mb-4 pr-10">
          <p className="text-xs uppercase tracking-widest text-clay font-black mb-2">Submit Score</p>
          <h2 className="text-2xl font-black text-fg">{match.round}</h2>
        </div>

        <div className="flex items-center gap-2 mb-5 px-3 py-2.5 text-sm text-orange-500">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {isCreatorSubmit
            ? 'Entering score as event organizer. This will be accepted immediately.'
            : 'Pick the winner, enter the games, and submit — the organizer will confirm it.'}
        </div>

        {/* Winner — two large tap-cards */}
        <p className="text-xs font-bold uppercase tracking-widest text-fg/50 mb-2">Winner</p>
        <div className="flex gap-2.5 mb-6" role="radiogroup" aria-label="Winner">
          {winnerOptions.map((p) => {
            const selected = scoreForm.winnerUserId === p.uid;
            return (
              <button
                key={p.uid}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onChange({ ...scoreForm, winnerUserId: p.uid || '' })}
                className={`flex-1 rounded-2xl border-2 px-3 py-4 text-center transition-colors ${
                  selected ? 'border-clay bg-clay/10' : 'border-fg/10 bg-fg/5 hover:border-fg/25'
                }`}
              >
                <span
                  className={`mx-auto mb-2 w-5 h-5 rounded-full flex items-center justify-center ${
                    selected ? 'bg-clay' : 'border-2 border-fg/20'
                  }`}
                >
                  {selected && <Check className="w-3.5 h-3.5 text-fg" />}
                </span>
                <span className="block text-sm font-bold text-fg truncate">{p.name}</span>
              </button>
            );
          })}
        </div>

        {/* Sets — +/− steppers, no number keyboard */}
        <div className="space-y-4">
          {scoreForm.sets.map((set, index) => (
            <div key={index}>
              <p className="text-fg font-bold text-sm mb-2">Set {index + 1}</p>
              <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-2.5">
                <div>
                  <span className="block truncate text-xs text-fg/50 font-semibold mb-1">{mineLabel}</span>
                  <Stepper
                    value={Number(set.mine || 0)}
                    onChange={(v) => setSetValue(index, 'mine', v)}
                    max={30}
                    label={`${mineLabel} set ${index + 1} games`}
                  />
                </div>
                <div>
                  <span className="block truncate text-xs text-fg/50 font-semibold mb-1">{oppLabel}</span>
                  <Stepper
                    value={Number(set.opponent || 0)}
                    onChange={(v) => setSetValue(index, 'opponent', v)}
                    max={30}
                    label={`${oppLabel} set ${index + 1} games`}
                  />
                </div>
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
