import React, { useMemo, useState } from 'react';
import { Sheet } from '../../components/Sheet';
import { Button } from '../../components/Button';
import { EventParticipant } from '../../types';
import { ZoneDrawConfig } from './types';
import { zoneBucketFor } from './utils';
import { ZONE_COURT_COUNTS } from '../../utils/zoneCourtCounts';
import { ZoneName } from '../../utils/zones';

/**
 * Creator-only zone management. Zones are always on and can't be switched off — the only lever is
 * MERGING one zone into another, which is how a thin zone gets folded into a neighbour instead of
 * running a near-empty draw.
 *
 * A merged zone produces no draws; its players play in the target's. Merging is per-source and
 * reversible, so a target that swallowed three zones offers three separate unmerge buttons.
 */
export const ZoneDrawConfigPanel: React.FC<{
  config: ZoneDrawConfig;
  participants: EventParticipant[];
  zoneMap: Record<string, string>;
  /** Zone ids that already have generated matches — these can't be merged away. */
  zonesWithMatches?: Set<string>;
  onMerge: (sourceId: string, targetId: string) => void;
  onUnmerge: (sourceId: string) => void;
  onSetEnabled: (enabled: boolean) => void;
  onClose: () => void;
}> = ({ config, participants, zoneMap, zonesWithMatches, onMerge, onUnmerge, onSetEnabled, onClose }) => {
  const [mergeSource, setMergeSource] = useState<string | null>(null);

  const merges = config.merges ?? {};
  const activeBuckets = config.buckets.filter((b) => !merges[b.id]);

  // Players per zone, counted against the zone they'd actually play in (so a merged zone's
  // players show under the target).
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    participants
      .filter((p) => p.tournament_choice === 'Singles' && !p.removal)
      .forEach((p) => {
        const id = p.zone_override ?? zoneBucketFor(zoneMap[p.uid], config);
        if (id) map.set(id, (map.get(id) ?? 0) + 1);
      });
    return map;
  }, [participants, zoneMap, config]);

  const sourcesMergedInto = (targetId: string) =>
    Object.entries(merges).filter(([, t]) => t === targetId).map(([s]) => s);
  const labelOf = (id: string) => config.buckets.find((b) => b.id === id)?.label ?? id;
  const courtsIn = (id: string) => ZONE_COURT_COUNTS[labelOf(id) as ZoneName]?.courts;

  return (
    <Sheet onClose={onClose} title="Zones" maxWidthClassName="max-w-md">
      <div className="p-6 pt-3 space-y-5">
        {/* Zone draws are on by default. Switching them off collapses the zone level entirely —
            one draw per skill, as before zones existed. Merges are kept, so turning them back on
            restores the setup rather than starting over. */}
        <button
          type="button"
          onClick={() => onSetEnabled(!config.enabled)}
          aria-pressed={config.enabled}
          className={`w-full flex items-center justify-between rounded-2xl px-4 py-3.5 text-left transition-colors ${
            config.enabled ? 'bg-clay/10 border border-clay/50' : 'bg-fg/5 border border-transparent hover:bg-fg/[0.09]'
          }`}
        >
          <span className="min-w-0">
            <span className="block text-sm font-bold text-fg">Split draws by zone</span>
            <span className="block text-xs text-fg/70 mt-0.5">
              {config.enabled ? 'Each zone runs its own draws' : 'One draw per skill, zones ignored'}
            </span>
          </span>
          <span className={`text-[10px] font-black uppercase tracking-wide shrink-0 ${config.enabled ? 'text-clay' : 'text-fg/70'}`}>
            {config.enabled ? 'On' : 'Off'}
          </span>
        </button>

        {config.enabled && (<>
        <p className="text-sm text-fg/70">
          Merge a quiet zone into a neighbour so it doesn&apos;t run a near-empty draw — you can
          unmerge it again at any point before its draws are generated.
        </p>

        <div className="space-y-2">
          {activeBuckets.map((b) => {
            const swallowed = sourcesMergedInto(b.id);
            const locked = zonesWithMatches?.has(b.id);
            const courts = courtsIn(b.id);
            return (
              <div key={b.id} className="rounded-2xl bg-fg/5 px-3.5 py-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-fg truncate">{b.label}</span>
                    <span className="block text-[11px] text-fg/70">
                      {counts.get(b.id) ?? 0} players{courts ? ` · ${courts} courts` : ''}
                    </span>
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={locked || activeBuckets.length < 2}
                    title={locked ? 'This zone already has matches' : undefined}
                    onClick={() => setMergeSource(b.id)}
                  >
                    Merge Zone
                  </Button>
                </div>

                {/* One unmerge button per zone this one swallowed. */}
                {swallowed.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1 border-t border-fg/5">
                    {swallowed.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => onUnmerge(s)}
                        className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-clay/10 text-clay hover:bg-clay/20 transition-colors"
                      >
                        Unmerge {labelOf(s)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* "Merge <zone> into…" — the target list is every other active zone. */}
        {mergeSource && (
          <div className="rounded-2xl border border-clay/40 bg-clay/5 p-3.5 space-y-2">
            <p className="text-xs font-bold uppercase tracking-widest text-clay">
              Merge {labelOf(mergeSource)} into
            </p>
            <div className="space-y-1.5">
              {activeBuckets.filter((b) => b.id !== mergeSource).map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => { onMerge(mergeSource, b.id); setMergeSource(null); }}
                  className="w-full flex items-center justify-between gap-2 rounded-xl bg-fg/5 hover:bg-fg/[0.09] px-3 py-2 text-left transition-colors"
                >
                  <span className="text-sm font-semibold text-fg truncate">{b.label}</span>
                  <span className="shrink-0 text-[11px] text-fg/70">
                    {counts.get(b.id) ?? 0} players
                  </span>
                </button>
              ))}
            </div>
            <Button size="sm" variant="outline" className="w-full" onClick={() => setMergeSource(null)}>
              Cancel
            </Button>
          </div>
        )}
        </>)}

        <Button variant="clay" className="w-full" onClick={onClose}>Done</Button>
      </div>
    </Sheet>
  );
};
