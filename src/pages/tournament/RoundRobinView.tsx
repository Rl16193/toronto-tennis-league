import React from 'react';
import { Trophy } from 'lucide-react';
import { Button } from '../../components/Button';
import { RRStandingRow, TournamentMatch, TournamentPlayer } from './types';
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
  currentUserId?: string;
  pendingMatchIds?: Set<string>;
  onSaveGroupEdit: (rrGroup: number, newPlayers: TournamentPlayer[]) => void;
  onMoveRRPlayer?: (fromRRGroup: number, toRRGroup: number, newFromPlayers: TournamentPlayer[], newToPlayers: TournamentPlayer[]) => void;
  rrKnockoutReady: boolean;
  generatingKnockout: boolean;
  onGenerateKnockout: () => void;
  roundDeadlines?: Record<string, string>;
  onUpdateDeadline?: (round: string, date: string) => void;
};

export const RoundRobinView: React.FC<Props> = ({
  groups, groupLabels, groupIndices, standingsByGroup, groupMatches, knockoutMatches,
  advancementCount, isCreator, isParticipant, isPastEvent, editMode, editPlayers,
  onEditPlayer, onSubmitScore, currentUserId, pendingMatchIds, onSaveGroupEdit, onMoveRRPlayer,
  rrKnockoutReady, generatingKnockout, onGenerateKnockout,
  roundDeadlines, onUpdateDeadline,
}) => {
  if (groups.length === 0) return null;

  // All players across all groups (for reassignment dropdowns in edit mode)
  const allGroupPlayers = groups.flat();

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
              currentUserId={currentUserId}
              pendingMatchIds={pendingMatchIds}
              // Translate the card's array position (gi) to the real rr_group value so
              // saves target the correct group even when indices are non-contiguous.
              onSaveGroupEdit={(_, newPlayers) => onSaveGroupEdit(groupIndices?.[gi] ?? gi, newPlayers)}
              // Other groups this card's players can be moved into (positional letter + index).
              groupTargets={onMoveRRPlayer
                ? groups.map((_, ti) => ({ gi: ti, label: groupLabels[ti] ?? `Group ${String.fromCharCode(65 + ti)}` })).filter((t) => t.gi !== gi)
                : []}
              onMovePlayer={onMoveRRPlayer
                ? (player, toGi) => {
                    const newFrom = players.filter((p) => p.user_id !== player.user_id);
                    const newTo = [...groups[toGi], player];
                    onMoveRRPlayer(groupIndices?.[gi] ?? gi, groupIndices?.[toGi] ?? toGi, newFrom, newTo);
                  }
                : undefined}
            />
          ))}
        </div>

        {/* Generate knockout button */}
        {isCreator && rrKnockoutReady && knockoutMatches.length === 0 && (
          <div className="mt-6 flex justify-center">
            <Button onClick={onGenerateKnockout} isLoading={generatingKnockout}>
              <Trophy className="w-4 h-4 mr-2" />
              Generate Knockout Stage
            </Button>
          </div>
        )}
      </div>

      {/* Knockout stage */}
      {knockoutMatches.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-widest text-white/40 font-bold mb-4">Knockout Stage</p>
          <BracketErrorBoundary onDownload={() => {}}>
            <BracketView
              matches={knockoutMatches}
              drawTitle="Knockout"
              editMode={editMode}
              editPlayers={editMode ? editPlayers : []}
              onEditPlayer={onEditPlayer}
              isCreator={isCreator}
              onSubmitScore={onSubmitScore}
              currentUserId={currentUserId}
              pendingMatchIds={pendingMatchIds}
              roundDeadlines={roundDeadlines}
              onUpdateDeadline={onUpdateDeadline}
            />
          </BracketErrorBoundary>
        </div>
      )}
    </div>
  );
};
