import React from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { useTournament } from './tournament/useTournament';
import { downloadDrawAsPng } from './tournament/bracketImage';
import { BracketView } from './tournament/BracketView';
import { BracketErrorBoundary } from './tournament/BracketErrorBoundary';
import { TournamentHeader } from './tournament/TournamentHeader';
import { OpponentCard } from './tournament/OpponentCard';
import { DrawTabs } from './tournament/DrawTabs';
import { ScoreModal } from './tournament/ScoreModal';
import { FlaggedResults } from './tournament/FlaggedResults';

export const Tournament: React.FC = () => {
  const {
    authLoading, loading,
    event, matches, submissions,
    isCreator, started, userParticipant,
    currentDraw, currentMatches, displayMatches, visibleDraws,
    myActiveMatch, hasSubmittedScore, opponent,
    editPlayers, skillMismatchedCount,
    message, scoreForm, setScoreForm,
    generating, updatingDraw, resettingDraw, editMode, setEditMode,
    activeTab, setActiveTab, activeSkill, setActiveSkill, activeDoubles, setActiveDoubles,
    handleGenerateAll, handleCreatorUpdateDraw, handleResetDraw,
    handleResolveDispute, handleEditPlayer, handleSubmitScore, handleOpenScoreForm,
  } = useTournament();

  if (authLoading || loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="w-14 h-14 border-4 border-clay border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20 pt-6">
      <TournamentHeader
        title={event?.title || 'Tournament Draw'}
        isCreator={isCreator}
        generating={generating}
        updatingDraw={updatingDraw}
        resettingDraw={resettingDraw}
        canReset={!started && currentMatches.length > 0}
        editMode={editMode}
        onDownload={() => downloadDrawAsPng(displayMatches, currentDraw?.label || 'Draw')}
        onGenerateAll={handleGenerateAll}
        onUpdateDraw={handleCreatorUpdateDraw}
        onResetDraw={handleResetDraw}
        onToggleEdit={() => setEditMode((v) => !v)}
      />

      {message && (
        <div className={`mb-6 rounded-2xl border p-4 flex items-start gap-3 ${
          message.type === 'success'
            ? 'bg-green-500/10 border-green-500/20 text-green-300'
            : 'bg-red-500/10 border-red-500/20 text-red-300'
        }`}>
          {message.type === 'success'
            ? <CheckCircle2 className="w-5 h-5 mt-0.5" />
            : <AlertCircle className="w-5 h-5 mt-0.5" />}
          <p className="font-semibold">{message.text}</p>
        </div>
      )}

      {userParticipant && matches.length > 0 && (
        <div className="mb-6 rounded-2xl border border-orange-500/30 bg-orange-500 p-4 flex items-start gap-3 text-white">
          <CheckCircle2 className="w-5 h-5 mt-0.5 shrink-0" />
          <p className="text-sm font-semibold">
            Draw finalized on Wednesday 6th May, 2026, 11:59 PM. You can schedule your matches anytime before round ends. Check draw for details.
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

      <BracketErrorBoundary onDownload={() => downloadDrawAsPng(displayMatches, currentDraw?.label || 'Draw')}>
        <BracketView
          matches={displayMatches}
          drawTitle={currentDraw?.label || 'Draw'}
          editMode={editMode}
          editPlayers={editPlayers}
          onEditPlayer={handleEditPlayer}
        />
      </BracketErrorBoundary>

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
