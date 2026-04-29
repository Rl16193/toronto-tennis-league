import React, { useMemo } from 'react';
import { TournamentMatch } from './types';
import { formatPlayerName } from './utils';
import { getRoundLabels } from './bracketImage';

const getRoundTone = (round: string) => {
  if (round === 'SF' || round === 'F') return 'bg-green-50 border-green-200';
  return 'bg-sky-50 border-sky-200';
};

const BracketPlayer: React.FC<{ name: string; winner: boolean }> = ({ name, winner }) => (
  <div className={`h-8 border-b border-gray-300 flex items-center px-2 text-sm font-semibold ${winner ? 'text-clay' : 'text-black'}`}>
    <span className="truncate">{formatPlayerName(name) || ' '}</span>
  </div>
);

export const BracketView: React.FC<{ matches: TournamentMatch[]; drawTitle: string }> = ({ matches, drawTitle }) => {
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
      <h2 className="text-center text-2xl md:text-3xl font-black mb-4">{drawTitle}</h2>
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
            <p className="sticky top-0 z-10 bg-inherit text-center text-xs uppercase tracking-widest text-gray-600 font-black pb-2">
              {round.round}
            </p>
            {round.matches.map((match, matchIndex) => {
              const rowSpan = 2 ** (roundIndex + 1);
              const gridRowStart = matchIndex * 2 ** roundIndex * 2 + 2;
              return (
                <div
                  key={match.id}
                  className="grid grid-cols-[minmax(0,1fr)_24px] items-center"
                  style={{ gridRow: `${gridRowStart} / span ${rowSpan}` }}
                >
                  <div className="rounded-sm bg-white border border-gray-300 shadow-sm">
                    <BracketPlayer name={match.player_1_name} winner={match.winner_user_id === match.player_1_user_id} />
                    <BracketPlayer name={match.player_2_name} winner={match.winner_user_id === match.player_2_user_id} />
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
