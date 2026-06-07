import React from 'react';
import { Trophy } from 'lucide-react';
import { Button } from '../../components/Button';
import { RRStandingRow, ScoreSubmission, TournamentMatch, TournamentPlayer } from './types';
import { RRGroupCard } from './RRGroupCard';
import { BracketView } from './BracketView';
import { BracketErrorBoundary } from './BracketErrorBoundary';

type Props = {
  groups: TournamentPlayer[][];
  standingsByGroup: RRStandingRow[][];
  groupMatches: TournamentMatch[];
  knockoutMatches: TournamentMatch[];
  advancementCount: number;
  isCreator: boolean;
  editMode: boolean;
  editPlayers: TournamentPlayer[];
  onEditPlayer: (matchId: string, slot: 'player_1' | 'player_2', player: TournamentPlayer | null) => void;
  onSubmitScore: (match: TournamentMatch) => void;
  submissions: ScoreSubmission[];
  rrKnockoutReady: boolean;
  generatingKnockout: boolean;
  onGenerateKnockout: () => void;
  roundDeadlines?: Record<string, string>;
  onUpdateDeadline?: (round: string, date: string) => void;
};

export const RoundRobinView: React.FC<Props> = ({
  groups, standingsByGroup, groupMatches, knockoutMatches,
  advancementCount, isCreator, editMode, editPlayers,
  onEditPlayer, onSubmitScore, submissions,
  rrKnockoutReady, generatingKnockout, onGenerateKnockout,
  roundDeadlines, onUpdateDeadline,
}) => {
  if (groups.length === 0) return null;

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
              players={players}
              matches={groupMatches.filter((m) => (m.rr_group ?? 0) === gi)}
              standings={standingsByGroup[gi] ?? []}
              advancementCount={advancementCount}
              isCreator={isCreator}
              editMode={editMode}
              editPlayers={editPlayers}
              onEditPlayer={onEditPlayer}
              onSubmitScore={onSubmitScore}
              submissions={submissions}
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
              editMode={false}
              editPlayers={[]}
              onEditPlayer={() => {}}
              submissions={submissions}
              isCreator={isCreator}
              onSubmitScore={onSubmitScore}
              roundDeadlines={roundDeadlines}
              onUpdateDeadline={onUpdateDeadline}
            />
          </BracketErrorBoundary>
        </div>
      )}
    </div>
  );
};
