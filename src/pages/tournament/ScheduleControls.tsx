import React, { useState } from 'react';
import { CalendarClock, Check, MessageCircle } from 'lucide-react';
import { Button } from '../../components/Button';
import { TournamentMatch } from './types';
import { getScheduleState } from './utils';

export type ScheduleApi = {
  uid: string;
  onPropose: (match: TournamentMatch, date: string, slot: 'AM' | 'PM') => void;
  onConfirm: (match: TournamentMatch) => void;
  onAskOrganizer: (match: TournamentMatch) => void;
  onSubmitScore?: (match: TournamentMatch) => void;
  submittableMatchIds?: Set<string>;
};

const fmtDate = (d?: string) => {
  if (!d) return '';
  const dt = new Date(`${d}T00:00:00`);
  return Number.isNaN(dt.getTime()) ? d : dt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
};

// Compact scheduling block for one match: status badge, propose/confirm/reschedule,
// ask-organizer fallback, submit-score, and the no-show rule. Message is a disabled stub.
// Once a score is recorded the match reads "Completed" and the action row is hidden.
// `hideRule` suppresses the weekend/no-show rule (shown once per group elsewhere); `className`
// overrides the wrapper so it can sit inline in a row.
export const ScheduleControls: React.FC<{
  match: TournamentMatch;
  api: ScheduleApi;
  showMessage?: boolean;
  hideRule?: boolean;
  hideBadge?: boolean;
  className?: string;
}> = ({ match, api, showMessage, hideRule, hideBadge, className }) => {
  const s = getScheduleState(match, api.uid);
  const isComplete = match.status === 'complete';
  const [picking, setPicking] = useState(false);
  const [date, setDate] = useState(s.date ?? '');
  const [slot, setSlot] = useState<'AM' | 'PM'>(s.slot ?? 'AM');

  const badge = isComplete
    ? { text: 'Completed', cls: 'bg-green-500/15 text-green-300 border-green-500/25' }
    : s.status === 'scheduled'
      ? { text: `Scheduled · ${fmtDate(s.date)} ${s.slot ?? ''}`.trim(), cls: 'bg-green-500/15 text-green-300 border-green-500/25' }
      : s.status === 'proposed'
        ? {
            text: s.proposedByMe
              ? `You proposed ${fmtDate(s.date)} ${s.slot} · awaiting confirm`
              : `Opponent proposed ${fmtDate(s.date)} ${s.slot}`,
            cls: 'bg-amber-500/15 text-amber-300 border-amber-500/25',
          }
        : { text: 'Unscheduled', cls: 'bg-white/5 text-white/60 border-white/10' };

  const canSubmit = !!api.onSubmitScore && !!api.submittableMatchIds?.has(match.id) && !isComplete;
  const submitPropose = () => { if (date) { api.onPropose(match, date, slot); setPicking(false); } };

  return (
    <div className={className ?? 'mt-3 rounded-2xl border border-white/10 bg-tennis-dark/40 p-3 space-y-2.5'}>
      {!hideBadge && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${badge.cls}`}>{badge.text}</span>
          {!isComplete && s.requested && <span className="text-[11px] text-white/40">Organizer asked to schedule</span>}
        </div>
      )}

      {isComplete ? null : picking ? (
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
            className="rounded-lg bg-tennis-surface border border-white/10 px-2 py-1.5 text-white text-xs" />
          <div className="flex rounded-lg overflow-hidden border border-white/10">
            {(['AM', 'PM'] as const).map((sl) => (
              <button key={sl} type="button" onClick={() => setSlot(sl)}
                className={`px-3 py-1.5 text-xs font-bold ${slot === sl ? 'bg-clay text-white' : 'bg-white/5 text-white/60'}`}>{sl}</button>
            ))}
          </div>
          <Button size="sm" className="px-3" onClick={submitPropose} disabled={!date}>Send</Button>
          <Button size="sm" variant="ghost" onClick={() => setPicking(false)}>Cancel</Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {s.status === 'proposed' && !s.proposedByMe && (
            <Button size="sm" className="px-3" onClick={() => api.onConfirm(match)}>
              <Check className="w-3.5 h-3.5 mr-1" />Confirm
            </Button>
          )}
          <Button size="sm" variant="outline" className="px-3" onClick={() => setPicking(true)}>
            <CalendarClock className="w-3.5 h-3.5 mr-1" />{s.status === 'unscheduled' ? 'Propose a time' : 'Reschedule'}
          </Button>
          {!s.requested && (
            <Button size="sm" variant="ghost" onClick={() => api.onAskOrganizer(match)}>Ask organizer to schedule</Button>
          )}
          {canSubmit && (
            <Button size="sm" variant="clay" className="px-3" onClick={() => api.onSubmitScore!(match)}>Submit Score</Button>
          )}
          {showMessage && (
            <Button size="sm" variant="ghost" disabled className="opacity-50">
              <MessageCircle className="w-3.5 h-3.5 mr-1" />Message
            </Button>
          )}
        </div>
      )}

      {!hideRule && !isComplete && (
        <p className="text-[11px] text-white/40 leading-snug">
          Play on weekend matchdays — schedule set by the organizer. Both players must attend; if only one shows up, they advance.
        </p>
      )}
    </div>
  );
};
