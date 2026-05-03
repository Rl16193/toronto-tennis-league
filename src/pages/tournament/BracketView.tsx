import React, { useMemo } from 'react';
import { TournamentMatch, TournamentPlayer } from './types';
import { BYE, formatPlayerName } from './utils';
import { getRoundLabels } from './bracketImage';

const getRoundTone = (round: string) => {
  if (round === 'SF' || round === 'F') return 'bg-green-50 border-green-200';
  return 'bg-sky-50 border-sky-200';
};

const ROUND_DEADLINES: Record<string, string> = {
  R32: 'Avail. till Sat May 16',
  R16: 'Avail. till Sat May 16',
  QF: 'Avail. till Sat May 23',
  SF: 'Avail. till Sun May 30',
  F: 'Avail. till Sun May 30',
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

type Props = {
  matches: TournamentMatch[];
  drawTitle: string;
  editMode?: boolean;
  editPlayers?: TournamentPlayer[];
  onEditPlayer?: (matchId: string, slot: 'player_1' | 'player_2', player: TournamentPlayer | null) => void;
};

export const BracketView: React.FC<Props> = ({ matches, drawTitle, editMode, editPlayers = [], onEditPlayer }) => {
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
              <p className="text-center text-xs uppercase tracking-widest text-gray-600 font-black">
                {round.round}
              </p>
              {ROUND_DEADLINES[round.round] && (
                <p className="text-center text-[10px] text-gray-400 mt-0.5">{ROUND_DEADLINES[round.round]}</p>
              )}
            </div>
            {round.matches.map((match, matchIndex) => {
              const rowSpan = 2 ** (roundIndex + 1);
              const gridRowStart = matchIndex * 2 ** roundIndex * 2 + 2;
              const isPreviewFirstRound = match.id.startsWith('preview_') &&
                typeof match.player_1_slot === 'number' &&
                typeof match.player_2_slot === 'number';
              const isEditable = editMode && !!onEditPlayer &&
                (!match.id.startsWith('preview_') || isPreviewFirstRound);

              return (
                <div
                  key={match.id}
                  className="grid grid-cols-[minmax(0,1fr)_24px] items-center"
                  style={{ gridRow: `${gridRowStart} / span ${rowSpan}` }}
                >
                  <div className="rounded-sm bg-white border border-gray-300 shadow-sm">
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
                    {round.round === 'F' && match.winner_name ? (
                      <div className="border-t border-gray-300 px-2 py-1 text-xs font-black text-clay">
                        Winner: {formatPlayerName(match.winner_name)}
                      </div>
                    ) : null}
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
