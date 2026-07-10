import React, { useState } from 'react';
import { Button } from '../../components/Button';
import { TournamentMatch } from './types';
import { formatPlayerName } from './utils';

const RequestRow: React.FC<{ match: TournamentMatch; onSet: (m: TournamentMatch, date: string, slot: 'AM' | 'PM') => void }> = ({ match, onSet }) => {
  const [date, setDate] = useState(match.proposed_date ?? '');
  const [slot, setSlot] = useState<'AM' | 'PM'>(match.proposed_slot ?? 'AM');
  return (
    <div className="flex flex-wrap items-center gap-2 py-2 border-b border-white/5 last:border-0">
      <span className="text-sm text-white/80 flex-1 min-w-[140px]">
        {formatPlayerName(match.player_1_name)} vs {formatPlayerName(match.player_2_name)}
      </span>
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
        className="rounded-lg bg-tennis-surface border border-white/10 px-2 py-1.5 text-white text-xs" />
      <div className="flex rounded-lg overflow-hidden border border-white/10">
        {(['AM', 'PM'] as const).map((s) => (
          <button key={s} type="button" onClick={() => setSlot(s)}
            className={`px-3 py-1.5 text-xs font-bold ${slot === s ? 'bg-clay text-white' : 'bg-white/5 text-white/60'}`}>{s}</button>
        ))}
      </div>
      <Button size="sm" className="px-3" onClick={() => onSet(match, date, slot)} disabled={!date}>Set</Button>
    </div>
  );
};

// Creator-only: matches a player asked the organizer to schedule; set a date + AM/PM per match.
export const ScheduleRequestsPanel: React.FC<{
  requests: TournamentMatch[];
  onSetSchedule: (m: TournamentMatch, date: string, slot: 'AM' | 'PM') => void;
}> = ({ requests, onSetSchedule }) => {
  if (requests.length === 0) return null;
  return (
    <div className="mb-6 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
      <p className="text-xs font-bold uppercase tracking-widest text-amber-300 mb-2">
        Scheduling requested ({requests.length})
      </p>
      {requests.map((m) => <RequestRow key={m.id} match={m} onSet={onSetSchedule} />)}
    </div>
  );
};
