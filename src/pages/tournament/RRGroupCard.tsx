import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Trash2, Trophy } from 'lucide-react';
import { Button, buttonCls } from '../../components/Button';
import { numCls, statTileCls, tableHeadCls } from '../../components/Input';
import { SelectField } from '../../components/SelectField';
import { RRStandingRow, TournamentMatch, TournamentPlayer } from './types';
import { PLAYER_LOADING, PLAYER_LOADING_SENTINEL, byMatchNumber, formatPlayerName, formatSetScores, withSeed } from './utils';
import { PlayerName, RemindButton, SeedContext } from './MatchCard';
import { ContactOpponentButton } from '../../components/ContactOpponentButton';
import { pgWinPct } from '../../features/leagues/useStandings';
import type { ContactData, GroupChampion } from '../../types';
import { isWalkover } from '../../features/matches/results';
import { cn } from '../../lib/cn';
import { WithdrawReasons } from '../../features/events/EventsElements';
import type { RemovalReason } from '../../features/events/registrations';

type Props = {
  groupIndex: number;
  groupLabel: string;
  players: TournamentPlayer[];
  matches: TournamentMatch[];
  standings: RRStandingRow[];
  isCreator: boolean;
  // The viewer's own uid — a non-creator only sees their own match(es) in the list below.
  currentUserId?: string;
  editMode: boolean;
  allGroupPlayers: TournamentPlayer[];
  onSubmitScore?: (match: TournamentMatch) => void;
  submittableMatchIds?: Set<string>;
  onSaveGroupEdit: (groupIndex: number, newPlayers: TournamentPlayer[]) => void;
  onRenameGroup?: (label: string) => void;
  /**
   * uid → career standings row. These tiles are lifetime figures, NOT this group’s: matches
   * played used to be summed from the group standings, which is why it disagreed with the
   * leaderboard. Supplied by RoundRobinView; a missing entry renders as an em-dash.
   */
  statsByUid?: Map<string, { pointswon: number; totalPointsPlayed: number; matchesPlayed: number }>;
  /** uid -> contact details, resolved once by RoundRobinView. Absent = no Contact button. */
  contactsByUid?: Record<string, ContactData>;
  /** Organizer removes a player from the draw (soft delete — see handleRemovePlayer). */
  onRemovePlayer?: (uid: string) => void;
  /** Organizer moves a player to another zone's draw. Addressed by uid, not participant id. */
  onMovePlayerZone?: (uid: string, bucketId: string) => void;
  /** Zone buckets offered in that picker. Empty hides the control entirely. */
  zoneBuckets?: { id: string; label: string }[];
  /** Organizer pays/takes back this group's bonus. Players see the switch but can't move it. */
  onSetGroupBonus?: (award: boolean) => Promise<void>;
  /** Whether this group's bonus award exists (the switch's state). */
  bonusAwarded?: boolean;
  /** One-group draws only: the named winner, or null while none is named. Undefined elsewhere. */
  champion?: GroupChampion | null;
  /** Organizer: name the leader as winner, or take it back with null. */
  onSetChampion?: (winnerUid: string | null) => Promise<void>;
  /** The viewer withdraws themselves from the event (trash on their own row). */
  onWithdrawSelf?: (reason: RemovalReason) => Promise<void>;
};


export const RRGroupCard: React.FC<Props> = ({
  groupIndex, groupLabel, players, matches, standings,
  isCreator, currentUserId, editMode, allGroupPlayers,
  onSubmitScore, submittableMatchIds, onSaveGroupEdit, onRenameGroup,
  statsByUid, contactsByUid, onRemovePlayer, onMovePlayerZone, zoneBuckets = [],
  onSetGroupBonus, bonusAwarded = false, champion, onSetChampion, onWithdrawSelf,
}) => {
  const [withdrawAsk, setWithdrawAsk] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  // Which standings row is expanded to show the full stat line (wireframe 1c: Pts is the one
  // primary number; MP/MW/GW/GL are a tap away — same disclosure the Leaderboard uses).
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  // Naming the winner: the leader by the table's own order (points, then games won). Teams level
  // on both are the organizer's pick, so the server accepts any of them.
  const ranked = standings.filter((r) => r.userId && r.name !== PLAYER_LOADING);
  const leaders = ranked.filter((r) => r.points === ranked[0]?.points && r.gamesWon === ranked[0]?.gamesWon);
  const unplayed = matches.filter((m) => m.status !== 'complete').length;
  const [pick, setPick] = useState('');
  const [naming, setNaming] = useState(false);
  const nameWinner = async (uid: string | null) => {
    if (!onSetChampion) return;
    setNaming(true);
    try { await onSetChampion(uid); } finally { setNaming(false); }
  };
  // Creator-only pairings list at the foot of the card.
  const [matchesOpen, setMatchesOpen] = useState(false);
  // Local edit state: copy of players in this group for reassignment
  const [localPlayers, setLocalPlayers] = useState<TournamentPlayer[]>(players);
  // Local draft of the group name (creator rename).
  const [labelDraft, setLabelDraft] = useState(groupLabel);
  // Group bonus in flight — the switch is frozen until the batch lands.
  const [awarding, setAwarding] = useState(false);
  const seeds = React.useContext(SeedContext);

  // Sync local state when the roster actually changes (e.g. after a save completes) — NOT on
  // every new `players` array reference. `players` is derived from the live matches feed, so an
  // unrelated Firestore write anywhere else in the event (another group's score, etc.) produces
  // a new reference on every render; resyncing on reference alone silently discarded an
  // in-progress "Reassign Players" edit before the creator could click Save.
  const playersKey = players.map((p) => p.uid).sort().join(',');
  const lastPlayersKeyRef = React.useRef(playersKey);
  React.useEffect(() => {
    if (playersKey !== lastPlayersKeyRef.current) {
      lastPlayersKeyRef.current = playersKey;
      setLocalPlayers(players);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playersKey]);
  React.useEffect(() => { setLabelDraft(groupLabel); }, [groupLabel]);


  return (
    <div className="rounded-2xl bg-fg/5 overflow-hidden">
      {/* Group header. Same switch as the profile card's Email Notifications. Shown to everyone so
          players can see whether their group has been paid; only the organizer can move it, and
          it's hidden in preview (no match docs yet) — nothing to pay or stamp. */}
      <div className="px-4 py-3 border-b border-fg/10 bg-fg/5 flex items-center justify-between gap-3">
        <h3 className="text-sm font-bold text-fg min-w-0 truncate">{groupLabel}</h3>
        {!!onSetGroupBonus && matches.length > 0 && (
          <div className="shrink-0 flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-widest text-fg/70">
              {bonusAwarded ? 'Bonus Awarded' : 'Group Bonus'}
            </span>
            <label className={`relative inline-flex items-center shrink-0 ${isCreator && !awarding ? 'cursor-pointer' : 'cursor-default opacity-50'}`}>
              <input
                type="checkbox"
                className="sr-only peer"
                checked={bonusAwarded}
                disabled={!isCreator || awarding}
                onChange={async (e) => {
                  const award = e.target.checked;
                  setAwarding(true);
                  try { await onSetGroupBonus(award); } finally { setAwarding(false); }
                }}
              />
              <div className="w-10 h-6 bg-fg/15 peer-checked:bg-clay rounded-full transition-colors" />
              <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-4" />
            </label>
          </div>
        )}
      </div>

      {/* A one-group round robin has no final, so its winner is named: the table's leader, once
          every match is in. Everyone sees the winner; only the organizer gets the button. */}
      {champion !== undefined && (champion || (isCreator && onSetChampion)) && (
        <div className="px-4 py-3 border-b border-fg/10">
          {champion ? (
            <div className="flex items-center justify-between gap-3">
              <p className="min-w-0 flex items-center gap-2 text-sm font-bold text-fg">
                <Trophy className="w-4 h-4 shrink-0 text-clay" />
                <span className="truncate">Winner: {formatPlayerName(champion.name)}</span>
              </p>
              {isCreator && onSetChampion && (
                <button
                  type="button"
                  disabled={naming}
                  onClick={() => { if (window.confirm('Take back the winner? The event reopens.')) void nameWinner(null); }}
                  className="shrink-0 text-xs font-bold text-clay hover:underline disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clay"
                >
                  Take back
                </button>
              )}
            </div>
          ) : unplayed > 0 ? (
            <p className="text-xs text-fg/70">
              The leader can be named winner once all {matches.length} matches are recorded ({unplayed} to go).
            </p>
          ) : (
            <div className="space-y-2">
              {leaders.length > 1 && (
                <SelectField
                  label="Tied for first"
                  value={pick}
                  placeholder="Choose the winner"
                  options={leaders.map((r) => ({ value: r.userId, label: formatPlayerName(r.name), hint: `${r.points} pts · ${r.gamesWon} games` }))}
                  onChange={setPick}
                />
              )}
              <Button
                size="sm"
                variant="clay"
                className="w-full"
                isLoading={naming}
                disabled={naming || leaders.length === 0 || (leaders.length > 1 && !pick)}
                onClick={() => {
                  const uid = leaders.length > 1 ? pick : leaders[0].userId;
                  const who = ranked.find((r) => r.userId === uid)?.name ?? '';
                  if (window.confirm(`Name ${formatPlayerName(who)} as the winner? It's a title, no points.`)) void nameWinner(uid);
                }}
              >
                Select Group Leader as Winner
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Standings — ranked rows, Pts as the one primary number; tap a row for the full line */}
      <div>
        {standings.length > 0 ? (
          <>
            {/* Removed players leave a Player Loading placeholder behind. In a group that's just
                an empty row nobody can act on, so it's hidden here (a knockout keeps its empty
                slot visible, because that's where a replacement gets dropped). */}
            {standings.filter((row) => row.userId && row.name !== PLAYER_LOADING).map((row, i) => {
              // One winner per group advances.
              const isAdvancing = i === 0;
              const expanded = expandedRow === row.userId;
              return (
                <div key={row.userId} className="border-b border-fg/[0.04] last:border-0">
                  <div className="flex items-center">
                  <button
                    type="button"
                    onClick={() => setExpandedRow((cur) => (cur === row.userId ? null : row.userId))}
                    aria-expanded={expanded}
                    className="flex-1 min-w-0 min-h-[44px] flex items-center gap-2.5 pl-4 pr-2 py-2.5 text-left hover:bg-fg/5 transition-colors"
                  >
                    <span className="text-fg/70 text-xs font-bold w-4 shrink-0">{row.rank}</span>
                    <span className="text-fg font-semibold text-sm truncate flex-1 min-w-0">
                      <PlayerName uid={row.userId} name={row.name} />
                    </span>
                    {isAdvancing && (
                      <span className="px-1.5 py-0.5 rounded text-xs font-bold border border-clay/50 text-clay uppercase tracking-wider shrink-0">
                        ADV
                      </span>
                    )}
                    <span className="text-clay font-black text-sm tabular-nums shrink-0">{row.points} pts</span>
                  </button>
                  {/* Move this player to another zone: writes their preferred_zone. The server
                      keeps every match they have with a real opponent. */}
                  {isCreator && editMode && onMovePlayerZone && zoneBuckets.length > 0 && (
                    <SelectField
                      value=""
                      placeholder="Zone…"
                      title={`Move ${formatPlayerName(row.name)} to another zone`}
                      options={zoneBuckets.map((b) => ({ value: b.id, label: b.label }))}
                      onChange={(zone) => { if (zone) onMovePlayerZone(row.userId, zone); }}
                      className="w-auto shrink-0 mr-2"
                    />
                  )}
                  {isCreator && editMode && onRemovePlayer && (
                    <button
                      type="button"
                      aria-label={`Remove ${formatPlayerName(row.name)} from the draw`}
                      title="Remove from draw"
                      onClick={() => {
                        if (window.confirm(`Remove ${formatPlayerName(row.name)} ?\n\nPlayer will be removed, matches played will be unaffected, and for future matches the opponent gets a walkover.`)) {
                          onRemovePlayer(row.userId);
                        }
                      }}
                      className="shrink-0 mr-2 p-1.5 rounded-2xl text-fg/70 opacity-70 hover:opacity-100 hover:text-badge-loss hover:bg-red-500/10 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {!editMode && onWithdrawSelf && row.userId === currentUserId && !withdrawAsk && (
                    <button
                      type="button"
                      aria-label="Withdraw from the event"
                      title="Withdraw from the event"
                      onClick={() => setWithdrawAsk(true)}
                      className="shrink-0 mr-2 p-1.5 rounded-2xl text-fg/70 opacity-70 hover:opacity-100 hover:text-badge-loss hover:bg-red-500/10 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                  </div>
                  {withdrawAsk && onWithdrawSelf && row.userId === currentUserId && (
                    <div className="px-4 pb-3">
                      <WithdrawReasons
                        prompt="Withdraw from this event? Why?"
                        note="Your opponents get a walkover in matches still to play. You can join again from Events."
                        busy={withdrawing}
                        onPick={async (reason) => {
                          setWithdrawing(true);
                          try { await onWithdrawSelf(reason); } finally { setWithdrawing(false); setWithdrawAsk(false); }
                        }}
                        onCancel={() => setWithdrawAsk(false)}
                      />
                    </div>
                  )}
                  {expanded && (() => {
                    // Career numbers, not this group's — every other player row in the app shows
                    // lifetime stats, and MP used to count only matches inside this one group.
                    const st = statsByUid?.get(row.userId);
                    const isSelf = !!currentUserId && row.userId === currentUserId;

                    // The match this tile acts on is YOUR match against this player, whenever one
                    // exists — being the creator as well as a player must not change that. Keying
                    // off `isCreator` first picked an arbitrary match of theirs (against someone
                    // else entirely), so the tile reported the wrong result and the wrong state.
                    const theirMatches = matches.filter(
                      (m) => m.player_1_uid === row.userId || m.player_2_uid === row.userId);
                    const mine = currentUserId
                      ? theirMatches.find((m) => m.player_1_uid === currentUserId || m.player_2_uid === currentUserId)
                      : undefined;
                    // Only YOUR match gets an action. An organizer looking at someone else's row
                    // gets a read-only played/pending count for that player in this group instead
                    // — scoring anyone's match belongs in the Matches list at the foot of the card,
                    // not scattered across every player row.
                    const relevant = isSelf ? undefined : mine;
                    const played = relevant?.status === 'complete';
                    const theirPlayed = theirMatches.filter((m) => m.status === 'complete').length;
                    const theirPending = theirMatches.length - theirPlayed;
                    const showOverview = !isSelf && !mine && theirMatches.length > 0;
                    // Always read from the VIEWER's side, matching every other W/L in the app.
                    // Reading it from the row player's side meant your own defeat showed a green W.
                    const wonIt = played && !!currentUserId && relevant?.winner_uid === currentUserId;

                    const contactTile = isSelf || !contactsByUid?.[row.userId] ? <span className="text-fg/70">—</span> : (
                      <ContactOpponentButton
                        name={row.name}
                        phone={contactsByUid[row.userId]?.phone}
                        email={contactsByUid[row.userId]?.email}
                        whatsappContact={contactsByUid[row.userId]?.whatsapp_contact}
                        preferred={contactsByUid[row.userId]?.preferred_mode_of_contact}
                        size="sm"
                      />
                    );

                    // Played → the score, with a W/L pill only when it's YOUR match, since only
                    // then does a win or loss have an owner the viewer can read it as.
                    const actionTile = showOverview ? (
                      <span className="text-xs font-bold leading-tight">
                        {theirPlayed} played
                        <br />
                        <span className="text-fg/70">{theirPending} pending</span>
                      </span>
                    ) : !relevant ? <span className="text-fg/70">—</span>
                      : played ? (
                        <span className="inline-flex items-center gap-1.5">
                          {!!mine && (
                            <span className={`px-1.5 py-0.5 rounded text-xs font-black ${wonIt ? 'bg-green-500/15 text-badge-win' : 'bg-red-500/15 text-badge-loss'}`}>
                              {wonIt ? 'W' : 'L'}
                            </span>
                          )}
                          <span className="text-xs font-bold text-fg">
                            {formatSetScores(relevant.result ?? {}) || (isWalkover(relevant.result) ? 'Walkover' : 'Recorded')}
                          </span>
                        </span>
                      ) : isCreator ? (
                        <button type="button" onClick={() => onSubmitScore?.(relevant)} className={cn(buttonCls('clay', 'sm'), 'px-2')}>Score</button>
                      ) : submittableMatchIds?.has(relevant.id) ? (
                        <button type="button" onClick={() => onSubmitScore?.(relevant)} className={cn(buttonCls('clay', 'sm'), 'px-2')}>Score</button>
                      ) : <span className="text-fg/70">—</span>;

                    return (
                      <div className="grid grid-cols-4 gap-2 px-4 pb-3 text-center">
                        {[
                          { label: 'MP', value: st ? st.matchesPlayed : '—' },
                          { label: 'P/G Won', value: st ? pgWinPct(st) : '—' },
                          { label: showOverview ? 'In Group' : played ? 'Score' : 'Match', value: actionTile },
                          { label: 'Contact', value: contactTile },
                        ].map((s) => (
                          // min-w-0 so a 4-column track can actually shrink on a phone (~58px at
                          // 320px) instead of its contents forcing the row wider.
                          <div key={s.label} className={statTileCls}>
                            <div className={`${numCls} text-sm flex-1 flex items-center justify-center`}>{s.value}</div>
                            <p className={`${tableHeadCls} mt-0.5`}>{s.label}</p>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              );
            })}
            <p className="px-4 py-1.5 text-center text-xs text-fg/70">tap a player to contact them or handle your match</p>
          </>
        ) : (
          players.map((p) => (
            <div key={p.uid} className="border-b border-fg/[0.04] last:border-0 flex items-center gap-2.5 pl-4 pr-4 py-2.5">
              <span className="text-fg/70 text-xs w-4 shrink-0">—</span>
              <span className="text-fg/70 text-sm truncate">{withSeed(formatPlayerName(p.name), seeds[p.uid])}</span>
            </div>
          ))
        )}
      </div>

      {/* Every pairing in the group — CREATOR ONLY. A participant's own match is fully handled in
          their player row above (contact, result, score), so the list would just repeat
          it; an organizer still needs one place to see and score every pairing at once. */}
      {isCreator && !editMode && matches.length > 0 && (
        <div className="border-t border-fg/10">
          <button
            type="button"
            onClick={() => setMatchesOpen((v) => !v)}
            aria-expanded={matchesOpen}
            className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-fg/5 transition-colors"
          >
            <span className="text-xs font-bold uppercase tracking-widest text-fg/70">
              Matches ({matches.length})
            </span>
            {matchesOpen
              ? <ChevronUp className="w-3.5 h-3.5 text-fg/70" />
              : <ChevronDown className="w-3.5 h-3.5 text-fg/70" />}
          </button>

          {matchesOpen && (
            <div>
              {matches.slice().sort(byMatchNumber).map((m) => {
                const isDone = m.status === 'complete';
                const scoreStr = formatSetScores(m.result ?? {});
                return (
                  <div key={m.id} className="flex items-center gap-3 px-4 py-2.5 border-t border-fg/[0.04]">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-fg break-words">
                        <span className={isDone && m.winner_uid === m.player_1_uid ? 'font-bold text-fg' : ''}>
                          <PlayerName uid={m.player_1_uid} name={m.player_1_name} />
                        </span>
                        <span className="text-fg/70 mx-1.5">vs</span>
                        <span className={isDone && m.winner_uid === m.player_2_uid ? 'font-bold text-fg' : ''}>
                          <PlayerName uid={m.player_2_uid} name={m.player_2_name} />
                        </span>
                      </p>
                      {isDone && scoreStr && <p className="text-xs text-fg/70 mt-0.5">{scoreStr}</p>}
                      {isWalkover(m.result) && <p className="text-xs text-badge/70 mt-0.5">Walkover</p>}
                    </div>
                    <div className="shrink-0 flex items-center gap-2">
                      {isDone && (
                        <span className="text-xs font-bold text-badge-win uppercase tracking-wider">Done</span>
                      )}
                      <RemindButton match={m} />
                      {!!onSubmitScore && (
                        <button type="button" onClick={() => onSubmitScore(m)} className={buttonCls('clay', 'sm')}>
                          Score
                        </button>
                      )}
                    </div>
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
              <p className="text-xs font-bold uppercase tracking-widest text-fg/70">Group Name</p>
              <div className="flex items-center gap-2">
                <input
                  value={labelDraft}
                  onChange={(e) => setLabelDraft(e.target.value)}
                  className="border border-fg/25 flex-1 bg-tennis-surface rounded px-2 py-1 text-fg text-xs"
                />
                <button
                  onClick={() => onRenameGroup(labelDraft)}
                  disabled={!labelDraft.trim() || labelDraft.trim() === groupLabel}
                  className="px-3 py-1 rounded-2xl bg-clay/20 text-clay text-xs font-bold hover:bg-clay/30 transition-colors disabled:opacity-50"
                >
                  Rename
                </button>
              </div>
            </div>
          )}
          <p className="text-xs font-bold uppercase tracking-widest text-fg/70">Reassign Players</p>
          {localPlayers.map((p, idx) => {
            return (
              <div key={p.uid} className="flex items-center gap-2">
                <span className="text-fg/70 text-xs w-4">{idx + 1}.</span>
                <SelectField
                  title={`Player ${idx + 1}`}
                  value={p.uid === PLAYER_LOADING_SENTINEL ? PLAYER_LOADING_SENTINEL : p.uid}
                  options={[
                    { value: PLAYER_LOADING_SENTINEL, label: '(Player Loading)' },
                    ...allGroupPlayers.map((pl) => ({ value: pl.uid, label: formatPlayerName(pl.name) })),
                  ]}
                  onChange={(value) => {
                    if (value === PLAYER_LOADING_SENTINEL) {
                      setLocalPlayers((prev) => prev.map((pp, i) => i === idx
                        ? { uid: PLAYER_LOADING_SENTINEL, name: PLAYER_LOADING, participantId: '' }
                        : pp));
                      return;
                    }
                    const chosen = allGroupPlayers.find((pl) => pl.uid === value);
                    if (!chosen) return;
                    setLocalPlayers((prev) => prev.map((pp, i) => i === idx ? chosen : pp));
                  }}
                  className="flex-1 min-w-0"
                />
              </div>
            );
          })}
          {/* Add a player from another group or the unplaced pool */}
          {(() => {
            const takenIds = new Set(localPlayers.map((p) => p.uid));
            const available = allGroupPlayers.filter((p) => !takenIds.has(p.uid));
            if (!available.length) return null;
            return (
              <div className="flex items-center gap-2">
                <span className="text-fg/70 text-xs w-4">+</span>
                <SelectField
                  value=""
                  placeholder="Add player…"
                  title="Add player"
                  options={available.map((pl) => ({ value: pl.uid, label: formatPlayerName(pl.name) }))}
                  onChange={(value) => {
                    const chosen = allGroupPlayers.find((pl) => pl.uid === value);
                    if (chosen) setLocalPlayers((prev) => [...prev, chosen]);
                  }}
                  className="flex-1 min-w-0"
                />
              </div>
            );
          })()}
          <button
            onClick={() => onSaveGroupEdit(groupIndex, localPlayers)}
            className="w-full mt-2 py-1.5 rounded-2xl bg-clay text-white text-xs font-bold hover:bg-clay/80 transition-colors"
          >
            Save Group
          </button>
        </div>
      )}
    </div>
  );
};
