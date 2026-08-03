import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check } from 'lucide-react';
import { Button } from '../../components/Button';
import { Sheet } from '../../components/Sheet';
import { Stepper } from '../../components/Stepper';
import { loadCourtList } from '../../features/tasks/courtList';
import { ScoreForm } from './types';

// A player, and a title, is all ScoreModal needs to know about the thing being scored — it
// doesn't care whether that's a tournament_matches doc or a ladder_challenges doc, so both
// Tournament.tsx (bracket matches) and Matches.tsx (accepted challenges) can reuse it as-is.
export type ScoreMatchInfo = {
  title: string;
  player1: { uid: string; name: string };
  player2: { uid: string; name: string };
};

type Props = {
  matchInfo: ScoreMatchInfo;
  scoreForm: ScoreForm;
  onChange: (form: ScoreForm) => void;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => Promise<void> | void;
  isCreatorSubmit?: boolean;
  // Optional single checkbox rendered above the submit button — e.g. Tournament's "Also count as
  // a Challenge" option. Generic so any caller can attach one extra choice without a new modal.
  extraCheckbox?: { label: string; checked: boolean; onChange: (checked: boolean) => void };
};

// Mobile-first score entry (wireframe 1d): winner picked with two large tap-cards instead of a
// native dropdown, games entered with +/− steppers instead of the number keyboard. Set values
// stay strings in ScoreForm ('' means untouched → 0 downstream), so submit semantics — including
// the all-0-0 walkover convention — are unchanged.
export const ScoreModal: React.FC<Props> = ({ matchInfo, scoreForm, onChange, onClose, onSubmit, isCreatorSubmit, extraCheckbox }) => {
  const [submitting, setSubmitting] = useState(false);
  const [courts, setCourts] = useState<string[]>([]);
  const [courtSearch, setCourtSearch] = useState('');
  const [showCourtDropdown, setShowCourtDropdown] = useState(false);

  useEffect(() => {
    loadCourtList().then((list) => setCourts([...new Set(list.map((c) => c.dropdown))].sort((a, b) => a.localeCompare(b))));
  }, []);

  const courtMatches = useMemo(() => {
    const q = courtSearch.trim().toLowerCase();
    if (!q) return courts.slice(0, 8);
    return courts.filter((c) => c.toLowerCase().includes(q)).slice(0, 8);
  }, [courts, courtSearch]);

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

  const winnerOptions = [matchInfo.player1, matchInfo.player2];

  const mineLabel = isCreatorSubmit ? matchInfo.player1.name : 'My score';
  const oppLabel = isCreatorSubmit ? matchInfo.player2.name : 'Opponent';

  return (
    <Sheet onClose={onClose} maxWidthClassName="max-w-xl">
      <form onSubmit={handleSubmit} className="p-6">
        <div className="text-center mb-4 pr-10">
          <p className="text-xs uppercase tracking-widest text-clay font-black mb-2">Submit Score</p>
          <h2 className="text-2xl font-black text-fg">{matchInfo.title}</h2>
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

        {/* Select Court — same search dropdown as the rest of the site (PhotoSubmitModal, Signup). */}
        <div className="space-y-1.5 relative mb-6">
          <p className="text-xs font-bold uppercase tracking-widest text-fg/50">Court</p>
          <input
            type="text"
            placeholder="Search courts…"
            value={scoreForm.court || courtSearch}
            onChange={(e) => { onChange({ ...scoreForm, court: '' }); setCourtSearch(e.target.value); setShowCourtDropdown(true); }}
            onFocus={() => setShowCourtDropdown(true)}
            onBlur={() => setTimeout(() => setShowCourtDropdown(false), 150)}
            className="w-full rounded-2xl bg-tennis-surface/50 border border-fg/10 px-4 py-2.5 text-sm text-fg placeholder-gray-500 outline-none focus:border-clay focus:ring-2 focus:ring-clay/20"
          />
          {showCourtDropdown && courtMatches.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1 z-10 max-h-48 overflow-y-auto rounded-2xl border border-fg/10 bg-tennis-dark/95 p-1 shadow-2xl">
              {courtMatches.map((c) => (
                <button
                  key={c}
                  type="button"
                  onMouseDown={() => { onChange({ ...scoreForm, court: c }); setCourtSearch(''); setShowCourtDropdown(false); }}
                  className="w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-fg hover:bg-clay/20 transition-colors"
                >
                  {c}
                </button>
              ))}
            </div>
          )}
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

        {extraCheckbox && (
          <label className="flex items-center gap-2.5 mt-5 px-1 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={extraCheckbox.checked}
              onChange={(e) => extraCheckbox.onChange(e.target.checked)}
              className="accent-clay w-4 h-4"
            />
            <span className="text-sm font-semibold text-fg">{extraCheckbox.label}</span>
          </label>
        )}

        <Button type="submit" className="w-full mt-6" isLoading={submitting} disabled={submitting}>
          {isCreatorSubmit ? 'Record Score' : 'Submit Score'}
        </Button>
      </form>
    </Sheet>
  );
};
