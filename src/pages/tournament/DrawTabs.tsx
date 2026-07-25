import React from 'react';
import { ChipRow } from '../../components/ChipRow';
import { SegmentedControl } from '../../components/SegmentedControl';
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
  // Round Robin sub-view (Groups / Knockout). Omitted for non-RR draws.
  rrView?: 'groups' | 'knockout';
  onRRViewChange?: (v: 'groups' | 'knockout') => void;
};

// Draw selector, mobile remodel (wireframe 1a): the old three stacked rows of pills
// (division → skill → RR view) collapse into ONE horizontally scrollable chip row — one chip
// per visible draw ("Men's Challengers", "Women's Seniors", "Mixed Doubles", …) — plus a
// Groups/Knockout segmented toggle for Round Robin draws.
export const DrawTabs: React.FC<Props> = ({
  currentDraw, visibleDraws,
  onTabChange, onSkillChange, onDoublesChange, rrView, onRRViewChange,
}) => {
  const drawKey = (d: DrawConfig) => `${d.tab}|${d.division}|${d.skillGroup}`;
  const currentKey = currentDraw ? drawKey(currentDraw) : null;

  const chipLabel = (d: DrawConfig) =>
    d.tab === 'doubles' && d.division !== 'Mixed Doubles' && d.division !== 'All'
      ? `${d.division} Doubles`
      : d.label;

  const select = (key: string) => {
    const d = visibleDraws.find((x) => drawKey(x) === key);
    if (!d) return;
    onTabChange(d.tab);
    if (d.tab === 'doubles') onDoublesChange(d.division);
    else onSkillChange(d.skillGroup);
  };

  return (
    <>
      {visibleDraws.length > 0 && (
        <ChipRow
          options={visibleDraws.map((d) => ({ value: drawKey(d), label: chipLabel(d) }))}
          value={currentKey}
          onChange={select}
          className="mb-4"
        />
      )}

      {rrView && onRRViewChange && (
        <SegmentedControl<'groups' | 'knockout'>
          options={[{ value: 'groups', label: 'Groups' }, { value: 'knockout', label: 'Knockout' }]}
          value={rrView}
          onChange={onRRViewChange}
          className="mb-5 max-w-xs"
        />
      )}
    </>
  );
};
