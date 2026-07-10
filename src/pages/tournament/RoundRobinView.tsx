import React, { useState } from 'react';
import { Trophy, Plus } from 'lucide-react';
import { Button } from '../../components/Button';
import { RRStandingRow, TournamentMatch, TournamentPlayer } from './types';
import { formatPlayerName } from './utils';
import { RRGroupCard } from './RRGroupCard';
import { BracketView } from './BracketView';
import { BracketErrorBoundary } from './BracketErrorBoundary';

type Props = {
  groups: TournamentPlayer[][];
  groupLabels: string[];
  groupIndices?: number[];
  standingsByGroup: RRStandingRow[][];
  groupMatches: TournamentMatch[];
  knockoutMatches: TournamentMatch[];
  advancementCount: number;
  isCreator: boolean;
  isParticipant: boolean;
  isPastEvent: boolean;
  editMode: boolean;
  editPlayers: TournamentPlayer[];
  onEditPlayer: (matchId: string, slot: 'player_1' | 'player_2', player: TournamentPlayer | null) => void;
  onSubmitScore: (match: TournamentMatch) => void;
  submittableMatchIds?: Set<string>;
  pendingMatchIds?: Set<string>;
  onSaveGroupEdit: (rrGroup: number, newPlayers: TournamentPlayer[]) => void;
  onRenameGroup?: (rrGroup: number, label: string) => void;
  onCreateGroup?: (players: TournamentPlayer[], label?: string) => void;
  unplacedPlayers?: TournamentPlayer[];
  rrKnockoutReady: boolean;
  generatingKnockout: boolean;
  onGenerateKnockout: (size?: number) => void;
  rrView: 'groups' | 'knockout';
  roundDeadlines?: Record<string, string>;
  onUpdateDeadline?: (round: string, date: string) => void;
};

// Creator control in the Knockout tab: pick a round size (R4/R8/R16) to build/rebuild the bracket.
const KnockoutSizeBar: React.FC<{
  currentSize?: number;
  generating: boolean;
  onSelect: (size: number) => void;
}> = ({ currentSize, generating, onSelect }) => (
  <div className="mb-5 flex flex-wrap items-center gap-3">
    <span className="text-sm font-bold text-white uppercase tracking-widest">Knockout round size</span>
    {[4, 8, 16].map((size) => (
      <button
        key={size}
        disabled={generating}
        onClick={() => onSelect(size)}
        className={`px-4 py-1.5 rounded-xl text-sm font-bold transition-colors ${
          currentSize === size ? 'bg-clay text-white' : 'bg-tennis-surface/60 text-white hover:text-white'
        } ${generating ? 'opacity-60 cursor-not-allowed' : ''}`}
      >
        R{size}
      </button>
    ))}
    <span className="text-xs text-white/50">Group winners are seeded automatically — place the rest with Edit Draw.</span>
  </div>
);

// Creator-only inline form to spin up a new group from unplaced players.
const AddGroupForm: React.FC<{
  unplacedPlayers: TournamentPlayer[];
  onCreateGroup: (players: TournamentPlayer[], label?: string) => void;
}> = ({ unplacedPlayers, onCreateGroup }) => {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = (uid: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(uid) ? next.delete(uid) : next.add(uid);
      return next;
    });

  const submit = () => {
    const chosen = unplacedPlayers.filter((p) => selected.has(p.user_id));
    onCreateGroup(chosen, name.trim() || undefined);
    setOpen(false);
    setName('');
    setSelected(new Set());
  };

  if (!open) {
    return (
      <div className="mt-4 flex justify-center">
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          <Plus className="w-4 h-4 mr-1.5" />
          Add Group
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-2xl border border-white/10 bg-tennis-surface/30 p-4 space-y-3">
      <p className="text-[10px] font-bold uppercase tracking-widest text-white/40">New Group</p>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Group name (optional)"
        className="w-full bg-tennis-surface border border-white/10 rounded px-2 py-1.5 text-white text-xs"
      />
      {unplacedPlayers.length > 0 ? (
        <div className="max-h-48 overflow-y-auto space-y-1">
          {unplacedPlayers.map((p) => (
            <label key={p.user_id} className="flex items-center gap-2 text-white/80 text-xs cursor-pointer">
              <input type="checkbox" checked={selected.has(p.user_id)} onChange={() => toggle(p.user_id)} className="accent-clay" />
              {formatPlayerName(p.name)}
            </label>
          ))}
        </div>
      ) : (
        <p className="text-xs text-white/40">
          No unplaced players. You can still create an empty group and use &quot;Add player...&quot; inside a group card to move players in.
        </p>
      )}
      <div className="flex gap-2 pt-1">
        <Button variant="outline" size="sm" onClick={() => { setOpen(false); setSelected(new Set()); setName(''); }} className="flex-1">
          Cancel
        </Button>
        <Button size="sm" onClick={submit} className="flex-1">
          Create
        </Button>
      </div>
    </div>
  );
};

export const RoundRobinView: React.FC<Props> = ({
  groups, groupLabels, groupIndices, standingsByGroup, groupMatches, knockoutMatches,
  advancementCount, isCreator, isParticipant, isPastEvent, editMode, editPlayers,
  onEditPlayer, onSubmitScore, submittableMatchIds, pendingMatchIds, onSaveGroupEdit,
  onRenameGroup, onCreateGroup, unplacedPlayers,
  rrKnockoutReady, generatingKnockout, onGenerateKnockout, rrView,
  roundDeadlines, onUpdateDeadline,
}) => {
  if (groups.length === 0) return null;

  // All players across all groups + unplaced pool (for reassignment / Add Player dropdowns).
  // In edit mode, use editPlayers (skill-group: All) so the creator can pull cross-skill players
  // (e.g. a Challengers-level player into a Masters group) that wouldn't appear in the
  // skill-filtered unplaced pool.
  const allGroupPlayers = editMode && editPlayers.length > 0
    ? editPlayers
    : [...groups.flat(), ...(unplacedPlayers ?? [])];

  // Knockout view (3rd-level tab): size selector + the bracket, or a prompt to build it.
  if (rrView === 'knockout') {
    return (
      <div>
        {isCreator && (
          <KnockoutSizeBar
            currentSize={knockoutMatches[0]?.drawsize}
            generating={generatingKnockout}
            onSelect={onGenerateKnockout}
          />
        )}
        {knockoutMatches.length > 0 ? (
          <BracketErrorBoundary onDownload={() => {}}>
            <BracketView
              matches={knockoutMatches}
              drawTitle="Knockout"
              editMode={editMode}
              editPlayers={editMode ? editPlayers : []}
              onEditPlayer={onEditPlayer}
              isCreator={isCreator}
              onSubmitScore={onSubmitScore}
              submittableMatchIds={submittableMatchIds}
              pendingMatchIds={pendingMatchIds}
              roundDeadlines={roundDeadlines}
              onUpdateDeadline={onUpdateDeadline}
            />
          </BracketErrorBoundary>
        ) : (
          <div className="rounded-2xl border border-white/10 bg-tennis-surface/20 p-8 text-center">
            <p className="text-sm text-white/60">
              {isCreator ? 'Pick a round size above to build the knockout bracket.' : 'The knockout bracket has not been set up yet.'}
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Group stage */}
      <div>
        <p className="text-xs uppercase tracking-widest text-white/40 font-bold mb-4">Group Stage</p>
        <div className={`grid gap-4 ${groups.length >= 2 ? 'sm:grid-cols-2' : ''}`}>
          {groups.map((players, gi) => (
            <RRGroupCard
              key={gi}
              groupIndex={gi}
              groupLabel={groupLabels[gi] ?? `Group ${String.fromCharCode(65 + gi)}`}
              players={players}
              matches={groupMatches.filter((m) => {
                const ids = new Set(players.map((p) => p.user_id));
                return ids.has(m.player_1_user_id) || ids.has(m.player_2_user_id);
              })}
              standings={standingsByGroup[gi] ?? []}
              advancementCount={advancementCount}
              isCreator={isCreator}
              isParticipant={isParticipant}
              isPastEvent={isPastEvent}
              editMode={editMode}
              editPlayers={editPlayers}
              allGroupPlayers={allGroupPlayers}
              onEditPlayer={onEditPlayer}
              onSubmitScore={onSubmitScore}
              submittableMatchIds={submittableMatchIds}
              pendingMatchIds={pendingMatchIds}
              // Translate the card's array position (gi) to the real rr_group value so
              // saves/renames target the correct group even when indices are non-contiguous.
              onSaveGroupEdit={(_, newPlayers) => onSaveGroupEdit(groupIndices?.[gi] ?? gi, newPlayers)}
              onRenameGroup={onRenameGroup ? (label) => onRenameGroup(groupIndices?.[gi] ?? gi, label) : undefined}
            />
          ))}
        </div>

        {/* Add a new group (creator, edit mode) */}
        {isCreator && editMode && onCreateGroup && (
          <AddGroupForm unplacedPlayers={unplacedPlayers ?? []} onCreateGroup={onCreateGroup} />
        )}
      </div>
    </div>
  );
};
