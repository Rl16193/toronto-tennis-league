import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { AlertCircle, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Download, Pencil, Play, Settings2, Trash2, UserPlus, Users, X, XCircle } from 'lucide-react';
import { EventCarousel } from '../../features/events/EventCarousel';
import { DrawSlide, buildDrawSlides, downloadSlide, loadBrandMark } from './bracketImage';
import { fetchPastResults, type PastDraw, type PastMatch, type PastResults } from '../../features/events/services/eventService';
import { Button, buttonCls } from '../../components/Button';
import { useTwoTap } from "../../lib/useTwoTap";
import { Sheet } from '../../components/Sheet';
import { SegmentedControl } from '../../components/SegmentedControl';
import { SelectField } from '../../components/SelectField';
import { Tree, TreeGroup, TreeRow } from '../../components/Tree';
import { EventParticipant, UserStats } from '../../types';
import { ZONE_NAMES, ZoneName } from '../../utils/zones';
import { ContactOpponentButton } from '../../components/ContactOpponentButton';
import type { ContactData } from '../../types';
import {
  DOUBLES_DIVISIONS, DrawConfig, DrawTab, OpenDrawSlot,
  SkillMergePair, TournamentFormat, TournamentMatch, UNASSIGNED_ZONE_ID, UnplacedEntry, ZoneDrawConfig,
} from './types';
import { PLAYER_LOADING, PLAYER_LOADING_SENTINEL, formatPlayerName } from './utils';
import { drawKey, zoneBucketFor } from './drawGenerator';
import { WithdrawReasons } from '../../features/events/EventsElements';
import type { RemovalReason } from '../../features/events/registrations';
import { skillBand } from '../../utils/skillLevels';
import { MemberSearchInput, type MemberPick } from '../../features/members/MemberSearchInput';

// Tournament page presentation: error boundary, request panels, modals, draw selector, and the
// organizer's Manage Draw sheet. Props in, callbacks out — all state lives in useTournament.ts.

// ─── Error boundary ───────────────────────────────────────────────────────────────────────────

type BoundaryProps = { children: React.ReactNode; onDownload: () => void };
type BoundaryState = { hasError: boolean };

export class BracketErrorBoundary extends React.Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { hasError: false };

  static getDerivedStateFromError(): BoundaryState {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-2xl bg-red-500/10 border border-red-500/20 p-10 text-center space-y-4">
          <AlertCircle className="w-10 h-10 text-badge-loss mx-auto" />
          <p className="text-fg font-bold text-lg">Failed to load the bracket.</p>
          <p className="text-fg text-sm">Download the draw to view it offline.</p>
          <Button variant="outline" onClick={this.props.onDownload}>
            <Download className="w-4 h-4" />
            Download Draw
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Player-facing zone controls ──────────────────────────────────────────────────────────────

// Changes the member's zone outright (preferences.preferred_zone). Nothing is requested and nobody
// approves it — the organizer is NOTIFIED by the server, and only has to act when the new zone
// already has a generated draw (see CLAUDE.md's zone-change cases).
export const ChangeZoneButton: React.FC<{
  onChange: () => void;
}> = ({ onChange }) => {
  return (
    <button type="button" className={buttonCls('clay', 'sm')} onClick={onChange}>
      Change
    </button>
  );
};

// Player picks the zone they want; court counts are the practical difference between zones.
export const ChangeZoneModal: React.FC<{
  currentZone: string;
  onClose: () => void;
  onSubmit: (zone: string) => Promise<void> | void;
}> = ({ currentZone, onClose, onSubmit }) => {
  const [picked, setPicked] = useState<string>('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!picked || picked === currentZone) return;
    setSaving(true);
    try {
      await onSubmit(picked);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet onClose={onClose} title="Change Zone" maxWidthClassName="max-w-md">
      <div className="p-6 pt-3 space-y-4">
        <p className="text-sm text-fg/70">
          You&apos;re currently in <span className="font-bold text-fg">{currentZone || 'no zone'}</span>.
          Pick the zone you want to play in. The change is yours to make — the organizer is told,
          not asked. Matches you already have stay exactly as they are.
        </p>
        <p className="text-sm">
          <a
            href="/courts"
            className="font-bold text-clay underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clay"
          >
            See which zone a court is in
          </a>
        </p>

        <div className="space-y-2">
          {ZONE_NAMES.map((z) => {
            const isCurrent = z === currentZone;
            const isPicked = z === picked;
            return (
              <button
                key={z}
                type="button"
                disabled={isCurrent}
                onClick={() => setPicked(z)}
                className={`w-full flex items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left transition-colors ${
                  isPicked ? 'bg-clay/15 border border-clay/50'
                    : isCurrent ? 'bg-fg/5 opacity-50 cursor-not-allowed'
                    : 'bg-fg/5 hover:bg-fg/10 border border-transparent'
                }`}
              >
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-fg truncate">{z}</span>
                  <span className="block text-xs text-fg/70">
                    {ZONE_COURT_COUNTS[z].courts} courts · {ZONE_COURT_COUNTS[z].sites} locations
                  </span>
                </span>
                {isCurrent && <span className="shrink-0 text-xs font-bold uppercase tracking-wide text-fg/70">Current</span>}
              </button>
            );
          })}
        </div>

        <div className="flex gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={onClose} className="flex-1">Cancel</Button>
          <Button size="sm" onClick={submit} isLoading={saving} disabled={!picked} className="flex-1">
            Change zone
          </Button>
        </div>
      </div>
    </Sheet>
  );
};

// ─── Creator request queues ───────────────────────────────────────────────────────────────────

/**
 * Collapsible queue. Every organizer-only queue uses this so they read as one stack of dropdowns
 * rather than a column of permanently-open amber panels — the shape the organizer overview will
 * inherit when these move behind it.
 */
const QueueDropdown: React.FC<{
  title: string;
  count: number;
  children: React.ReactNode;
}> = ({ title, count, children }) => {
  const [open, setOpen] = useState(false);
  if (count === 0) return null;
  return (
    <div className="mb-3 rounded-2xl border border-amber-500/20 bg-amber-500/5 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left hover:bg-amber-500/5 transition-colors"
      >
        <span className="text-xs font-bold uppercase tracking-widest text-badge">
          {title} ({count})
        </span>
        {open ? <ChevronUp className="w-4 h-4 text-badge shrink-0" />
              : <ChevronDown className="w-4 h-4 text-badge shrink-0" />}
      </button>
      {open && <div className="px-4 pb-3">{children}</div>}
    </div>
  );
};

const UnplacedPlayerRow: React.FC<{
  player: UnplacedEntry;
  slots: OpenDrawSlot[];
  onSeat: (uid: string, name: string, matchId: string, slot: 'player_1' | 'player_2') => void;
}> = ({ player, slots, onSeat }) => {
  const [pick, setPick] = useState('');
  // Empty zone means they picked no courts — say so rather than showing the placement default.
  const meta = [
    player.tournamentChoice, player.division,
    player.skill ? `skill ${player.skill}` : '',
    player.zone || 'Unassigned',
  ].filter(Boolean).join(' · ');
  return (
    <div className="flex flex-wrap items-center gap-2 py-2 border-b border-fg/5 last:border-0">
      <span className="flex-1 min-w-[140px]">
        <span className="block text-sm text-fg">{formatPlayerName(player.name)}</span>
        {!!player.eventTitle && <span className="block text-xs font-semibold text-fg truncate">{player.eventTitle}</span>}
        {!!meta && <span className="block text-xs text-fg/70">{meta}</span>}
      </span>
      <SelectField
        value={pick}
        placeholder="Open slot…"
        title={`Slot for ${player.name}`}
        options={slots.map((s) => ({ value: `${s.matchId}_${s.slot}`, label: s.label }))}
        onChange={setPick}
        className="w-auto max-w-[11rem]"
      />
      <Button
        size="sm"
        className="px-3"
        disabled={!pick}
        onClick={() => {
          const chosen = slots.find((s) => `${s.matchId}_${s.slot}` === pick);
          if (chosen) onSeat(player.uid, player.name, chosen.matchId, chosen.slot);
          setPick('');
        }}
      >
        Place
      </Button>
    </div>
  );
};

/**
 * Creator-only: everyone registered for the event who is in no match of it. A player's own join
 * cannot seat them (that write is organizer-only under the rules), so without this they are
 * invisible — registered, expecting to play, and in no draw.
 */
export const UnplacedPlayersPanel: React.FC<{
  players: UnplacedEntry[];
  slots: OpenDrawSlot[];
  onSeat: (uid: string, name: string, matchId: string, slot: 'player_1' | 'player_2') => void;
}> = ({ players, slots, onSeat }) => (
  <QueueDropdown title="Unplaced players" count={players.length}>
    {slots.length === 0 && (
      <p className="py-2 text-xs text-fg/70">
        No free slots in this draw. Switch draw, or make room, to place these players.
      </p>
    )}
    {/* The slot picker only offers the draw on screen, so the row names the event a player
        actually joined — placing a Zephyr registrant into another tournament is the mistake. */}
    {players.map((p) => (
      <UnplacedPlayerRow key={`${p.eventId}_${p.uid}`} player={p} slots={slots} onSeat={onSeat} />
    ))}
  </QueueDropdown>
);

// ─── Per-match controls ───────────────────────────────────────────────────────────────────────

export type ScheduleApi = {
  onSubmitScore?: (match: TournamentMatch) => void;
  submittableMatchIds?: Set<string>;
};

// One match's block: result badge, submit-score, the matchday rule.
// The hide* flags let OpponentPanels render individual buttons inline in its own row instead.
export const ScheduleControls: React.FC<{
  match: TournamentMatch;
  api: ScheduleApi;
  hideRule?: boolean;
  hideBadge?: boolean;
  /** The submit-score button is shown inline in the row above instead (OpponentPanels.tsx). */
  hideSubmitButton?: boolean;
  className?: string;
  /** 'grid-2' lays the action buttons in a 2-column grid instead of flex-wrap */
  buttonLayout?: 'flex' | 'grid-2';
  /** Signed-in user, so a completed match reads "Win"/"Loss" instead of a generic "Completed". */
  viewerUid?: string;
}> = ({ match, api, hideRule, hideBadge, hideSubmitButton, className, buttonLayout = 'flex', viewerUid }) => {
  const isComplete = match.status === 'complete';

  const badge = isComplete
    ? (viewerUid && match.winner_uid
      ? (match.winner_uid === viewerUid
        ? { text: 'Win', cls: 'bg-green-500/15 text-badge-win border-green-500/25' }
        : { text: 'Loss', cls: 'bg-red-500/15 text-badge-loss border-red-500/25' })
      : { text: 'Completed', cls: 'bg-green-500/15 text-badge-win border-green-500/25' })
    : null;

  const showSubmit = !!api.onSubmitScore && !!api.submittableMatchIds?.has(match.id) && !isComplete && !hideSubmitButton;

  return (
    <div className={className ?? 'mt-3 rounded-2xl bg-tennis-dark/40 p-3 space-y-2.5'}>
      {!hideBadge && badge && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`px-2.5 py-1 rounded-2xl text-xs font-bold border ${badge.cls}`}>{badge.text}</span>
        </div>
      )}

      {showSubmit && (
        <div className={buttonLayout === 'grid-2' ? 'grid grid-cols-2 gap-2' : 'flex flex-wrap gap-2'}>
          <Button size="sm" variant="clay" className="px-3" onClick={() => api.onSubmitScore!(match)}>Submit Score</Button>
        </div>
      )}
      {!hideRule && !isComplete && (
        <p className="text-xs text-fg/70 leading-snug">
          Matchdays. Schedule prepared by organizer based on your availability.
        </p>
      )}
    </div>
  );
};

// ─── Round Robin setup ────────────────────────────────────────────────────────────────────────

export const RRConfigModal: React.FC<{
  playerCount: number;
  isConversion?: boolean;
  isLoading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}> = ({ playerCount, isConversion = false, isLoading = false, onConfirm, onClose }) => {
  const [convertConfirmed, setConvertConfirmed] = useState(false);
  const canConfirm = playerCount >= 3 && (!isConversion || convertConfirmed);

  return (
    <Sheet onClose={onClose} maxWidthClassName="max-w-md">
      <div className="p-6 space-y-5">
        {/* Header */}
        <div className="pr-10">
          <h2 className="text-lg font-bold text-fg">
            {isConversion ? 'Convert to Round Robin' : 'Round Robin Setup'}
          </h2>
        </div>

        {/* Conversion warning */}
        {isConversion && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-3 space-y-2">
            <p className="text-sm font-semibold text-badge-loss">
              This will delete all existing bracket matches and rebuild as Round Robin.
            </p>
            <p className="text-xs text-badge-loss/70">
              Stats from any completed matches will not be reversed. Only convert before play has begun.
            </p>
            <label className="flex items-center gap-2 cursor-pointer text-sm text-badge-loss mt-1">
              <input
                type="checkbox"
                checked={convertConfirmed}
                onChange={(e) => setConvertConfirmed(e.target.checked)}
                className="accent-clay"
              />
              I understand — proceed with conversion
            </label>
          </div>
        )}

        {/* Player count */}
        <p className="text-sm text-fg/70">
          <span className="font-bold text-fg">{playerCount}</span> players registered
        </p>

        {/* How groups + knockout are formed (sizes are automatic — see the preview on the page) */}
        {playerCount >= 3 ? (
          <div className="rounded-2xl bg-fg/5 p-3 space-y-1.5 text-sm">
            <p className="text-fg/70 text-xs font-bold uppercase tracking-widest mb-1">How it works</p>
            <p className="text-fg/70">
              Groups are formed automatically by <span className="text-fg">skill band</span> and{' '}
              <span className="text-fg">preferred-court zone</span>, in balanced groups of 3–5.
            </p>
            <p className="text-fg/70">
              Every group winner advances to the knockout, then the best runners-up fill up to the next
              4 / 8 / 16-player bracket.
            </p>
            <p className="text-fg/70 text-xs pt-1">The exact groups are shown in the preview on the page.</p>
          </div>
        ) : (
          <p className="text-sm text-badge-loss">Need at least 3 registered players to generate a group draw.</p>
        )}

        {/* Actions */}
        <div className="flex gap-3 pt-1">
          <Button variant="outline" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button
            onClick={() => onConfirm()}
            disabled={!canConfirm || isLoading}
            isLoading={isLoading}
            className="flex-1"
          >
            {isConversion ? 'Convert' : 'Generate'}
          </Button>
        </div>
      </div>
    </Sheet>
  );
};

// ─── Zone configuration (creator) ─────────────────────────────────────────────────────────────

// Creator-only. A merged zone produces no draws — its players play in the target's. Merging is
// per-source and reversible, so a target that swallowed three zones offers three unmerge buttons.
export const ZoneDrawConfigPanel: React.FC<{
  config: ZoneDrawConfig;
  participants: EventParticipant[];
  zoneMap: Record<string, string>;
  /** Same map the draw filters band players by, so the overview agrees with the draws. */
  statsMap?: Record<string, UserStats>;
  /** Zone ids that already have generated matches — these can't be merged away. */
  zonesWithMatches?: Set<string>;
  onMerge: (sourceId: string, targetId: string) => void;
  onUnmerge: (sourceId: string) => void;
  onSetEnabled: (enabled: boolean) => void;
  onClose: () => void;
}> = ({ config, participants, zoneMap, statsMap = {}, zonesWithMatches, onMerge, onUnmerge, onSetEnabled, onClose }) => {
  const [mergeSource, setMergeSource] = useState<string | null>(null);
  const [openPrefTab, setOpenPrefTab] = useState<string | null>(null);
  const [openPrefZone, setOpenPrefZone] = useState<string | null>(null);

  const merges = config.merges ?? {};
  const activeBuckets = config.buckets.filter((b) => !merges[b.id]);
  // Unassigned (players with no Toronto zone) isn't a bucket, but it runs its own draw, so it is
  // listed to be merged into a real zone. It is never offered as a target.
  const listedZones = merges[UNASSIGNED_ZONE_ID]
    ? activeBuckets
    : [...activeBuckets, { id: UNASSIGNED_ZONE_ID, label: 'Unassigned', zones: [] }];

  // Counted against the zone they'd actually play in, so a merged zone's players show under the target.
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    participants
      .filter((p) => p.category === 'singles_tournament' && p.status === 'active')
      .forEach((p) => {
        const id = zoneBucketFor(zoneMap[p.uid], config);
        if (id) map.set(id, (map.get(id) ?? 0) + 1);
      });
    return map;
  }, [participants, zoneMap, config]);

  /**
   * Where people play, by division → zone → band: the zone is the member's own preferred_zone
   * (a merged zone counts under its target). Retired Pro is its own division.
   */
  const preferred = useMemo(() => {
    const bandOf = (p: EventParticipant) => skillBand(statsMap[p.uid]?.skill_level ?? Number(p.skill || 0));

    const divisions = new Map<string, Map<string, Map<string, number>>>();
    participants
      .filter((p) => p.category === 'singles_tournament' && p.status === 'active' && p.uid)
      .forEach((p) => {
        const zone = zoneBucketFor(zoneMap[p.uid], config) ?? '';
        const division = p.division ?? '';
        const zones = divisions.get(division) ?? new Map<string, Map<string, number>>();
        const bands = zones.get(zone) ?? new Map<string, number>();
        const b = bandOf(p);
        bands.set(b, (bands.get(b) ?? 0) + 1);
        zones.set(zone, bands);
        divisions.set(division, zones);
      });

    // Busiest zone first — this is an overview, so the useful ordering is by headcount.
    const total = (bands: Map<string, number>) => [...bands.values()].reduce((a, b) => a + b, 0);
    const rows = [...divisions.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([division, zones]) => ({
        division,
        count: [...zones.values()].reduce((n, bands) => n + total(bands), 0),
        zones: [...zones.entries()]
          .map(([zone, bands]) => ({
            zone,
            count: total(bands),
            bands: [...bands.entries()].sort((x, y) => y[1] - x[1]),
          }))
          .sort((x, y) => y.count - x.count),
      }));
    return { rows };
  }, [participants, zoneMap, statsMap, config]);

  const sourcesMergedInto = (targetId: string) =>
    Object.entries(merges).filter(([, t]) => t === targetId).map(([s]) => s);
  const labelOf = (id: string) =>
    (id === UNASSIGNED_ZONE_ID ? 'Unassigned' : config.buckets.find((b) => b.id === id)?.label ?? id);
  const courtsIn = (id: string) => ZONE_COURT_COUNTS[labelOf(id) as ZoneName]?.courts;

  return (
    <Sheet onClose={onClose} title="Zones" maxWidthClassName="max-w-md">
      <div className="p-6 pt-3 space-y-5">
        {/* Off collapses the zone level to one draw per skill. Merges are kept, so turning it
            back on restores the setup rather than starting over. */}
        <button
          type="button"
          onClick={() => onSetEnabled(!config.enabled)}
          aria-pressed={config.enabled}
          className={`w-full flex items-center justify-between rounded-2xl px-4 py-3.5 text-left transition-colors ${
            config.enabled ? 'bg-clay/10 border border-clay/50' : 'bg-fg/5 border border-transparent hover:bg-fg/10'
          }`}
        >
          <span className="min-w-0">
            <span className="block text-sm font-bold text-fg">Split draws by zone</span>
            <span className="block text-xs text-fg/70 mt-0.5">
              {config.enabled ? 'Each zone runs its own draws' : 'One draw per skill, zones ignored'}
            </span>
          </span>
          <span className={`text-xs font-black uppercase tracking-wide shrink-0 ${config.enabled ? 'text-clay' : 'text-fg/70'}`}>
            {config.enabled ? 'On' : 'Off'}
          </span>
        </button>

        {config.enabled && (<>
        <p className="text-sm text-fg/70">
          Merge a quiet zone into a neighbour so it doesn&apos;t run a near-empty draw — you can
          unmerge it again at any point before its draws are generated.
        </p>

        <div className="space-y-2">
          {listedZones.map((b) => {
            const swallowed = sourcesMergedInto(b.id);
            const locked = zonesWithMatches?.has(b.id);
            const courts = courtsIn(b.id);
            return (
              <div key={b.id} className="rounded-2xl bg-fg/5 px-3.5 py-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-fg truncate">{b.label}</span>
                    <span className="block text-xs text-fg/70">
                      {counts.get(b.id) ?? 0} players{courts ? ` · ${courts} courts` : ''}
                    </span>
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={locked || !activeBuckets.some((t) => t.id !== b.id)}
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
                        className="px-2.5 py-1 rounded-2xl text-xs font-bold bg-clay/10 text-clay hover:bg-clay/20 transition-colors"
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
                  className="w-full flex items-center justify-between gap-2 rounded-2xl bg-fg/5 hover:bg-fg/10 px-3 py-2 text-left transition-colors"
                >
                  <span className="text-sm font-semibold text-fg truncate">{b.label}</span>
                  <span className="shrink-0 text-xs text-fg/70">
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

        {/* Read-only overview. Same tree shape as the draw selector, but it lists where players
            PREFER to play rather than which draw they are in, so rows aren't selectable — a zone
            here may have no draw at all. */}
        {preferred.rows.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-widest text-fg/70">Preferred zones</p>
            <p className="text-xs text-fg/70">
              Where players say they want to play, from their own zone.
            </p>
            <Tree>
              {preferred.rows.map((d) => (
                <TreeGroup
                  key={d.division}
                  id={d.division}
                  label={d.division}
                  right={`${d.count} signed up`}
                  open={openPrefTab === d.division}
                  onToggle={(id) => setOpenPrefTab((cur) => (cur === id ? null : id))}
                >
                  {d.zones.map((z) => (
                    <TreeGroup
                      key={`${d.division}-${z.zone}`}
                      id={`${d.division}-${z.zone}`}
                      label={labelOf(z.zone)}
                      level={1}
                      right={`${z.count}`}
                      open={openPrefZone === `${d.division}-${z.zone}`}
                      onToggle={(id) => setOpenPrefZone((cur) => (cur === id ? null : id))}
                    >
                      {z.bands.map(([band, n]) => (
                        <TreeRow key={band} label={band} right={`${n}`} level={1} />
                      ))}
                    </TreeGroup>
                  ))}
                </TreeGroup>
              ))}
            </Tree>
          </div>
        )}

        <Button variant="clay" className="w-full" onClick={onClose}>Done</Button>
      </div>
    </Sheet>
  );
};

// ─── Draw selector ────────────────────────────────────────────────────────────────────────────

const TAB_ORDER: DrawTab[] = ['mens', 'womens', 'doubles'];

// The draw picker: one name at a time between previous / next arrows that loop, its signed-up
// count under it and its zones as pills above (see CLAUDE.md, "A player sees one draw at a time").
export const DrawTabs: React.FC<{
  selected: DrawConfig | undefined;
  draws: DrawConfig[];
  /** Per-draw signed-up count and capacity, keyed by draw label. */
  drawCounts?: Record<string, { count: number; size: number }>;
  onSelect: (draw: DrawConfig) => void;
  // Round Robin sub-view (Groups / Knockout). Omitted for non-RR draws.
  rrView?: 'groups' | 'knockout';
  onRRViewChange?: (v: 'groups' | 'knockout') => void;
  /** Draw-size picker, rendered inside the selected draw's row (creator, pre-generation only). */
  drawSizeControl?: React.ReactNode;
  /** Opens the picture slideshow. Omitted when the draw has nothing generated to show. */
  onViewCompleteDraw?: () => void;
  /** A player's view: the wheel steps only through their own zones (`playerZones`). */
  playerMode?: boolean;
  /** Zone bucket ids a player may step through: their own zone and any zone they hold a match in. */
  playerZones?: Set<string>;
  /** The current draw holds one of the viewer's matches ("My Draw"). */
  isMyDraw?: boolean;
}> = ({
  selected: currentDraw, draws: visibleDraws, drawCounts, onSelect: select, rrView, onRRViewChange,
  drawSizeControl, onViewCompleteDraw, playerMode, playerZones, isMyDraw,
}) => {
  const currentKey = currentDraw ? drawKey(currentDraw) : null;
  const reduceMotion = useReducedMotion();
  // +1 turns the wheel forward, -1 back; the name swings out the way it was pushed.
  const [direction, setDirection] = useState(1);

  // Read off the draw label's " — <zone>" suffix, so the header needs no zone config passed down.
  const zoneLabel = (d: DrawConfig) => (d.zone ? d.label.split(' — ').slice(1).join(' — ') || d.zone : '');

  // Players step through their own zone only; doubles draws carry no zone and always stay.
  const shown = visibleDraws.filter((d) =>
    !playerMode || !playerZones || !d.zone || playerZones.has(d.zone));
  // A level is one draw across its zones: Men's Masters in every zone is one stop on the wheel.
  const levelKey = (d: DrawConfig) => `${d.tab}|${d.division}|${d.skillGroup}`;
  const levels: { key: string; name: string; draws: DrawConfig[] }[] = [];
  [...shown]
    .sort((a, b) => TAB_ORDER.indexOf(a.tab) - TAB_ORDER.indexOf(b.tab))
    .forEach((d) => {
      const lvl = levels.find((l) => l.key === levelKey(d));
      if (lvl) lvl.draws.push(d);
      else levels.push({ key: levelKey(d), name: d.label.split(' — ')[0], draws: [d] });
    });
  const level = currentDraw ? levels.find((l) => l.key === levelKey(currentDraw)) : undefined;
  const name = level?.name ?? currentDraw?.label.split(' — ')[0] ?? '';
  const zoneDraws = level ? level.draws.filter((d) => d.zone) : [];
  const countOf = (list: DrawConfig[]) => list.reduce((n, d) => n + (drawCounts?.[d.label]?.count ?? 0), 0);

  // Previous / next loop round; the new level keeps the chosen zone when it has it.
  const step = (dir: 1 | -1) => {
    if (levels.length < 2) return;
    const i = level ? levels.indexOf(level) : 0;
    const next = levels[(i + dir + levels.length) % levels.length];
    setDirection(dir);
    select(next.draws.find((d) => d.zone === currentDraw?.zone) ?? next.draws[0]);
  };

  // The name swings along an arc pivoting below it, like a wheel turning; a plain fade when the
  // viewer asks for reduced motion.
  const wheel = {
    enter: (dir: number) => (reduceMotion ? { opacity: 0 } : { opacity: 0, rotate: 25 * dir, x: `${60 * dir}%`, y: 12 }),
    center: { opacity: 1, rotate: 0, x: '0%', y: 0 },
    exit: (dir: number) => (reduceMotion ? { opacity: 0 } : { opacity: 0, rotate: -25 * dir, x: `${-60 * dir}%`, y: 12 }),
  };
  const arrowCls = `shrink-0 w-11 h-11 rounded-2xl bg-fg/5 hover:bg-fg/10 text-fg flex items-center justify-center
                    transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clay`;

  return (
    <>
      {currentDraw && (
        <div className="mb-4">
          {/* Zones as pills above the name, only when this level runs in more than one. Never for a
              player, whose wheel is already limited to their own zones. */}
          {!playerMode && zoneDraws.length > 1 && (
            <div className="mb-3 flex flex-wrap justify-center gap-2">
              {zoneDraws.map((d) => {
                const on = drawKey(d) === currentKey;
                return (
                  <button
                    key={drawKey(d)}
                    type="button"
                    onClick={() => select(d)}
                    aria-pressed={on}
                    className={`min-h-11 rounded-2xl px-3 text-xs font-bold transition-colors focus-visible:outline-2
                                focus-visible:outline-offset-2 focus-visible:outline-clay ${on ? 'bg-clay text-white' : 'bg-fg/5 text-fg hover:bg-fg/10'}`}
                  >
                    {zoneLabel(d)}{drawCounts ? ` ${countOf([d])}` : ''}
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex items-center justify-center gap-3">
            {levels.length > 1 && (
              <button type="button" onClick={() => step(-1)} aria-label="Previous draw" className={arrowCls}>
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}
            <div className="relative min-w-0 flex-1 max-w-xs h-16 overflow-hidden">
              <AnimatePresence initial={false} custom={direction} mode="popLayout">
                <motion.div
                  key={level?.key ?? currentKey ?? ''}
                  custom={direction}
                  variants={wheel}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={reduceMotion ? { duration: 0.2 } : { type: 'spring', stiffness: 260, damping: 18 }}
                  style={{ transformOrigin: '50% 180%' }}
                  className="absolute inset-0 flex flex-col items-center justify-center text-center"
                >
                  <span className="flex items-baseline gap-2 max-w-full">
                    <h2 className="text-lg font-bold text-fg truncate">{name}</h2>
                    {isMyDraw && <span className="shrink-0 text-xs font-bold text-clay">My Draw</span>}
                  </span>
                  {drawCounts && (
                    <span className="text-xs text-fg/70">{countOf(level?.draws ?? [currentDraw])} signed up</span>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
            {levels.length > 1 && (
              <button type="button" onClick={() => step(1)} aria-label="Next draw" className={arrowCls}>
                <ChevronRight className="w-5 h-5" />
              </button>
            )}
          </div>

          {drawSizeControl && <div className="mt-3 flex justify-center">{drawSizeControl}</div>}
        </div>
      )}

      {/* Everyone's way into the pictures, players included. The organizer's Manage Draw sheet no
          longer carries a download of its own. */}
      {onViewCompleteDraw && (
        <div className="mb-4 flex justify-center">
          <Button variant="clay" size="sm" className="whitespace-nowrap" onClick={onViewCompleteDraw}>
            View Draw
          </Button>
        </div>
      )}

      {rrView && onRRViewChange && (
        <SegmentedControl<'groups' | 'knockout'>
          options={[{ value: 'groups', label: 'Groups' }, { value: 'knockout', label: 'Knockout' }]}
          value={rrView}
          onChange={onRRViewChange}
          className="mb-5 max-w-xs mx-auto"
        />
      )}
    </>
  );
};

// ─── Draw slideshow ───────────────────────────────────────────────────────────────────────────

/**
 * The pictures for the selected draw, swiped through one at a time, each with its own download.
 *
 * The preview and the file are the same SVG string, so what somebody sees is exactly what they
 * save. Shown inline as a data URI rather than an object URL because there is nothing to revoke
 * and the markup is self-contained.
 */
export const DrawSlideshow: React.FC<{
  slides: DrawSlide[];
  onClose: () => void;
}> = ({ slides, onClose }) => (
  <Sheet onClose={onClose} title="Complete Draw" maxWidthClassName="max-w-lg">
    <div className="p-4 pt-1">
      {slides.length === 0 ? (
        <p className="text-sm text-fg/70 text-center py-10">
          Nothing to show for this draw yet. Pictures appear once matches are generated.
        </p>
      ) : (
        <EventCarousel count={slides.length} fullBleed={false} alwaysPager itemLabel="picture">
          {slides.map((s) => (
            <div key={s.id} className="space-y-3">
              <img
                src={`data:image/svg+xml;utf8,${encodeURIComponent(s.svg)}`}
                alt={s.label}
                className="w-full rounded-2xl border border-fg/10"
              />
              <Button variant="outline" className="w-full" onClick={() => downloadSlide(s)}>
                <Download className="w-4 h-4" />Download {s.label}
              </Button>
            </div>
          ))}
        </EventCarousel>
      )}
    </div>
  </Sheet>
);

// ─── Past tournament draws (Events → Completed) ──────────────────────────────────────────────────

const drawName = (d: PastDraw) => [d.division, d.skillGroup && d.skillGroup !== 'All' ? d.skillGroup : ''].filter(Boolean).join(' ');

// A group whose players all sit in a bigger group was merged into it (its played matches keep the
// old label), so it is shown under the bigger group's name: one group, not two.
const mergedLabels = (ms: PastMatch[]) => {
  const rosters = new Map<string, Set<string>>();
  for (const m of ms.filter((x) => x.round === 'RR')) {
    const r = rosters.get(m.group_label) ?? new Set<string>();
    [m.player_1_uid, m.player_2_uid].forEach((u) => { if (u) r.add(u); });
    rosters.set(m.group_label, r);
  }
  const into = new Map<string, string>();
  for (const [label, r] of rosters) {
    const host = [...rosters].find(([l, h]) => l !== label && h.size > r.size && [...r].every((u) => h.has(u)));
    if (host) into.set(label, host[0]);
  }
  return (label: string) => into.get(label) ?? label;
};

// pastResults' matches in the shape the draw pictures read: the bracket and Results frames only
// (no zone line, no group rosters).
const slidesFor = (d: PastDraw, title: string, mark: string, deadlines: Record<string, string>) => {
  const labelOf = mergedLabels(d.matches);
  const matches = d.matches.map((m, i) => ({
    ...m, id: `${d.key}_${m.match_id || i}`, group_label: labelOf(m.group_label),
    result: m.result && {
      set_1_player_1: m.result.sets[0][0], set_1_player_2: m.result.sets[0][1],
      set_2_player_1: m.result.sets[1][0], set_2_player_2: m.result.sets[1][1],
      set_3_player_1: m.result.sets[2][0], set_3_player_2: m.result.sets[2][1],
    },
  })) as unknown as TournamentMatch[];
  return buildDrawSlides({
    matches, eventTitle: title, division: drawName(d), brandMark: mark,
    groups: [], groupLabels: [],
    roundDeadlines: deadlines,
    played: Object.fromEntries(matches.flatMap((m, i) => {
      const r = d.matches[i].result;
      return r ? [[m.id, { recordedAt: r.recordedAt, court: r.court || '', walkover: r.walkover }]] : [];
    })),
  });
};

/**
 * Two finished draws of a completed tournament as the draw pictures, results included. A visitor
 * sees players as "Player A", "Player B": names never leave the server for a signed-out caller.
 */
export const PastDrawsSheet: React.FC<{ eventId: string; signedIn: boolean; onClose: () => void }> = ({ eventId, signedIn, onClose }) => {
  const [data, setData] = useState<PastResults | null>(null);
  const [failed, setFailed] = useState(false);
  const [mark, setMark] = useState('');
  useEffect(() => {
    let live = true;
    fetchPastResults(eventId).then((r) => { if (live) setData(r); }).catch(() => { if (live) setFailed(true); });
    loadBrandMark().then((m) => { if (live) setMark(m); });
    return () => { live = false; };
  }, [eventId]);
  const slides = useMemo(() => (data ? data.draws.map((d) => slidesFor(d, data.title, mark, data.roundDeadlines)) : []), [data, mark]);

  return (
    <Sheet onClose={onClose} title={data?.title ?? 'Past tournament'} maxWidthClassName="max-w-lg">
      <div className="p-4 pt-1 space-y-6">
        {!signedIn && data && (
          <p className="text-sm text-fg/70">
            <Link to="/login" className="font-semibold text-clay underline underline-offset-2">Log in</Link> to reveal player names.
          </p>
        )}
        {failed ? (
          <p className="text-sm text-fg/70 text-center py-10">Results for this tournament aren't available.</p>
        ) : !data ? (
          <div className="aspect-[4/5] rounded-2xl bg-fg/5 animate-pulse" />
        ) : data.draws.map((d, i) => (
          <section key={d.key} className="space-y-3">
            <h3 className="text-lg font-bold text-fg">{drawName(d)}</h3>
            {slides[i]?.length > 0 && (
              <EventCarousel count={slides[i].length} fullBleed={false} alwaysPager itemLabel="picture">
                {slides[i].map((s) => (
                  <img key={s.id} src={`data:image/svg+xml;utf8,${encodeURIComponent(s.svg)}`} alt={s.label}
                    className="w-full rounded-2xl border border-fg/10" />
                ))}
              </EventCarousel>
            )}
          </section>
        ))}
        {signedIn && data && (
          <Link to={`/matches?mode=tournament&event=${eventId}`} className={`w-full ${buttonCls('secondary')}`}>
            Open every draw
          </Link>
        )}
      </div>
    </Sheet>
  );
};

// ─── Organizer header ─────────────────────────────────────────────────────────────────────────

// One "Manage Draw" button opening a bottom sheet of every organizer action.
// Non-creators never render this (also gated at the call site).
export const TournamentHeader: React.FC<{
  isCreator: boolean;
  hasMatches: boolean;
  isProcessing: boolean;
  editMode: boolean;
  started: boolean;
  mensSkillMerge: SkillMergePair | null;
  womensSkillMerge: SkillMergePair | null;
  consolidateDoubles: boolean;
  currentDrawFormat: TournamentFormat;
  onGenerateMatches: () => void;
  onCancelMatches: () => void;
  onToggleEdit: () => void;
  onSetMensSkillMerge: (pair: SkillMergePair | null) => void;
  onSetWomensSkillMerge: (pair: SkillMergePair | null) => void;
  onToggleConsolidateDoubles: () => void;
  zoneDrawsEnabled: boolean;
  onOpenZoneConfig: () => void;
}> = ({
  isCreator, hasMatches, isProcessing, editMode, started,
  mensSkillMerge, womensSkillMerge, consolidateDoubles,
  currentDrawFormat,
  onGenerateMatches, onCancelMatches, onToggleEdit,
  onSetMensSkillMerge, onSetWomensSkillMerge, onToggleConsolidateDoubles,
  zoneDrawsEnabled, onOpenZoneConfig,
}) => {
  const [open, setOpen] = useState(false);
  // Collapsed by default so the sheet stays compact instead of listing every pair up front.
  const [expandedMerge, setExpandedMerge] = useState<'mens' | 'womens' | null>(null);

  if (!isCreator) return null;

  const canMerge = !started && (currentDrawFormat === 'knockout' || currentDrawFormat === 'rr');
  // Only adjacent pairs, or all three — Beginners+Masters skipping Challengers is never offered.
  const MERGE_PAIR_OPTIONS: { label: string; pair: SkillMergePair }[] = [
    { label: 'All (Beginners + Challengers + Masters)', pair: 'Beginners+Challengers+Masters' },
    { label: 'Beginners + Challengers', pair: 'Beginners+Challengers' },
    { label: 'Challengers + Masters', pair: 'Challengers+Masters' },
  ];
  const mergeSections = [
    { key: 'mens' as const, label: "Merge Men's Singles", current: mensSkillMerge, onSet: onSetMensSkillMerge },
    { key: 'womens' as const, label: "Merge Women's Singles", current: womensSkillMerge, onSet: onSetWomensSkillMerge },
  ];

  const Row: React.FC<{
    icon: React.ReactNode; label: string; hint?: string; danger?: boolean; active?: boolean;
    onClick: () => void; busy?: boolean;
  }> = ({ icon, label, hint, danger, active, onClick, busy }) => (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      className={`w-full flex items-center gap-4 rounded-2xl border px-4 py-3.5 text-left transition-colors disabled:opacity-50 ${
        active
          ? 'border-clay/50 bg-clay/10'
          : danger
            ? 'border-red-500/25 bg-red-500/5 hover:border-red-500/50'
            : 'border-fg/10 bg-fg/5 hover:border-fg/30'
      }`}
    >
      <span className={`w-9 h-9 rounded-2xl flex items-center justify-center shrink-0 ${
        danger ? 'bg-red-500/15 text-badge-loss' : active ? 'bg-clay/20 text-clay' : 'bg-fg/5 text-fg/70'
      }`}>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block text-sm font-bold ${danger ? 'text-badge-loss' : 'text-fg'}`}>{label}</span>
        {hint && <span className="block text-xs text-fg/70 mt-0.5">{hint}</span>}
      </span>
      {active && <span className="text-xs font-black uppercase tracking-wide text-clay shrink-0">On</span>}
    </button>
  );

  return (
    <div className="mb-8">
      <Button variant="white" onClick={() => setOpen(true)} className="w-full sm:w-auto">
        <Settings2 className="w-4 h-4" />Manage Draw
      </Button>

      {open && (
        <Sheet onClose={() => setOpen(false)} title="Manage Draw" maxWidthClassName="max-w-md">
          <div className="p-6 pt-3 space-y-2.5">
            {/* Download Draw used to sit here. It moved to View Draw under the selector,
                where players can reach it too. */}
            {hasMatches ? (
              <Row
                icon={<XCircle className="w-4 h-4" />}
                label="Cancel Matches"
                hint="Delete this draw's generated matches"
                danger
                busy={isProcessing}
                onClick={() => { onCancelMatches(); setOpen(false); }}
              />
            ) : (
              <Row
                icon={<Play className="w-4 h-4" />}
                label="Generate Matches"
                hint="Lock the draw in and create matches"
                busy={isProcessing}
                onClick={() => { onGenerateMatches(); setOpen(false); }}
              />
            )}
            <Row
              icon={editMode ? <X className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
              label={editMode ? 'Done Editing' : 'Edit Draw'}
              hint={editMode ? undefined : 'Reassign players, set draw size'}
              active={editMode}
              onClick={() => { onToggleEdit(); setOpen(false); }}
            />
            {canMerge && (
              <Row
                icon={<Settings2 className="w-4 h-4" />}
                label="Zone Draws"
                hint={zoneDrawsEnabled ? 'Split by zone — tap to edit' : 'Split this draw by geographic zone'}
                active={zoneDrawsEnabled}
                onClick={() => { onOpenZoneConfig(); setOpen(false); }}
              />
            )}
            {canMerge && (
              <>
                <p className="text-xs font-bold uppercase tracking-widest text-fg/70 pt-2">Merge Draws</p>
                {mergeSections.map((section) => {
                  const isExpanded = expandedMerge === section.key;
                  return (
                    <React.Fragment key={section.key}>
                      <Row
                        icon={<Settings2 className="w-4 h-4" />}
                        label={section.label}
                        hint={section.current ? section.current.split('+').join(' + ') : 'Tap to choose which levels to merge'}
                        active={!!section.current}
                        onClick={() => setExpandedMerge(isExpanded ? null : section.key)}
                      />
                      {isExpanded && (
                        <div className="ml-4 pl-3 border-l-2 border-fg/10 space-y-2">
                          {MERGE_PAIR_OPTIONS.map((opt) => {
                            const active = section.current === opt.pair;
                            return (
                              <Row
                                key={opt.pair}
                                icon={<Settings2 className="w-3.5 h-3.5" />}
                                label={opt.label}
                                hint={active ? 'Tap to unmerge' : undefined}
                                active={active}
                                onClick={() => { section.onSet(active ? null : opt.pair); setOpen(false); setExpandedMerge(null); }}
                              />
                            );
                          })}
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}
                <Row
                  icon={<Settings2 className="w-4 h-4" />}
                  label="Merge Doubles"
                  hint={consolidateDoubles ? 'Tap to unmerge' : undefined}
                  active={consolidateDoubles}
                  onClick={() => { onToggleConsolidateDoubles(); setOpen(false); }}
                />
              </>
            )}
          </div>
        </Sheet>
      )}
    </div>
  );
};

/**
 * Doubles partner pool: the event's active doubles registrations with no partner, in one division
 * (an organizer sees every division). The server connects pool members, so their contacts become
 * readable; saving a teammate is what leaves the pool.
 */
export type PoolMember = { uid: string; name: string; skill: number };
export const PartnerPoolPanel: React.FC<{
  members: PoolMember[];
  contacts: Record<string, ContactData>;
  viewerUid: string;
}> = ({ members, contacts, viewerUid }) => (
  <section className="mb-6 rounded-2xl bg-fg/5 p-4" aria-label="Partner pool">
    <div className="min-w-0">
      <h2 className="text-sm font-bold text-fg">Partner pool</h2>
      <p className="mt-0.5 text-xs text-fg/70">Players looking for a doubles partner. Contact one to team up.</p>
    </div>
    {members.length === 0 ? (
      <p className="mt-3 text-sm text-fg">Nobody is waiting yet.</p>
    ) : (
      <ul className="mt-3 divide-y divide-fg/10">
        {members.map((m) => {
          const c = contacts[m.uid];
          return (
            <li key={m.uid} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-fg">{formatPlayerName(m.name)}{m.uid === viewerUid ? ' (you)' : ''}</p>
                <p className="text-xs text-fg/70">Skill {Number(m.skill || 0).toFixed(1)}</p>
              </div>
              {c && m.uid !== viewerUid && (
                <ContactOpponentButton
                  name={m.name}
                  phone={c.phone}
                  email={c.email}
                  whatsappContact={c.whatsapp_contact}
                  preferred={c.preferred_mode_of_contact}
                  className="shrink-0"
                />
              )}
            </li>
          );
        })}
      </ul>
    )}
  </section>
);

// ─── Zone court counts ─────────────────────────────────────────────────────────────────────────

/**
 * Courts and sites per zone, shown to players when they pick a zone to move to — the number of
 * courts is the practical reason to prefer one zone over another.
 *
 * A static table rather than a runtime calculation: deriving it needs the full facilities CSV
 * (~174 rows) parsed and every row run through `getZone`, which is a lot of work for a number
 * that only moves when the City publishes new court data.
 *
 * REGENERATE when `public/Tennis Courts Facilities - 4326.csv` or the zone boundaries in
 * `zones.ts` change — sum the CSV's `Courts` column per `getZone(lat, lng)`.
 * Last generated: 628 courts across 182 sites.
 */
const ZONE_COURT_COUNTS: Record<ZoneName, { courts: number; sites: number }> = {
  'York West': { courts: 90, sites: 30 },
  'Etobicoke': { courts: 93, sites: 29 },
  'Etobicoke - Lakeshore': { courts: 72, sites: 24 },
  'North York': { courts: 118, sites: 34 },
  'Downtown - Midtown': { courts: 88, sites: 19 },
  'North Scarborough': { courts: 89, sites: 26 },
  'East York and South Scarborough': { courts: 78, sites: 20 },
};

// ─── Add teammate panel ────────────────────────────────────────────────────────────────────────

type AddTeammatePanelProps = {
  currentUserId?: string;
  saving: boolean;
  /** `partnerUid` is null for someone not on the app. */
  onSave: (partnerName: string, partnerUid: string | null, combinedSkill: number | null) => void;
};

/**
 * Shown to a doubles participant whose registration has no partner recorded.
 *
 * This exists because registrations could previously be saved as Singles inside a Doubles event
 * (see the comment in JoinEventSheet) — the partner-name check was keyed on a different value
 * than the one being written, so it never fired and those signups landed with an empty partner.
 * Rather than making those players register again, they finish the pairing here.
 *
 * The skill field only appears for a partner who isn't on the app: a member's rating comes from
 * their own profile, so asking someone else to estimate it would be worse data.
 */
export const AddTeammatePanel: React.FC<AddTeammatePanelProps> = ({ currentUserId, saving, onSave }) => {
  const [pick, setPick] = useState<MemberPick | null>(null);
  const [skill, setSkill] = useState('');
  const [error, setError] = useState('');

  const isGuest = !!pick && pick.memberId === null;

  const submit = () => {
    if (!pick) { setError('Please choose your teammate.'); return; }
    const name = pick.name.trim();
    // Same rules the join form applies, so both paths produce identical data.
    if (name.length < 3 || name.length > 80) { setError('Teammate name must be 3–80 characters.'); return; }
    if (/\d/.test(name)) { setError('Teammate name cannot contain numbers.'); return; }

    let combined: number | null = null;
    if (isGuest) {
      const n = Number(skill);
      if (!skill.trim() || !Number.isFinite(n) || n < 1 || n > 5) {
        setError('Enter your teammate’s skill level between 1 and 5.');
        return;
      }
      combined = n;
    }
    setError('');
    onSave(name, pick.memberId ?? null, combined);
  };

  return (
    <div className="mb-6 rounded-2xl bg-fg/5 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Users className="w-4 h-4 text-clay shrink-0" />
        <div>
          <p className="text-sm font-bold text-fg">Add your teammate</p>
          <p className="text-xs text-fg">
            You’re registered for doubles but we don’t have your partner yet.
          </p>
        </div>
      </div>

      <MemberSearchInput
        label="Teammate"
        value={pick}
        onChange={(p) => { setPick(p); setError(''); }}
        excludeId={currentUserId}
        allowGuest
        placeholder="Search for your teammate…"
        hint="Not on the app yet? Type their full name and pick “not on the app”."
      />

      {isGuest && (
        <div className="space-y-1.5">
          <label className="block text-xs font-bold text-fg uppercase tracking-widest" htmlFor="tm-skill">
            Their skill level (1–5)
          </label>
          <input
            id="tm-skill"
            type="number"
            min={1}
            max={5}
            step={0.5}
            value={skill}
            onChange={(e) => setSkill(e.target.value)}
            placeholder="e.g. 3.5"
            className="border border-fg/25 w-full rounded-2xl bg-tennis-dark/70 px-3 py-2.5 text-sm text-fg outline-none focus:border-clay"
          />
        </div>
      )}

      {error && <p className="text-xs text-badge-loss">{error}</p>}

      <Button variant="clay" isLoading={saving} onClick={submit} className="w-full">
        Save teammate
      </Button>
    </div>
  );
};

// ─── Add player panel ──────────────────────────────────────────────────────────────────────────

type AvailableUser = { id: string; name: string; email: string };

type AddPlayerPanelProps = {
  availableUsers: AvailableUser[];
  currentDraw: DrawConfig | undefined;
  onAdd: (userId: string, partnerName?: string, divisionOverride?: string) => Promise<void>;
};


export const AddPlayerPanel: React.FC<AddPlayerPanelProps> = ({
  availableUsers, currentDraw, onAdd,
}) => {
  const [selectedUserId, setSelectedUserId] = useState('');
  const [partnerName, setPartnerName] = useState('');
  const [divisionOverride, setDivisionOverride] = useState("Men's");
  const [adding, setAdding] = useState(false);

  if (!currentDraw) return null;

  const isDoubles = currentDraw.tournamentChoice === 'Doubles';
  const needsDivisionPicker = currentDraw.division === 'All';

  const handleAdd = async () => {
    if (!selectedUserId) return;
    setAdding(true);
    try {
      await onAdd(
        selectedUserId,
        isDoubles && partnerName ? partnerName : undefined,
        needsDivisionPicker ? divisionOverride : undefined,
      );
      setSelectedUserId('');
      setPartnerName('');
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="mb-6 rounded-2xl bg-tennis-surface/40 p-4">
      <div className="flex items-center gap-2 mb-4">
        <UserPlus className="w-4 h-4 text-clay" />
        <span className="text-sm font-bold text-fg uppercase tracking-widest">Add Player</span>
      </div>

      <div className="flex flex-wrap items-end gap-3">
          <SelectField
            title="Add Player"
            value={selectedUserId}
            placeholder="Select player…"
            searchable
            options={[
              { value: PLAYER_LOADING_SENTINEL, label: PLAYER_LOADING },
              ...availableUsers.map((u) => ({ value: u.id, label: u.name || '', hint: u.email || undefined })),
            ]}
            onChange={setSelectedUserId}
            className="flex-1 min-w-[200px]"
          />

          {needsDivisionPicker && (
            <SelectField
              title="Division"
              value={divisionOverride}
              options={DOUBLES_DIVISIONS}
              onChange={setDivisionOverride}
              className="w-auto"
            />
          )}

          {isDoubles && (
            <input
              value={partnerName}
              onChange={(e) => setPartnerName(e.target.value)}
              placeholder="Partner name…"
              className="border border-fg/25 flex-1 min-w-[160px] px-3 py-2 rounded-2xl bg-tennis-surface/60 text-sm text-fg placeholder-fg/70 outline-none focus:border-clay/50 transition-colors"
            />
          )}

          <Button onClick={handleAdd} disabled={!selectedUserId} isLoading={adding} size="md">
            <UserPlus className="w-4 h-4" />
            Add
          </Button>
        </div>
    </div>
  );
};

// ── Withdraw yourself (under Your Match) ──────────────────────────────────────
export const WithdrawSelf: React.FC<{ onWithdraw: (reason: RemovalReason) => Promise<void> }> = ({ onWithdraw }) => {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!asking) {
    return (
      <div className="-mt-4 mb-6 flex justify-end px-2">
        <button
          type="button"
          onClick={() => setAsking(true)}
          className="inline-flex items-center gap-1.5 rounded-2xl px-2 py-1.5 text-xs text-fg/70 hover:text-badge-loss focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clay"
        >
          <Trash2 className="h-3.5 w-3.5" /> Withdraw
        </button>
      </div>
    );
  }
  return (
    <div className="-mt-4 mb-6">
      <WithdrawReasons
        prompt="Withdraw from this event? Why?"
        note="Your opponents get a walkover in matches still to play. You can join again from Events."
        busy={busy}
        onPick={async (reason) => {
          setBusy(true);
          try { await onWithdraw(reason); } finally { setBusy(false); setAsking(false); }
        }}
        onCancel={() => setAsking(false)}
      />
    </div>
  );
};

/** Trash button that asks twice instead of window.confirm: the first tap turns it into "Sure?". */
export const RemoveTap: React.FC<{ name: string; className: string; onRemove: () => void }> = ({ name, className, onRemove }) => {
  const [armed, tap] = useTwoTap();
  return (
    <button
      type="button"
      aria-label={armed ? `Confirm removing ${name} from the draw` : `Remove ${name} from the draw`}
      title={armed ? "Tap again: matches played stay, future opponents get a walkover" : "Remove from draw"}
      onClick={() => tap(onRemove)}
      className={`${className}${armed ? " text-badge-loss bg-red-500/10 !opacity-100" : ""}`}
    >
      {armed ? <span className="px-1 text-xs font-bold">Sure?</span> : <Trash2 className="w-3.5 h-3.5" />}
    </button>
  );
};
