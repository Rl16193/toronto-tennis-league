import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { ChevronDown } from 'lucide-react';
import { db } from '../lib/firebase';
import { useTournament } from './tournament/useTournament';
import { getEventDate } from './tournament/utils';
import { downloadDrawAsPng, getRoundLabels } from './tournament/bracketImage';
import { TournamentMatch } from './tournament/types';
import { BracketView } from './tournament/BracketView';
import { BracketErrorBoundary } from './tournament/BracketErrorBoundary';
import { TournamentHeader } from './tournament/TournamentHeader';
import { OpponentCard } from './tournament/OpponentCard';
import { DrawTabs } from './tournament/DrawTabs';
import { ScoreModal } from './tournament/ScoreModal';
import { AddPlayerPanel } from './tournament/AddPlayerPanel';
import { RoundRobinView } from './tournament/RoundRobinView';
import { RRConfigModal } from './tournament/RRConfigModal';
import { RROpponentPanel } from './tournament/RROpponentPanel';
import { AlertMessage } from '../components/AlertMessage';
import { Button } from '../components/Button';
import { TennisEvent } from '../types';

type PageTab = 'past' | 'active' | 'upcoming';
type EventStatus = 'active' | 'past';

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

  const tabParam = searchParams.get('tab') as PageTab | null;
  const [pageTab, setPageTab] = useState<PageTab>(tabParam || 'active');
  const eventId = searchParams.get('event') || undefined;

  const [eventStatuses, setEventStatuses] = useState<Record<string, EventStatus>>({});
  const [statusLoading, setStatusLoading] = useState(true);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);

  const {
    authLoading, loading, user,
    event, matches,
    allTournamentEvents,
    isCreator, started, userParticipant,
    currentDraw, currentMatches, displayMatches, visibleDraws,
    opponent, nextMatchOpponents,
    editPlayers, reservesPlayers, currentDrawAllPlayers, currentDrawSize, skillMismatchedCount,
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
    currentReservesMatches, llDrawDisplayMatches, currentLLSize, allUsersAsTournamentPlayers,
    showReserves, setShowReserves, generatingReserves,
    handleSetLLDrawSize, handleGenerateReservesDraw, handleResetLLDraw,
    submissions,
    currentDrawFormat, drawFormat,
    showRRConfig, setShowRRConfig, generatingRR,
    rrGroups, previewRRGroups, userRRGroup, rrStandingsByGroup, rrGroupMatches, rrKnockoutMatches, rrKnockoutReady, rrConfig,
    handleGenerateRR, handleResetRR, handleGenerateRRKnockout,
  } = useTournament(eventId);

  useEffect(() => { document.title = 'Matches — Racquets & Strings'; }, []);

  // Sync tab param into state
  useEffect(() => {
    if (tabParam && tabParam !== pageTab) setPageTab(tabParam);
  }, [tabParam]);

  // Auto-set event from first active event if none selected
  useEffect(() => {
    if (!event && allTournamentEvents.length > 0 && !loading) {
      const first = allTournamentEvents[0];
      setSearchParams((p) => { const n = new URLSearchParams(p); n.set('event', first.id); return n; }, { replace: true });
    }
  }, [event?.id, allTournamentEvents.length, loading]);

  // Fetch match statuses for all events (one batch query)
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
          if (m.round === 'F' && m.status === 'complete' && m.winner_user_id) statuses[eid] = 'past';
        });
        setEventStatuses(statuses);
      })
      .finally(() => setStatusLoading(false));
  }, [allTournamentEvents.length]);

  // Auto-expand: when tab or events change, expand user's event or first in tab
  useEffect(() => {
    if (statusLoading || allTournamentEvents.length === 0) return;
    const tabEvents = allTournamentEvents.filter((e) => {
      if (pageTab === 'past') return eventStatuses[e.id] === 'past';
      if (pageTab === 'active') return eventStatuses[e.id] === 'active';
      return !eventStatuses[e.id];
    });
    if (tabEvents.length === 0) return;
    // Prefer event the user participated in; otherwise first
    const preferred = userParticipant ? tabEvents.find((e) => e.id === event?.id) : null;
    const toExpand = preferred ?? tabEvents[0];
    setExpandedEventId(toExpand.id);
    setSearchParams((p) => { const n = new URLSearchParams(p); n.set('event', toExpand.id); return n; }, { replace: true });
  }, [pageTab, statusLoading, allTournamentEvents.length]);

  const handleAccordionToggle = (eid: string) => {
    if (expandedEventId === eid) {
      setExpandedEventId(null);
    } else {
      setExpandedEventId(eid);
      setSearchParams((p) => { const n = new URLSearchParams(p); n.set('event', eid); return n; });
    }
  };

  const handleTabChange = (tab: PageTab) => {
    setPageTab(tab);
    setSearchParams((p) => { const n = new URLSearchParams(p); n.set('tab', tab); return n; });
  };

  if (authLoading || (loading && allTournamentEvents.length === 0)) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="w-14 h-14 border-4 border-clay border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const llIsPreview = currentReservesMatches.length === 0;
  const drawState = getDrawState(currentMatches);

  const pastEvents = allTournamentEvents.filter((e) => eventStatuses[e.id] === 'past');
  const activeEvents = allTournamentEvents.filter((e) => eventStatuses[e.id] === 'active');
  const upcomingEvents = allTournamentEvents.filter((e) => !eventStatuses[e.id]);

  const tabEvents = pageTab === 'past' ? pastEvents : pageTab === 'active' ? activeEvents : upcomingEvents;

  const PAGE_TABS: { id: PageTab; label: string }[] = [
    { id: 'upcoming', label: 'Upcoming' },
    { id: 'active', label: 'Active' },
    { id: 'past', label: 'Past' },
  ];

  const drawContent = (
    <>
      {message && (
        <AlertMessage tone={message.type} className="mb-6">
          <p>{message.text}</p>
        </AlertMessage>
      )}

      {currentDrawFormat === 'rr' && userRRGroup && user ? (
        <RROpponentPanel
          group={userRRGroup}
          userId={user.uid}
          isDoubles={rrGroupMatches[0]?.tournament_choice === 'Doubles'}
        />
      ) : (
        opponent && <OpponentCard opponent={opponent} nextMatchOpponents={nextMatchOpponents} />
      )}

      <DrawTabs
        activeTab={activeTab}
        activeSkill={activeSkill}
        activeDoubles={activeDoubles}
        currentDraw={currentDraw}
        visibleDraws={visibleDraws}
        showReserves={showReserves}
        onTabChange={setActiveTab}
        onSkillChange={setActiveSkill}
        onDoublesChange={setActiveDoubles}
        onReservesChange={setShowReserves}
      />

      {/* LL Draw view */}
      {showReserves ? (
        <>
          {isCreator && (
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <span className="text-sm font-bold text-white uppercase tracking-widest">LL Draw Size</span>
              {[4, 8, 16].map((size) => (
                <button
                  key={size}
                  disabled={!llIsPreview}
                  onClick={() => handleSetLLDrawSize(size)}
                  className={`px-4 py-1.5 rounded-xl text-sm font-bold transition-colors ${
                    currentLLSize === size ? 'bg-clay text-white' : !llIsPreview ? 'bg-tennis-surface/30 text-white cursor-not-allowed' : 'bg-tennis-surface/60 text-white hover:text-white'
                  }`}
                >
                  R{size}
                </button>
              ))}
              {llIsPreview && (
                <Button onClick={handleGenerateReservesDraw} isLoading={generatingReserves} className="ml-2">
                  Finalize LL Draw
                </Button>
              )}
              {!llIsPreview && (
                <>
                  <span className="text-xs text-white">Draw finalized — use Edit Draw to modify players.</span>
                  <Button variant="danger" onClick={handleResetLLDraw} className="ml-2">Reset LL Draw</Button>
                </>
              )}
            </div>
          )}
          <BracketErrorBoundary onDownload={() => downloadDrawAsPng(llDrawDisplayMatches, 'LL Draw', drawState, event?.title, event?.round_deadlines ?? {})}>
            <BracketView
              matches={llDrawDisplayMatches}
              drawTitle="LL Draw"
              editMode={editMode}
              editPlayers={editMode ? allUsersAsTournamentPlayers : []}
              onEditPlayer={handleEditPlayer}
              isCreator={isCreator}
              onSubmitScore={handleOpenScoreForm}
              roundDeadlines={event?.round_deadlines}
              onUpdateDeadline={isCreator ? handleUpdateRoundDeadline : undefined}
            />
          </BracketErrorBoundary>
        </>
      ) : (
        <>
          {editMode && isCreator && (
            <AddPlayerPanel availableUsers={availableUsers} currentDraw={currentDraw} onAdd={handleAddPlayer} />
          )}
          {editMode && currentDraw && (
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
          {currentDrawFormat === 'rr' ? (
            <RoundRobinView
              groups={rrGroups.length > 0 ? rrGroups : previewRRGroups}
              standingsByGroup={rrGroups.length > 0 ? rrStandingsByGroup : previewRRGroups.map(() => [])}
              groupMatches={rrGroupMatches}
              knockoutMatches={rrKnockoutMatches}
              advancementCount={rrConfig?.advancementCount ?? 1}
              isCreator={isCreator}
              editMode={editMode}
              editPlayers={editPlayers}
              onEditPlayer={handleEditPlayer}
              onSubmitScore={handleOpenScoreForm}
              submissions={submissions}
              rrKnockoutReady={rrKnockoutReady}
              generatingKnockout={generatingRR}
              onGenerateKnockout={handleGenerateRRKnockout}
              roundDeadlines={event?.round_deadlines}
              onUpdateDeadline={isCreator ? handleUpdateRoundDeadline : undefined}
            />
          ) : (
            <BracketErrorBoundary onDownload={() => downloadDrawAsPng(displayMatches, currentDraw?.label || 'Draw', drawState, event?.title, event?.round_deadlines ?? {})}>
              <BracketView
                matches={displayMatches}
                drawTitle={currentDraw?.label || 'Draw'}
                editMode={editMode}
                editPlayers={editPlayers}
                onEditPlayer={handleEditPlayer}
                isCreator={isCreator}
                onSubmitScore={handleOpenScoreForm}
                roundDeadlines={event?.round_deadlines}
                onUpdateDeadline={isCreator ? handleUpdateRoundDeadline : undefined}
              />
            </BracketErrorBoundary>
          )}
          {reservesPlayers.length > 0 && (
            <div className="mt-8">
              <h3 className="text-xl font-bold text-white mb-4">
                Reserves <span className="text-white text-base font-normal">({reservesPlayers.length})</span>
              </h3>
              <div className="bg-tennis-surface/30 border border-white/5 rounded-2xl p-6">
                <ol className="space-y-2">
                  {reservesPlayers.map((player, i) => (
                    <li key={player.user_id} className="flex items-center gap-3 text-white">
                      <span className="text-white text-sm w-6 text-right shrink-0">{i + 1}.</span>
                      <span className="font-semibold">{player.name}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          )}
        </>
      )}

      {/* Buttons at bottom */}
      <div className="mt-8 pt-6 border-t border-white/5">
        <TournamentHeader
          isCreator={isCreator}
          hasMatches={currentMatches.length > 0}
          isProcessing={generating || resettingDraw || generatingRR}
          editMode={editMode}
          started={currentMatches.some((m) => m.status === 'complete')}
          mergeMensSingles={mergeMensSingles}
          mergeWomensSingles={mergeWomensSingles}
          consolidateDoubles={consolidateDoubles}
          currentDrawFormat={currentDrawFormat}
          onDownload={() => downloadDrawAsPng(showReserves ? llDrawDisplayMatches : displayMatches, showReserves ? 'LL Draw' : (currentDraw?.label || 'Draw'), drawState, event?.title, event?.round_deadlines ?? {})}
          onGenerateMatches={drawFormat === 'rr' ? () => setShowRRConfig(true) : handleGenerateAll}
          onCancelMatches={currentDrawFormat === 'rr' ? handleResetRR : handleResetDraw}
          onToggleEdit={() => setEditMode((v) => !v)}
          onToggleMergeMens={() => setMergeMensSingles((v) => !v)}
          onToggleMergeWomens={() => setMergeWomensSingles((v) => !v)}
          onToggleConsolidateDoubles={() => setConsolidateDoubles((v) => !v)}
        />
      </div>

      {scoreForm && scoreFormMatch && (
        <ScoreModal
          match={scoreFormMatch}
          scoreForm={scoreForm}
          onChange={setScoreForm}
          onClose={() => setScoreForm(null)}
          onSubmit={handleSubmitScore}
          isCreatorSubmit={true}
        />
      )}

      {showRRConfig && (
        <RRConfigModal
          playerCount={currentDrawAllPlayers.length}
          isLoading={generatingRR}
          onConfirm={handleGenerateRR}
          onClose={() => setShowRRConfig(false)}
        />
      )}
    </>
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20 pt-6">
      {/* Page tabs: Past / Active / Upcoming */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {PAGE_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => handleTabChange(t.id)}
            className={`px-4 py-2 rounded-2xl text-sm font-semibold transition-all border ${
              pageTab === t.id
                ? 'bg-clay text-white border-clay'
                : 'bg-tennis-surface/40 text-white border-white/10 hover:border-white/30'
            }`}
          >
            {t.label}
            {t.id === 'active' && activeEvents.length > 0 && (
              <span className="ml-1.5 text-xs font-bold opacity-70">{activeEvents.length}</span>
            )}
          </button>
        ))}
      </div>

      {statusLoading && allTournamentEvents.length === 0 ? (
        <div className="space-y-3">
          {[1, 2].map((i) => <div key={i} className="h-14 bg-tennis-surface/30 rounded-2xl animate-pulse" />)}
        </div>
      ) : tabEvents.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-white/50 text-sm">No {pageTab} tournaments.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tabEvents.map((e) => {
            const isOpen = expandedEventId === e.id;
            const isLoaded = isOpen && event?.id === e.id;
            const dateRange = formatEventRange(e);
            return (
              <div key={e.id} className="rounded-2xl border border-white/10 bg-tennis-surface/20 overflow-hidden">
                {/* Accordion header */}
                <button
                  onClick={() => handleAccordionToggle(e.id)}
                  className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-white/[0.03] transition-colors"
                >
                  <div>
                    <span className="font-bold text-white">{e.title}</span>
                    {dateRange && <span className="ml-3 text-xs text-white/50">{dateRange}</span>}
                  </div>
                  <ChevronDown className={`w-5 h-5 text-white/40 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>

                {/* Accordion body */}
                {isOpen && (
                  <div className="px-4 pb-6 pt-2 border-t border-white/5">
                    {!isLoaded || loading ? (
                      <div className="flex justify-center py-8">
                        <div className="w-10 h-10 border-4 border-clay border-t-transparent rounded-full animate-spin" />
                      </div>
                    ) : (
                      drawContent
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
