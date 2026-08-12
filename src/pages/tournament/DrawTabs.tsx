import React, { useState } from 'react';
import { SegmentedControl } from '../../components/SegmentedControl';
import { Tree, TreeGroup, TreeRow } from '../../components/Tree';
import { DrawConfig, DrawTab, SkillGroup } from './types';

type Props = {
  activeTab: DrawTab;
  activeSkill: SkillGroup;
  activeDoubles: string;
  currentDraw: DrawConfig | undefined;
  visibleDraws: DrawConfig[];
  /** Per-draw signed-up count and capacity, keyed by draw label. */
  drawCounts?: Record<string, { count: number; size: number }>;
  onTabChange: (tab: DrawTab) => void;
  onSkillChange: (skill: SkillGroup) => void;
  onDoublesChange: (division: string) => void;
  // Zone bucket id — only relevant once an event has zone draws enabled (see ZoneDrawConfigPanel).
  onZoneChange: (zone: string | undefined) => void;
  // Round Robin sub-view (Groups / Knockout). Omitted for non-RR draws.
  rrView?: 'groups' | 'knockout';
  onRRViewChange?: (v: 'groups' | 'knockout') => void;
  /** Draw-size picker, rendered inside the selected draw's row (creator, pre-generation only). */
  drawSizeControl?: React.ReactNode;
};

const TAB_LABEL: Record<DrawTab, string> = {
  mens: "Men's",
  womens: "Women's",
  doubles: 'Doubles',
};
const TAB_ORDER: DrawTab[] = ['mens', 'womens', 'doubles'];

// Draw selector: a division tree rather than the old flat chip row. Men's / Women's / Doubles
// collapse and expand; each draw inside shows how full it is ("14/16"), so a creator can see
// at a glance which divisions need players without tapping through every chip. Zone variants
// stay their own rows — buildZoneAwareDrawConfigs already gives each a readable label.
export const DrawTabs: React.FC<Props> = ({
  currentDraw, visibleDraws, drawCounts,
  onTabChange, onSkillChange, onDoublesChange, onZoneChange, rrView, onRRViewChange,
  drawSizeControl,
}) => {
  const drawKey = (d: DrawConfig) => `${d.tab}|${d.division}|${d.skillGroup}|${d.zone ?? ''}`;
  const currentKey = currentDraw ? drawKey(currentDraw) : null;

  // Open the group holding the current draw by default, so the selection is always visible.
  const [openTab, setOpenTab] = useState<DrawTab | null>(currentDraw?.tab ?? null);
  const [openZone, setOpenZone] = useState<string | null>(
    currentDraw?.zone ? `${currentDraw.tab}-${currentDraw.zone}` : null,
  );

  // Preserves the order draws arrive in; un-zoned draws collapse into a single leading bucket.
  const groupByZone = (list: DrawConfig[]) => {
    const out: { zone: string; label: string; draws: DrawConfig[] }[] = [];
    for (const d of list) {
      const zone = d.zone ?? '';
      const existing = out.find((g) => g.zone === zone);
      if (existing) existing.draws.push(d);
      else out.push({ zone, label: zoneLabel(d), draws: [d] });
    }
    return out;
  };

  // Rows sit under gender (and, for singles, under a zone), so strip both from the label —
  // the parent groups already say them.
  const rowLabel = (d: DrawConfig) => {
    if (d.tab === 'doubles') {
      return d.division !== 'Mixed Doubles' && d.division !== 'All' ? `${d.division} Doubles` : d.label;
    }
    const prefix = `${d.division} `;
    const withoutDivision = d.label.startsWith(prefix) ? d.label.slice(prefix.length) : d.label;
    return withoutDivision.split(' — ')[0];
  };

  // Zone label lives on the draw's own label as the " — <zone>" suffix, so the tree can group by
  // it without needing the event's zone config passed down.
  const zoneLabel = (d: DrawConfig) => (d.zone ? d.label.split(' — ').slice(1).join(' — ') || d.zone : '');

  const select = (d: DrawConfig) => {
    onTabChange(d.tab);
    if (d.tab === 'doubles') onDoublesChange(d.division);
    else onSkillChange(d.skillGroup);
    onZoneChange(d.zone);
  };

  const tabs = TAB_ORDER
    .map((tab) => ({ tab, draws: visibleDraws.filter((d) => d.tab === tab) }))
    .filter((g) => g.draws.length > 0);

  return (
    <>
      {tabs.length > 0 && (
        <Tree className="mb-4">
          {tabs.map(({ tab, draws }) => {
            const signedUp = draws.reduce((n, d) => n + (drawCounts?.[d.label]?.count ?? 0), 0);
            return (
              <TreeGroup
                key={tab}
                id={tab}
                label={TAB_LABEL[tab]}
                right={drawCounts ? `${signedUp} signed up` : undefined}
                open={openTab === tab}
                onToggle={(id) => setOpenTab((cur) => (cur === id ? null : (id as DrawTab)))}
              >
                {/* Gender → Zone → Skill. Zoned draws group under their zone; anything without a
                    zone (doubles, or a pre-zone leftover draw) stays a direct row. */}
                {groupByZone(draws).map(({ zone, label, draws: zoneDraws }) => {
                  const rows = zoneDraws.map((d) => {
                    const key = drawKey(d);
                    const c = drawCounts?.[d.label];
                    const isActive = currentKey === key;
                    return (
                      <React.Fragment key={key}>
                        <TreeRow
                          label={rowLabel(d)}
                          fill={c}
                          active={isActive}
                          onClick={() => select(d)}
                          level={zone ? 1 : 0}
                        />
                        {/* Draw size belongs to the draw it changes, so it lives in the row
                            rather than floating below the whole selector. */}
                        {isActive && drawSizeControl && (
                          <div className={`${zone ? 'pl-14' : 'pl-10'} pr-5 pb-2`}>{drawSizeControl}</div>
                        )}
                      </React.Fragment>
                    );
                  });
                  if (!zone) return <React.Fragment key={`${tab}-nozone`}>{rows}</React.Fragment>;
                  const zoneSignedUp = zoneDraws.reduce((n, d) => n + (drawCounts?.[d.label]?.count ?? 0), 0);
                  return (
                    <TreeGroup
                      key={`${tab}-${zone}`}
                      id={`${tab}-${zone}`}
                      label={label}
                      level={1}
                      right={drawCounts ? `${zoneSignedUp}` : undefined}
                      open={openZone === `${tab}-${zone}`}
                      onToggle={(id) => setOpenZone((cur) => (cur === id ? null : id))}
                    >
                      {rows}
                    </TreeGroup>
                  );
                })}
              </TreeGroup>
            );
          })}
        </Tree>
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
