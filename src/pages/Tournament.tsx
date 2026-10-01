import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { tapScale } from '../lib/motion';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { Lock, Menu } from 'lucide-react';
import { db } from '../lib/firebase';
import { Sheet } from '../components/Sheet';
import { useTournament } from './tournament/useTournament';
import { choiceOfMatch, getEventDate, isPreviewMatch, zoneBucketFor } from './tournament/utils';
import { toDate } from '../utils/eventDates';
import { buildDrawSlides, downloadSlide, loadBrandMark } from './tournament/bracketImage';
import { BracketView } from './tournament/BracketView';
import { BracketAccordion } from './tournament/BracketAccordion';
import {
  BracketErrorBoundary, ChangeZoneModal, DrawSlideshow, DrawTabs, RRConfigModal,
  ChangeZoneButton, PartnerPoolPanel, TournamentHeader, UnplacedPlayersPanel,
  ZoneDrawConfigPanel,
} from './tournament/TournamentElements';
import { OpponentCard } from './tournament/OpponentPanels';
import { ScoreModal } from '../features/matches/ScoreModal';
import { AddPlayerPanel } from './tournament/TournamentElements';
import { AddTeammatePanel } from './tournament/TournamentElements';
import { RoundRobinView } from './tournament/RoundRobinView';
import { AlertMessage } from '../components/AlertMessage';
import { LoadingBar } from '../components/LoadingBar';
import { TennisEvent } from '../types';
import { useAuth } from '../context/AuthContext';
import { useContacts } from '../features/contacts/useContacts';

type EventStatus = 'active' | 'completed';


const formatEventRange = (e: TennisEvent): string => {
  const start = getEventDate(e);
  const end: Date | null = toDate(e.end_date);
  if (!start) return '';
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  const s = start.toLocaleDateString('en-CA', opts);
  if (!end) return s;
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  const endStr = sameMonth
    ? end.toLocaleDateString('en-CA', { day: 'numeric' })
    : end.toLocaleDateString('en-CA', opts);
  return `${s}–${endStr}, ${start.getFullYear()}`;
};

export const Tournament: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const eventId = searchParams.get('event') || undefined;

  const [myEventIds, setMyEventIds] = useState<Set<string>>(new Set());
  const [eventStatuses, setEventStatuses] = useState<Record<string, EventStatus>>({});
  const [statusLoading, setStatusLoading] = useState(true);
  const [showEventSheet, setShowEventSheet] = useState(false);
  const [showZoneConfig, setShowZoneConfig] = useState(false);
  const [showChangeZone, setShowChangeZone] = useState(false);
  // The draw pictures, opened from View Complete Draw under the selector. Everyone can open it,
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
    message, scoreForm, scoreFormMatch, setScoreForm,
    generating, resettingDraw, editMode, setEditMode,
    mensSkillMerge, setMensSkillMerge,
    womensSkillMerge, setWomensSkillMerge,
    consolidateDoubles, setConsolidateDoubles,
    activeTab, setActiveTab, activeSkill, setActiveSkill, activeDoubles, setActiveDoubles, setActiveZone,
    availableUsers,

    handleUpdateRoundDeadline, handleSetPreviewDrawSize, handleAddPlayer, handleRemovePlayer,
    handleGenerateAll, handleResetDraw,
    handleEditPlayer, handleSubmitScore, handleOpenScoreForm,
    submittableMatchIds,
    currentDrawFormat, drawFormat,
    showRRConfig, setShowRRConfig, generatingRR,
    rrGroups, previewRRGroups, previewRRLabels, rrStandingsByGroup, rrGroupMatches, rrKnockoutMatches,
    rrGroupLabels, rrGroupBonus,
    rrUnplacedPlayers,
    rrView, setRRView,
    handleGenerateRR, handleResetRR, handleGenerateRRKnockout, handleSaveGroupEdit,
    handleCreateRRGroup, handleRenameGroup, handleSetGroupBonus, handleResetMatchScore,
    visibleUserMatch,
    unplacedParticipants, openDrawSlots, handleSeatParticipant,
    handleChangeZone, handleMoveZoneByUid,
    handleMergeZone, handleUnmergeZone, handleSetZoneDrawsEnabled, zoneConfig,
    handleAddTeammate, savingTeammate,
  } = useTournament(eventId);

  // Viewer's own preferred courts — for the "Nearby" pill shown against an opponent who shares one.
  const myCourts = useMemo(() => new Set(profile?.preferences.preferred_courts ?? []), [profile]);

  // Score API passed to the current-match panel (the existing submit flow). Undefined when logged out.
  const scheduleApi = user
    ? {
        onSubmitScore: handleOpenScoreForm,
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
        snap.docs.forEach((d) => {
          const m = d.data();
          const eid = m.event_id as string;
          if (!statuses[eid]) statuses[eid] = 'active';
          if (m.round === 'F' && m.status === 'complete' && m.winner_uid) statuses[eid] = 'completed';
        });
        setEventStatuses(statuses);
      })
      .finally(() => setStatusLoading(false));
  }, [allTournamentEvents.length]);

  // Tournaments the user joined or created. League Ladder events live on their own page
  // (/matches, Challenges tab) now — this page shows only bracket/RR tournaments.
  const myEvents = useMemo(
    () => allTournamentEvents.filter((e) => !!user && (e.organizer_ids?.includes(user.uid) || myEventIds.has(e.id))),
    [allTournamentEvents, user, myEventIds],
  );
  // Completed tournaments are reached from History via ?event= deep links — no Past mode here.
  const tabEvents = myEvents.filter((e) => eventStatuses[e.id] !== 'completed');

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
      brandMark,
    };
  }, [currentMatches, rrGroups, rrGroupLabels, previewRRGroups, previewRRLabels,
    event?.title, event?.round_deadlines, currentDraw, drawContacts, brandMark]);

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

  const initialLoading = authLoading || (loading && allTournamentEvents.length === 0);
  const eventSwitching = !initialLoading && allTournamentEvents.length > 0 && !eventDataReady;
  if (initialLoading || eventSwitching) {
    return (
      <LoadingBar
        label="Loading matches…"
        progress={initialLoading ? 20 : event ? 75 : 45}
        className="min-h-[50vh] flex flex-col items-center justify-center gap-4"
      />
    );
  }

  // Read-only mode is per-event now: a completed tournament opened from History renders
  // exactly like the old Past mode did.
  const pastMode = !!event && eventStatuses[event.id] === 'completed';

  const canEdit = isCreator && !pastMode;
  const effEditMode = editMode && canEdit;
  const schedule = pastMode ? undefined : scheduleApi;
  // Creator can always enter or edit scores (including past events and already-scored matches).
  const submitScore = isCreator ? handleOpenScoreForm : (pastMode ? undefined : handleOpenScoreForm);
  const submittable = pastMode ? undefined : submittableMatchIds;
  const isRR = currentDrawFormat === 'rr';

  // Completed tournaments stay open to any spectator (History deep-links rely on this). A live
  // one is locked behind participation — creators and joined participants see the draw, anyone
  // else (e.g. someone who switched the ?event= param, or joined a different tournament) gets a
  // join prompt instead of the bracket.
  const joinLocked = !pastMode && !isCreator && !userParticipant;

  // Past events: hide draws that were never played (no submitted scores) — e.g. an empty Retired
  // Pro or Doubles draw in a season opener. Live events keep every draw so setup stays visible.
  const drawHasCompleted = (d: { tournamentChoice: string; division: string; skillGroup: string }) =>
    matches.some((m) =>
      choiceOfMatch(m) === d.tournamentChoice && m.division === d.division &&
      m.skill_group === d.skillGroup && m.status === 'complete');
  const playedDraws = pastMode ? visibleDraws.filter(drawHasCompleted) : visibleDraws;
  const shownDraws = playedDraws.length > 0 ? playedDraws : visibleDraws;

  // Draw size sits inside the selected draw's row in the tree, so it's attached to the draw it
  // resizes. Creator-only, knockout-only, and locked once matches exist.
  const drawSizeControl = !isRR && effEditMode && currentDraw ? (
    <div className="rounded-xl bg-fg/[0.03] px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-bold text-fg/70 uppercase tracking-widest">Draw size</span>
        {[8, 16, 32].map((size) => (
          <motion.button
            key={size}
            disabled={currentMatches.length > 0}
            onClick={() => handleSetPreviewDrawSize(currentDraw.label, size)}
            whileTap={currentMatches.length > 0 ? undefined : tapScale.whileTap}
            transition={tapScale.transition}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
              currentDrawSize === size ? 'bg-clay text-white' : currentMatches.length > 0 ? 'bg-tennis-surface/30 text-fg/70 opacity-50 cursor-not-allowed' : 'bg-tennis-surface/60 text-fg'
            }`}
          >
            R{size}
          </motion.button>
        ))}
      </div>
      {currentMatches.length > 0 && (
        <p className="text-[11px] text-badge/80 mt-1.5">Matches already created. Reset this draw first to change the size.</p>
      )}
    </div>
  ) : undefined;

  const drawSelector = (
    <DrawTabs
      activeTab={activeTab}
      activeSkill={activeSkill}
      activeDoubles={activeDoubles}
      currentDraw={currentDraw}
      visibleDraws={shownDraws}
      drawCounts={drawCounts}
      onTabChange={setActiveTab}
      onSkillChange={setActiveSkill}
      onDoublesChange={setActiveDoubles}
      onZoneChange={setActiveZone}
      rrView={isRR && rrGroupMatches.length > 0 ? rrView : undefined}
      onRRViewChange={isRR && rrGroupMatches.length > 0 ? setRRView : undefined}
      drawSizeControl={drawSizeControl}
      onViewCompleteDraw={hasGeneratedMatches ? () => setShowSlideshow(true) : undefined}
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
      onRemovePlayer={handleRemovePlayer}
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
        <div className="mb-6 flex items-center justify-end gap-3 flex-wrap">
          <span className="text-xs text-fg/70">
            Your zone: <span className="font-bold text-fg">{userZoneLabel}</span>
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
              ? <OpponentCard opponent={opponent} defaultOpen currentMatch={visibleUserMatch} schedule={schedule} isCreator={isCreator} viewerUid={user?.uid} myCourts={myCourts} courtsMap={courtsMap} availabilityMap={availabilityMap} />
              : !isCreator && (
                  <div className="mb-6 rounded-2xl bg-tennis-surface/30 px-4 py-6 text-center">
                    <p className="text-sm font-semibold text-fg/70">Draw not released yet</p>
                  </div>
                ))
          // "Your Group" used to repeat the whole group here. Every part of it — contact, your
          // result, and the score/schedule action for your match — now lives in the player row
          // inside the group card itself, so this panel was saying the same thing twice.
          : null
      ) : (
        currentMatches.length > 0 && opponent && (
          <OpponentCard opponent={opponent} defaultOpen currentMatch={visibleUserMatch} schedule={schedule} isCreator={isCreator} viewerUid={user?.uid} myCourts={myCourts} courtsMap={courtsMap} availabilityMap={availabilityMap} />
        )
      )}

      {/* Full draw — everyone gets a real bracket now (wireframe 1b): a vertical round-by-round
          accordion on mobile, the wide grid on desktop. The old PNG-in-new-tab player fallback
          is retired (PNG export stays in Manage Draw → Download). */}
      {isRR ? (
        roundRobinFull(!canEdit)
      ) : (
        (isCreator || displayMatches.some((m) => !isPreviewMatch(m))) && (
          <BracketErrorBoundary onDownload={() => {
            const [first] = buildDrawSlides(slideInput);
            if (first) downloadSlide(first);
          }}>
            <div className="sm:hidden">
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
            </div>
            <div className="hidden sm:block">
              <BracketView
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
            </div>
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
        {scoreForm && scoreFormMatch && (() => {
          return (
            <ScoreModal
              matchInfo={{
                title: scoreFormMatch.round,
                player1: { uid: scoreFormMatch.player_1_uid, name: scoreFormMatch.player_1_name },
                player2: { uid: scoreFormMatch.player_2_uid, name: scoreFormMatch.player_2_name },
              }}
              scoreForm={scoreForm}
              onChange={setScoreForm}
              onClose={() => setScoreForm(null)}
              onSubmit={handleSubmitScore}
              isCreatorSubmit={isCreator}
              // Only for an organizer, and only once there's a result to undo.
              onReset={isCreator && scoreFormMatch.status === 'complete'
                ? () => handleResetMatchScore(scoreFormMatch)
                : undefined}
            />
          );
        })()}
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

  // The dropdown lists the current tab's events, plus the selected one if it came from a
  // History deep link (a completed tournament that isn't in either live list).
  const dropdownEvents = selectedMeta && !tabEvents.some((e) => e.id === selectedMeta.id)
    ? [selectedMeta, ...tabEvents]
    : tabEvents;

  return (
    <div>
      {/* Event picker — hamburger opens a sheet listing events, instead of an inline dropdown */}
      {dropdownEvents.length > 0 && (
        <div className="mb-4 rounded-2xl bg-tennis-surface/40 px-4 py-2.5 flex items-center gap-3 max-w-xl">
          <button
            type="button"
            onClick={() => setShowEventSheet(true)}
            aria-label="Switch event"
            className="shrink-0 w-9 h-9 rounded-xl bg-fg/5 hover:bg-fg/10 flex items-center justify-center text-fg/70 hover:text-fg transition-colors"
          >
            <Menu className="w-4 h-4" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-fg truncate">{selectedMeta?.title ?? 'Select event'}</p>
          </div>
          {selectedMeta && (
            <span className={`shrink-0 text-[10px] font-bold rounded-full border px-2.5 py-1 whitespace-nowrap ${
              pastMode ? 'text-fg/70 border-fg/20' : 'text-clay border-clay/50'
            }`}>
              {pastMode ? 'Completed' : formatEventRange(selectedMeta) || 'Live'}
            </span>
          )}
        </div>
      )}

      <AnimatePresence>
        {showEventSheet && (
          <Sheet onClose={() => setShowEventSheet(false)} title="Switch Event" maxWidthClassName="max-w-md">
            <div className="p-3 pt-1 space-y-1 max-h-[70vh] overflow-y-auto">
              {dropdownEvents.map((e) => (
                <motion.button
                  key={e.id}
                  type="button"
                  onClick={() => { selectEvent(e.id); setShowEventSheet(false); }}
                  whileTap={tapScale.whileTap}
                  transition={tapScale.transition}
                  className={`w-full flex items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left transition-colors ${
                    e.id === eventId ? 'bg-clay/15 border border-clay/40' : 'bg-fg/5 border border-transparent hover:border-fg/20'
                  }`}
                >
                  <span className="text-sm font-semibold text-fg truncate">{e.title}</span>
                  {eventStatuses[e.id] === 'completed' && (
                    <span className="shrink-0 text-[10px] font-bold text-fg/70">Completed</span>
                  )}
                </motion.button>
              ))}
            </div>
          </Sheet>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showSlideshow && <DrawSlideshow slides={drawSlides} onClose={() => setShowSlideshow(false)} />}
      </AnimatePresence>

      {statusLoading && allTournamentEvents.length === 0 ? (
        <div className="space-y-3">
          {[1, 2].map((i) => <div key={i} className="h-14 bg-tennis-surface/30 rounded-2xl animate-pulse" />)}
        </div>
      ) : dropdownEvents.length === 0 ? (
        <div className="text-center py-16 space-y-4">
          <p className="text-fg/70 text-sm">You're not in any current tournaments.</p>
          <Link to="/events" className="inline-block">
            <span className="px-4 py-2 rounded-xl bg-clay text-white text-sm font-semibold hover:bg-clay/90 transition-colors">
              Join an active tournament
            </span>
          </Link>
        </div>
      ) : !selectedLoaded ? (
        <div className="flex justify-center py-16">
          <div className="w-10 h-10 border-4 border-clay border-t-transparent rounded-full animate-spin" />
        </div>
      ) : joinLocked ? (
        <div className="rounded-3xl bg-tennis-surface/30 px-6 py-14 text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-fg/5 flex items-center justify-center mx-auto">
            <Lock className="w-5 h-5 text-fg/70" />
          </div>
          <p className="text-sm font-bold text-fg">Join to view the live draw</p>
          <p className="text-xs text-fg/70 max-w-xs mx-auto">
            {event?.title ? `You haven't joined "${event.title}" yet.` : "You haven't joined this tournament yet."} Join to see matches and scores as they happen.
          </p>
          <Link to="/events" className="inline-block pt-1">
            <span className="px-4 py-2 rounded-xl bg-clay text-white text-sm font-semibold hover:bg-clay/90 transition-colors">
              Find this event
            </span>
          </Link>
        </div>
      ) : (
        drawContent
      )}
    </div>
  );
};
