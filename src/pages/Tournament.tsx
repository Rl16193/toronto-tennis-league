import React, { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
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
import { AlertMessage } from '../components/AlertMessage';
import { Button } from '../components/Button';

const abbreviateEventTitle = (title: string): string => {
  return title
    .replace(/Season Opener\s*/i, 'SO')
    .replace(/Racquets\s*&\s*Strings\s*Slam\s*/i, 'RS Slam ')
    .replace(/\s+/g, ' ')
    .trim();
};

const getDrawState = (matches: TournamentMatch[]): string => {
  const real = matches.filter((m) => !m.id.startsWith('preview_') && !m.id.startsWith('ll_preview_'));
  if (real.length === 0) return 'Live Preview';

  const drawSize = real[0]?.drawsize || 8;
  const roundLabels = getRoundLabels(drawSize);

  // Check tournament complete: final match has a winner
  const finals = real.filter((m) => m.round === 'F');
  if (finals.length > 0 && finals.every((m) => m.winner_user_id)) return 'Tournament Complete';

  // Walk rounds from last to first — find most advanced with activity
  for (let i = roundLabels.length - 1; i >= 0; i--) {
    const round = roundLabels[i];
    const roundMatches = real.filter((m) => m.round === round);
    if (roundMatches.length === 0 || roundMatches.every((m) => !m.winner_user_id)) continue;
    const allComplete = roundMatches.every((m) => !!m.winner_user_id);
    return allComplete ? `${round} Complete` : `${round} Started`;
  }

  return 'Matches Generated';
};

export const Tournament: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const eventId = searchParams.get('event') || undefined;

  const {
    authLoading, loading, user,
    event, matches, submissions,
    allTournamentEvents,
    isCreator, started, userParticipant,
    currentDraw, currentMatches, displayMatches, visibleDraws,
    opponent,
    editPlayers, reservesPlayers, currentDrawSize, skillMismatchedCount,
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
  } = useTournament(eventId);

  useEffect(() => {
    if (!event) return;
    if (!searchParams.get('event')) {
      setSearchParams({ event: event.id }, { replace: true });
    }
  }, [event?.id]);

  useEffect(() => {
    document.title = event?.title
      ? `${event.title} — Racquets & Strings`
      : 'Tournament — Racquets & Strings';
  }, [event?.title]);

  const handleEventChange = (id: string) => setSearchParams({ event: id });

  if (authLoading || loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="w-14 h-14 border-4 border-clay border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const now = Date.now();
  const llIsPreview = currentReservesMatches.length === 0;
  const drawState = getDrawState(currentMatches);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20 pt-6">
      {/* Event selector — always shown when multiple events exist */}
      {allTournamentEvents.length > 1 && (
        <div className="mb-6 flex flex-wrap gap-2">
          {allTournamentEvents.map((e) => {
            const startMs = getEventDate(e)?.getTime();
            const isActive = startMs != null && startMs <= now;
            const isCurrent = e.id === event?.id;
            return (
              <button
                key={e.id}
                onClick={() => handleEventChange(e.id)}
                className={`px-4 py-2 rounded-2xl text-sm font-semibold transition-all border ${
                  isCurrent
                    ? 'bg-clay text-white border-clay'
                    : 'bg-tennis-surface/40 text-white border-white/10 hover:text-white hover:border-white/30'
                }`}
              >
                {abbreviateEventTitle(e.title)}
                <span className={`ml-2 text-xs font-bold uppercase tracking-wider ${isCurrent ? 'text-white/70' : 'text-white'}`}>
                  {isActive ? 'Active' : 'Upcoming'}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <TournamentHeader
        isCreator={isCreator}
        hasMatches={currentMatches.length > 0}
        isProcessing={generating || resettingDraw}
        editMode={editMode}
        started={started}
        mergeMensSingles={mergeMensSingles}
        mergeWomensSingles={mergeWomensSingles}
        consolidateDoubles={consolidateDoubles}
        onDownload={() => downloadDrawAsPng(showReserves ? llDrawDisplayMatches : displayMatches, showReserves ? 'LL Draw' : (currentDraw?.label || 'Draw'), drawState)}
        onGenerateMatches={handleGenerateAll}
        onCancelMatches={handleResetDraw}
        onToggleEdit={() => setEditMode((v) => !v)}
        onToggleMergeMens={() => setMergeMensSingles((v) => !v)}
        onToggleMergeWomens={() => setMergeWomensSingles((v) => !v)}
        onToggleConsolidateDoubles={() => setConsolidateDoubles((v) => !v)}
      />

      {message && (
        <AlertMessage tone={message.type} className="mb-6">
          <p>{message.text}</p>
        </AlertMessage>
      )}

      {isCreator && skillMismatchedCount > 0 && (
        <div className="mb-6 flex items-start gap-2 text-sm text-orange-500">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">Bracket mismatch detected</p>
            <p className="mt-1">
              {skillMismatchedCount} player{skillMismatchedCount > 1 ? 's have' : ' has'} updated their skill level since the draw was finalized and may be in the wrong bracket. Use Edit Draw to correct their bracket placement.
            </p>
          </div>
        </div>
      )}

      {opponent && (
        <OpponentCard
          opponent={opponent}
          eventId={event?.id}
        />
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
                    currentLLSize === size
                      ? 'bg-clay text-white'
                      : !llIsPreview
                        ? 'bg-tennis-surface/30 text-white cursor-not-allowed'
                        : 'bg-tennis-surface/60 text-white hover:text-white'
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
                  <Button variant="danger" onClick={handleResetLLDraw} className="ml-2">
                    Reset LL Draw
                  </Button>
                </>
              )}
            </div>
          )}

          <BracketErrorBoundary onDownload={() => downloadDrawAsPng(llDrawDisplayMatches, 'LL Draw', drawState)}>
            <BracketView
              matches={llDrawDisplayMatches}
              drawTitle="LL Draw"
              drawState={drawState}
              editMode={editMode}
              editPlayers={editMode ? allUsersAsTournamentPlayers : []}
              onEditPlayer={handleEditPlayer}
              submissions={submissions}
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
            <AddPlayerPanel
              availableUsers={availableUsers}
              currentDraw={currentDraw}
              onAdd={handleAddPlayer}
            />
          )}

          {editMode && currentDraw && (
            <div className="mb-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm font-bold text-white uppercase tracking-widest">Draw Size</span>
                {(currentDraw.tournamentChoice === 'Singles' ? [8, 16, 32] : [8, 16]).map((size) => (
                  <button
                    key={size}
                    disabled={currentMatches.length > 0}
                    onClick={() => handleSetPreviewDrawSize(currentDraw.label, size)}
                    className={`px-4 py-1.5 rounded-xl text-sm font-bold transition-colors ${
                      currentDrawSize === size
                        ? 'bg-clay text-white'
                        : currentMatches.length > 0
                          ? 'bg-tennis-surface/30 text-white cursor-not-allowed'
                          : 'bg-tennis-surface/60 text-white hover:text-white'
                    }`}
                  >
                    R{size}
                  </button>
                ))}
              </div>
              {currentMatches.length > 0 && (
                <p className="text-xs text-amber-400/80 mt-2">
                  Matches already created — reset this draw first to change the size.
                </p>
              )}
            </div>
          )}

          <BracketErrorBoundary onDownload={() => downloadDrawAsPng(displayMatches, currentDraw?.label || 'Draw', drawState)}>
            <BracketView
              matches={displayMatches}
              drawTitle={currentDraw?.label || 'Draw'}
              drawState={drawState}
              editMode={editMode}
              editPlayers={editPlayers}
              onEditPlayer={handleEditPlayer}
              submissions={submissions}
              isCreator={isCreator}
              onSubmitScore={handleOpenScoreForm}
              roundDeadlines={event?.round_deadlines}
              onUpdateDeadline={isCreator ? handleUpdateRoundDeadline : undefined}
            />
          </BracketErrorBoundary>

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
                {editMode && (
                  <p className="text-xs text-white mt-4 border-t border-white/5 pt-4">
                    Use the slot dropdowns in the draw above to assign reserves players.
                  </p>
                )}
              </div>
            </div>
          )}
        </>
      )}

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
    </div>
  );
};
