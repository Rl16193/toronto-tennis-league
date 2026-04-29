import React from 'react';
import { DrawConfig, DrawTab, SkillGroup } from './types';

type Props = {
  activeTab: DrawTab;
  activeSkill: SkillGroup;
  activeDoubles: string;
  currentDraw: DrawConfig | undefined;
  onTabChange: (tab: DrawTab) => void;
  onSkillChange: (skill: SkillGroup) => void;
  onDoublesChange: (division: string) => void;
};

export const DrawTabs: React.FC<Props> = ({
  activeTab, activeSkill, activeDoubles, currentDraw,
  onTabChange, onSkillChange, onDoublesChange,
}) => (
  <>
    <div className="flex flex-wrap gap-3 mb-5">
      {([
        { key: 'mens' as DrawTab, label: "Men's" },
        { key: 'womens' as DrawTab, label: "Women's" },
        { key: 'doubles' as DrawTab, label: 'Doubles' },
      ] as const).map((tab) => (
        <button
          key={tab.key}
          onClick={() => onTabChange(tab.key)}
          className={`px-5 py-2.5 rounded-2xl font-bold transition-colors ${
            activeTab === tab.key ? 'bg-clay text-white' : 'bg-tennis-surface/60 text-gray-300 hover:text-white'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>

    {activeTab !== 'doubles' ? (
      <div className="flex flex-wrap gap-2 mb-6">
        {(['Challengers', 'Masters'] as SkillGroup[]).map((skill) => (
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
    ) : (
      <div className="flex flex-wrap gap-2 mb-6">
        {["Men's", "Women's", 'Mixed Doubles'].map((division) => (
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
    )}
  </>
);
