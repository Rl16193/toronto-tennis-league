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
  // Round Robin 3rd-level tabs (Groups / Knockout). Omitted for non-RR draws.
  rrView?: 'groups' | 'knockout';
  onRRViewChange?: (v: 'groups' | 'knockout') => void;
};

const subBtnClass = (active: boolean) =>
  `px-4 py-2 rounded-xl text-sm font-bold transition-colors ${
    active ? 'bg-white text-tennis-dark' : 'bg-white/10 text-white hover:text-white'
  }`;

export const DrawTabs: React.FC<Props> = ({
  activeTab, activeSkill, activeDoubles, currentDraw, visibleDraws,
  onTabChange, onSkillChange, onDoublesChange, rrView, onRRViewChange,
}) => {
  const availablePrimaryTabs = (['mens', 'womens', 'doubles'] as DrawTab[]).filter(
    (tab) => visibleDraws.some((d) => d.tab === tab),
  );

  // Skill sub-tabs for singles (Challengers / Masters)
  const availableSkills = (['Challengers', 'Masters'] as SkillGroup[]).filter(
    (skill) => visibleDraws.some((d) => d.tab === activeTab && d.skillGroup === skill),
  );

  // Division sub-tabs for doubles
  const availableDoublesDivisions = ["Men's", "Women's", 'Mixed Doubles'].filter(
    (div) => visibleDraws.some((d) => d.tab === 'doubles' && d.division === div),
  );

  return (
    <>
      {/* Primary tab row: Men's / Women's / Doubles — always shown */}
      {availablePrimaryTabs.length > 0 && (
        <div className="flex flex-wrap gap-3 mb-5">
          {availablePrimaryTabs.map((tab) => {
            const label = tab === 'mens' ? "Men's" : tab === 'womens' ? "Women's" : 'Doubles';
            return (
              <button
                key={tab}
                onClick={() => onTabChange(tab)}
                className={`px-5 py-2.5 rounded-2xl font-bold transition-colors ${
                  activeTab === tab ? 'bg-clay text-white' : 'bg-tennis-surface/60 text-white hover:text-white'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}

      {/* Sub-tab row */}
      {activeTab !== 'doubles'
        ? availableSkills.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-6">
              {availableSkills.map((skill) => (
                <button
                  key={skill}
                  onClick={() => onSkillChange(skill)}
                  className={subBtnClass(currentDraw?.skillGroup === skill)}
                >
                  {skill}
                </button>
              ))}
            </div>
          )
        : availableDoublesDivisions.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-6">
              {availableDoublesDivisions.map((division) => {
                const shortLabel = division === 'Mixed Doubles' ? 'Mixed Doubles' : `${division} Doubles`;
                return (
                  <button
                    key={division}
                    onClick={() => onDoublesChange(division)}
                    className={subBtnClass(activeDoubles === division)}
                  >
                    {shortLabel}
                  </button>
                );
              })}
            </div>
          )}

      {/* 3rd-level RR tabs: Groups / Knockout */}
      {rrView && onRRViewChange && (
        <div className="flex flex-wrap gap-2 mb-6">
          {(['groups', 'knockout'] as const).map((v) => (
            <button key={v} onClick={() => onRRViewChange(v)} className={subBtnClass(rrView === v)}>
              {v === 'groups' ? 'Groups' : 'Knockout'}
            </button>
          ))}
        </div>
      )}
    </>
  );
};
