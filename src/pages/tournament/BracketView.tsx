import React, { useMemo } from 'react';
import { ScoreSubmission, TournamentMatch, TournamentPlayer } from './types';
import { BYE, PLAYER_LOADING, formatPlayerName } from './utils';
import { getRoundLabels } from './bracketImage';

const getRoundTone = (round: string) => {
  if (round === 'SF' || round === 'F') return 'bg-green-50 border-green-200';
  return 'bg-sky-50 border-sky-200';
};

const formatDeadline = (iso: string): string => {
  const [, m, d] = iso.split('-').map(Number);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[m - 1]} ${d}`;
};

const BracketPlayer: React.FC<{ name: string; winner: boolean }> = ({ name, winner }) => (
  <div className={`h-8 border-b border-gray-300 flex items-center px-2 text-sm font-semibold ${winner ? 'text-clay' : 'text-black'}`}>
    <span className="truncate">{formatPlayerName(name) || ' '}</span>
  </div>
);

type PlayerSelectProps = {
  matchId: string;
  slot: 'player_1' | 'player_2';
  currentUserId: string;
  players: TournamentPlayer[];
  onSelect: (matchId: string, slot: 'player_1' | 'player_2', player: TournamentPlayer | null) => void;
};

const PlayerSelect: React.FC<PlayerSelectProps> = ({ matchId, slot, currentUserId, players, onSelect }) => (
  <div className="h-8 border-b border-gray-300 flex items-center px-1 bg-yellow-50">
    <select
      value={currentUserId || ''}
      onChange={(e) => {
        const p = e.target.value ? players.find((p) => p.user_id === e.target.value) ?? null : null;
        onSelect(matchId, slot, p);
      }}
      className="w-full text-xs bg-transparent border-none outline-none cursor-pointer"
    >
      <option value="">{BYE}</option>
      {players.map((p) => (
        <option key={p.user_id} value={p.user_id}>{p.name}</option>
      ))}
    </select>
  </div>
);

const formatSetScores = (sub: ScoreSubmission): string => {
  const pairs: [number, number][] = [
    [sub.set_1_player_1, sub.set_1_player_2],
    [sub.set_2_player_1, sub.set_2_player_2],
    [sub.set_3_player_1, sub.set_3_player_2],
  ];
  return pairs
    .filter(([p1, p2]) => p1 > 0 || p2 > 0)
    .map(([p1, p2]) => `${p1}-${p2}`)
    .join('  ');
};

type Props = {
  matches: TournamentMatch[];
  drawTitle: string;
  editMode?: boolean;
  editPlayers?: TournamentPlayer[];
  onEditPlayer?: (matchId: string, slot: 'player_1' | 'player_2', player: TournamentPlayer | null) => void;
  submissions?: ScoreSubmission[];
  isCreator?: boolean;
  onSubmitScore?: (match: TournamentMatch) => void;
  roundDeadlines?: Record<string, string>; // round → 'YYYY-MM-DD'
  onUpdateDeadline?: (round: string, date: string) => void;
};

export const BracketView: React.FC<Props> = ({
  matches, drawTitle, editMode, editPlayers = [], onEditPlayer,
  submissions = [], isCreator, onSubmitScore,
  roundDeadlines = {}, onUpdateDeadline,
}) => {
  const drawSize = Math.max(8, matches[0]?.drawsize || 8);
  const roundLabels = getRoundLabels(drawSize);

  // Pre-index submissions by match_doc_id for O(1) lookup
  const submissionsByMatch = useMemo(() => {
    const map = new Map<string, ScoreSubmission[]>();
    for (const s of submissions) {
      const list = map.get(s.match_doc_id) ?? [];
      list.push(s);
      map.set(s.match_doc_id, list);
    }
    return map;
  }, [submissions]);

  const rounds = useMemo(
    () => roundLabels.map((round) => ({
      round,
      matches: matches.filter((m) => m.round === round).sort((a, b) => a.position - b.position),
    })),
    [matches, roundLabels],
  );

  return (
    <section className="overflow-x-auto rounded-[2rem] bg-violet-100 text-black border border-white/10 p-4 md:p-6">
      <h2 className="text-center text-2xl md:text-3xl font-black mb-1">{drawTitle}</h2>
      {editMode && (
        <p className="text-center text-xs text-amber-700 font-semibold mb-4">
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
              <p className="text-center text-xs uppercase tracking-widest text-white font-black">
                {round.round}
              </p>
              {onUpdateDeadline ? (
                <input
                  type="date"
                  value={roundDeadlines[round.round] ?? ''}
                  onChange={(e) => onUpdateDeadline(round.round, e.target.value)}
                  className="mt-0.5 w-full text-center text-[10px] text-white bg-transparent border-none outline-none cursor-pointer hover:text-white focus:text-white"
                  title={`Set deadline for ${round.round}`}
                />
              ) : roundDeadlines[round.round] ? (
                <p className="text-center text-[10px] text-white mt-0.5">
                  Till {formatDeadline(roundDeadlines[round.round])}
                </p>
              ) : null}
            </div>
            {round.matches.map((match, matchIndex) => {
              const rowSpan = 2 ** (roundIndex + 1);
              const gridRowStart = matchIndex * 2 ** roundIndex * 2 + 2;
              const isPreview = match.id.startsWith('preview_') || match.id.startsWith('ll_preview_');
              const isPreviewFirstRound = isPreview &&
                typeof match.player_1_slot === 'number' &&
                typeof match.player_2_slot === 'number';
              const isEditable = editMode && !!onEditPlayer &&
                (!isPreview || isPreviewFirstRound);

              // Score / status logic (only for real matches)
              const matchSubs = isPreview ? [] : (submissionsByMatch.get(match.id) ?? []);
              const firstSub = matchSubs.length > 0
                ? [...matchSubs].sort((a, b) => a.created_at.localeCompare(b.created_at))[0]
                : null;
              const scoreText = firstSub ? formatSetScores(firstSub) : '';

              const hasBye = match.player_1_name === BYE || match.player_2_name === BYE;
              const hasRealPlayers =
                !isPreview && !hasBye &&
                !!match.player_1_user_id && !!match.player_2_user_id;

              // For the creator, also allow submitting when a slot is PLAYER_LOADING (winner pending)
              const hasPlayableSlots =
                !isPreview && !hasBye && (
                  (!!match.player_1_user_id || match.player_1_name === PLAYER_LOADING) &&
                  (!!match.player_2_user_id || match.player_2_name === PLAYER_LOADING)
                );

              // Status dot
              const showDot = !isPreview && hasRealPlayers;
              const dotClass =
                match.status === 'flagged' && isCreator
                  ? 'bg-red-500'
                  : matchSubs.length > 0
                  ? 'bg-green-400'
                  : 'bg-orange-400';

              // Creator submit button (also shown for complete matches so creator can overwrite)
              const showCreatorSubmit =
                isCreator && !!onSubmitScore && hasPlayableSlots && !editMode;

              return (
                <div
                  key={match.id}
                  className="grid grid-cols-[minmax(0,1fr)_24px] items-center"
                  style={{ gridRow: `${gridRowStart} / span ${rowSpan}` }}
                >
                  <div className="relative rounded-sm bg-white border border-gray-300 shadow-sm">
                    {/* Status dot */}
                    {showDot && (
                      <span
                        className={`absolute top-1.5 right-1.5 w-2 h-2 rounded-full ${dotClass} z-10`}
                        title={
                          match.status === 'flagged' && isCreator
                            ? 'Disputed'
                            : matchSubs.length > 0
                            ? 'Score submitted'
                            : 'Pending'
                        }
                      />
                    )}

                    {isEditable ? (
                      <PlayerSelect
                        matchId={match.id}
                        slot="player_1"
                        currentUserId={match.player_1_user_id}
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
                        players={editPlayers}
                        onSelect={onEditPlayer!}
                      />
                    ) : (
                      <BracketPlayer name={match.player_2_name} winner={match.winner_user_id === match.player_2_user_id} />
                    )}

                    {/* Score display */}
                    {scoreText && (
                      <div className="border-t border-gray-200 px-2 py-0.5 text-[10px] text-white font-mono tracking-wide">
                        {scoreText}
                      </div>
                    )}

                    {/* Final winner banner */}
                    {round.round === 'F' && match.winner_name ? (
                      <div className="border-t border-gray-300 px-2 py-1 text-xs font-black text-clay">
                        Winner: {formatPlayerName(match.winner_name)}
                      </div>
                    ) : null}

                    {/* Creator enter-score button */}
                    {showCreatorSubmit && (
                      <button
                        type="button"
                        onClick={() => onSubmitScore(match)}
                        className="w-full border-t border-gray-100 px-2 py-1 text-[10px] text-white hover:text-clay transition-colors text-center leading-tight"
                      >
                        {match.status === 'complete' ? 'Edit score' : 'Enter score'}
                      </button>
                    )}
                  </div>
                  {roundIndex < rounds.length - 1 ? (
                    <div className="grid h-full grid-cols-[1fr_1px] items-center">
                      <div className="border-t border-gray-500" />
                      <div className="h-1/2 border-r border-gray-500" />
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
