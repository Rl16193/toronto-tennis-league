import React, { useState } from 'react';
import { Sheet } from '../../../components/Sheet';
import { Button } from '../../../components/Button';
import { Input } from '../../../components/Input';
import { useAuth } from '../../../context/AuthContext';
import { useProfileActions } from '../hooks/useProfileActions';
import { SELECTABLE_SKILL_LEVELS, SKILL_LEVEL_TIERS, leagueAgeCategory, leagueDivision } from '../../../utils/skillLevels';
import { defaultCourtOptions, getCourtSuggestions } from '../../../features/signup/utils/courtSearch';

// Blocks Challenges/Friendlies until the 3 fields real matching needs are set: preferred courts,
// skill level, league. Reuses the same profileService update functions (and refreshProfile) as
// the Profile page, so this writes to the player's real profile, not a separate store.
export const CompleteProfileModal: React.FC<{ onClose: () => void; onDone: () => void }> = ({ onClose, onDone }) => {
  const { profile } = useAuth();
  const { updateLoading, actions } = useProfileActions();

  const [skillLevel, setSkillLevel] = useState(profile?.stats.skill_level || 2);
  const [league, setLeague] = useState<"Men's" | "Women's" | ''>(leagueDivision(profile?.stats.league));
  const [ageCategory, setAgeCategory] = useState<'Retired Pro' | 'Juniors' | ''>(leagueAgeCategory(profile?.stats.league));
  const [courts, setCourts] = useState<string[]>(profile?.preferences.preferred_courts || []);
  const [courtQuery, setCourtQuery] = useState('');
  const [error, setError] = useState('');

  const suggestions = getCourtSuggestions(defaultCourtOptions, courts, courtQuery);
  const addCourt = (court: string) => { setCourts((prev) => [...new Set([...prev, court])]); setCourtQuery(''); };
  const removeCourt = (court: string) => setCourts((prev) => prev.filter((c) => c !== court));

  const handleSave = async () => {
    if (!league) { setError('Please choose your league.'); return; }
    if (courts.length === 0) { setError('Please add at least one preferred court.'); return; }
    setError('');
    const ok1 = await actions.updateSkills(skillLevel, profile?.stats.tournament_preference || 'Challengers');
    const ok2 = await actions.updateLeagueAgeCategory(league, ageCategory, true);
    const ok3 = await actions.updatePreferredCourts(courts, profile?.preferences.preferred_zone || '');
    if (ok1 && ok2 && ok3) onDone();
  };

  return (
    <Sheet onClose={onClose} title="Complete Your Profile" maxWidthClassName="max-w-md">
      <div className="p-6 pt-2 space-y-6">
        <p className="text-sm text-fg/70">
          Finish these 3 things so we can match you with the right players.
        </p>

        {error && <p className="text-xs font-semibold text-badge-loss">{error}</p>}

        <div className="space-y-3">
          <div className="flex justify-between items-end">
            <p className="text-xs font-bold text-fg/70 uppercase tracking-widest">Skill Level</p>
            <span className="text-2xl font-black text-clay">{skillLevel}</span>
          </div>
          <input
            type="range"
            min={0} max={SELECTABLE_SKILL_LEVELS.length - 1} step={1}
            value={SELECTABLE_SKILL_LEVELS.indexOf(skillLevel as typeof SELECTABLE_SKILL_LEVELS[number])}
            onChange={(e) => setSkillLevel(SELECTABLE_SKILL_LEVELS[Number(e.target.value)])}
            className="w-full h-3 rounded-full"
          />
          <div className="flex justify-between text-[10px] text-fg/70">
            {SKILL_LEVEL_TIERS.map((t) => <span key={t.label}>{t.range} · {t.label}</span>)}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-bold text-fg/70 uppercase tracking-widest">League</p>
          <div className="flex gap-2">
            {(["Men's", "Women's"] as const).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLeague(l)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-bold border transition-colors ${
                  league === l ? 'bg-clay border-clay text-white' : 'bg-white text-ink border-fg/10 hover:bg-white/90'
                }`}
              >
                {l}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!league}
              onClick={() => setAgeCategory(ageCategory === 'Retired Pro' ? '' : 'Retired Pro')}
              className={`px-4 py-2 rounded-full text-xs font-bold border transition-all ${
                !league
                  ? 'bg-fg/5 border-fg/5 text-fg/70 opacity-50 cursor-not-allowed'
                  : ageCategory === 'Retired Pro'
                    ? 'bg-clay border-clay text-white shadow-lg shadow-clay/20'
                    : 'bg-fg/5 border-fg/5 text-fg hover:bg-fg/10'
              }`}
            >
              Retired Pro <span className="ml-1 opacity-70 font-normal normal-case">(age: 55+)</span>
            </button>
            <button
              type="button"
              disabled={!league}
              onClick={() => setAgeCategory(ageCategory === 'Juniors' ? '' : 'Juniors')}
              className={`px-4 py-2 rounded-full text-xs font-bold border transition-all ${
                !league
                  ? 'bg-fg/5 border-fg/5 text-fg/70 opacity-50 cursor-not-allowed'
                  : ageCategory === 'Juniors'
                    ? 'bg-clay border-clay text-white shadow-lg shadow-clay/20'
                    : 'bg-fg/5 border-fg/5 text-fg hover:bg-fg/10'
              }`}
            >
              Juniors
            </button>
          </div>
          {!league && (
            <p className="text-[11px] text-fg/70">Choose a league above to unlock Retired Pro / Juniors.</p>
          )}
        </div>

        <div className="space-y-2">
          <p className="text-xs font-bold text-fg/70 uppercase tracking-widest">Preferred Courts</p>
          {courts.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {courts.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => removeCourt(c)}
                  className="px-3 py-1 rounded-xl text-xs font-bold bg-clay text-white flex items-center gap-1.5"
                >
                  {c} <span className="opacity-70">✕</span>
                </button>
              ))}
            </div>
          )}
          <Input
            placeholder="Search courts by name…"
            value={courtQuery}
            onChange={(e) => setCourtQuery(e.target.value)}
          />
          {suggestions.length > 0 && (
            <div className="max-h-40 overflow-y-auto rounded-2xl bg-tennis-dark/95 p-2 shadow-2xl">
              {suggestions.map((court) => (
                <button
                  key={court}
                  type="button"
                  onClick={() => addCourt(court)}
                  className="w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-fg hover:bg-clay/20 transition-colors"
                >
                  {court}
                </button>
              ))}
            </div>
          )}
        </div>

        <Button onClick={handleSave} isLoading={updateLoading} className="w-full">Save & Continue</Button>
      </div>
    </Sheet>
  );
};
