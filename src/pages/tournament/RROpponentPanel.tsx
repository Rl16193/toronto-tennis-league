import React from 'react';
import { Link } from 'react-router-dom';
import { TournamentPlayer } from './types';
import { formatPlayerName } from './utils';

type Props = {
  group: TournamentPlayer[];
  userId: string;      // current viewer — excluded from the list
  isDoubles: boolean;
};

export const RROpponentPanel: React.FC<Props> = ({ group, userId, isDoubles }) => {
  const others = group.filter((p) => p.user_id !== userId);
  if (others.length === 0) return null;

  return (
    <div className="mb-6">
      <p className="text-xs uppercase tracking-widest text-white/50 font-bold mb-3">Your Group</p>

      {/* Mobile: stacked cards */}
      <div className="flex flex-col gap-3 sm:hidden">
        {others.map((p) => (
          <div key={p.user_id} className="rounded-2xl p-4 border border-white/10 bg-tennis-dark/40">
            <div className="flex items-start justify-between gap-3 mb-2">
              <p className="text-white font-bold text-base">{formatPlayerName(p.name)}</p>
              {p.user_id && (
                <Link
                  to={`/players/${p.user_id}`}
                  className="shrink-0 inline-flex items-center px-3 py-1.5 rounded-lg bg-clay text-white text-xs font-bold hover:bg-clay/80 transition-colors"
                >
                  Profile
                </Link>
              )}
            </div>
            {p.contact && (
              <div>
                <p className="text-[10px] uppercase tracking-widest text-white/40 mb-0.5">
                  {isDoubles ? 'Team contact' : 'Contact'}
                </p>
                <p className="text-white/80 font-medium text-sm break-all">{p.contact}</p>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Desktop: table */}
      <div className="hidden sm:block overflow-x-auto rounded-2xl bg-tennis-dark/40 border border-white/10 px-4">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/10">
              <th className="py-3 pr-4 text-left text-[10px] uppercase tracking-widest text-white/40 font-bold">
                {isDoubles ? 'Team' : 'Opponent'}
              </th>
              <th className="py-3 pr-4 text-left text-[10px] uppercase tracking-widest text-white/40 font-bold">
                {isDoubles ? 'Team Contact' : 'Contact'}
              </th>
              <th className="py-3 text-left text-[10px] uppercase tracking-widest text-white/40 font-bold">Profile</th>
            </tr>
          </thead>
          <tbody>
            {others.map((p) => (
              <tr key={p.user_id} className="border-b border-white/5 last:border-0">
                <td className="py-3 pr-4 text-white font-semibold text-sm whitespace-nowrap">
                  {formatPlayerName(p.name)}
                </td>
                <td className="py-3 pr-4 text-white/70 text-sm break-all">
                  {p.contact || '—'}
                </td>
                <td className="py-3">
                  {p.user_id && (
                    <Link
                      to={`/players/${p.user_id}`}
                      className="inline-flex items-center px-3 py-1.5 rounded-lg bg-clay text-white text-xs font-bold hover:bg-clay/80 transition-colors whitespace-nowrap"
                    >
                      View Profile
                    </Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
