import React from 'react';
import { RRStandingRow, ScoreSubmission, TournamentMatch, TournamentPlayer } from './types';
import { formatPlayerName } from './utils';

type Props = {
  groupIndex: number;
  players: TournamentPlayer[];
  matches: TournamentMatch[];
  standings: RRStandingRow[];
  advancementCount: number;
  isCreator: boolean;
  editMode: boolean;
  editPlayers: TournamentPlayer[];
  onEditPlayer: (matchId: string, slot: 'player_1' | 'player_2', player: TournamentPlayer | null) => void;
  onSubmitScore: (match: TournamentMatch) => void;
  submissions: ScoreSubmission[];
};

const GROUP_LABELS = ['A', 'B', 'C', 'D', 'E', 'F'];

const formatSets = (m: TournamentMatch): string => {
  const pairs: [number, number][] = [
    [m.set_1_player_1 ?? 0, m.set_1_player_2 ?? 0],
    [m.set_2_player_1 ?? 0, m.set_2_player_2 ?? 0],
    [m.set_3_player_1 ?? 0, m.set_3_player_2 ?? 0],
  ];
  return pairs
    .filter(([a, b]) => a > 0 || b > 0)
    .map(([a, b]) => `${a}–${b}`)
    .join('  ');
};

export const RRGroupCard: React.FC<Props> = ({
  groupIndex, players, matches, standings, advancementCount,
  isCreator, editMode, editPlayers, onEditPlayer, onSubmitScore, submissions,
}) => {
  const label = GROUP_LABELS[groupIndex] ?? String(groupIndex + 1);

  return (
    <div className="rounded-2xl border border-white/10 bg-tennis-surface/30 overflow-hidden">
      {/* Group header */}
      <div className="px-4 py-3 border-b border-white/10 bg-white/[0.03]">
        <h3 className="text-sm font-bold text-white uppercase tracking-widest">Group {label}</h3>
      </div>

      {/* Standings table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5">
              <th className="py-2 pl-4 pr-2 text-left text-[10px] font-bold uppercase tracking-widest text-white/40 w-6">#</th>
              <th className="py-2 pr-3 text-left text-[10px] font-bold uppercase tracking-widest text-white/40">Player</th>
              <th className="py-2 pr-3 text-center text-[10px] font-bold uppercase tracking-widest text-white/40">W</th>
              <th className="py-2 pr-3 text-center text-[10px] font-bold uppercase tracking-widest text-white/40">L</th>
              <th className="py-2 pr-4 text-center text-[10px] font-bold uppercase tracking-widest text-white/40">Pts</th>
            </tr>
          </thead>
          <tbody>
            {standings.length > 0
              ? standings.map((row, i) => {
                  const isAdvancing = i < advancementCount;
                  return (
                    <tr key={row.userId} className="border-b border-white/[0.04] last:border-0">
                      <td className="py-2.5 pl-4 pr-2 text-white/40 text-xs font-bold">{row.rank}</td>
                      <td className="py-2.5 pr-3">
                        <div className="flex items-center gap-2">
                          <span className="text-white font-semibold text-sm truncate max-w-[120px] sm:max-w-none">
                            {formatPlayerName(row.name)}
                          </span>
                          {isAdvancing && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-clay/20 text-clay uppercase tracking-wider shrink-0">
                              ADV
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 pr-3 text-center text-white/80 font-bold text-sm">{row.matchWins}</td>
                      <td className="py-2.5 pr-3 text-center text-white/50 text-sm">{row.matchLosses}</td>
                      <td className="py-2.5 pr-4 text-center text-white/80 font-semibold text-sm">{row.points}</td>
                    </tr>
                  );
                })
              : players.map((p) => (
                  <tr key={p.user_id} className="border-b border-white/[0.04] last:border-0">
                    <td className="py-2.5 pl-4 pr-2 text-white/40 text-xs">—</td>
                    <td colSpan={4} className="py-2.5 pr-4 text-white/70 text-sm">{formatPlayerName(p.name)}</td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      {/* Match list */}
      <div className="border-t border-white/10">
        {matches
          .slice()
          .sort((a, b) => a.position - b.position)
          .map((m) => {
            const isDone = m.status === 'complete';
            const scoreStr = isDone ? formatSets(m) : '';
            const submission = submissions.find((s) => s.match_doc_id === m.id);

            return (
              <div
                key={m.id}
                className="px-4 py-2.5 border-b border-white/[0.04] last:border-0 flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-2 min-w-0">
                  {/* Status dot */}
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      isDone ? 'bg-green-500' : 'bg-white/20'
                    }`}
                  />
                  <div className="min-w-0">
                    {editMode && isCreator ? (
                      <div className="flex items-center gap-1 text-xs flex-wrap">
                        <select
                          value={m.player_1_user_id}
                          onChange={(e) => {
                            const p = e.target.value ? editPlayers.find((pl) => pl.user_id === e.target.value) ?? null : null;
                            onEditPlayer(m.id, 'player_1', p);
                          }}
                          className="bg-white/5 border border-white/10 rounded px-1 py-0.5 text-white text-xs max-w-[100px]"
                        >
                          <option value="">—</option>
                          {editPlayers.map((p) => <option key={p.user_id} value={p.user_id}>{p.name}</option>)}
                        </select>
                        <span className="text-white/30">vs</span>
                        <select
                          value={m.player_2_user_id}
                          onChange={(e) => {
                            const p = e.target.value ? editPlayers.find((pl) => pl.user_id === e.target.value) ?? null : null;
                            onEditPlayer(m.id, 'player_2', p);
                          }}
                          className="bg-white/5 border border-white/10 rounded px-1 py-0.5 text-white text-xs max-w-[100px]"
                        >
                          <option value="">—</option>
                          {editPlayers.map((p) => <option key={p.user_id} value={p.user_id}>{p.name}</option>)}
                        </select>
                      </div>
                    ) : (
                      <p className="text-sm text-white/80 truncate">
                        <span className={isDone && m.winner_user_id === m.player_1_user_id ? 'font-bold text-white' : ''}>
                          {formatPlayerName(m.player_1_name)}
                        </span>
                        <span className="text-white/30 mx-1.5">vs</span>
                        <span className={isDone && m.winner_user_id === m.player_2_user_id ? 'font-bold text-white' : ''}>
                          {formatPlayerName(m.player_2_name)}
                        </span>
                      </p>
                    )}
                    {isDone && scoreStr && (
                      <p className="text-xs text-white/40 mt-0.5">{scoreStr}</p>
                    )}
                    {m.walkover && <p className="text-[10px] text-amber-400/70 mt-0.5">Walkover</p>}
                    {submission && !isDone && (
                      <p className="text-[10px] text-amber-300/70 mt-0.5">Score submitted — awaiting confirmation</p>
                    )}
                  </div>
                </div>

                {isCreator && !isDone && !editMode && (
                  <button
                    onClick={() => onSubmitScore(m)}
                    className="shrink-0 px-3 py-1.5 rounded-lg bg-clay/20 text-clay text-xs font-bold hover:bg-clay/30 transition-colors whitespace-nowrap"
                  >
                    Enter Score
                  </button>
                )}
                {isDone && (
                  <span className="shrink-0 text-[10px] font-bold text-green-500 uppercase tracking-wider">Done</span>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
};
