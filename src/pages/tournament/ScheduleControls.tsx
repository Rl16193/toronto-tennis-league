import React from 'react';
import { Button } from '../../components/Button';
import { TournamentMatch } from './types';
import { formatScheduledDate, getScheduleState } from './utils';

export type ScheduleApi = {
  onAskOrganizer: (match: TournamentMatch) => void;
  onSubmitScore?: (match: TournamentMatch) => void;
  submittableMatchIds?: Set<string>;
};

// Compact scheduling block for one match: status badge, ask-organizer fallback, submit-score,
// and the no-show rule. Contacting the opponent directly (ContactOpponentButton, shown alongside
// this) is the primary way to arrange a match; "Schedule on Matchdays" is the deliberate fallback
// for when that doesn't work — `hideAskButton` lets a parent render that one button inline in its
// own row instead (OpponentPanels.tsx) while this block still handles Submit Score + the no-show
// rule. Once a score is recorded the match reads "Completed" and the action row is hidden.
// `hideRule` suppresses the weekend/no-show rule (shown once per group elsewhere); `className`
// overrides the wrapper so it can sit inline in a row.
export const ScheduleControls: React.FC<{
  match: TournamentMatch;
  api: ScheduleApi;
  hideRule?: boolean;
  hideBadge?: boolean;
  /** The ask-organizer button is shown inline in the row above instead (OpponentPanels.tsx). */
  hideAskButton?: boolean;
  /** The submit-score button is shown inline in the row above instead (OpponentPanels.tsx). */
  hideSubmitButton?: boolean;
  className?: string;
  /** 'grid-2' lays the action buttons in a 2-column grid instead of flex-wrap */
  buttonLayout?: 'flex' | 'grid-2';
  /** Signed-in user, so a completed match reads "Win"/"Loss" instead of a generic "Completed". */
  viewerUid?: string;
}> = ({ match, api, hideRule, hideBadge, hideAskButton, hideSubmitButton, className, buttonLayout = 'flex', viewerUid }) => {
  const s = getScheduleState(match);
  const isComplete = match.status === 'complete';

  const badge = isComplete
    ? (viewerUid && match.winner_uid
      ? (match.winner_uid === viewerUid
        ? { text: 'Win', cls: 'bg-green-500/15 text-badge-win border-green-500/25' }
        : { text: 'Loss', cls: 'bg-red-500/15 text-badge-loss border-red-500/25' })
      : { text: 'Completed', cls: 'bg-green-500/15 text-badge-win border-green-500/25' })
    : s.status === 'scheduled'
      ? { text: `Scheduled on ${formatScheduledDate(s.date, s.slot ?? '')}`, cls: 'bg-green-500/15 text-badge-win border-green-500/25' }
      : { text: 'Unscheduled', cls: 'bg-fg/5 text-fg/70 border-fg/10' };

  const showSubmit = !!api.onSubmitScore && !!api.submittableMatchIds?.has(match.id) && !isComplete && !hideSubmitButton;
  const showAsk = !isComplete && !hideAskButton && !s.requested;

  return (
    <div className={className ?? 'mt-3 rounded-2xl bg-tennis-dark/40 p-3 space-y-2.5'}>
      {!hideBadge && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${badge.cls}`}>{badge.text}</span>
          {!isComplete && s.requested && <span className="text-[11px] text-fg/70">Organizer asked to schedule</span>}
        </div>
      )}

      {(showAsk || showSubmit) && (
        <div className={buttonLayout === 'grid-2' ? 'grid grid-cols-2 gap-2' : 'flex flex-wrap gap-2'}>
          {showAsk && (
            <Button size="sm" variant="clay" onClick={() => api.onAskOrganizer(match)}>Schedule</Button>
          )}
          {showSubmit && (
            <Button size="sm" variant="clay" className="px-3" onClick={() => api.onSubmitScore!(match)}>Submit Score</Button>
          )}
        </div>
      )}
      {!hideRule && !isComplete && (
        <p className="text-[11px] text-fg/70 leading-snug">
          Matchdays. Schedule prepared by organizer based on your availability.
        </p>
      )}
    </div>
  );
};
