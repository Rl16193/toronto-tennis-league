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
// this) is the primary way to arrange a match; Request Scheduling Assistance is the deliberate
// fallback for when that doesn't work. Once a score is recorded the match reads "Completed" and
// the action row is hidden. `hideRule` suppresses the weekend/no-show rule (shown once per group
// elsewhere); `className` overrides the wrapper so it can sit inline in a row.
export const ScheduleControls: React.FC<{
  match: TournamentMatch;
  api: ScheduleApi;
  hideRule?: boolean;
  hideBadge?: boolean;
  className?: string;
  /** 'grid-2' lays the action buttons in a 2-column grid instead of flex-wrap */
  buttonLayout?: 'flex' | 'grid-2';
}> = ({ match, api, hideRule, hideBadge, className, buttonLayout = 'flex' }) => {
  const s = getScheduleState(match);
  const isComplete = match.status === 'complete';

  const badge = isComplete
    ? { text: 'Completed', cls: 'bg-green-500/15 text-green-300 border-green-500/25' }
    : s.status === 'scheduled'
      ? { text: `Scheduled on ${formatScheduledDate(s.date, s.slot ?? '')}`, cls: 'bg-green-500/15 text-green-300 border-green-500/25' }
      : { text: 'Unscheduled', cls: 'bg-white/5 text-white/60 border-white/10' };

  const canSubmit = !!api.onSubmitScore && !!api.submittableMatchIds?.has(match.id) && !isComplete;

  return (
    <div className={className ?? 'mt-3 rounded-2xl border border-white/10 bg-tennis-dark/40 p-3 space-y-2.5'}>
      {!hideBadge && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${badge.cls}`}>{badge.text}</span>
          {!isComplete && s.requested && <span className="text-[11px] text-white/40">Organizer asked to schedule</span>}
        </div>
      )}

      {!isComplete && (
        <div className={buttonLayout === 'grid-2' ? 'grid grid-cols-2 gap-2' : 'flex flex-wrap gap-2'}>
          {!s.requested && (
            <Button size="sm" variant="clay" onClick={() => api.onAskOrganizer(match)}>Request Scheduling Assistance</Button>
          )}
          {canSubmit && (
            <Button size="sm" variant="clay" className="px-3" onClick={() => api.onSubmitScore!(match)}>Submit Score</Button>
          )}
        </div>
      )}
      {!isComplete && !s.requested && (
        <p className="text-[11px] text-white/40 leading-snug">
          Use this when/if you're unable to contact your opponent.
        </p>
      )}

      {!hideRule && !isComplete && (
        <p className="text-[11px] text-white/40 leading-snug">
          Play on weekend matchdays — schedule set by the organizer. Both players must attend; if only one shows up, they advance.
        </p>
      )}
    </div>
  );
};
