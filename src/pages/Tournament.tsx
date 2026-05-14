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
import { AlertMessage } from '../components/AlertMessage';

export const Tournament: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const eventId = searchParams.get('event') || undefined;

  const {
    authLoading, loading,
    event, matches, submissions,
    allTournamentEvents,
    isCreator, started, userParticipant,
    currentDraw, currentMatches, displayMatches, visibleDraws,
    myActiveMatch, hasSubmittedScore, opponent,
    editPlayers, reservesPlayers, currentDrawSize, skillMismatchedCount,
    message, scoreForm, setScoreForm,
    generating, updatingDraw, resettingDraw, editMode, setEditMode,
    mergeWomensSingles, setMergeWomensSingles, consolidateDoubles, setConsolidateDoubles,
    activeTab, setActiveTab, activeSkill, setActiveSkill, activeDoubles, setActiveDoubles,
    moveablePlayers, availableUsers,
    handleSetPreviewDrawSize, handleMovePlayer, handleAddPlayer,
    handleGenerateAll, handleCreatorUpdateDraw, handleResetDraw,
    handleResolveDispute, handleEditPlayer, handleSubmitScore, handleOpenScoreForm,
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
        onDownload={() => downloadDrawAsPng(displayMatches, currentDraw?.label || 'Draw')}
        onGenerateAll={handleGenerateAll}
        onUpdateDraw={handleCreatorUpdateDraw}
        onResetDraw={handleResetDraw}
        onToggleEdit={() => setEditMode((v) => !v)}
        onToggleMergeWomens={() => setMergeWomensSingles((v) => !v)}
        onToggleConsolidateDoubles={() => setConsolidateDoubles((v) => !v)}
      />

      {message && (
        <AlertMessage tone={message.type} className="mb-6">
          <p>{message.text}</p>
        </AlertMessage>
      )}

      {userParticipant && matches.length > 0 && (
        <div className="mb-6 rounded-2xl border border-orange-500/30 bg-orange-500 p-4 flex items-start gap-3 text-white">
          <CheckCircle2 className="w-5 h-5 mt-0.5 shrink-0" />
          <p className="text-sm font-semibold">
            Draws have been finalized. Please contact your opponent to schedule your match. Kindly play your matches before the round deadline provided in the draw. Contact us if you are facing any difficulties.
          </p>
        </div>
      )}

      {isCreator && skillMismatchedCount > 0 && (
        <div className="mb-6 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 flex items-start gap-3 text-amber-300">
          <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">Bracket mismatch detected</p>
            <p className="text-sm mt-1">
              {skillMismatchedCount} player{skillMismatchedCount > 1 ? 's have' : ' has'} updated their skill level since the draw was finalized and may be in the wrong bracket. Click <strong>Update Draw</strong> to move them to the correct bracket.
            </p>
          </div>
        </div>
      )}

      {opponent && (
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
        onTabChange={setActiveTab}
        onSkillChange={setActiveSkill}
        onDoublesChange={setActiveDoubles}
      />

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

      {isCreator && (
        <FlaggedResults
          submissions={submissions}
          matches={matches}
          onResolve={handleResolveDispute}
        />
      )}

      {scoreForm && myActiveMatch && (
        <ScoreModal
          match={myActiveMatch}
          scoreForm={scoreForm}
          onChange={setScoreForm}
          onClose={() => setScoreForm(null)}
          onSubmit={handleSubmitScore}
        />
      )}
    </div>
  );
};
