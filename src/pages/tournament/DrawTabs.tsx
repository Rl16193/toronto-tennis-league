import React from 'react';
import { DrawConfig, DrawTab, SkillGroup } from './types';

type Props = {
  activeTab: DrawTab;
  activeSkill: SkillGroup;
  activeDoubles: string;
  currentDraw: DrawConfig | undefined;
  visibleDraws: DrawConfig[];
  onTabChange: (tab: DrawTab) => void;
  onSkillChange: (skill: SkillGroup) => void;
  onDoublesChange: (division: string) => void;
};

export const DrawTabs: React.FC<Props> = ({
  activeTab, activeSkill, activeDoubles, currentDraw, visibleDraws,
  onTabChange, onSkillChange, onDoublesChange,
}) => {
  const availablePrimaryTabs = (['mens', 'womens', 'doubles'] as DrawTab[]).filter(
    (tab) => visibleDraws.some((d) => d.tab === tab),
  );
  const availableSkills = (['Challengers', 'Masters'] as SkillGroup[]).filter(
    (skill) => visibleDraws.some((d) => d.tab === activeTab && d.skillGroup === skill),
  );
  const availableDoublesDivisions = ["Men's", "Women's", 'Mixed Doubles'].filter(
    (div) => visibleDraws.some((d) => d.tab === 'doubles' && d.division === div),
  );

  return (
    <>
      {availablePrimaryTabs.length > 1 && (
        <div className="flex flex-wrap gap-3 mb-5">
          {availablePrimaryTabs.map((tab) => {
            const label = tab === 'mens' ? "Men's" : tab === 'womens' ? "Women's" : 'Doubles';
            return (
              <button
                key={tab}
                onClick={() => onTabChange(tab)}
                className={`px-5 py-2.5 rounded-2xl font-bold transition-colors ${
                  activeTab === tab ? 'bg-clay text-white' : 'bg-tennis-surface/60 text-gray-300 hover:text-white'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}

      {activeTab !== 'doubles' ? (
        availableSkills.length > 1 && (
          <div className="flex flex-wrap gap-2 mb-6">
            {availableSkills.map((skill) => (
              <button
                key={skill}
                onClick={() => onSkillChange(skill)}
                className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${
                  currentDraw?.skillGroup === skill ? 'bg-white text-tennis-dark' : 'bg-white/10 text-gray-300 hover:text-white'
                }`}
              >
                {skill}
              </button>
            ))}
          </div>
        )
      ) : (
        availableDoublesDivisions.length > 1 && (
          <div className="flex flex-wrap gap-2 mb-6">
            {availableDoublesDivisions.map((division) => (
              <button
                key={division}
                onClick={() => onDoublesChange(division)}
                className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${
                  activeDoubles === division ? 'bg-white text-tennis-dark' : 'bg-white/10 text-gray-300 hover:text-white'
                }`}
              >
                {division === 'Mixed Doubles' ? division : `${division} Doubles`}
              </button>
            ))}
          </div>
        )
      )}
    </>
  );
};
