import React, { useMemo, useState } from 'react';
import { Button } from '../../../components/Button';
import { Calendar, Trash2 } from 'lucide-react';
import { JoinedEventCard } from '../types';

interface ProfileEventsProps {
  joinedEvents: JoinedEventCard[];
  loading: boolean;
  onRemoveEvent: (event: JoinedEventCard) => void;
}

type EventFilter = 'all' | 'upcoming' | 'active' | 'completed';

const FILTERS: { id: EventFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'active', label: 'Active' },
  { id: 'completed', label: 'Completed' },
];

const parseEventDate = (value?: string | { toDate?: () => Date; seconds?: number; nanoseconds?: number }) => {
  if (!value) return null;
  if (typeof value === 'object') {
    if (typeof value.toDate === 'function') {
      const parsed = value.toDate();
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    if (typeof value.seconds === 'number') {
      const parsed = new Date(value.seconds * 1000);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const ProfileEvents: React.FC<ProfileEventsProps> = ({
  joinedEvents,
  loading,
  onRemoveEvent,
}) => {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [filter, setFilter] = useState<EventFilter>('all');

  const openConfirm = (participantId: string) => {
    setPendingId(participantId);
    setConfirmed(false);
  };

  const closeConfirm = () => {
    setPendingId(null);
    setConfirmed(false);
  };

  const handleConfirm = () => {
    const event = joinedEvents.find((e) => e.participantId === pendingId);
    if (!event || !confirmed) return;
    onRemoveEvent(event);
    closeConfirm();
  };

  const filteredEvents = useMemo(() => {
    if (filter === 'all') return joinedEvents;
    const now = Date.now();
    return joinedEvents.filter((event) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const e = event as Record<string, any>;
      const startDate = parseEventDate(e.startDate || e.start_date || e.date);
      const endDate = parseEventDate(e.endDate || e.end_date);
      const startMs = startDate?.getTime() ?? null;
      const endMs = endDate?.getTime() ?? null;
      if (filter === 'upcoming') return startMs !== null && startMs > now;
      if (filter === 'active') return (startMs === null || startMs <= now) && (endMs === null || endMs >= now);
      if (endMs !== null) return endMs < now;
      return startMs !== null && startMs < now;
    });
  }, [joinedEvents, filter]);

  return (
    <div className="bg-tennis-surface/30 border border-white/5 rounded-3xl md:rounded-[2.5rem] shadow-xl p-4 md:p-8 flex flex-col">
      <div className="flex items-center mb-4">
        <h2 className="text-xl md:text-2xl font-bold text-white flex items-center">
          <Calendar className="w-6 h-6 mr-3 text-clay" />
          My Events
        </h2>
      </div>

      <div className="flex gap-1.5 mb-4 flex-wrap">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
              filter === f.id
                ? 'bg-clay text-white'
                : 'bg-white/5 text-white/50 hover:text-white'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="flex-grow overflow-y-auto max-h-[300px] space-y-3 pr-2 custom-scrollbar">
        {loading ? (
          <div className="space-y-4">
            {[1, 2].map(i => <div key={i} className="h-20 bg-white/5 rounded-2xl animate-pulse" />)}
          </div>
        ) : filteredEvents.length > 0 ? (
          filteredEvents.map((event) => (
            <div key={event.participantId}>
              <div className="bg-white/5 border border-white/5 rounded-2xl p-4 flex items-center gap-4 hover:border-clay/30 transition-all group">
                <div className="flex-grow">
                  <h4 className="text-white font-bold text-sm truncate">{event.title}</h4>
                  <p className="text-white/50 text-[10px]">
                    {(() => {
                      const eventDate = parseEventDate(event.startDate || event.start_date || event.date);
                      return eventDate
                        ? eventDate.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })
                        : 'Date TBD';
                    })()}
                  </p>
                </div>
                <button
                  onClick={() => pendingId === event.participantId ? closeConfirm() : openConfirm(event.participantId)}
                  className="p-2 text-white/40 hover:text-red-500 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              {pendingId === event.participantId && (
                <div className="mt-2 mx-2 p-4 rounded-2xl bg-red-500/10 border border-red-500/20">
                  <p className="text-white text-sm mb-3">
                    Deleting event will remove points collected and reset your match stats to 0 for this event.
                  </p>
                  <label className="flex items-start gap-3 cursor-pointer mb-4">
                    <input
                      type="checkbox"
                      checked={confirmed}
                      onChange={(e) => setConfirmed(e.target.checked)}
                      className="mt-0.5 accent-red-500"
                    />
                    <span className="text-white text-sm font-semibold">I understand and want to remove this event</span>
                  </label>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={closeConfirm}>Cancel</Button>
                    <Button variant="danger" size="sm" onClick={handleConfirm} disabled={!confirmed}>
                      Confirm Removal
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))
        ) : (
          <div className="text-center py-10">
            <p className="text-white/50 text-sm">
              {filter === 'all' ? 'No events joined yet' : `No ${filter} events`}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
