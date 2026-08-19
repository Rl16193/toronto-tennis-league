import React, { useMemo } from 'react';
import { TournamentMatch, TournamentPlayer } from './types';
import { PLAYER_LOADING, formatDeadline } from './utils';
import { getRoundLabels } from './bracketImage';
import { MatchCard } from './MatchCard';

const getRoundTone = (round: string) => {
  if (round === 'SF' || round === 'F') return 'bg-clay/10 border-clay/20';
  return 'bg-tennis-dark/40 border-fg/10';
};

const isPlaceholder = (name?: string) => (name || '').toLowerCase().startsWith('winner of ');

export const getRoundState = (roundMatches: TournamentMatch[]): 'preview' | 'loading' | 'started' | 'finished' => {
  const real = roundMatches.filter((m) => !m.id.startsWith('preview_') && !m.id.startsWith('ll_preview_'));
  if (real.length === 0) return 'preview';
  // Any slot still waiting on a previous-round winner → Loading
  if (real.some((m) => isPlaceholder(m.player_1_name) || isPlaceholder(m.player_2_name))) return 'loading';
  // round is "started" once at least one match has both slots filled with real players
  const anyReady = real.some((m) => m.player_1_name !== PLAYER_LOADING && m.player_2_name !== PLAYER_LOADING);
  if (!anyReady) return 'preview';
  if (real.every((m) => !!m.winner_uid)) return 'finished';
  return 'started';
};

type Props = {
  matches: TournamentMatch[];
  drawTitle: string;
  editMode?: boolean;
  editPlayers?: TournamentPlayer[];
  onEditPlayer?: (matchId: string, slot: 'player_1' | 'player_2', player: TournamentPlayer | null) => void;
  onRemovePlayer?: (uid: string) => void;
  isCreator?: boolean;
  onSubmitScore?: (match: TournamentMatch) => void;
  submittableMatchIds?: Set<string>;
  pendingMatchIds?: Set<string>;
  roundDeadlines?: Record<string, string>;
  onUpdateDeadline?: (round: string, date: string) => void;
};

export const BracketView: React.FC<Props> = ({
  matches,
  drawTitle,
  editMode,
  editPlayers = [],
  onEditPlayer,
  onRemovePlayer,
  isCreator,
  onSubmitScore,
  submittableMatchIds,
  pendingMatchIds,
  roundDeadlines = {},
  onUpdateDeadline,
}) => {
  const drawSize = Math.max(8, matches[0]?.drawsize || 8);
  const roundLabels = getRoundLabels(drawSize);

  const rounds = useMemo(
    () =>
      roundLabels.map((round) => ({
        round,
        matches: matches.filter((m) => m.round === round).sort((a, b) => a.position - b.position),
      })),
    [matches, roundLabels],
  );

  return (
    <section className="overflow-x-auto rounded-[2rem] bg-tennis-surface/20 text-fg p-4 md:p-6">
      {editMode && (
        <p className="text-center text-xs text-badge font-semibold mb-4">
          Edit mode — use dropdowns to reassign players
        </p>
      )}
      <div
        className="grid min-w-[900px] gap-x-5"
        style={{ gridTemplateColumns: `repeat(${rounds.length}, minmax(150px, 1fr))` }}
      >
        {rounds.map((round, roundIndex) => (
          <div
            key={round.round}
            className={`grid rounded-xl border p-3 ${getRoundTone(round.round)}`}
            style={{ gridTemplateRows: `auto repeat(${drawSize}, minmax(24px, 1fr))`, rowGap: '0.35rem' }}
          >
            <div className="sticky top-0 z-10 bg-inherit pb-2">
              {(() => {
                const rs = getRoundState(round.matches);
                return (
                  <p
                    className={`text-center text-xs uppercase tracking-widest font-black ${rs === 'finished' ? 'text-clay' : rs === 'loading' ? 'text-fg/70' : 'text-fg'}`}
                  >
                    {round.round} —{' '}
                    {rs === 'preview'
                      ? 'Live Preview'
                      : rs === 'loading'
                        ? 'Loading'
                        : rs === 'started'
                          ? 'Started'
                          : 'Finished'}
                  </p>
                );
              })()}
              {onUpdateDeadline ? (
                <input
                  type="date"
                  value={roundDeadlines[round.round] ?? ''}
                  onChange={(e) => onUpdateDeadline(round.round, e.target.value)}
                  className="mt-0.5 w-full text-center text-[10px] text-fg/70 bg-transparent border-none outline-none cursor-pointer hover:text-fg focus:text-fg [color-scheme:dark]"
                  title={`Set deadline for ${round.round}`}
                />
              ) : roundDeadlines[round.round] ? (
                <p className="text-center text-[10px] text-fg/70 mt-0.5">
                  Till {formatDeadline(roundDeadlines[round.round])}
                </p>
              ) : null}
            </div>
            {round.matches.map((match, matchIndex) => {
              const rowSpan = 2 ** (roundIndex + 1);
              const gridRowStart = matchIndex * 2 ** roundIndex * 2 + 2;

              return (
                <div
                  key={match.id}
                  className="grid grid-cols-[minmax(0,1fr)_24px] items-center"
                  style={{ gridRow: `${gridRowStart} / span ${rowSpan}` }}
                >
                  <MatchCard
                    match={match}
                    variant="grid"
                    isFinal={round.round === 'F'}
                    editMode={editMode}
                    editPlayers={editPlayers}
                    onEditPlayer={onEditPlayer}
                    onRemovePlayer={onRemovePlayer}
                    isCreator={isCreator}
                    onSubmitScore={onSubmitScore}
                    submittableMatchIds={submittableMatchIds}
                    pendingMatchIds={pendingMatchIds}
                  />
                  {roundIndex < rounds.length - 1 ? (
                    <div className="grid h-full grid-cols-[1fr_1px] items-center">
                      <div className="border-t border-fg/20" />
                      <div className="h-1/2 border-r border-fg/20" />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
};
