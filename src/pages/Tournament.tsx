import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AnimatePresence } from 'motion/react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { ChevronDown } from 'lucide-react';
import { db } from '../lib/firebase';
import { useTournament } from './tournament/useTournament';
import { getEventDate } from './tournament/utils';
import { downloadDrawAsPng, openDrawInNewTab, getRoundLabels, downloadRRGroupsAsPng, openRRGroupsInNewTab } from './tournament/bracketImage';
import { TournamentMatch } from './tournament/types';
import { BracketView } from './tournament/BracketView';
import { BracketErrorBoundary } from './tournament/BracketErrorBoundary';
import { TournamentHeader } from './tournament/TournamentHeader';
import { OpponentCard, RROpponentPanel } from './tournament/OpponentPanels';
import { DrawTabs } from './tournament/DrawTabs';
import { ScoreModal } from './tournament/ScoreModal';
import { PendingScoresPanel } from './tournament/PendingScoresPanel';
import { ScheduleRequestsPanel } from './tournament/ScheduleRequestsPanel';
import { AddPlayerPanel } from './tournament/AddPlayerPanel';
import { RoundRobinView } from './tournament/RoundRobinView';
import { RRConfigModal } from './tournament/RRConfigModal';
import { AlertMessage } from '../components/AlertMessage';
import { Button } from '../components/Button';
import { LoadingBar } from '../components/LoadingBar';
import { TennisEvent } from '../types';
import { isLadderEvent } from '../utils/eventTypes';
import { LadderView } from '../features/leagues/LadderView';

type PageTab = 'completed' | 'active' | 'upcoming';
type EventStatus = 'active' | 'completed';

const getDrawState = (matches: TournamentMatch[]): string => {
  const real = matches.filter((m) => !m.id.startsWith('preview_') && !m.id.startsWith('ll_preview_'));
  if (real.length === 0) return 'Live Preview';
  if (real.some((m) => m.format === 'rr')) {
    const groupStage = real.filter((m) => m.round === 'RR');
    const knockout = real.filter((m) => m.format === 'rr' && m.round !== 'RR');
    if (knockout.length > 0) {
      const finals = knockout.filter((m) => m.round === 'F');
      if (finals.length > 0 && finals.every((m) => m.winner_user_id)) return 'Tournament Complete';
      return knockout.some((m) => m.winner_user_id) ? 'Knockout Started' : 'Knockout Stage';
    }
    if (groupStage.every((m) => m.status === 'complete')) return 'Group Stage Complete';
    if (groupStage.some((m) => m.status === 'complete')) return 'Group Stage Started';
    return 'Group Stage';
  }
  const drawSize = real[0]?.drawsize || 8;
  const roundLabels = getRoundLabels(drawSize);
  const finals = real.filter((m) => m.round === 'F');
  if (finals.length > 0 && finals.every((m) => m.winner_user_id)) return 'Tournament Complete';
  for (let i = roundLabels.length - 1; i >= 0; i--) {
    const round = roundLabels[i];
    const roundMatches = real.filter((m) => m.round === round);
    if (roundMatches.length === 0 || roundMatches.every((m) => !m.winner_user_id)) continue;
    const allComplete = roundMatches.every((m) => !!m.winner_user_id);
    return allComplete ? `${round} Complete` : `${round} Started`;
  }
  return 'Matches Generated';
};

const formatEventRange = (e: TennisEvent): string => {
  const start = getEventDate(e);
  const rawEnd = (e as unknown as Record<string, unknown>).endDate || (e as unknown as Record<string, unknown>).end_date;
  let end: Date | null = null;
  if (rawEnd) {
    if (typeof rawEnd === 'string') end = new Date(rawEnd);
    else if (typeof rawEnd === 'object' && rawEnd !== null) {
      const obj = rawEnd as Record<string, unknown>;
      if (typeof obj['toDate'] === 'function') end = (obj['toDate'] as () => Date)();
      else if (typeof obj['seconds'] === 'number') end = new Date((obj['seconds'] as number) * 1000);
    }
  }
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

  const [navMode, setNavMode] = useState<'live' | 'past'>('live');
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [showOtherGroups, setShowOtherGroups] = useState(false);
  const [myEventIds, setMyEventIds] = useState<Set<string>>(new Set());
  const [eventStatuses, setEventStatuses] = useState<Record<string, EventStatus>>({});
  const [statusLoading, setStatusLoading] = useState(true);

  const {
    authLoading, loading, eventDataReady, user,
    event, matches, participants,
    allTournamentEvents,
    isCreator, started, userParticipant, zoneMap, userMap,
    currentDraw, currentMatches, displayMatches, visibleDraws,
    opponent,
    editPlayers, currentDrawAllPlayers, currentDrawSize,
    message, scoreForm, scoreFormMatch, setScoreForm,
    generating, resettingDraw, editMode, setEditMode,
    mergeMensSingles, setMergeMensSingles,
    mergeWomensSingles, setMergeWomensSingles,
    consolidateDoubles, setConsolidateDoubles,
    activeTab, setActiveTab, activeSkill, setActiveSkill, activeDoubles, setActiveDoubles,
    availableUsers,
    handleUpdateRoundDeadline, handleSetPreviewDrawSize, handleAddPlayer,
    handleGenerateAll, handleResetDraw,
    handleEditPlayer, handleSubmitScore, handleOpenScoreForm,
    pendingSubmissions, pendingMatchIds, submittableMatchIds, handleConfirmSubmission, handleRejectSubmission,
    currentDrawFormat, drawFormat,
    showRRConfig, setShowRRConfig, generatingRR,
    rrGroups, previewRRGroups, previewRRLabels, userRRGroup, rrStandingsByGroup, rrGroupMatches, rrKnockoutMatches, rrKnockoutReady, rrConfig,
    rrGroupLabels, rrGroupIndices,
    rrUnplacedPlayers, rrSiblingDraw, rrSiblingGroups, rrSiblingLabels, rrSiblingIndices,
    rrView, setRRView,
    handleGenerateRR, handleResetRR, handleGenerateRRKnockout, handleSaveGroupEdit,
    handleCreateRRGroup, handleRenameGroup, handleRemoveParticipant,
    visibleUserMatch, userRRMatches, scheduleRequests,
    handleAskOrganizerSchedule, handleSetSchedule,
  } = useTournament(eventId);

  // Scheduling API passed to the current-match panels (Request Scheduling Assistance; scores via
  // the existing submit flow). Undefined when logged out.
  const scheduleApi = user
    ? {
        onAskOrganizer: handleAskOrganizerSchedule,
        onSubmitScore: handleOpenScoreForm,
        submittableMatchIds,
      }
    : undefined;

  useEffect(() => {
    document.title = event?.title
      ? `${event.title} — Racquets & Strings`
      : 'Matches — Racquets & Strings';
  }, [event?.title]);

  // Which tournaments the signed-in user has joined (event_participants) — combined with the
  // ones they created, this is the set the Matches tab lists.
  useEffect(() => {
    if (!user) { setMyEventIds(new Set()); return; }
    getDocs(query(collection(db, 'event_participants'), where('user_id', '==', user.uid)))
      .then((snap) => setMyEventIds(new Set(snap.docs.map((d) => (d.data().event_id as string)).filter(Boolean))))
      .catch(() => {});
  }, [user?.uid]);

  // Fetch match statuses for all events (one batch query) — classifies completed vs live.
  useEffect(() => {
    if (allTournamentEvents.length === 0) return;
    const ids = allTournamentEvents.map((e) => e.id).slice(0, 30);
    setStatusLoading(true);
    getDocs(query(collection(db, 'tournament_matches'), where('event_id', 'in', ids)))
      .then((snap) => {
        const statuses: Record<string, EventStatus> = {};
        snap.docs.forEach((d) => {
          const m = d.data();
          const eid = m.event_id as string;
          if (!statuses[eid]) statuses[eid] = 'active';
          if (m.round === 'F' && m.status === 'complete' && m.winner_user_id) statuses[eid] = 'completed';
        });
        setEventStatuses(statuses);
      })
      .finally(() => setStatusLoading(false));
  }, [allTournamentEvents.length]);

  // Tournaments the user joined or created — plus League Ladder events, which need no join and
  // are visible to every signed-in player.
  const myEvents = useMemo(
    () => allTournamentEvents.filter((e) => !!user && (e.creator_id === user.uid || myEventIds.has(e.id) || isLadderEvent(e))),
    [allTournamentEvents, user, myEventIds],
  );
  const liveEvents = myEvents.filter((e) => eventStatuses[e.id] !== 'completed');
  const pastEvents = myEvents.filter((e) => eventStatuses[e.id] === 'completed');
  const yearOf = (e: TennisEvent) => getEventDate(e)?.getFullYear() ?? new Date().getFullYear();
  const pastYears = [...new Set(pastEvents.map(yearOf))].sort((a, b) => b - a);
  const activeYear = selectedYear ?? pastYears[0] ?? null;
  const pastEventsInYear = pastEvents.filter((e) => yearOf(e) === activeYear);
  const visibleEvents = navMode === 'live' ? liveEvents : pastEventsInYear;

  const selectEvent = (id: string) =>
    setSearchParams((p) => { const n = new URLSearchParams(p); n.set('event', id); return n; });

  // Keep a valid selection: when the visible list changes and the current event isn't in it,
  // select the first visible tournament.
  const visibleKey = visibleEvents.map((e) => e.id).join(',');
  useEffect(() => {
    if (statusLoading || visibleEvents.length === 0) return;
    if (!eventId || !visibleEvents.some((e) => e.id === eventId)) {
      setSearchParams((p) => { const n = new URLSearchParams(p); n.set('event', visibleEvents[0].id); return n; }, { replace: true });
    }
  }, [navMode, activeYear, statusLoading, visibleKey, eventId]);

  // Each tournament starts with the "other groups" section collapsed.
  useEffect(() => { setShowOtherGroups(false); }, [eventId, navMode]);

  // Gate on BOTH the initial event-list fetch AND the currently-selected event's own data
  // (participants + matches) actually arriving — otherwise switching tournaments (or the gap
  // between the event list loading and the specific event being selected) briefly renders a
  // flash of empty/wrong content instead of a loading state.
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

  const drawState = getDrawState(currentMatches);

  const pastMode = navMode === 'past';
  const canEdit = isCreator && !pastMode;
  const effEditMode = editMode && canEdit;
  const schedule = pastMode ? undefined : scheduleApi;
  // Creator can always enter or edit scores (including past events and already-scored matches).
  const submitScore = isCreator ? handleOpenScoreForm : (pastMode ? undefined : handleOpenScoreForm);
  const submittable = pastMode ? undefined : submittableMatchIds;
  const isRR = currentDrawFormat === 'rr';

  const drawSelector = (
    <DrawTabs
      activeTab={activeTab}
      activeSkill={activeSkill}
      activeDoubles={activeDoubles}
      currentDraw={currentDraw}
      visibleDraws={visibleDraws}
      onTabChange={setActiveTab}
      onSkillChange={setActiveSkill}
      onDoublesChange={setActiveDoubles}
      rrView={isRR && rrGroupMatches.length > 0 ? rrView : undefined}
      onRRViewChange={isRR && rrGroupMatches.length > 0 ? setRRView : undefined}
    />
  );

  const roundRobinFull = (readOnly: boolean) => (
    <RoundRobinView
      groups={rrGroups.length > 0 ? rrGroups : previewRRGroups}
      groupLabels={rrGroups.length > 0 ? rrGroupLabels : previewRRLabels}
      groupIndices={rrGroupIndices}
      standingsByGroup={rrGroups.length > 0 ? rrStandingsByGroup : previewRRGroups.map(() => [])}
      groupMatches={rrGroupMatches}
      knockoutMatches={rrKnockoutMatches}
      advancementCount={rrConfig?.advancementCount ?? 1}
      isCreator={readOnly ? false : canEdit}
      isParticipant={!!userParticipant}
      isPastEvent={pastMode}
      editMode={readOnly ? false : effEditMode}
      editPlayers={editPlayers}
      onEditPlayer={handleEditPlayer}
      onSubmitScore={readOnly ? undefined : submitScore}
      submittableMatchIds={readOnly ? undefined : submittable}
      pendingMatchIds={pendingMatchIds}
      onSaveGroupEdit={handleSaveGroupEdit}
      onRenameGroup={handleRenameGroup}
      onCreateGroup={handleCreateRRGroup}
      unplacedPlayers={rrUnplacedPlayers}
      rrKnockoutReady={rrKnockoutReady}
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

      {!pastMode && isCreator && (
        <PendingScoresPanel
          submissions={pendingSubmissions}
          onConfirm={handleConfirmSubmission}
          onReject={handleRejectSubmission}
        />
      )}

      {!pastMode && isCreator && <ScheduleRequestsPanel requests={scheduleRequests} onSetSchedule={handleSetSchedule} />}

      {/* Draw tabs: division → skill → (RR) Groups / Knockout */}
      {drawSelector}

      {/* Creator edit tools */}
      {effEditMode && (
        <AddPlayerPanel availableUsers={availableUsers} currentDraw={currentDraw} onAdd={handleAddPlayer} />
      )}
      {!isRR && effEditMode && currentDraw && (
        <div className="mb-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-bold text-white uppercase tracking-widest">Draw Size</span>
            {[8, 16, 32].map((size) => (
              <button
                key={size}
                disabled={currentMatches.length > 0}
                onClick={() => handleSetPreviewDrawSize(currentDraw.label, size)}
                className={`px-4 py-1.5 rounded-xl text-sm font-bold transition-colors ${
                  currentDrawSize === size ? 'bg-clay text-white' : currentMatches.length > 0 ? 'bg-tennis-surface/30 text-white cursor-not-allowed' : 'bg-tennis-surface/60 text-white hover:text-white'
                }`}
              >
                R{size}
              </button>
            ))}
          </div>
          {currentMatches.length > 0 && (
            <p className="text-xs text-amber-400/80 mt-2">Matches already created — reset this draw first to change the size.</p>
          )}
        </div>
      )}

      {/* Your group / your match — under all the tabs. Groups view → your group; Knockout view → your match. */}
      {isRR ? (
        rrView === 'knockout'
          ? (visibleUserMatch && opponent && (
              <OpponentCard opponent={opponent} defaultOpen currentMatch={visibleUserMatch} schedule={schedule} />
            ))
          : (userRRGroup && user && (
              <RROpponentPanel
                group={userRRGroup}
                userId={user.uid}
                isDoubles={rrGroupMatches[0]?.tournament_choice === 'Doubles'}
                defaultOpen
                pairingMatches={userRRMatches}
                schedule={schedule}
                contactMap={userMap}
              />
            ))
      ) : (
        currentMatches.length > 0 && opponent && (
          <OpponentCard opponent={opponent} defaultOpen currentMatch={visibleUserMatch} schedule={schedule} />
        )
      )}

      {/* Full draw */}
      {isRR ? (
        roundRobinFull(!canEdit)
      ) : isCreator ? (
        /* Creator: the full draw as an interactive interface, blended with the site. */
        <BracketErrorBoundary onDownload={() => downloadDrawAsPng(displayMatches, currentDraw?.label || 'Draw', drawState, event?.title, event?.round_deadlines ?? {})}>
          <BracketView
            matches={displayMatches}
            drawTitle={currentDraw?.label || 'Draw'}
            editMode={effEditMode}
            editPlayers={editPlayers}
            onEditPlayer={handleEditPlayer}
            isCreator={isCreator}
            onSubmitScore={submitScore}
            submittableMatchIds={submittable}
            pendingMatchIds={pendingMatchIds}
            roundDeadlines={event?.round_deadlines}
            onUpdateDeadline={canEdit ? handleUpdateRoundDeadline : undefined}
          />
        </BracketErrorBoundary>
      ) : (
        /* Players: no inline bracket — open the full draw as an image in a new tab. */
        displayMatches.some((m) => !m.id.startsWith('preview_') && !m.id.startsWith('ll_preview_')) && (
          <div className="rounded-2xl border border-white/10 bg-tennis-surface/20 p-6 text-center">
            <p className="text-sm text-white/60 mb-3">See where you sit in the full bracket.</p>
            <Button
              variant="outline"
              onClick={() => openDrawInNewTab(displayMatches, currentDraw?.label || 'Draw', drawState, event?.title, event?.round_deadlines ?? {})}
            >
              View entire draw
            </Button>
          </div>
        )
      )}

      {/* Creator controls — hidden for past (read-only) tournaments */}
      {!pastMode && isCreator && (
        <div className="mt-8 pt-6 border-t border-white/5">
          <TournamentHeader
            isCreator={isCreator}
            hasMatches={currentMatches.length > 0}
            isProcessing={generating || resettingDraw || generatingRR}
            editMode={effEditMode}
            started={currentMatches.some((m) => m.status === 'complete')}
            mergeMensSingles={mergeMensSingles}
            mergeWomensSingles={mergeWomensSingles}
            consolidateDoubles={consolidateDoubles}
            currentDrawFormat={currentDrawFormat}
            onDownload={() => isRR && rrKnockoutMatches.length === 0
              ? downloadRRGroupsAsPng(rrGroups, rrGroupLabels, rrGroupMatches, currentDraw?.division || 'Draw', event?.title, userMap)
              : downloadDrawAsPng(displayMatches, currentDraw?.label || 'Draw', drawState, event?.title, event?.round_deadlines ?? {})}
            onGenerateMatches={drawFormat === 'rr' ? () => setShowRRConfig(true) : handleGenerateAll}
            onCancelMatches={currentDrawFormat === 'rr' ? handleResetRR : handleResetDraw}
            onToggleEdit={() => setEditMode((v) => !v)}
            onToggleMergeMens={() => setMergeMensSingles((v) => !v)}
            onToggleMergeWomens={() => setMergeWomensSingles((v) => !v)}
            onToggleConsolidateDoubles={() => setConsolidateDoubles((v) => !v)}
          />
        </div>
      )}

      <AnimatePresence>
        {scoreForm && scoreFormMatch && (
          <ScoreModal
            match={scoreFormMatch}
            scoreForm={scoreForm}
            onChange={setScoreForm}
            onClose={() => setScoreForm(null)}
            onSubmit={handleSubmitScore}
            isCreatorSubmit={isCreator}
          />
        )}
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

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20 pt-6">
      {/* Tournament name tabs (live) or year tabs (past) + Past/Current toggle */}
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex gap-2 flex-wrap">
          {navMode === 'live'
            ? liveEvents.map((e) => (
                <button
                  key={e.id}
                  onClick={() => selectEvent(e.id)}
                  className={`px-4 py-2 rounded-2xl text-sm font-semibold border transition-all ${
                    eventId === e.id ? 'bg-clay text-white border-clay' : 'bg-tennis-surface/40 text-white border-white/10 hover:border-white/30'
                  }`}
                >
                  {e.title}
                </button>
              ))
            : pastYears.map((y) => (
                <button
                  key={y}
                  onClick={() => setSelectedYear(y)}
                  className={`px-4 py-2 rounded-2xl text-sm font-bold border transition-all ${
                    activeYear === y ? 'bg-clay text-white border-clay' : 'bg-tennis-surface/40 text-white border-white/10 hover:border-white/30'
                  }`}
                >
                  {y}
                </button>
              ))}
        </div>
        <button
          onClick={() => { setNavMode((m) => (m === 'live' ? 'past' : 'live')); setSelectedYear(null); }}
          className="px-4 py-2 rounded-2xl text-sm font-semibold border border-white/10 bg-tennis-surface/40 text-white hover:border-white/30 transition-all"
        >
          {navMode === 'live' ? 'Past Events' : '← Current'}
        </button>
      </div>

      {/* Past mode: tournament name tabs for the selected year */}
      {navMode === 'past' && pastEventsInYear.length > 0 && (
        <div className="flex gap-2 mb-4 flex-wrap">
          {pastEventsInYear.map((e) => (
            <button
              key={e.id}
              onClick={() => selectEvent(e.id)}
              className={`px-4 py-2 rounded-2xl text-sm font-semibold border transition-all ${
                eventId === e.id ? 'bg-clay text-white border-clay' : 'bg-tennis-surface/40 text-white border-white/10 hover:border-white/30'
              }`}
            >
              {e.title}
            </button>
          ))}
        </div>
      )}

      {statusLoading && allTournamentEvents.length === 0 ? (
        <div className="space-y-3">
          {[1, 2].map((i) => <div key={i} className="h-14 bg-tennis-surface/30 rounded-2xl animate-pulse" />)}
        </div>
      ) : visibleEvents.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-white/50 text-sm">
            {navMode === 'live' ? "You're not in any current tournaments." : 'No past tournaments.'}
          </p>
        </div>
      ) : !selectedLoaded ? (
        <div className="flex justify-center py-16">
          <div className="w-10 h-10 border-4 border-clay border-t-transparent rounded-full animate-spin" />
        </div>
      ) : event && isLadderEvent(event) ? (
        <LadderView key={event.id} event={event} isCreator={isCreator} />
      ) : (
        drawContent
      )}
    </div>
  );
};
