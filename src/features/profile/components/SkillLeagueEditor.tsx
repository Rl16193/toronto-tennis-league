import React, { useState } from 'react';
import { Button } from '../../../components/Button';
import { SELECTABLE_SKILL_LEVELS, leagueAgeCategory, leagueDivision, skillBand } from '../../../utils/skillLevels';


// The skill and league editors, shared by the profile card and the Player Dash.

export const SkillEditor: React.FC<{
  initial: number;
  saving: boolean;
  onSave: (skill: number) => void;
}> = ({ initial, saving, onSave }) => {
  const [skillDraft, setSkillDraft] = useState(initial || 2);
  return (
    <div className="mt-3 space-y-3">
      {/* Same control as signup: one column per level filling the width, an INSET border
          for the selected state (a ring paints outside the box and gets clipped by the
          card edge), and the band name centred underneath. The range slider this replaced
          was hard to land on an exact half-step on a phone. */}
      <div className="grid grid-cols-7 gap-1.5">
        {SELECTABLE_SKILL_LEVELS.map((level) => {
          const active = skillDraft === level;
          return (
            <button
              key={level}
              type="button"
              onClick={() => setSkillDraft(level)}
              className={`py-2.5 rounded-2xl text-sm font-bold border-2 transition-colors ${
                active ? 'bg-clay/10 text-clay border-clay' : 'bg-fg/5 text-fg border-transparent hover:bg-fg/10'
              }`}
            >
              {level.toFixed(1)}
            </button>
          );
        })}
      </div>
      {/* skillBand is the same function the draw engine groups on, so this label and the
          group a player actually lands in can never disagree. */}
      <p className="text-sm font-bold text-clay text-center">{skillBand(skillDraft)}</p>
      <Button size="sm" onClick={() => onSave(skillDraft)} isLoading={saving}>Save</Button>
    </div>
  );
};

export const LeagueEditor: React.FC<{
  /** stats.league — the division plus an optional Retired Pro / Juniors suffix. */
  league: string;
  saving: boolean;
  onSave: (league: "Men's" | "Women's" | '', ageCategory: 'Retired Pro' | 'Juniors' | '') => void;
}> = ({ league, saving, onSave }) => {
  const [leagueDraft, setLeagueDraft] = useState<"Men's" | "Women's" | ''>(leagueDivision(league));
  const [ageCategoryDraft, setAgeCategoryDraft] = useState<'Retired Pro' | 'Juniors' | ''>(leagueAgeCategory(league));
  return (
    <div className="mt-2 space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <div className="flex flex-wrap gap-2">
          {(["Men's", "Women's"] as const).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLeagueDraft(l)}
              className={`px-4 py-2 rounded-full text-xs font-bold border transition-colors ${
                leagueDraft === l
                  ? 'bg-clay border-clay text-white shadow-lg shadow-clay/20'
                  : 'bg-fg/5 border-fg/5 text-fg hover:bg-fg/10'
              }`}
            >
              {l}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!leagueDraft}
            onClick={() => setAgeCategoryDraft(ageCategoryDraft === 'Retired Pro' ? '' : 'Retired Pro')}
            className={`px-4 py-2 rounded-full text-xs font-bold border transition-colors ${
              !leagueDraft
                ? 'bg-fg/5 border-fg/5 text-fg/70 opacity-50 cursor-not-allowed'
                : ageCategoryDraft === 'Retired Pro'
                  ? 'bg-clay border-clay text-white shadow-lg shadow-clay/20'
                  : 'bg-fg/5 border-fg/5 text-fg hover:bg-fg/10'
            }`}
          >
            Retired Pro <span className="ml-1 opacity-70 font-normal normal-case">(age: 55+)</span>
          </button>
          <button
            type="button"
            disabled={!leagueDraft}
            onClick={() => setAgeCategoryDraft(ageCategoryDraft === 'Juniors' ? '' : 'Juniors')}
            className={`px-4 py-2 rounded-full text-xs font-bold border transition-colors ${
              !leagueDraft
                ? 'bg-fg/5 border-fg/5 text-fg/70 opacity-50 cursor-not-allowed'
                : ageCategoryDraft === 'Juniors'
                  ? 'bg-clay border-clay text-white shadow-lg shadow-clay/20'
                  : 'bg-fg/5 border-fg/5 text-fg hover:bg-fg/10'
            }`}
          >
            Juniors
          </button>
        </div>
      </div>
      {!leagueDraft && (
        <p className="text-xs text-fg/70">Choose a league above to unlock Retired Pro / Juniors.</p>
      )}
      <Button size="sm" onClick={() => onSave(leagueDraft, ageCategoryDraft)} isLoading={saving}>Save</Button>
    </div>
  );
};
