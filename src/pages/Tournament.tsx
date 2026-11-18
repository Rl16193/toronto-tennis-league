import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { tapScale } from '../lib/motion';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { Lock, Trophy } from 'lucide-react';
import { db } from '../lib/firebase';
import { useTournament } from './tournament/useTournament';
import { isPreviewMatch } from './tournament/utils';
import { drawOf, effectiveZone, sameDraw, zoneBucketFor } from './tournament/drawGenerator';
import { buildDrawSlides, downloadSlide, loadBrandMark } from './tournament/bracketImage';
import { PlayerLinkContext, RemindContext, SeedContext } from './tournament/MatchCard';
import { remindMatch } from '../features/matches/scoring';
import { BracketAccordion } from './tournament/BracketAccordion';
import {
  BracketErrorBoundary, ChangeZoneModal, DrawSlideshow, DrawTabs, RRConfigModal,
  ChangeZoneButton, PartnerPoolPanel, TournamentHeader, UnplacedPlayersPanel,
  WithdrawSelf, ZoneDrawConfigPanel,
} from './tournament/TournamentElements';
import { OpponentCard } from './tournament/OpponentPanels';
import { PlayerDashSwitch } from './profile/PlayerDashElements';
import type { DrawConfig, TournamentMatch } from './tournament/types';
import { isEventManager } from '../utils/eventTypes';
import { resolveStorageUrl } from '../features/events/services/eventService';
import { ScoreModal } from '../features/matches/ScoreModal';
import { useRequestScoring } from '../features/matches/useRequestScoring';
import { AddPlayerPanel } from './tournament/TournamentElements';
import { AddTeammatePanel } from './tournament/TournamentElements';
import { RoundRobinView } from './tournament/RoundRobinView';
import { AlertMessage } from '../components/AlertMessage';
import { LoadingBar } from '../components/LoadingBar';
import { useAuth } from '../context/AuthContext';
import { useContacts } from '../features/contacts/useContacts';

type EventStatus = 'active' | 'completed';

// Slots that aren't a real person yet; a match counts on the event card only with two real sides.
const PLACEHOLDER_NAMES = new Set(['bye', 'player loading', '']);
const isBye = (name: unknown) => typeof name === 'string' && name.trim().toLowerCase() === 'bye';
const isRealName = (name: unknown) =>
  typeof name === 'string' && !PLACEHOLDER_NAMES.has(name.trim().toLowerCase()) && !name.toLowerCase().startsWith('winner of ');

export const Tournament: React.FC<{
  /** False while Matches shows Challenges or Rallies: only the card row renders. */
  showDraw?: boolean;
  /** Matches' Challenges and Rallies cards, at the end of the row. */
  extraCards?: React.ReactNode;
  onPickEvent?: () => void;
}> = ({ showDraw = true, extraCards, onPickEvent }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const eventId = searchParams.get('event') || undefined;

  const [myEventIds, setMyEventIds] = useState<Set<string>>(new Set());
  const [eventStatuses, setEventStatuses] = useState<Record<string, EventStatus>>({});
  const [statusLoading, setStatusLoading] = useState(true);
  // Your matches per tournament, for the event cards.
  const [myMatchCounts, setMyMatchCounts] = useState<Record<string, number>>({});
  // Unplayed matches left in each tournament, for an organizer's cards.
  const [matchesLeft, setMatchesLeft] = useState<Record<string, number>>({});
  // Set by a card tap; the next load of that event scrolls your match into view.
  const [scrollToMine, setScrollToMine] = useState(false);
  // Player View for a manager who also plays; useTournament drops every organizer control.
  const [playerView, setPlayerView] = useState(false);
  const [showZoneConfig, setShowZoneConfig] = useState(false);
  const [showChangeZone, setShowChangeZone] = useState(false);
  // The draw pictures, opened from View Draw under the selector. Everyone can open it,
  // so the organizer's Manage Draw sheet no longer carries a download of its own.
  const [showSlideshow, setShowSlideshow] = useState(false);
  const [brandMark, setBrandMark] = useState('');
  const { profile } = useAuth();

  const {
    authLoading, loading, eventDataReady, user,
    event, matches, participants,
    allTournamentEvents,
    isCreator, userParticipant, zoneMap, statsMap, courtsMap, availabilityMap,
    currentDraw, currentMatches, displayMatches, visibleDraws, drawCounts,
    opponent,
    editPlayers, currentDrawAllPlayers, currentDrawSize,
    message, setMessage,
    generating, resettingDraw, editMode, setEditMode,
    mensSkillMerge, setMensSkillMerge,
    womensSkillMerge, setWomensSkillMerge,
    consolidateDoubles, setConsolidateDoubles,
    liveDraws, selectDraw,
    availableUsers,

    handleUpdateRoundDeadline, handleSetPreviewDrawSize, handleAddPlayer, handleRemovePlayer, handleWithdrawSelf,
    handleGenerateAll, handleResetDraw,
    handleEditPlayer,
    submittableMatchIds,
    currentDrawFormat, drawFormat,
    showRRConfig, setShowRRConfig, generatingRR,
    rrGroups, previewRRGroups, previewRRLabels, rrStandingsByGroup, rrGroupMatches, rrKnockoutMatches,
    rrGroupLabels, rrGroupBonus, rrSingleGroup, rrChampion, drawSeeds, rrKnockoutSeeds,
    rrUnplacedPlayers,
    rrView, setRRView,
    handleGenerateRR, handleResetRR, handleGenerateRRKnockout, handleSaveGroupEdit,
    handleCreateRRGroup, handleRenameGroup, handleSetGroupBonus, handleSetGroupChampion, handleResetMatchScore,
    visibleUserMatch,
    unplacedParticipants, openDrawSlots, handleSeatParticipant,
    handleChangeZone, handleMoveZoneByUid,
    handleMergeZone, handleUnmergeZone, handleSetZoneDrawsEnabled, zoneConfig,
    handleAddTeammate, savingTeammate,
  } = useTournament(eventId, playerView);

  // Viewer's own preferred courts — for the "Nearby" pill shown against an opponent who shares one.
  const myCourts = useMemo(() => new Set(profile?.preferences.preferred_courts ?? []), [profile]);

  // One score sheet (useRequestScoring): a player scores from their own side; an organizer for both
  // players from player 1's, with a walkover and, once played, Reset.
  const scoring = useRequestScoring(user ? { uid: user.uid, name: profile?.user.name ?? '' } : null, (notice) => {
    if (!notice) setMessage({ type: 'success', text: 'Score recorded and draw updated.' });
  });
  const openScore = (m: TournamentMatch) => {
    const viewerIsP1 = isCreator || user?.uid === m.player_1_uid;
    const p1 = { uid: m.player_1_uid, name: m.player_1_name };
    const p2 = { uid: m.player_2_uid, name: m.player_2_name };
    scoring.open({
      kind: 'tournament', docId: m.id, title: m.round, court: m.result?.court,
      opponent: viewerIsP1 ? p2 : p1, viewerIsP1,
      organizer: isCreator ? {
        player1: p1,
        onReset: m.status === 'complete' ? async () => { await handleResetMatchScore(m); scoring.close(); } : undefined,
      } : undefined,
    });
  };

  // Score API passed to the current-match panel. Undefined when logged out.
  const scheduleApi = user
    ? {
        onSubmitScore: openScore,
        submittableMatchIds,
      }
    : undefined;

  useEffect(() => {
    document.title = event?.title
      ? `${event.title} · Racquets & Strings`
      : 'Matches · Racquets & Strings';
  }, [event?.title]);

  // Which tournaments the signed-in user has joined (event_participants) — combined with the
  // ones they created, this is the set the Matches tab lists.
  useEffect(() => {
    if (!user) { setMyEventIds(new Set()); return; }
    getDocs(query(collection(db, 'event_participants'), where('uid', '==', user.uid)))
      .then((snap) => setMyEventIds(new Set(snap.docs
        .filter((d) => d.data().status === 'active') // a withdrawn registration isn't a tournament you're in
        .map((d) => (d.data().event_id as string)).filter(Boolean))))
      .catch(() => {});
  }, [user?.uid]);

  // Fetch match statuses for all events (one batch query) — classifies completed vs live.
  useEffect(() => {
    if (allTournamentEvents.length === 0) return;
    const ids = allTournamentEvents.map((e) => e.id).slice(0, 30);
    setStatusLoading(true);
    getDocs(query(collection(db, 'matches'), where('event_id', 'in', ids)))
      .then((snap) => {
        const statuses: Record<string, EventStatus> = {};
        const counts: Record<string, number> = {};
        const left: Record<string, number> = {};
        snap.docs.forEach((d) => {
          const m = d.data();
          const eid = m.event_id as string;
          if (!statuses[eid]) statuses[eid] = 'active';
          // participant_uids carries doubles partners too.
          if (user && m.status !== 'cancelled' && (m.participant_uids ?? []).includes(user.uid)
            && isRealName(m.player_1_name) && isRealName(m.player_2_name)) {
            counts[eid] = (counts[eid] ?? 0) + 1;
          }
          // Still to play before the event is done: unplayed, not cancelled, not a bye. Later
          // rounds waiting on a winner count too.
          if (m.status !== 'complete' && m.status !== 'cancelled'
            && !isBye(m.player_1_name) && !isBye(m.player_2_name)) {
            left[eid] = (left[eid] ?? 0) + 1;
          }
        });
        setMyMatchCounts(counts);
        setMatchesLeft(left);
        // Completed only once every draw has played its final: scoring stamps `completed_at` then.
        allTournamentEvents.forEach((e) => { if (e.completed_at) statuses[e.id] = 'completed'; });
        setEventStatuses(statuses);
      })
      .finally(() => setStatusLoading(false));
  }, [allTournamentEvents.length, user?.uid]);

  // Tournaments the user joined or created. League Ladder events live on their own page
  // (/matches, Challenges tab) now — this page shows only bracket/RR tournaments.
  // Player View keeps only the tournaments you play in, each seen as a player.
  const myEvents = useMemo(
    () => allTournamentEvents.filter((e) => !!user && (
      myEventIds.has(e.id) || (!playerView && e.organizer_ids?.includes(user.uid)))),
    [allTournamentEvents, user, myEventIds, playerView],
  );
  // Completed tournaments are reached from History via ?event= deep links — no Past mode here.
  const tabEvents = myEvents.filter((e) => eventStatuses[e.id] !== 'completed');
  const liveEvents = allTournamentEvents.filter((e) => eventStatuses[e.id] !== 'completed');
  // The switch shows to a manager (an organizer or the super admin) who plays in a live tournament.
  const canPlayerView = !!user && liveEvents.some((e) => isEventManager(e, user.uid))
    && liveEvents.some((e) => myEventIds.has(e.id));

  // gs:// image paths become download URLs; a web URL is used as it is.
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const tabImages = tabEvents.map((e) => `${e.id}=${e.image ?? ''}`).join('|');
  useEffect(() => {
    tabEvents.filter((e) => e.image?.startsWith('gs://') && !imageUrls[e.id]).forEach((e) => {
      resolveStorageUrl(e.image!)
        .then((url) => setImageUrls((cur) => ({ ...cur, [e.id]: url })))
        .catch(() => {});
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabImages]);
  const imageOf = (e: { id: string; image?: string }) =>
    e.image?.startsWith('gs://') ? imageUrls[e.id] ?? '' : e.image ?? '';

  const selectEvent = (id: string) =>
    setSearchParams((p) => { const n = new URLSearchParams(p); n.set('event', id); return n; });

  const selectedMeta = myEvents.find((e) => e.id === eventId);

  // Keep a valid selection: any of my events counts (completed ones arrive via History).
  // Otherwise pick the first event on the current tab.
  const tabKey = tabEvents.map((e) => e.id).join(',');
  useEffect(() => {
    if (statusLoading) return;
    if (eventId && myEvents.some((e) => e.id === eventId)) return;
    if (tabEvents.length > 0) {
      setSearchParams((p) => { const n = new URLSearchParams(p); n.set('event', tabEvents[0].id); return n; }, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusLoading, tabKey, eventId, myEvents.length]);

  // After a card tap, scroll your match into view once that event has loaded.
  useEffect(() => {
    if (!scrollToMine || !event || event.id !== eventId || loading) return;
    setScrollToMine(false);
    requestAnimationFrame(() =>
      document.getElementById('my-tournament-match')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  }, [scrollToMine, event, eventId, loading]);

  // Gate on BOTH the initial event-list fetch AND the currently-selected event's own data
  // (participants + matches) actually arriving — otherwise switching tournaments (or the gap
  // between the event list loading and the specific event being selected) briefly renders a
  // flash of empty/wrong content instead of a loading state.
  // Zones that already have generated matches can't be merged away — their draws would vanish.
  // Declared ABOVE the loading early-return below: a hook after a conditional return runs on some
  // renders and not others, which is what "Rendered more hooks than during the previous render"
  // means. Every hook in this component has to sit above that return.
  const zonesWithMatches = useMemo(
    () => new Set(matches.map((m) => m.zone).filter((z): z is string => !!z)),
    [matches],
  );

  // The zone bucket this player actually sits in, by its display name. Reads the RESOLVED config
  // so it honours zones being on by default and follows any merge to the target zone.
  const userZoneLabel = useMemo(() => {
    if (!zoneConfig.enabled || !userParticipant) return '';
    const bucketId = zoneBucketFor(zoneMap[userParticipant.uid], zoneConfig);
    return zoneConfig.buckets.find((b) => b.id === bucketId)?.label ?? 'Unassigned';
  }, [zoneConfig, userParticipant, zoneMap]);

  // The zones a player's draw picker steps through: their own, plus any zone they hold a match in.
  const playerZones = useMemo(() => {
    if (!userParticipant) return undefined;
    const zones = new Set([zoneBucketFor(zoneMap[userParticipant.uid], zoneConfig)]);
    matches.forEach((m) => {
      if (m.participant_uids?.includes(userParticipant.uid)) zones.add(effectiveZone(m.zone));
    });
    return zones;
  }, [userParticipant, zoneMap, zoneConfig, matches]);

  // ── Draw pictures ──────────────────────────────────────────────────────────
  // All of this sits above the loading early-return to keep hook order stable.

  // Contacts are fetched ONE AT A TIME, deliberately. `userMap` gets them in batches of ten and
  // Firestore denies a whole batch if the caller may not read even one of its docs, so a player
  // connected to two people in a batch got none of them and only organizers ever saw numbers.
  // A per-uid read with its own catch returns exactly what this viewer is allowed to see, which
  // is precisely the "contacts for people you are playing" rule. Only while the sheet is open.
  const drawContactUids = useMemo(() => [...new Set([
    ...currentMatches.flatMap((m) => [m.player_1_uid, m.player_2_uid]),
    ...rrGroups.flat().map((p) => p.uid),
  ].filter(Boolean))], [currentMatches, rrGroups]);
  const drawContacts = useContacts(showSlideshow ? drawContactUids : []);

  // The badge is fetched and recoloured once, the first time somebody opens the slideshow.
  useEffect(() => {
    if (showSlideshow && !brandMark) loadBrandMark().then(setBrandMark);
  }, [showSlideshow, brandMark]);

  const slideInput = useMemo(() => {
    const [division, zone] = (currentDraw?.label ?? 'Draw').split(' — ');
    return {
      matches: currentMatches,
      groups: rrGroups.length > 0 ? rrGroups : previewRRGroups,
      groupLabels: rrGroups.length > 0 ? rrGroupLabels : previewRRLabels,
      // Singles/Doubles is appended only when the event's own name doesn't already say it,
      // or the header reads "Zephyr Open 2026 Singles · Singles".
      eventTitle: [
        event?.title,
        currentDraw?.tournamentChoice && !new RegExp(currentDraw.tournamentChoice, 'i').test(event?.title ?? '')
          ? currentDraw.tournamentChoice : '',
      ].filter(Boolean).join(' · '),
      division,
      zone,
      roundDeadlines: event?.round_deadlines ?? {},
      contacts: drawContacts,
      groupSeeds: drawSeeds,
      bracketSeeds: currentDrawFormat === 'rr' ? rrKnockoutSeeds : drawSeeds,
      brandMark,
    };
  }, [currentMatches, rrGroups, rrGroupLabels, previewRRGroups, previewRRLabels,
    event?.title, event?.round_deadlines, currentDraw, drawContacts, brandMark,
    drawSeeds, rrKnockoutSeeds, currentDrawFormat]);

  // Built only while the sheet is open; a closed slideshow costs nothing.
  const drawSlides = useMemo(
    () => (showSlideshow ? buildDrawSlides(slideInput) : []),
    [showSlideshow, slideInput],
  );
  // The button appears once the draw has real matches, not previews.
  const hasGeneratedMatches = displayMatches.some((m) => !isPreviewMatch(m));

  // Hooks: must stay above the loading early return below.
  // Doubles partner pool: active doubles registrations with no partner. A player sees their own
  // division's pool; an organizer sees every pool. A doubles entry with no partner IS in the pool,
  // so there is nothing to join or leave. Contacts are per-uid reads (the server connects pool
  // members), each allowed or denied on its own.
  const needsPartner = userParticipant?.category === 'doubles_tournament' && !userParticipant.partner_uid;
  const poolMembers = useMemo(() => participants
    .filter((p) => p.category === 'doubles_tournament' && p.status === 'active' && !p.partner_uid && p.uid
      && (isCreator || p.division === userParticipant?.division))
    .map((p) => ({ uid: p.uid, name: p.user_name || 'Player', skill: Number(p.skill || 0) })),
  [participants, isCreator, userParticipant?.division]);
  const poolContacts = useContacts(needsPartner || isCreator ? poolMembers.map((m) => m.uid) : []);

  // One card row for the Matches page: your live tournaments (a completed one opened from History
  // has no card but still renders below), then Matches' own Challenges and Rallies cards.
  const cardRow = (
    <>
    {canPlayerView && (
      <div className="mb-4">
        <PlayerDashSwitch
          label="Player View"
          hint="Your tournaments, as a player sees them."
          on={playerView}
          count={0}
          onChange={setPlayerView}
        />
      </div>
    )}
    <div className="grid grid-cols-3 gap-3 mb-4">
      {tabEvents.map((e) => {
        const active = showDraw && e.id === eventId;
        // An organizer (outside Player View) sees what's left to play; a player, their own matches.
        const managing = !!user && !playerView && isEventManager(e, user.uid);
        const n = (managing ? matchesLeft : myMatchCounts)[e.id] ?? 0;
        return (
          <button
            key={e.id}
            type="button"
            onClick={() => { selectEvent(e.id); setScrollToMine(true); onPickEvent?.(); }}
            aria-pressed={active}
            className={`relative w-full aspect-square rounded-2xl overflow-hidden text-left bg-fg/5
                        transition-[opacity,box-shadow] focus-visible:outline-2 focus-visible:outline-offset-2
                        focus-visible:outline-clay ${active ? 'ring-2 ring-clay' : 'opacity-90 hover:opacity-100'}`}
          >
            {imageOf(e) ? (
              <img
                src={imageOf(e)}
                alt=""
                loading="lazy"
                decoding="async"
                className="absolute inset-0 w-full h-full object-cover object-center"
              />
            ) : (
              <Trophy className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 text-fg/70" />
            )}
            <span className="absolute top-1.5 left-1.5 max-w-[calc(100%-0.75rem)] truncate rounded-full bg-clay px-1.5 py-0.5 text-xs font-bold text-white">
              Tournament
            </span>
            <span className="absolute inset-x-0 bottom-0 p-2.5 bg-gradient-to-t from-tennis-dark via-tennis-dark/75 to-transparent">
              <span className="block text-sm font-bold text-clay truncate">{e.title}</span>
              <span className="block text-xs font-semibold text-fg/70">
                {n} Match{n === 1 ? '' : 'es'}{managing ? ' Left' : ''}
              </span>
            </span>
          </button>
        );
      })}
      {extraCards}
    </div>
    </>
  );

  const initialLoading = authLoading || (loading && allTournamentEvents.length === 0);
  const eventSwitching = !initialLoading && allTournamentEvents.length > 0 && !eventDataReady;
  if (!showDraw) return cardRow;
  if (initialLoading || eventSwitching) {
    return (
      <>
        {cardRow}
        <LoadingBar
          label="Loading matches…"
          progress={initialLoading ? 20 : event ? 75 : 45}
          className="min-h-[50vh] flex flex-col items-center justify-center gap-4"
        />
      </>
    );
  }

  // Read-only mode is per-event now: a completed tournament opened from History renders
  // exactly like the old Past mode did.
  const pastMode = !!event && eventStatuses[event.id] === 'completed';

  const canEdit = isCreator && !pastMode;
  const effEditMode = editMode && canEdit;
  const schedule = pastMode ? undefined : scheduleApi;
  // Creator can always enter or edit scores (including past events and already-scored matches).
  const submitScore = isCreator || !pastMode ? openScore : undefined;
  const submittable = pastMode ? undefined : submittableMatchIds;
  const isRR = currentDrawFormat === 'rr';

  // Completed tournaments stay open to any spectator (History deep-links rely on this). A live
  // one is locked behind participation — creators and joined participants see the draw, anyone
  // else (e.g. someone who switched the ?event= param, or joined a different tournament) gets a
  // join prompt instead of the bracket.
  const joinLocked = !pastMode && !isCreator && !userParticipant;

  // Past events: hide draws that were never played (no submitted scores) — e.g. an empty Retired
  // Pro or Doubles draw in a season opener. Live events keep every draw so setup stays visible.
  const drawHasCompleted = (d: DrawConfig) =>
    matches.some((m) => m.status === 'complete' && sameDraw(drawOf(m), d));
  const baseDraws = liveDraws.length > 0 ? liveDraws : visibleDraws;
  const playedDraws = pastMode ? baseDraws.filter(drawHasCompleted) : baseDraws;
  const shownDraws = playedDraws.length > 0 ? playedDraws : baseDraws;

  // Draw size sits inside the selected draw's row in the tree, so it's attached to the draw it
  // resizes. Creator-only, knockout-only, and locked once matches exist.
  const drawSizeControl = !isRR && effEditMode && currentDraw ? (
    <div className="rounded-2xl bg-fg/5 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold text-fg/70 uppercase tracking-widest">Draw size</span>
        {[8, 16, 32].map((size) => (
          <motion.button
            key={size}
            disabled={currentMatches.length > 0}
            onClick={() => handleSetPreviewDrawSize(currentDraw.label, size)}
            whileTap={currentMatches.length > 0 ? undefined : tapScale.whileTap}
            transition={tapScale.transition}
            className={`px-3 py-1 rounded-2xl text-xs font-bold transition-colors ${
              currentDrawSize === size ? 'bg-clay text-white' : currentMatches.length > 0 ? 'bg-fg/5 text-fg/70 opacity-50 cursor-not-allowed' : 'bg-tennis-surface/60 text-fg'
            }`}
          >
            R{size}
          </motion.button>
        ))}
      </div>
      {currentMatches.length > 0 && (
        <p className="text-xs text-badge/80 mt-1.5">Matches already created. Reset this draw first to change the size.</p>
      )}
    </div>
  ) : undefined;

  const drawSelector = (
    <DrawTabs
      selected={currentDraw}
      draws={shownDraws}
      drawCounts={drawCounts}
      onSelect={selectDraw}
      rrView={isRR && rrGroupMatches.length > 0 ? rrView : undefined}
      onRRViewChange={isRR && rrGroupMatches.length > 0 ? setRRView : undefined}
      drawSizeControl={drawSizeControl}
      onViewCompleteDraw={hasGeneratedMatches ? () => setShowSlideshow(true) : undefined}
      playerMode={!isCreator}
      playerZones={playerZones}
      isMyDraw={!!user && currentMatches.some((m) => m.participant_uids?.includes(user.uid))}
    />
  );

  const roundRobinFull = (readOnly: boolean) => (
    <RoundRobinView
      groups={rrGroups.length > 0 ? rrGroups : previewRRGroups}
      groupLabels={rrGroups.length > 0 ? rrGroupLabels : previewRRLabels}
      groupBonus={rrGroups.length > 0 ? rrGroupBonus : undefined}
      standingsByGroup={rrGroups.length > 0 ? rrStandingsByGroup : previewRRGroups.map(() => [])}
      groupMatches={rrGroupMatches}
      knockoutMatches={rrKnockoutMatches}
      isCreator={readOnly ? false : canEdit}
      currentUserId={user?.uid}
      editMode={readOnly ? false : effEditMode}
      editPlayers={editPlayers}
      onEditPlayer={handleEditPlayer}
      onSubmitScore={readOnly ? undefined : submitScore}
      submittableMatchIds={readOnly ? undefined : submittable}
      onSaveGroupEdit={handleSaveGroupEdit}
      onRenameGroup={handleRenameGroup}
      // Passed regardless of readOnly: players see the switch (disabled) so they can tell whether
      // their group's bonus has been paid. handleSetGroupBonus is creator-gated on its own.
      onSetGroupBonus={handleSetGroupBonus}
      // One group, no knockout: its leader can be named winner. Everyone sees the winner; only the
      // organizer gets the button (handleSetGroupChampion is creator-gated too).
      champion={rrSingleGroup ? rrChampion : undefined}
      onSetChampion={rrSingleGroup && !readOnly ? handleSetGroupChampion : undefined}
      onRemovePlayer={handleRemovePlayer}
      onWithdrawSelf={withdrawSelf}
      onMovePlayerZone={handleMoveZoneByUid}
      zoneBuckets={zoneConfig.buckets}
      onCreateGroup={handleCreateRRGroup}
      unplacedPlayers={rrUnplacedPlayers}
      generatingKnockout={generatingRR}
      onGenerateKnockout={handleGenerateRRKnockout}
      rrView={rrView}
      roundDeadlines={event?.round_deadlines}
      onUpdateDeadline={canEdit ? handleUpdateRoundDeadline : undefined}
    />
  );

  // Players, organizers and the super admin alike may withdraw themselves while the event is live.
  const withdrawSelf = !pastMode && !effEditMode && userParticipant ? handleWithdrawSelf : undefined;

  // Your match; a card tap scrolls to it by this id.
  const myMatchCard = opponent && (
    <div id="my-tournament-match">
      <OpponentCard opponent={opponent} currentMatch={visibleUserMatch} schedule={schedule} isCreator={isCreator} viewerUid={user?.uid} myCourts={myCourts} courtsMap={courtsMap} availabilityMap={availabilityMap} />
      {withdrawSelf && visibleUserMatch?.status !== 'complete' && <WithdrawSelf onWithdraw={withdrawSelf} />}
    </div>
  );

  const drawContent = (
    <div className="pt-2">
      {message && (
        <AlertMessage tone={message.type} className="mb-6">
          <p>{message.text}</p>
        </AlertMessage>
      )}

      {/* Disputed results moved to the Organizer Dash (/profile?dash=organizer), which lists every
          kind of dispute in one place instead of one event at a time. */}

      {/* Only once a draw exists — before that "unplaced" is everyone, which says nothing. */}
      {!pastMode && isCreator && currentMatches.length > 0 && (
        <UnplacedPlayersPanel
          players={unplacedParticipants}
          slots={openDrawSlots}
          onSeat={handleSeatParticipant}
        />
      )}

      {/* Zone is worth stating outright: it decides which draw you're in.
          Gated on the RESOLVED config, not `event.zone_draw_config`. No event has ever stored that
          field, while `resolveZoneConfig` defaults `enabled` to true — so reading the raw field
          made this whole row (and the only way a player can ask to move) permanently invisible. */}
      {!pastMode && !isCreator && zoneConfig.enabled && userParticipant && (
        <div className="mb-6 flex items-center justify-center gap-3 flex-wrap">
          <span className="text-xs text-fg/70">
            Zone: <span className="font-bold text-fg">{userZoneLabel}</span>
          </span>
          <ChangeZoneButton onChange={() => setShowChangeZone(true)} />
        </div>
      )}

      <AnimatePresence>
        {showChangeZone && userParticipant && (
          <ChangeZoneModal
            currentZone={userZoneLabel}
            onClose={() => setShowChangeZone(false)}
            onSubmit={(zone) => handleChangeZone(zone)}
          />
        )}
      </AnimatePresence>

      {/* A doubles registration with no partner recorded can't be placed in a draw — let the
          player finish the pairing themselves rather than re-register. */}
      {!pastMode && userParticipant && needsPartner && (
        <AddTeammatePanel
          currentUserId={userParticipant.uid}
          saving={savingTeammate}
          onSave={(name, partnerUid, skill) => handleAddTeammate(userParticipant.id, name, partnerUid, skill)}
        />
      )}

      {!pastMode && user && (needsPartner || (isCreator && poolMembers.length > 0)) && (
        <PartnerPoolPanel
          members={poolMembers}
          contacts={poolContacts}
          viewerUid={user.uid}
        />
      )}

      {/* Draw tabs: division → skill → (RR) Groups / Knockout */}
      {drawSelector}

      {/* Creator edit tools */}
      {effEditMode && (
        <AddPlayerPanel availableUsers={availableUsers} currentDraw={currentDraw} onAdd={handleAddPlayer} />
      )}
      {/* Draw Size moved into the division tree above — see `drawSizeControl`. */}

      {/* Your group / your match — under all the tabs. Groups view → your group; Knockout view → your match. */}
      {isRR ? (
        rrView === 'knockout'
          ? (visibleUserMatch && opponent
              ? myMatchCard
              : !isCreator && (
                  <div className="mb-6 rounded-2xl bg-fg/5 px-4 py-6 text-center">
                    <p className="text-sm font-semibold text-fg/70">Draw not released yet</p>
                  </div>
                ))
          // "Your Group" used to repeat the whole group here. Every part of it — contact, your
          // result, and the score/schedule action for your match — now lives in the player row
          // inside the group card itself, so this panel was saying the same thing twice.
          : null
      ) : (
        currentMatches.length > 0 && opponent && (
          myMatchCard
        )
      )}

      {/* Full draw: the round-by-round accordion on every screen size, so desktop and mobile
          read the same. */}
      {isRR ? (
        roundRobinFull(!canEdit)
      ) : (
        (isCreator || displayMatches.some((m) => !isPreviewMatch(m))) && (
          <BracketErrorBoundary onDownload={() => {
            const [first] = buildDrawSlides(slideInput);
            if (first) downloadSlide(first);
          }}>
            <BracketAccordion
              matches={displayMatches}
              editMode={effEditMode}
              editPlayers={editPlayers}
              onEditPlayer={handleEditPlayer}
              onRemovePlayer={handleRemovePlayer}
              isCreator={isCreator}
              onSubmitScore={submitScore}
              submittableMatchIds={submittable}
              roundDeadlines={event?.round_deadlines}
              onUpdateDeadline={canEdit ? handleUpdateRoundDeadline : undefined}
            />
          </BracketErrorBoundary>
        )
      )}

      {/* Creator controls — hidden for past (read-only) tournaments */}
      {!pastMode && isCreator && (
        <div className="mt-8 pt-6 border-t border-fg/5">
          <TournamentHeader
            isCreator={isCreator}
            hasMatches={currentMatches.length > 0}
            isProcessing={generating || resettingDraw || generatingRR}
            editMode={effEditMode}
            started={currentMatches.some((m) => m.status === 'complete')}
            mensSkillMerge={mensSkillMerge}
            womensSkillMerge={womensSkillMerge}
            consolidateDoubles={consolidateDoubles}
            currentDrawFormat={currentDrawFormat}
            onGenerateMatches={drawFormat === 'rr' ? () => setShowRRConfig(true) : handleGenerateAll}
            onCancelMatches={currentDrawFormat === 'rr' ? handleResetRR : handleResetDraw}
            onToggleEdit={() => setEditMode((v) => !v)}
            onSetMensSkillMerge={setMensSkillMerge}
            onSetWomensSkillMerge={setWomensSkillMerge}
            onToggleConsolidateDoubles={() => setConsolidateDoubles((v) => !v)}
            zoneDrawsEnabled={zoneConfig.enabled}
            onOpenZoneConfig={() => setShowZoneConfig(true)}
          />
          {showZoneConfig && (
            <ZoneDrawConfigPanel
              config={zoneConfig}
              participants={participants}
              zoneMap={zoneMap}
              statsMap={statsMap}
              zonesWithMatches={zonesWithMatches}
              onMerge={handleMergeZone}
              onUnmerge={handleUnmergeZone}
              onSetEnabled={handleSetZoneDrawsEnabled}
              onClose={() => setShowZoneConfig(false)}
            />
          )}
        </div>
      )}

      <AnimatePresence>
        {scoring.modalProps && <ScoreModal {...scoring.modalProps} />}
      </AnimatePresence>

      <AnimatePresence>
        {showRRConfig && (
          <RRConfigModal
            playerCount={currentDrawAllPlayers.length}
            isLoading={generatingRR}
            onConfirm={handleGenerateRR}
            onClose={() => setShowRRConfig(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );

  const selectedLoaded = !!event && event.id === eventId && !loading;

  // The live events, plus the selected one if it came from a History deep link (a completed
  // tournament that has no card).
  const dropdownEvents = selectedMeta && !tabEvents.some((e) => e.id === selectedMeta.id)
    ? [selectedMeta, ...tabEvents]
    : tabEvents;

  return (
    // Organizers can tap a player's name in the draw to open their profile.
    <PlayerLinkContext.Provider value={isCreator ? (uid) => navigate(`/players/${uid}`) : null}>
    {/* An RR draw shows its group seeds, or the knockout's on the Knockout view. */}
    <SeedContext.Provider value={isRR && rrView === 'knockout' ? rrKnockoutSeeds : drawSeeds}>
    {/* Organizers get the paper-plane WhatsApp reminder on unplayed matches. */}
    <RemindContext.Provider value={isCreator && !pastMode ? remindMatch : null}>
    <div>
      {cardRow}

      <AnimatePresence>
        {showSlideshow && <DrawSlideshow slides={drawSlides} onClose={() => setShowSlideshow(false)} />}
      </AnimatePresence>

      {statusLoading && allTournamentEvents.length === 0 ? (
        <div className="space-y-3">
          {[1, 2].map((i) => <div key={i} className="h-14 bg-fg/5 rounded-2xl animate-pulse" />)}
        </div>
      ) : dropdownEvents.length === 0 ? (
        <div className="text-center py-16 space-y-4">
          <p className="text-fg/70 text-sm">You're not in any current tournaments.</p>
          <Link to="/events" className="inline-block">
            <span className="px-4 py-2 rounded-2xl bg-clay text-white text-sm font-semibold hover:bg-clay/90 transition-colors">
              Join an active tournament
            </span>
          </Link>
        </div>
      ) : !selectedLoaded ? (
        <div className="flex justify-center py-16">
          <div className="w-10 h-10 border-4 border-clay border-t-transparent rounded-full animate-spin" />
        </div>
      ) : joinLocked ? (
        <div className="rounded-2xl bg-fg/5 px-6 py-14 text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-fg/5 flex items-center justify-center mx-auto">
            <Lock className="w-5 h-5 text-fg/70" />
          </div>
          <p className="text-sm font-bold text-fg">Join to view the live draw</p>
          <p className="text-xs text-fg/70 max-w-xs mx-auto">
            {event?.title ? `You haven't joined "${event.title}" yet.` : "You haven't joined this tournament yet."} Join to see matches and scores as they happen.
          </p>
          <Link to="/events" className="inline-block pt-1">
            <span className="px-4 py-2 rounded-2xl bg-clay text-white text-sm font-semibold hover:bg-clay/90 transition-colors">
              Find this event
            </span>
          </Link>
        </div>
      ) : (
        drawContent
      )}
    </div>
    </RemindContext.Provider>
    </SeedContext.Provider>
    </PlayerLinkContext.Provider>
  );
};
