import React, { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { useTournament } from './tournament/useTournament';
import { getEventDate } from './tournament/utils';
import { downloadDrawAsPng } from './tournament/bracketImage';
import { BracketView } from './tournament/BracketView';
import { BracketErrorBoundary } from './tournament/BracketErrorBoundary';
import { TournamentHeader } from './tournament/TournamentHeader';
import { OpponentCard } from './tournament/OpponentCard';
import { DrawTabs } from './tournament/DrawTabs';
import { ScoreModal } from './tournament/ScoreModal';
import { FlaggedResults } from './tournament/FlaggedResults';
import { PlayerMovePanel } from './tournament/PlayerMovePanel';
import { AddPlayerPanel } from './tournament/AddPlayerPanel';
import { Button } from '../components/Button';

export const Tournament: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const eventId = searchParams.get('event') || undefined;

  const {
    authLoading, loading, user,
    event, matches, submissions,
    allTournamentEvents,
    isCreator, started, userParticipant,
    currentDraw, currentMatches, displayMatches, visibleDraws,
    myActiveMatch, hasSubmittedScore, opponent,
    editPlayers, reservesPlayers, currentDrawSize, skillMismatchedCount,
    message, scoreForm, scoreFormMatch, setScoreForm,
    generating, updatingDraw, resettingDraw, editMode, setEditMode,
    mergeWomensSingles, setMergeWomensSingles, consolidateDoubles, setConsolidateDoubles,
    activeTab, setActiveTab, activeSkill, setActiveSkill, activeDoubles, setActiveDoubles,
    moveablePlayers, availableUsers,
    handleSetPreviewDrawSize, handleMovePlayer, handleAddPlayer,
    handleGenerateAll, handleCreatorUpdateDraw, handleResetDraw,
    handleResolveDispute, handleEditPlayer, handleSubmitScore, handleOpenScoreForm,
    currentReservesMatches, llDrawDisplayMatches, currentLLSize, allUsersAsTournamentPlayers,
    showReserves, setShowReserves, generatingReserves,
    handleSetLLDrawSize, handleGenerateReservesDraw,
  } = useTournament(eventId);

  useEffect(() => {
    if (!event) return;
    if (!searchParams.get('event')) {
      setSearchParams({ event: event.id }, { replace: true });
    }
  }, [event?.id]);

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

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20 pt-6">
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
                    : 'bg-tennis-surface/40 text-gray-400 border-white/10 hover:text-white hover:border-white/30'
                }`}
              >
                {e.title}
                <span className={`ml-2 text-xs font-bold uppercase tracking-wider ${isCurrent ? 'text-white/70' : 'text-gray-600'}`}>
                  {isActive ? 'Active' : 'Upcoming'}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <TournamentHeader
        title={event?.title || 'Tournament Draw'}
        isCreator={isCreator}
        generating={generating}
        updatingDraw={updatingDraw}
        resettingDraw={resettingDraw}
        canReset={false}
        canFinalize={currentMatches.length === 0}
        editMode={editMode}
        started={started}
        mergeWomensSingles={mergeWomensSingles}
        consolidateDoubles={consolidateDoubles}
        onDownload={() => downloadDrawAsPng(showReserves ? llDrawDisplayMatches : displayMatches, showReserves ? 'LL Draw' : (currentDraw?.label || 'Draw'))}
        onGenerateAll={handleGenerateAll}
        onUpdateDraw={handleCreatorUpdateDraw}
        onResetDraw={handleResetDraw}
        onToggleEdit={() => setEditMode((v) => !v)}
        onToggleMergeWomens={() => setMergeWomensSingles((v) => !v)}
        onToggleConsolidateDoubles={() => setConsolidateDoubles((v) => !v)}
      />

      {message && (
        <div className={`mb-6 flex items-start gap-2 text-sm ${message.type === 'success' ? 'text-green-400' : 'text-orange-500'}`}>
          {message.type === 'success'
            ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
            : <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />}
          <p className="font-semibold">{message.text}</p>
        </div>
      )}

      {userParticipant && matches.length > 0 && (
        <div className="mb-6 flex items-start gap-2 text-sm text-orange-500">
          <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
          <p className="font-semibold">
            Draws have been finalized. Please contact your opponent to schedule your match. Kindly play your matches before the round deadline provided in the draw. Contact us if you are facing any difficulties.
          </p>
        </div>
      )}

      {isCreator && skillMismatchedCount > 0 && (
        <div className="mb-6 flex items-start gap-2 text-sm text-orange-500">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">Bracket mismatch detected</p>
            <p className="mt-1">
              {skillMismatchedCount} player{skillMismatchedCount > 1 ? 's have' : ' has'} updated their skill level since the draw was finalized and may be in the wrong bracket. Click <strong>Update Draw</strong> to move them to the correct bracket.
            </p>
          </div>
        </div>
      )}

      {opponent && !showReserves && (
        <OpponentCard
          opponent={opponent}
          myActiveMatch={myActiveMatch}
          hasSubmittedScore={hasSubmittedScore}
          onSubmitScore={handleOpenScoreForm}
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
          {/* LL Draw controls — size selector + finalize (preview only) */}
          {isCreator && (
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <span className="text-sm font-bold text-gray-400 uppercase tracking-widest">LL Draw Size</span>
              {[4, 8, 16].map((size) => (
                <button
                  key={size}
                  disabled={!llIsPreview}
                  onClick={() => handleSetLLDrawSize(size)}
                  className={`px-4 py-1.5 rounded-xl text-sm font-bold transition-colors ${
                    currentLLSize === size
                      ? 'bg-clay text-white'
                      : !llIsPreview
                        ? 'bg-tennis-surface/30 text-gray-600 cursor-not-allowed'
                        : 'bg-tennis-surface/60 text-gray-300 hover:text-white'
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
                <span className="text-xs text-gray-500">Draw finalized — use Edit Draw to modify players.</span>
              )}
            </div>
          )}

          <BracketErrorBoundary onDownload={() => downloadDrawAsPng(llDrawDisplayMatches, 'LL Draw')}>
            <BracketView
              matches={llDrawDisplayMatches}
              drawTitle="LL Draw"
              editMode={editMode}
              editPlayers={editMode ? allUsersAsTournamentPlayers : []}
              onEditPlayer={handleEditPlayer}
              submissions={submissions}
              isCreator={isCreator}
              onSubmitScore={handleOpenScoreForm}
            />
          </BracketErrorBoundary>
        </>
      ) : (
        <>
          {editMode && isCreator && (
            <PlayerMovePanel players={moveablePlayers} onMove={handleMovePlayer} />
          )}

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
                <span className="text-sm font-bold text-gray-400 uppercase tracking-widest">Draw Size</span>
                {(currentDraw.tournamentChoice === 'Singles' ? [8, 16, 32] : [8, 16]).map((size) => (
                  <button
                    key={size}
                    disabled={currentMatches.length > 0}
                    onClick={() => handleSetPreviewDrawSize(currentDraw.label, size)}
                    className={`px-4 py-1.5 rounded-xl text-sm font-bold transition-colors ${
                      currentDrawSize === size
                        ? 'bg-clay text-white'
                        : currentMatches.length > 0
                          ? 'bg-tennis-surface/30 text-gray-600 cursor-not-allowed'
                          : 'bg-tennis-surface/60 text-gray-300 hover:text-white'
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

          <BracketErrorBoundary onDownload={() => downloadDrawAsPng(displayMatches, currentDraw?.label || 'Draw')}>
            <BracketView
              matches={displayMatches}
              drawTitle={currentDraw?.label || 'Draw'}
              editMode={editMode}
              editPlayers={editPlayers}
              onEditPlayer={handleEditPlayer}
              submissions={submissions}
              isCreator={isCreator}
              onSubmitScore={handleOpenScoreForm}
            />
          </BracketErrorBoundary>

          {reservesPlayers.length > 0 && (
            <div className="mt-8">
              <h3 className="text-xl font-bold text-white mb-4">
                Reserves <span className="text-gray-400 text-base font-normal">({reservesPlayers.length})</span>
              </h3>
              <div className="bg-tennis-surface/30 border border-white/5 rounded-2xl p-6">
                <ol className="space-y-2">
                  {reservesPlayers.map((player, i) => (
                    <li key={player.user_id} className="flex items-center gap-3 text-gray-300">
                      <span className="text-gray-500 text-sm w-6 text-right shrink-0">{i + 1}.</span>
                      <span className="font-semibold">{player.name}</span>
                    </li>
                  ))}
                </ol>
                {editMode && (
                  <p className="text-xs text-gray-500 mt-4 border-t border-white/5 pt-4">
                    Use the slot dropdowns in the draw above to assign reserves players.
                  </p>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {isCreator && (
        <FlaggedResults
          submissions={submissions}
          matches={matches}
          onResolve={handleResolveDispute}
        />
      )}

      {scoreForm && scoreFormMatch && (
        <ScoreModal
          match={scoreFormMatch}
          scoreForm={scoreForm}
          onChange={setScoreForm}
          onClose={() => setScoreForm(null)}
          onSubmit={handleSubmitScore}
          isCreatorSubmit={isCreator && scoreFormMatch.player_1_user_id !== user?.uid && scoreFormMatch.player_2_user_id !== user?.uid}
        />
      )}
    </div>
  );
};
