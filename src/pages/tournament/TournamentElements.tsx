import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronUp,
  Download,
  Pencil,
  Play,
  Settings2,
  X,
  XCircle,
} from 'lucide-react';
import { Button } from '../../components/Button';
import { Sheet } from '../../components/Sheet';
import { SegmentedControl } from '../../components/SegmentedControl';
import { Tree, TreeGroup, TreeRow } from '../../components/Tree';
import { EventParticipant } from '../../types';
import { ZONE_NAMES, ZoneName } from '../../utils/zones';
import { ZONE_COURT_COUNTS } from '../../utils/zoneCourtCounts';
import { pillButtonCls } from '../../components/ContactOpponentButton';
import {
  DrawConfig,
  DrawTab,
  OpenDrawSlot,
  RRConfig,
  ScheduleRequest,
  ScoreSubmissionDoc,
  SkillGroup,
  SkillMergePair,
  TournamentFormat,
  TournamentMatch,
  UnplacedEntry,
  ZoneDrawConfig,
} from './types';
import { formatPlayerName, formatScheduledDate, formatSetScores, getScheduleState, zoneBucketFor } from './utils';

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
        <div className="rounded-[2rem] bg-red-500/10 border border-red-500/20 p-10 text-center space-y-4">
          <AlertCircle className="w-10 h-10 text-badge-loss mx-auto" />
          <p className="text-fg font-bold text-lg">Failed to load the bracket.</p>
          <p className="text-fg text-sm">Download the draw to view it offline.</p>
          <Button variant="outline" onClick={this.props.onDownload}>
            <Download className="w-4 h-4 mr-2" />
            Download Draw
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Player-facing zone controls ──────────────────────────────────────────────────────────────

// Flags the participant doc only; the organizer actions the move from ZoneChangeRequestsPanel.
export const RequestZoneChangeButton: React.FC<{
  requested: boolean;
  onRequest: () => void;
}> = ({ requested, onRequest }) => {
  if (requested) {
    return <span className={`${pillButtonCls('sm', 'outline')} opacity-60 pointer-events-none`}>Request sent</span>;
  }
  return (
    <button type="button" className={pillButtonCls('sm', 'outline')} onClick={onRequest}>
      Request Zone Change
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
          You&apos;re currently in <span className="font-bold text-fg">{currentZone || 'no zone'}</span>. Pick the zone
          you&apos;d like to play in — the organizer reviews every request.
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
                  isPicked
                    ? 'bg-clay/15 border border-clay/50'
                    : isCurrent
                      ? 'bg-fg/[0.03] opacity-50 cursor-not-allowed'
                      : 'bg-fg/5 hover:bg-fg/[0.08] border border-transparent'
                }`}
              >
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-fg truncate">{z}</span>
                  <span className="block text-[11px] text-fg/70">
                    {ZONE_COURT_COUNTS[z].courts} courts · {ZONE_COURT_COUNTS[z].sites} locations
                  </span>
                </span>
                {isCurrent && (
                  <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-fg/70">Current</span>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button size="sm" onClick={submit} isLoading={saving} disabled={!picked} className="flex-1">
            Request move
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
        {open ? (
          <ChevronUp className="w-4 h-4 text-badge shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-badge shrink-0" />
        )}
      </button>
      {open && <div className="px-4 pb-3">{children}</div>}
    </div>
  );
};

const ScheduleRequestRow: React.FC<{
  match: ScheduleRequest;
  onSet: (m: TournamentMatch, date: string, slot: 'AM' | 'PM') => void;
}> = ({ match, onSet }) => {
  const [date, setDate] = useState(match.proposed_date ?? '');
  const [slot, setSlot] = useState<'AM' | 'PM'>(match.proposed_slot ?? 'AM');
  return (
    <div className="flex flex-wrap items-center gap-2 py-2 border-b border-fg/5 last:border-0">
      <span className="flex-1 min-w-[140px]">
        <span className="block text-sm text-fg">
          {formatPlayerName(match.player_1_name)} vs {formatPlayerName(match.player_2_name)}
        </span>
        {!!match.event_title && <span className="block text-[11px] text-fg/70 truncate">{match.event_title}</span>}
      </span>
      <input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        className="border border-fg/25 rounded-lg bg-tennis-surface px-2 py-1.5 text-fg text-xs"
      />
      <div className="flex rounded-lg overflow-hidden">
        {(['AM', 'PM'] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSlot(s)}
            className={`px-3 py-1.5 text-xs font-bold ${slot === s ? 'bg-clay text-white' : 'bg-white text-ink'}`}
          >
            {s}
          </button>
        ))}
      </div>
      <Button size="sm" className="px-3" onClick={() => onSet(match, date, slot)} disabled={!date}>
        Set
      </Button>
    </div>
  );
};

// Creator-only, and spans every tournament they run — each row names its tournament.
export const ScheduleRequestsPanel: React.FC<{
  requests: ScheduleRequest[];
  onSetSchedule: (m: TournamentMatch, date: string, slot: 'AM' | 'PM') => void;
}> = ({ requests, onSetSchedule }) => (
  <QueueDropdown title="Scheduling requested" count={requests.length}>
    {requests.map((m) => (
      <ScheduleRequestRow key={m.id} match={m} onSet={onSetSchedule} />
    ))}
  </QueueDropdown>
);

const UnplacedPlayerRow: React.FC<{
  player: UnplacedEntry;
  slots: OpenDrawSlot[];
  onSeat: (uid: string, name: string, matchId: string, slot: 'player_1' | 'player_2') => void;
}> = ({ player, slots, onSeat }) => {
  const [pick, setPick] = useState('');
  // Empty zone means they picked no courts — say so rather than showing the placement default.
  const meta = [
    player.tournamentChoice,
    player.division,
    player.skill ? `skill ${player.skill}` : '',
    player.zone || 'No zone',
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <div className="flex flex-wrap items-center gap-2 py-2 border-b border-fg/5 last:border-0">
      <span className="flex-1 min-w-[140px]">
        <span className="block text-sm text-fg">{formatPlayerName(player.name)}</span>
        {!!player.eventTitle && (
          <span className="block text-[11px] font-semibold text-fg truncate">{player.eventTitle}</span>
        )}
        {!!meta && <span className="block text-[11px] text-fg/70">{meta}</span>}
      </span>
      <select
        value={pick}
        onChange={(e) => setPick(e.target.value)}
        aria-label={`Slot for ${player.name}`}
        className="bg-tennis-surface rounded-lg px-2 py-1.5 text-fg text-xs max-w-[11rem]"
      >
        <option value="">Open slot…</option>
        {slots.map((s) => (
          <option key={`${s.matchId}_${s.slot}`} value={`${s.matchId}_${s.slot}`}>
            {s.label}
          </option>
        ))}
      </select>
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
      <p className="py-2 text-[11px] text-fg/70">
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

// Creator-only queue. Approve pins `zone_override` and clears the request in one write; reject
// only clears it. Changes which draw the player routes to — does not touch matches they're in.
export const ZoneChangeRequestsPanel: React.FC<{
  requests: EventParticipant[];
  buckets?: { id: string; label: string }[];
  onMoveZone?: (participantId: string, bucketId: string) => void;
  /** Approve — move them to the zone they asked for. Only offered when we can resolve it. */
  onApprove?: (participantId: string, newZone: string) => void;
  /** Reject — clear the request, leaving the player where they are. */
  onClear: (participantId: string) => void;
}> = ({ requests, buckets = [], onMoveZone, onApprove, onClear }) => {
  if (requests.length === 0) return null;
  return (
    <div className="mb-6 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
      <p className="text-xs font-bold uppercase tracking-widest text-badge mb-2">
        Zone change requested ({requests.length})
      </p>
      {requests.map((p) => (
        <div key={p.id} className="flex flex-wrap items-center gap-2 py-2 border-b border-fg/5 last:border-0">
          <span className="flex-1 min-w-[140px]">
            <span className="block text-sm text-fg">{formatPlayerName(p.user_name || 'Player')}</span>
            {p.new_zone && <span className="block text-[11px] text-fg/70">wants: {p.new_zone}</span>}
          </span>
          {!!buckets.length && onMoveZone && (
            <select
              value=""
              onChange={(e) => {
                if (e.target.value) onMoveZone(p.id, e.target.value);
              }}
              aria-label={`Move ${formatPlayerName(p.user_name || 'Player')} to a zone`}
              className="text-xs bg-tennis-surface rounded-lg px-2 py-1.5 text-fg cursor-pointer"
            >
              <option value="">Move to zone…</option>
              {buckets.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </select>
          )}
          {/* Hidden when the request carries no target zone — an older request raised before the
              picker existed has nothing to approve into. */}
          {onApprove && p.new_zone && (
            <button
              type="button"
              aria-label={`Approve move to ${p.new_zone}`}
              title={`Approve — move to ${p.new_zone}`}
              onClick={() => onApprove(p.id, p.new_zone!)}
              className="shrink-0 p-2 rounded-lg bg-green-500/10 text-badge-win hover:bg-green-500/20 transition-colors"
            >
              <Check className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            aria-label="Reject zone change"
            title="Reject — leave them in their current zone"
            onClick={() => onClear(p.id)}
            className="shrink-0 p-2 rounded-lg bg-red-500/10 text-badge-loss hover:bg-red-500/20 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
};

export const PendingScoresPanel: React.FC<{
  submissions: ScoreSubmissionDoc[];
  onConfirm: (sub: ScoreSubmissionDoc) => void;
  onReject: (sub: ScoreSubmissionDoc) => void;
}> = ({ submissions, onConfirm, onReject }) => {
  if (submissions.length === 0) return null;

  return (
    <div className="mb-6 rounded-2xl border border-clay/40 bg-clay/[0.06] overflow-hidden">
      <div className="px-4 py-3 border-b border-clay/20 flex items-center gap-2">
        <span className="px-2 py-0.5 rounded-full bg-clay text-white text-[10px] font-bold">{submissions.length}</span>
        <span className="text-sm font-bold text-fg">Pending score{submissions.length !== 1 ? 's' : ''} to confirm</span>
      </div>
      <div className="divide-y divide-white/5">
        {submissions.map((s) => {
          const winnerIsP1 = s.claimed_winner_uid && s.claimed_winner_name === s.player_1_name;
          const scoreStr = s.is_walkover ? 'Walkover' : formatSetScores(s);
          return (
            <div key={s.id} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
              <div className="min-w-0">
                <p className="text-sm text-fg truncate">
                  <span className="text-fg/70 text-xs mr-2">
                    {s.match_round}
                    {s.draw_label ? ` · ${s.draw_label}` : ''}
                  </span>
                  <span className={winnerIsP1 ? 'font-bold text-fg' : ''}>{formatPlayerName(s.player_1_name)}</span>
                  <span className="text-fg/70 mx-1.5">vs</span>
                  <span className={!winnerIsP1 ? 'font-bold text-fg' : ''}>{formatPlayerName(s.player_2_name)}</span>
                </p>
                <p className="text-xs text-fg/70 mt-0.5">
                  {scoreStr && <span className="font-mono mr-2">{scoreStr}</span>}
                  Winner: <span className="text-fg/70">{formatPlayerName(s.claimed_winner_name)}</span>
                  <span className="text-fg/70"> · submitted by {formatPlayerName(s.submitted_by_name)}</span>
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => onConfirm(s)}
                  className="px-3 py-1.5 rounded-lg bg-green-600 text-fg text-xs font-bold hover:bg-green-500 transition-colors"
                >
                  Confirm
                </button>
                <button
                  onClick={() => onReject(s)}
                  className="px-3 py-1.5 rounded-lg border border-fg/15 text-fg/70 text-xs font-bold hover:text-fg hover:border-fg/30 transition-colors"
                >
                  Reject
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ─── Per-match scheduling ─────────────────────────────────────────────────────────────────────

export type ScheduleApi = {
  onAskOrganizer: (match: TournamentMatch) => void;
  onSubmitScore?: (match: TournamentMatch) => void;
  submittableMatchIds?: Set<string>;
};

// One match's scheduling block: status badge, ask-organizer fallback, submit-score, no-show rule.
// Contacting the opponent directly is the primary path; asking the organizer is the fallback.
// The hide* flags let OpponentPanels render individual buttons inline in its own row instead.
export const ScheduleControls: React.FC<{
  match: TournamentMatch;
  api: ScheduleApi;
  hideRule?: boolean;
  hideBadge?: boolean;
  /** The ask-organizer button is shown inline in the row above instead (OpponentPanels.tsx). */
  hideAskButton?: boolean;
  /** The submit-score button is shown inline in the row above instead (OpponentPanels.tsx). */
  hideSubmitButton?: boolean;
  className?: string;
  /** 'grid-2' lays the action buttons in a 2-column grid instead of flex-wrap */
  buttonLayout?: 'flex' | 'grid-2';
  /** Signed-in user, so a completed match reads "Win"/"Loss" instead of a generic "Completed". */
  viewerUid?: string;
}> = ({
  match,
  api,
  hideRule,
  hideBadge,
  hideAskButton,
  hideSubmitButton,
  className,
  buttonLayout = 'flex',
  viewerUid,
}) => {
  const s = getScheduleState(match);
  const isComplete = match.status === 'complete';

  const badge = isComplete
    ? viewerUid && match.winner_uid
      ? match.winner_uid === viewerUid
        ? { text: 'Win', cls: 'bg-green-500/15 text-badge-win border-green-500/25' }
        : { text: 'Loss', cls: 'bg-red-500/15 text-badge-loss border-red-500/25' }
      : { text: 'Completed', cls: 'bg-green-500/15 text-badge-win border-green-500/25' }
    : s.status === 'scheduled'
      ? {
          text: `Scheduled on ${formatScheduledDate(s.date, s.slot ?? '')}`,
          cls: 'bg-green-500/15 text-badge-win border-green-500/25',
        }
      : { text: 'Unscheduled', cls: 'bg-fg/5 text-fg/70 border-fg/10' };

  const showSubmit =
    !!api.onSubmitScore && !!api.submittableMatchIds?.has(match.id) && !isComplete && !hideSubmitButton;
  const showAsk = !isComplete && !hideAskButton && !s.requested;

  return (
    <div className={className ?? 'mt-3 rounded-2xl bg-tennis-dark/40 p-3 space-y-2.5'}>
      {!hideBadge && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${badge.cls}`}>{badge.text}</span>
          {!isComplete && s.requested && <span className="text-[11px] text-fg/70">Organizer asked to schedule</span>}
        </div>
      )}

      {(showAsk || showSubmit) && (
        <div className={buttonLayout === 'grid-2' ? 'grid grid-cols-2 gap-2' : 'flex flex-wrap gap-2'}>
          {showAsk && (
            <Button size="sm" variant="clay" onClick={() => api.onAskOrganizer(match)}>
              Schedule
            </Button>
          )}
          {showSubmit && (
            <Button size="sm" variant="clay" className="px-3" onClick={() => api.onSubmitScore!(match)}>
              Submit Score
            </Button>
          )}
        </div>
      )}
      {!hideRule && !isComplete && (
        <p className="text-[11px] text-fg/70 leading-snug">
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
  onConfirm: (config: RRConfig) => void;
  onClose: () => void;
}> = ({ playerCount, isConversion = false, isLoading = false, onConfirm, onClose }) => {
  const [convertConfirmed, setConvertConfirmed] = useState(false);
  const canConfirm = playerCount >= 3 && (!isConversion || convertConfirmed);

  return (
    <Sheet onClose={onClose} maxWidthClassName="max-w-md">
      <div className="p-6 space-y-5">
        {/* Header */}
        <div className="pr-10">
          <h2 className="text-lg font-bold text-fg">{isConversion ? 'Convert to Round Robin' : 'Round Robin Setup'}</h2>
        </div>

        {/* Conversion warning */}
        {isConversion && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 space-y-2">
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
          <div className="rounded-xl bg-fg/5 p-3 space-y-1.5 text-sm">
            <p className="text-fg/70 text-xs font-bold uppercase tracking-widest mb-1">How it works</p>
            <p className="text-fg/70">
              Groups are formed automatically by <span className="text-fg">skill band</span> and{' '}
              <span className="text-fg">preferred-court zone</span>, in balanced groups of 3–5.
            </p>
            <p className="text-fg/70">
              Every group winner advances to the knockout, then the best runners-up fill up to the next 4 / 8 /
              16-player bracket.
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
            onClick={() => onConfirm({ advancementCount: 1 })}
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

  // Counted against the zone they'd actually play in, so a merged zone's players show under the target.
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
    Object.entries(merges)
      .filter(([, t]) => t === targetId)
      .map(([s]) => s);
  const labelOf = (id: string) => config.buckets.find((b) => b.id === id)?.label ?? id;
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
            config.enabled ? 'bg-clay/10 border border-clay/50' : 'bg-fg/5 border border-transparent hover:bg-fg/[0.09]'
          }`}
        >
          <span className="min-w-0">
            <span className="block text-sm font-bold text-fg">Split draws by zone</span>
            <span className="block text-xs text-fg/70 mt-0.5">
              {config.enabled ? 'Each zone runs its own draws' : 'One draw per skill, zones ignored'}
            </span>
          </span>
          <span
            className={`text-[10px] font-black uppercase tracking-wide shrink-0 ${config.enabled ? 'text-clay' : 'text-fg/70'}`}
          >
            {config.enabled ? 'On' : 'Off'}
          </span>
        </button>

        {config.enabled && (
          <>
            <p className="text-sm text-fg/70">
              Merge a quiet zone into a neighbour so it doesn&apos;t run a near-empty draw — you can unmerge it again at
              any point before its draws are generated.
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
                  {activeBuckets
                    .filter((b) => b.id !== mergeSource)
                    .map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => {
                          onMerge(mergeSource, b.id);
                          setMergeSource(null);
                        }}
                        className="w-full flex items-center justify-between gap-2 rounded-xl bg-fg/5 hover:bg-fg/[0.09] px-3 py-2 text-left transition-colors"
                      >
                        <span className="text-sm font-semibold text-fg truncate">{b.label}</span>
                        <span className="shrink-0 text-[11px] text-fg/70">{counts.get(b.id) ?? 0} players</span>
                      </button>
                    ))}
                </div>
                <Button size="sm" variant="outline" className="w-full" onClick={() => setMergeSource(null)}>
                  Cancel
                </Button>
              </div>
            )}
          </>
        )}

        <Button variant="clay" className="w-full" onClick={onClose}>
          Done
        </Button>
      </div>
    </Sheet>
  );
};

// ─── Draw selector ────────────────────────────────────────────────────────────────────────────

const TAB_LABEL: Record<DrawTab, string> = {
  mens: "Men's",
  womens: "Women's",
  doubles: 'Doubles',
};
const TAB_ORDER: DrawTab[] = ['mens', 'womens', 'doubles'];

// Division tree. Each draw shows how full it is ("14/16") so a creator can see which divisions
// need players without tapping through. Zone variants stay their own rows.
export const DrawTabs: React.FC<{
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
}> = ({
  currentDraw,
  visibleDraws,
  drawCounts,
  onTabChange,
  onSkillChange,
  onDoublesChange,
  onZoneChange,
  rrView,
  onRRViewChange,
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

  // Strip gender and zone from the label — the parent groups already say them.
  const rowLabel = (d: DrawConfig) => {
    if (d.tab === 'doubles') {
      return d.division !== 'Mixed Doubles' && d.division !== 'All' ? `${d.division} Doubles` : d.label;
    }
    const prefix = `${d.division} `;
    const withoutDivision = d.label.startsWith(prefix) ? d.label.slice(prefix.length) : d.label;
    return withoutDivision.split(' — ')[0];
  };

  // Read off the draw label's " — <zone>" suffix, so the tree needs no zone config passed down.
  const zoneLabel = (d: DrawConfig) => (d.zone ? d.label.split(' — ').slice(1).join(' — ') || d.zone : '');

  const select = (d: DrawConfig) => {
    onTabChange(d.tab);
    if (d.tab === 'doubles') onDoublesChange(d.division);
    else onSkillChange(d.skillGroup);
    onZoneChange(d.zone);
  };

  const tabs = TAB_ORDER.map((tab) => ({ tab, draws: visibleDraws.filter((d) => d.tab === tab) })).filter(
    (g) => g.draws.length > 0,
  );

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
                {/* Gender → Zone → Skill. Un-zoned draws (doubles, pre-zone leftovers) stay direct rows. */}
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
                        {/* Lives in the row it changes, not floating below the whole selector. */}
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
          options={[
            { value: 'groups', label: 'Groups' },
            { value: 'knockout', label: 'Knockout' },
          ]}
          value={rrView}
          onChange={onRRViewChange}
          className="mb-5 max-w-xs"
        />
      )}
    </>
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
  onDownload: () => void;
  onGenerateMatches: () => void;
  onCancelMatches: () => void;
  onToggleEdit: () => void;
  onSetMensSkillMerge: (pair: SkillMergePair | null) => void;
  onSetWomensSkillMerge: (pair: SkillMergePair | null) => void;
  onToggleConsolidateDoubles: () => void;
  zoneDrawsEnabled: boolean;
  onOpenZoneConfig: () => void;
}> = ({
  isCreator,
  hasMatches,
  isProcessing,
  editMode,
  started,
  mensSkillMerge,
  womensSkillMerge,
  consolidateDoubles,
  currentDrawFormat,
  onDownload,
  onGenerateMatches,
  onCancelMatches,
  onToggleEdit,
  onSetMensSkillMerge,
  onSetWomensSkillMerge,
  onToggleConsolidateDoubles,
  zoneDrawsEnabled,
  onOpenZoneConfig,
}) => {
  const [open, setOpen] = useState(false);
  // Collapsed by default so the sheet stays compact instead of listing every pair up front.
  const [expandedMerge, setExpandedMerge] = useState<'mens' | 'womens' | null>(null);

  if (!isCreator) return null;

  const canMerge = !started && (currentDrawFormat === 'bracket' || currentDrawFormat === 'rr');
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
    icon: React.ReactNode;
    label: string;
    hint?: string;
    danger?: boolean;
    active?: boolean;
    onClick: () => void;
    busy?: boolean;
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
      <span
        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
          danger ? 'bg-red-500/15 text-badge-loss' : active ? 'bg-clay/20 text-clay' : 'bg-fg/5 text-fg/70'
        }`}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block text-sm font-bold ${danger ? 'text-badge-loss' : 'text-fg'}`}>{label}</span>
        {hint && <span className="block text-xs text-fg/70 mt-0.5">{hint}</span>}
      </span>
      {active && <span className="text-[10px] font-black uppercase tracking-wide text-clay shrink-0">On</span>}
    </button>
  );

  return (
    <div className="mb-8">
      <Button variant="white" onClick={() => setOpen(true)} className="w-full sm:w-auto">
        <Settings2 className="w-4 h-4 mr-2" />
        Manage Draw
      </Button>

      {open && (
        <Sheet onClose={() => setOpen(false)} title="Manage Draw" maxWidthClassName="max-w-md">
          <div className="p-6 pt-3 space-y-2.5">
            <Row
              icon={<Download className="w-4 h-4" />}
              label="Download Draw"
              hint="Save the current draw as an image"
              onClick={() => {
                onDownload();
                setOpen(false);
              }}
            />
            {hasMatches ? (
              <Row
                icon={<XCircle className="w-4 h-4" />}
                label="Cancel Matches"
                hint="Delete this draw's generated matches"
                danger
                busy={isProcessing}
                onClick={() => {
                  onCancelMatches();
                  setOpen(false);
                }}
              />
            ) : (
              <Row
                icon={<Play className="w-4 h-4" />}
                label="Generate Matches"
                hint="Lock the draw in and create matches"
                busy={isProcessing}
                onClick={() => {
                  onGenerateMatches();
                  setOpen(false);
                }}
              />
            )}
            <Row
              icon={editMode ? <X className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
              label={editMode ? 'Done Editing' : 'Edit Draw'}
              hint={editMode ? undefined : 'Reassign players, set draw size'}
              active={editMode}
              onClick={() => {
                onToggleEdit();
                setOpen(false);
              }}
            />
            {canMerge && (
              <Row
                icon={<Settings2 className="w-4 h-4" />}
                label="Zone Draws"
                hint={zoneDrawsEnabled ? 'Split by zone — tap to edit' : 'Split this draw by geographic zone'}
                active={zoneDrawsEnabled}
                onClick={() => {
                  onOpenZoneConfig();
                  setOpen(false);
                }}
              />
            )}
            {canMerge && (
              <>
                <p className="text-[11px] font-bold uppercase tracking-widest text-fg/70 pt-2">Merge Draws</p>
                {mergeSections.map((section) => {
                  const isExpanded = expandedMerge === section.key;
                  return (
                    <React.Fragment key={section.key}>
                      <Row
                        icon={<Settings2 className="w-4 h-4" />}
                        label={section.label}
                        hint={
                          section.current
                            ? section.current.split('+').join(' + ')
                            : 'Tap to choose which levels to merge'
                        }
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
                                onClick={() => {
                                  section.onSet(active ? null : opt.pair);
                                  setOpen(false);
                                  setExpandedMerge(null);
                                }}
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
                  onClick={() => {
                    onToggleConsolidateDoubles();
                    setOpen(false);
                  }}
                />
              </>
            )}
          </div>
        </Sheet>
      )}
    </div>
  );
};
