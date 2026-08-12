import React from 'react';
import { Check, X } from 'lucide-react';
import { EventParticipant } from '../../types';
import { formatPlayerName } from './utils';

// Creator-only: participants who asked to be moved to a different zone. The organizer can action
// the move right here — picking a zone pins `zone_override` on the participant and clears the
// request in one write. Approve (tick) moves them to the zone they asked for; reject (cross)
// clears the request and leaves them where they are.
//
// Moving a zone changes which draw the player is routed to; it does not touch matches they're
// already in. Use the normal edit tools for that.
export const ZoneChangeRequestsPanel: React.FC<{
  requests: EventParticipant[];
  buckets?: { id: string; label: string }[];
  onMoveZone?: (participantId: string, bucketId: string) => void;
  /** Approve — move them to the zone they asked for. Only offered when we can resolve it. */
  onApprove?: (participantId: string, newZone: string) => void;
  /** Reject — clear the request, leaving the player where they are. */
  onClear: (participantId: string) => void;
}> = ({ requests, buckets = [], onMoveZone, onApprove, onClear }) => {
  if (requests.length === 0) return null;
  return (
    <div className="mb-6 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
      <p className="text-xs font-bold uppercase tracking-widest text-amber-300 mb-2">
        Zone change requested ({requests.length})
      </p>
      {requests.map((p) => (
        <div key={p.id} className="flex flex-wrap items-center gap-2 py-2 border-b border-fg/5 last:border-0">
          <span className="flex-1 min-w-[140px]">
            <span className="block text-sm text-fg">{formatPlayerName(p.user_name || 'Player')}</span>
            {p.new_zone && (
              <span className="block text-[11px] text-fg/70">wants: {p.new_zone}</span>
            )}
          </span>
          {!!buckets.length && onMoveZone && (
            <select
              value=""
              onChange={(e) => { if (e.target.value) onMoveZone(p.id, e.target.value); }}
              aria-label={`Move ${formatPlayerName(p.user_name || 'Player')} to a zone`}
              className="text-xs bg-tennis-surface rounded-lg px-2 py-1.5 text-fg cursor-pointer"
            >
              <option value="">Move to zone…</option>
              {buckets.map((b) => (
                <option key={b.id} value={b.id}>{b.label}</option>
              ))}
            </select>
          )}
          {/* Approve moves them to the zone they asked for; reject just clears the request and
              leaves them put. Approve is hidden when the request carries no target zone — an
              older request raised before the picker existed has nothing to approve them into. */}
          {onApprove && p.new_zone && (
            <button
              type="button"
              aria-label={`Approve move to ${p.new_zone}`}
              title={`Approve: move to ${p.new_zone}`}
              onClick={() => onApprove(p.id, p.new_zone!)}
              className="shrink-0 p-2 rounded-lg bg-green-500/10 text-green-500 hover:bg-green-500/20 transition-colors"
            >
              <Check className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            aria-label="Reject zone change"
            title="Reject, leave them in their current zone"
            onClick={() => onClear(p.id)}
            className="shrink-0 p-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
};
