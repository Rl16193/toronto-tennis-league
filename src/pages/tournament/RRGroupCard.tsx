import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { RRStandingRow, TournamentMatch, TournamentPlayer } from './types';
import { PLAYER_LOADING, formatPlayerName, formatSetScores } from './utils';
import { PLAYER_LOADING_SENTINEL } from './AddPlayerPanel';

type Props = {
  groupIndex: number;
  groupLabel: string;
  players: TournamentPlayer[];
  matches: TournamentMatch[];
  standings: RRStandingRow[];
  advancementCount: number;
  isCreator: boolean;
  isParticipant: boolean;
  // The viewer's own uid — a non-creator only sees their own match(es) in the list below.
  currentUserId?: string;
  isPastEvent: boolean;
  editMode: boolean;
  editPlayers: TournamentPlayer[];
  allGroupPlayers: TournamentPlayer[];
  onEditPlayer: (matchId: string, slot: 'player_1' | 'player_2', player: TournamentPlayer | null) => void;
  onSubmitScore?: (match: TournamentMatch) => void;
  submittableMatchIds?: Set<string>;
  pendingMatchIds?: Set<string>;
  onSaveGroupEdit: (groupIndex: number, newPlayers: TournamentPlayer[]) => void;
  onRenameGroup?: (label: string) => void;
};


export const RRGroupCard: React.FC<Props> = ({
  groupIndex, groupLabel, players, matches, standings, advancementCount,
  isCreator, isParticipant, currentUserId, isPastEvent, editMode, editPlayers, allGroupPlayers,
  onEditPlayer, onSubmitScore, submittableMatchIds, pendingMatchIds, onSaveGroupEdit, onRenameGroup,
}) => {
  const [matchesOpen, setMatchesOpen] = useState(false);
  // Which standings row is expanded to show the full stat line (wireframe 1c: Pts is the one
  // primary number; MP/MW/GW/GL are a tap away — same disclosure the Leaderboard uses).
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  // Local edit state: copy of players in this group for reassignment
  const [localPlayers, setLocalPlayers] = useState<TournamentPlayer[]>(players);
  // Local draft of the group name (creator rename).
  const [labelDraft, setLabelDraft] = useState(groupLabel);

  // Sync local state when the roster actually changes (e.g. after a save completes) — NOT on
  // every new `players` array reference. `players` is derived from the live matches feed, so an
  // unrelated Firestore write anywhere else in the event (another group's score, etc.) produces
  // a new reference on every render; resyncing on reference alone silently discarded an
  // in-progress "Reassign Players" edit before the creator could click Save.
  const playersKey = players.map((p) => p.user_id).sort().join(',');
  const lastPlayersKeyRef = React.useRef(playersKey);
  React.useEffect(() => {
    if (playersKey !== lastPlayersKeyRef.current) {
      lastPlayersKeyRef.current = playersKey;
      setLocalPlayers(players);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playersKey]);
  React.useEffect(() => { setLabelDraft(groupLabel); }, [groupLabel]);

  const sortedMatches = matches.slice().sort((a, b) => a.position - b.position);
  // The creator sees every match in the group; a participant only sees their own match(es) here
  // (one row per opponent they actually play), not the whole group's pairings.
  const visibleMatches = isCreator
    ? sortedMatches
    : sortedMatches.filter((m) => m.player_1_user_id === currentUserId || m.player_2_user_id === currentUserId);
  const canSeeMatches = isCreator || isParticipant;

  return (
    <div className="rounded-2xl border border-fg/10 bg-tennis-surface/30 overflow-hidden">
      {/* Group header */}
      <div className="px-4 py-3 border-b border-fg/10 bg-fg/[0.03]">
        <h3 className="text-sm font-bold text-fg">{groupLabel}</h3>
      </div>

      {/* Standings — ranked rows, Pts as the one primary number; tap a row for the full line */}
      <div>
        {standings.length > 0 ? (
          <>
            {standings.map((row, i) => {
              const isAdvancing = i < advancementCount;
              const expanded = expandedRow === row.userId;
              return (
                <div key={row.userId} className="border-b border-fg/[0.04] last:border-0">
                  <button
                    type="button"
                    onClick={() => setExpandedRow((cur) => (cur === row.userId ? null : row.userId))}
                    aria-expanded={expanded}
                    className="w-full min-h-[44px] flex items-center gap-2.5 pl-4 pr-4 py-2.5 text-left hover:bg-fg/[0.03] transition-colors"
                  >
                    <span className="text-fg/40 text-xs font-bold w-4 shrink-0">{row.rank}</span>
                    <span className="text-fg font-semibold text-sm truncate flex-1 min-w-0">
                      {formatPlayerName(row.name)}
                    </span>
                    {isAdvancing && (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold border border-clay/50 text-clay uppercase tracking-wider shrink-0">
                        ADV
                      </span>
                    )}
                    <span className="text-clay font-black text-sm tabular-nums shrink-0">{row.points} pts</span>
                  </button>
                  {expanded && (
                    <div className="grid grid-cols-4 gap-2 px-4 pb-3 text-center">
                      {[
                        { label: 'MP', value: row.matchWins + row.matchLosses },
                        { label: 'MW', value: row.matchWins },
                        { label: 'GW', value: row.gamesWon },
                        { label: 'GL', value: row.gamesLost },
                      ].map((s) => (
                        <div key={s.label} className="rounded-xl bg-fg/[0.04] py-2">
                          <p className="text-sm font-black text-fg tabular-nums">{s.value}</p>
                          <p className="text-[9px] font-bold uppercase tracking-widest text-fg/40">{s.label}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            <p className="px-4 py-1.5 text-center text-[10px] text-fg/30">tap a player for MP · MW · GW · GL</p>
          </>
        ) : (
          players.map((p) => (
            <div key={p.user_id} className="border-b border-fg/[0.04] last:border-0 flex items-center gap-2.5 pl-4 pr-4 py-2.5">
              <span className="text-fg/40 text-xs w-4 shrink-0">—</span>
              <span className="text-fg/70 text-sm truncate">{formatPlayerName(p.name)}</span>
            </div>
          ))
        )}
      </div>

      {/* Match results — collapsible, visible to participants + creator */}
      {canSeeMatches && visibleMatches.length > 0 && (
        <div className="border-t border-fg/10">
          <button
            type="button"
            onClick={() => setMatchesOpen((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-fg/[0.03] transition-colors"
          >
            <span className="text-[10px] font-bold uppercase tracking-widest text-fg/40">
              {isCreator ? 'Match List' : 'Match Results'}
            </span>
            {matchesOpen
              ? <ChevronUp className="w-3.5 h-3.5 text-fg/30" />
              : <ChevronDown className="w-3.5 h-3.5 text-fg/30" />}
          </button>

          {matchesOpen && (
            <div>
              {visibleMatches.map((m) => {
                const isDone = m.status === 'complete';
                const scoreStr = isDone ? formatSetScores(m) : '';

                return (
                  <div
                    key={m.id}
                    className="px-4 py-2.5 border-t border-fg/[0.04] flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isDone ? 'bg-green-500' : 'bg-fg/20'}`} />
                      <div className="min-w-0">
                        {isCreator && editMode ? (
                          <div className="flex items-center gap-1 text-xs flex-wrap">
                            <select
                              value={m.player_1_user_id}
                              onChange={(e) => {
                                const p = e.target.value ? editPlayers.find((pl) => pl.user_id === e.target.value) ?? null : null;
                                onEditPlayer(m.id, 'player_1', p);
                              }}
                              className="bg-tennis-surface border border-fg/10 rounded px-1 py-0.5 text-fg text-xs max-w-[100px]"
                            >
                              <option value="" className="bg-tennis-surface text-fg">—</option>
                              {editPlayers.map((p) => <option key={p.user_id} value={p.user_id} className="bg-tennis-surface text-fg">{p.name}</option>)}
                            </select>
                            <span className="text-fg/30">vs</span>
                            <select
                              value={m.player_2_user_id}
                              onChange={(e) => {
                                const p = e.target.value ? editPlayers.find((pl) => pl.user_id === e.target.value) ?? null : null;
                                onEditPlayer(m.id, 'player_2', p);
                              }}
                              className="bg-tennis-surface border border-fg/10 rounded px-1 py-0.5 text-fg text-xs max-w-[100px]"
                            >
                              <option value="" className="bg-tennis-surface text-fg">—</option>
                              {editPlayers.map((p) => <option key={p.user_id} value={p.user_id} className="bg-tennis-surface text-fg">{p.name}</option>)}
                            </select>
                          </div>
                        ) : (
                          <p className="text-sm text-fg/80 truncate">
                            <span className={isDone && m.winner_user_id === m.player_1_user_id ? 'font-bold text-fg' : ''}>
                              {formatPlayerName(m.player_1_name)}
                            </span>
                            <span className="text-fg/30 mx-1.5">vs</span>
                            <span className={isDone && m.winner_user_id === m.player_2_user_id ? 'font-bold text-fg' : ''}>
                              {formatPlayerName(m.player_2_name)}
                            </span>
                          </p>
                        )}
                        {isDone && scoreStr && <p className="text-xs text-fg/40 mt-0.5">{scoreStr}</p>}
                        {m.walkover && <p className="text-[10px] text-amber-400/70 mt-0.5">Walkover</p>}
                      </div>
                    </div>

                    {isCreator && !editMode && !!onSubmitScore && (
                      <button
                        onClick={() => onSubmitScore(m)}
                        className="shrink-0 px-3 py-1.5 rounded-lg bg-clay/20 text-clay text-xs font-bold hover:bg-clay/30 transition-colors whitespace-nowrap"
                      >
                        {isDone ? 'Edit Score' : 'Enter Score'}
                      </button>
                    )}
                    {!isCreator && !isDone && !editMode && !!submittableMatchIds?.has(m.id) && (
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

      {/* Group edit mode — creator only: rename + reassign players in this group */}
      {isCreator && editMode && (
        <div className="border-t border-fg/10 px-4 py-4 space-y-3">
          {onRenameGroup && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-fg/40">Group Name</p>
              <div className="flex items-center gap-2">
                <input
                  value={labelDraft}
                  onChange={(e) => setLabelDraft(e.target.value)}
                  className="flex-1 bg-tennis-surface border border-fg/10 rounded px-2 py-1 text-fg text-xs"
                />
                <button
                  onClick={() => onRenameGroup(labelDraft)}
                  disabled={!labelDraft.trim() || labelDraft.trim() === groupLabel}
                  className="px-3 py-1 rounded-lg bg-clay/20 text-clay text-xs font-bold hover:bg-clay/30 transition-colors disabled:opacity-40"
                >
                  Rename
                </button>
              </div>
            </div>
          )}
          <p className="text-[10px] font-bold uppercase tracking-widest text-fg/40">Reassign Players</p>
          {localPlayers.map((p, idx) => {
            const hasPlayedMatch = matches.some((m) => m.status === 'complete');
            return (
              <div key={p.user_id} className="flex items-center gap-2">
                <span className="text-fg/50 text-xs w-4">{idx + 1}.</span>
                <select
                  value={p.user_id === PLAYER_LOADING_SENTINEL ? PLAYER_LOADING_SENTINEL : p.user_id}
                  onChange={(e) => {
                    if (e.target.value === PLAYER_LOADING_SENTINEL) {
                      setLocalPlayers((prev) => prev.map((pp, i) => i === idx
                        ? { user_id: PLAYER_LOADING_SENTINEL, name: PLAYER_LOADING, contact: '', preferredContact: 'email' as const, participantId: '' }
                        : pp));
                      return;
                    }
                    const chosen = allGroupPlayers.find((pl) => pl.user_id === e.target.value);
                    if (!chosen) return;
                    setLocalPlayers((prev) => prev.map((pp, i) => i === idx ? chosen : pp));
                  }}
                  className="flex-1 bg-tennis-surface border border-fg/10 rounded px-2 py-1 text-fg text-xs"
                >
                  <option value={PLAYER_LOADING_SENTINEL} className="bg-tennis-surface text-fg/40">— Player Loading —</option>
                  {allGroupPlayers.map((pl) => (
                    <option key={pl.user_id} value={pl.user_id} className="bg-tennis-surface text-fg">{formatPlayerName(pl.name)}</option>
                  ))}
                </select>
              </div>
            );
          })}
          {/* Add a player from another group or the unplaced pool */}
          {(() => {
            const takenIds = new Set(localPlayers.map((p) => p.user_id));
            const available = allGroupPlayers.filter((p) => !takenIds.has(p.user_id));
            if (!available.length) return null;
            return (
              <div className="flex items-center gap-2">
                <span className="text-fg/50 text-xs w-4">+</span>
                <select
                  value=""
                  onChange={(e) => {
                    const chosen = allGroupPlayers.find((pl) => pl.user_id === e.target.value);
                    if (chosen) setLocalPlayers((prev) => [...prev, chosen]);
                  }}
                  className="flex-1 bg-tennis-surface border border-fg/10 rounded px-2 py-1 text-fg text-xs"
                >
                  <option value="">Add player…</option>
                  {available.map((pl) => (
                    <option key={pl.user_id} value={pl.user_id} className="bg-tennis-surface text-fg">{formatPlayerName(pl.name)}</option>
                  ))}
                </select>
              </div>
            );
          })()}
          <button
            onClick={() => onSaveGroupEdit(groupIndex, localPlayers)}
            className="w-full mt-2 py-1.5 rounded-lg bg-clay text-white text-xs font-bold hover:bg-clay/80 transition-colors"
          >
            Save Group
          </button>
        </div>
      )}
    </div>
  );
};
