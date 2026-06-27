import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { RRStandingRow, TournamentMatch, TournamentPlayer } from './types';
import { formatPlayerName, formatSetScores } from './utils';

type Props = {
  groupIndex: number;
  groupLabel: string;
  players: TournamentPlayer[];
  matches: TournamentMatch[];
  standings: RRStandingRow[];
  advancementCount: number;
  isCreator: boolean;
  isParticipant: boolean;
  isPastEvent: boolean;
  editMode: boolean;
  editPlayers: TournamentPlayer[];
  allGroupPlayers: TournamentPlayer[];
  onEditPlayer: (matchId: string, slot: 'player_1' | 'player_2', player: TournamentPlayer | null) => void;
  onSubmitScore: (match: TournamentMatch) => void;
  currentUserId?: string;
  pendingMatchIds?: Set<string>;
  onSaveGroupEdit: (groupIndex: number, newPlayers: TournamentPlayer[]) => void;
  groupTargets?: { gi: number; label: string }[];
  onMovePlayer?: (player: TournamentPlayer, toGi: number) => void;
};


export const RRGroupCard: React.FC<Props> = ({
  groupIndex, groupLabel, players, matches, standings, advancementCount,
  isCreator, isParticipant, isPastEvent, editMode, editPlayers, allGroupPlayers,
  onEditPlayer, onSubmitScore, currentUserId, pendingMatchIds, onSaveGroupEdit, groupTargets, onMovePlayer,
}) => {
  const [matchesOpen, setMatchesOpen] = useState(false);
  // Local edit state: copy of players in this group for reassignment
  const [localPlayers, setLocalPlayers] = useState<TournamentPlayer[]>(players);

  // Sync local state when players prop changes (e.g. after save)
  React.useEffect(() => { setLocalPlayers(players); }, [players]);

  const sortedMatches = matches.slice().sort((a, b) => a.position - b.position);
  const canSeeMatches = isCreator || isParticipant || isPastEvent;

  return (
    <div className="rounded-2xl border border-white/10 bg-tennis-surface/30 overflow-hidden">
      {/* Group header */}
      <div className="px-4 py-3 border-b border-white/10 bg-white/[0.03]">
        <h3 className="text-sm font-bold text-white">{groupLabel}</h3>
      </div>

      {/* Standings table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5">
              <th className="py-2 pl-4 pr-2 text-left text-[10px] font-bold uppercase tracking-widest text-white/40 w-6">#</th>
              <th className="py-2 pr-3 text-left text-[10px] font-bold uppercase tracking-widest text-white/40">Player</th>
              <th className="py-2 pr-3 text-center text-[10px] font-bold uppercase tracking-widest text-white/40">MP</th>
              <th className="py-2 pr-3 text-center text-[10px] font-bold uppercase tracking-widest text-white/40">MW</th>
              <th className="py-2 pr-3 text-center text-[10px] font-bold uppercase tracking-widest text-white/40">GW</th>
              <th className="py-2 pr-3 text-center text-[10px] font-bold uppercase tracking-widest text-white/40">GL</th>
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
                      <td className="py-2.5 pr-3 text-center text-white/50 text-sm">{row.matchWins + row.matchLosses}</td>
                      <td className="py-2.5 pr-3 text-center text-white/80 font-bold text-sm">{row.matchWins}</td>
                      <td className="py-2.5 pr-3 text-center text-white/80 font-bold text-sm">{row.gamesWon}</td>
                      <td className="py-2.5 pr-3 text-center text-white/50 text-sm">{row.gamesLost}</td>
                      <td className="py-2.5 pr-4 text-center text-white/80 font-semibold text-sm">{row.points}</td>
                    </tr>
                  );
                })
              : players.map((p) => (
                  <tr key={p.user_id} className="border-b border-white/[0.04] last:border-0">
                    <td className="py-2.5 pl-4 pr-2 text-white/40 text-xs">—</td>
                    <td colSpan={6} className="py-2.5 pr-4 text-white/70 text-sm">{formatPlayerName(p.name)}</td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      {/* Match results — collapsible, visible to participants + creator */}
      {canSeeMatches && sortedMatches.length > 0 && (
        <div className="border-t border-white/10">
          <button
            type="button"
            onClick={() => setMatchesOpen((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-white/[0.03] transition-colors"
          >
            <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">
              {isCreator ? 'Match List' : 'Match Results'}
            </span>
            {matchesOpen
              ? <ChevronUp className="w-3.5 h-3.5 text-white/30" />
              : <ChevronDown className="w-3.5 h-3.5 text-white/30" />}
          </button>

          {matchesOpen && (
            <div>
              {sortedMatches.map((m) => {
                const isDone = m.status === 'complete';
                const scoreStr = isDone ? formatSetScores(m) : '';

                return (
                  <div
                    key={m.id}
                    className="px-4 py-2.5 border-t border-white/[0.04] flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isDone ? 'bg-green-500' : 'bg-white/20'}`} />
                      <div className="min-w-0">
                        {isCreator && editMode ? (
                          <div className="flex items-center gap-1 text-xs flex-wrap">
                            <select
                              value={m.player_1_user_id}
                              onChange={(e) => {
                                const p = e.target.value ? editPlayers.find((pl) => pl.user_id === e.target.value) ?? null : null;
                                onEditPlayer(m.id, 'player_1', p);
                              }}
                              className="bg-tennis-surface border border-white/10 rounded px-1 py-0.5 text-white text-xs max-w-[100px]"
                            >
                              <option value="" className="bg-tennis-surface text-white">—</option>
                              {editPlayers.map((p) => <option key={p.user_id} value={p.user_id} className="bg-tennis-surface text-white">{p.name}</option>)}
                            </select>
                            <span className="text-white/30">vs</span>
                            <select
                              value={m.player_2_user_id}
                              onChange={(e) => {
                                const p = e.target.value ? editPlayers.find((pl) => pl.user_id === e.target.value) ?? null : null;
                                onEditPlayer(m.id, 'player_2', p);
                              }}
                              className="bg-tennis-surface border border-white/10 rounded px-1 py-0.5 text-white text-xs max-w-[100px]"
                            >
                              <option value="" className="bg-tennis-surface text-white">—</option>
                              {editPlayers.map((p) => <option key={p.user_id} value={p.user_id} className="bg-tennis-surface text-white">{p.name}</option>)}
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
                        {isDone && scoreStr && <p className="text-xs text-white/40 mt-0.5">{scoreStr}</p>}
                        {m.walkover && <p className="text-[10px] text-amber-400/70 mt-0.5">Walkover</p>}
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
                    {!isCreator && !isDone && !editMode && !!currentUserId &&
                      (m.player_1_user_id === currentUserId || m.player_2_user_id === currentUserId) && (
                        pendingMatchIds?.has(m.id) ? (
                          <span className="shrink-0 text-[10px] font-bold text-green-500 uppercase tracking-wider">Submitted ✓</span>
                        ) : (
                          <button
                            onClick={() => onSubmitScore(m)}
                            className="shrink-0 px-3 py-1.5 rounded-lg bg-clay/20 text-clay text-xs font-bold hover:bg-clay/30 transition-colors whitespace-nowrap"
                          >
                            Submit Score
                          </button>
                        )
                      )}
                    {isDone && (
                      <span className="shrink-0 text-[10px] font-bold text-green-500 uppercase tracking-wider">Done</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Group edit mode — creator only: reassign players in this group */}
      {isCreator && editMode && (
        <div className="border-t border-white/10 px-4 py-4 space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/40">Reassign Players</p>
          {localPlayers.map((p, idx) => (
            <div key={p.user_id} className="flex items-center gap-2">
              <span className="text-white/50 text-xs w-4">{idx + 1}.</span>
              <select
                value={p.user_id}
                onChange={(e) => {
                  const chosen = allGroupPlayers.find((pl) => pl.user_id === e.target.value);
                  if (!chosen) return;
                  setLocalPlayers((prev) => prev.map((pp, i) => i === idx ? chosen : pp));
                }}
                className="flex-1 bg-tennis-surface border border-white/10 rounded px-2 py-1 text-white text-xs"
              >
                {allGroupPlayers.map((pl) => (
                  <option key={pl.user_id} value={pl.user_id} className="bg-tennis-surface text-white">{formatPlayerName(pl.name)}</option>
                ))}
              </select>
            </div>
          ))}
          <button
            onClick={() => onSaveGroupEdit(groupIndex, localPlayers)}
            className="w-full mt-2 py-1.5 rounded-lg bg-clay text-white text-xs font-bold hover:bg-clay/80 transition-colors"
          >
            Save Group
          </button>

          {/* Move players to another group (true move / dissolve) */}
          {onMovePlayer && groupTargets && groupTargets.length > 0 && (
            <div className="pt-3 mt-1 border-t border-white/10 space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/40">Move To Another Group</p>
              {players.map((p) => (
                <div key={p.user_id} className="flex items-center gap-2">
                  <span className="flex-1 text-white/80 text-xs truncate">{formatPlayerName(p.name)}</span>
                  <select
                    value=""
                    onChange={(e) => {
                      if (e.target.value === '') return;
                      onMovePlayer(p, Number(e.target.value));
                    }}
                    className="bg-tennis-surface border border-white/10 rounded px-2 py-1 text-white text-xs"
                  >
                    <option value="" className="bg-tennis-surface text-white">Move to…</option>
                    {groupTargets.map((t) => (
                      <option key={t.gi} value={t.gi} className="bg-tennis-surface text-white">{t.label}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
