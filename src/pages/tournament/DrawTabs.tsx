import React from 'react';
import { DrawConfig, DrawTab, SkillGroup } from './types';

type Props = {
  activeTab: DrawTab;
  activeSkill: SkillGroup;
  activeDoubles: string;
  currentDraw: DrawConfig | undefined;
  visibleDraws: DrawConfig[];
  reserveDrawLabels: Set<string>;
  showReserves: boolean;
  onTabChange: (tab: DrawTab) => void;
  onSkillChange: (skill: SkillGroup) => void;
  onDoublesChange: (division: string) => void;
  onReservesChange: (show: boolean) => void;
};

export const DrawTabs: React.FC<Props> = ({
  activeTab, activeSkill, activeDoubles, currentDraw, visibleDraws,
  reserveDrawLabels, showReserves,
  onTabChange, onSkillChange, onDoublesChange, onReservesChange,
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

  const skillDrawHasReserves = (skill: SkillGroup) =>
    visibleDraws.some((d) => d.tab === activeTab && d.skillGroup === skill && reserveDrawLabels.has(d.label));

  const doublesDivisionHasReserves = (div: string) =>
    visibleDraws.some((d) => d.tab === 'doubles' && d.division === div && reserveDrawLabels.has(d.label));

  return (
    <>
      {availablePrimaryTabs.length > 1 && (
        <div className="flex flex-wrap gap-3 mb-5">
          {availablePrimaryTabs.map((tab) => {
            const label = tab === 'mens' ? "Men's" : tab === 'womens' ? "Women's" : 'Doubles';
            return (
              <button
                key={tab}
                onClick={() => { onTabChange(tab); onReservesChange(false); }}
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
        availableSkills.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-6">
            {availableSkills.map((skill) => {
              const isActive = currentDraw?.skillGroup === skill && !showReserves;
              const isReserveActive = currentDraw?.skillGroup === skill && showReserves;
              const hasReserve = skillDrawHasReserves(skill);
              return (
                <React.Fragment key={skill}>
                  <button
                    onClick={() => { onSkillChange(skill); onReservesChange(false); }}
                    className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${
                      isActive ? 'bg-white text-tennis-dark' : 'bg-white/10 text-gray-300 hover:text-white'
                    }`}
                  >
                    {skill}
                  </button>
                  {hasReserve && (
                    <button
                      onClick={() => { onSkillChange(skill); onReservesChange(true); }}
                      className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${
                        isReserveActive ? 'bg-white text-tennis-dark' : 'bg-white/10 text-gray-300 hover:text-white'
                      }`}
                    >
                      {skill} Reserve
                    </button>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        )
      ) : (
        availableDoublesDivisions.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-6">
            {availableDoublesDivisions.map((division) => {
              const shortLabel = division === 'Mixed Doubles' ? 'Mixed Doubles' : `${division} Doubles`;
              const isActive = activeDoubles === division && !showReserves;
              const isReserveActive = activeDoubles === division && showReserves;
              const hasReserve = doublesDivisionHasReserves(division);
              return (
                <React.Fragment key={division}>
                  <button
                    onClick={() => { onDoublesChange(division); onReservesChange(false); }}
                    className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${
                      isActive ? 'bg-white text-tennis-dark' : 'bg-white/10 text-gray-300 hover:text-white'
                    }`}
                  >
                    {shortLabel}
                  </button>
                  {hasReserve && (
                    <button
                      onClick={() => { onDoublesChange(division); onReservesChange(true); }}
                      className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${
                        isReserveActive ? 'bg-white text-tennis-dark' : 'bg-white/10 text-gray-300 hover:text-white'
                      }`}
                    >
                      {shortLabel} Reserve
                    </button>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        )
      )}
    </>
  );
};
