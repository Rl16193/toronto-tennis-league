import React, { useMemo } from 'react';
import { TournamentMatch, TournamentPlayer } from './types';
import { BYE, PLAYER_LOADING, formatPlayerName, getMatchDisplayFlags } from './utils';
import { getRoundLabels } from './bracketImage';

const getRoundTone = (round: string) => {
  if (round === 'SF' || round === 'F') return 'bg-clay/10 border-clay/20';
  return 'bg-tennis-dark/40 border-fg/10';
};

const isPlaceholder = (name?: string) =>
  (name || '').toLowerCase().startsWith('winner of ');

export const getRoundState = (roundMatches: TournamentMatch[]): 'preview' | 'loading' | 'started' | 'finished' => {
  const real = roundMatches.filter(
    (m) => !m.id.startsWith('preview_') && !m.id.startsWith('ll_preview_'),
  );
  if (real.length === 0) return 'preview';
  // Any slot still waiting on a previous-round winner → Loading
  if (real.some((m) => isPlaceholder(m.player_1_name) || isPlaceholder(m.player_2_name))) return 'loading';
  // round is "started" once at least one match has both slots filled with real players
  const anyReady = real.some(
    (m) => m.player_1_name !== PLAYER_LOADING && m.player_2_name !== PLAYER_LOADING,
  );
  if (!anyReady) return 'preview';
  if (real.every((m) => !!m.winner_user_id)) return 'finished';
  return 'started';
};

export const formatDeadline = (iso: string): string => {
  const [, m, d] = iso.split('-').map(Number);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[m - 1]} ${d}`;
};

const BracketPlayer: React.FC<{ name: string; winner: boolean }> = ({ name, winner }) => (
  <div className={`h-8 border-b border-fg/10 flex items-center px-2 text-sm font-semibold ${winner ? 'text-clay' : 'text-fg/90'}`}>
    <span className="truncate">{formatPlayerName(name) || ' '}</span>
  </div>
);

type PlayerSelectProps = {
  matchId: string;
  slot: 'player_1' | 'player_2';
  currentUserId: string;
  currentName: string;
  players: TournamentPlayer[];
  onSelect: (matchId: string, slot: 'player_1' | 'player_2', player: TournamentPlayer | null) => void;
};

export const PlayerSelect: React.FC<PlayerSelectProps> = ({ matchId, slot, currentUserId, currentName, players, onSelect }) => {
  const selectValue = currentName === PLAYER_LOADING ? PLAYER_LOADING : (currentUserId || '');
  return (
    <div className="h-8 border-b border-fg/10 flex items-center px-1 bg-clay/10">
      <select
        value={selectValue}
        onChange={(e) => {
          if (e.target.value === PLAYER_LOADING) {
            onSelect(matchId, slot, { user_id: '', name: PLAYER_LOADING, contact: '', preferredContact: 'email', participantId: '' });
          } else {
            const p = e.target.value ? players.find((p) => p.user_id === e.target.value) ?? null : null;
            onSelect(matchId, slot, p);
          }
        }}
        className="w-full text-xs bg-transparent border-none outline-none cursor-pointer text-fg [&>option]:text-black"
      >
        <option value="">{BYE}</option>
        <option value={PLAYER_LOADING}>{PLAYER_LOADING}</option>
        {players.map((p) => (
          <option key={p.user_id} value={p.user_id}>{p.name}</option>
        ))}
      </select>
    </div>
  );
};


type Props = {
  matches: TournamentMatch[];
  drawTitle: string;
  editMode?: boolean;
  editPlayers?: TournamentPlayer[];
  onEditPlayer?: (matchId: string, slot: 'player_1' | 'player_2', player: TournamentPlayer | null) => void;
  isCreator?: boolean;
  onSubmitScore?: (match: TournamentMatch) => void;
  submittableMatchIds?: Set<string>;
  pendingMatchIds?: Set<string>;
  roundDeadlines?: Record<string, string>;
  onUpdateDeadline?: (round: string, date: string) => void;
};

export const BracketView: React.FC<Props> = ({
  matches, drawTitle, editMode, editPlayers = [], onEditPlayer,
  isCreator, onSubmitScore, submittableMatchIds, pendingMatchIds,
  roundDeadlines = {}, onUpdateDeadline,
}) => {
  const drawSize = Math.max(8, matches[0]?.drawsize || 8);
  const roundLabels = getRoundLabels(drawSize);

  const rounds = useMemo(
    () => roundLabels.map((round) => ({
      round,
      matches: matches.filter((m) => m.round === round).sort((a, b) => a.position - b.position),
    })),
    [matches, roundLabels],
  );

  return (
    <section className="overflow-x-auto rounded-[2rem] bg-tennis-surface/20 text-fg border border-fg/10 p-4 md:p-6">
      {editMode && (
        <p className="text-center text-xs text-amber-300 font-semibold mb-4">
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
                  <p className={`text-center text-xs uppercase tracking-widest font-black ${rs === 'finished' ? 'text-clay' : rs === 'loading' ? 'text-fg/40' : 'text-fg'}`}>
                    {round.round} — {rs === 'preview' ? 'Live Preview' : rs === 'loading' ? 'Loading' : rs === 'started' ? 'Started' : 'Finished'}
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
                <p className="text-center text-[10px] text-fg/60 mt-0.5">
                  Till {formatDeadline(roundDeadlines[round.round])}
                </p>
              ) : null}
            </div>
            {round.matches.map((match, matchIndex) => {
              const rowSpan = 2 ** (roundIndex + 1);
              const gridRowStart = matchIndex * 2 ** roundIndex * 2 + 2;
              const {
                isEditable, scoreText, showDot, showCreatorSubmit, showPlayerSubmit, alreadySubmitted,
              } = getMatchDisplayFlags(match, {
                editMode, hasEditHandler: !!onEditPlayer, isCreator, hasSubmitHandler: !!onSubmitScore,
                submittableMatchIds, pendingMatchIds,
              });
              const dotClass = match.status === 'complete' ? 'bg-green-400' : 'bg-orange-400';

              return (
                <div
                  key={match.id}
                  className="grid grid-cols-[minmax(0,1fr)_24px] items-center"
                  style={{ gridRow: `${gridRowStart} / span ${rowSpan}` }}
                >
                  <div className="relative rounded-sm bg-tennis-dark/60 border border-fg/10 shadow-sm">
                    {/* Status dot */}
                    {showDot && (
                      <span
                        className={`absolute top-1.5 right-1.5 w-2 h-2 rounded-full ${dotClass} z-10`}
                        title={
                          match.status === 'complete'
                            ? 'Score recorded'
                            : 'Pending'
                        }
                      />
                    )}

                    {isEditable ? (
                      <PlayerSelect
                        matchId={match.id}
                        slot="player_1"
                        currentUserId={match.player_1_user_id}
                        currentName={match.player_1_name}
                        players={editPlayers}
                        onSelect={onEditPlayer!}
                      />
                    ) : (
                      <BracketPlayer name={match.player_1_name} winner={match.winner_user_id === match.player_1_user_id} />
                    )}
                    {isEditable ? (
                      <PlayerSelect
                        matchId={match.id}
                        slot="player_2"
                        currentUserId={match.player_2_user_id}
                        currentName={match.player_2_name}
                        players={editPlayers}
                        onSelect={onEditPlayer!}
                      />
                    ) : (
                      <BracketPlayer name={match.player_2_name} winner={match.winner_user_id === match.player_2_user_id} />
                    )}

                    {/* Score display */}
                    {scoreText && (
                      <div className="border-t border-fg/10 px-2 py-0.5 text-[10px] text-fg/60 font-mono tracking-wide">
                        {scoreText}
                      </div>
                    )}

                    {/* Final winner banner */}
                    {round.round === 'F' && match.winner_name ? (
                      <div className="border-t border-fg/10 px-2 py-1 text-xs font-black text-clay">
                        Winner: {formatPlayerName(match.winner_name)}
                      </div>
                    ) : null}

                    {/* Creator enter-score button */}
                    {showCreatorSubmit && (
                      <button
                        type="button"
                        onClick={() => onSubmitScore(match)}
                        className="w-full border-t border-fg/10 px-2 py-1 text-[10px] text-fg/70 hover:text-clay transition-colors text-center leading-tight"
                      >
                        {match.status === 'complete' ? 'Edit score' : 'Enter score'}
                      </button>
                    )}

                    {/* Player submit-score button (queues for organizer confirmation) */}
                    {showPlayerSubmit && (
                      alreadySubmitted ? (
                        <div className="w-full border-t border-fg/10 px-2 py-1 text-[10px] text-green-400 text-center leading-tight">
                          Submitted ✓ awaiting confirmation
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onSubmitScore!(match)}
                          className="w-full border-t border-fg/10 px-2 py-1 text-[10px] text-fg/70 hover:text-clay transition-colors text-center leading-tight"
                        >
                          Submit score
                        </button>
                      )
                    )}
                  </div>
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
