import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../../components/Button';
import { Calendar, Plus, Trash2 } from 'lucide-react';
import { JoinedEventCard } from '../types';

interface ProfileEventsProps {
  joinedEvents: JoinedEventCard[];
  loading: boolean;
  onRemoveEvent: (event: JoinedEventCard) => void;
}

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

  return (
    <div className="bg-tennis-surface/30 border border-white/5 rounded-[2.5rem] shadow-xl p-8 flex flex-col">
      <div className="flex justify-between items-center mb-8">
        <h2 className="text-2xl font-bold text-white flex items-center">
          <Calendar className="w-6 h-6 mr-3 text-clay" />
          Events
        </h2>
        <Link to="/events">
          <Button size="sm" className="rounded-xl">
            <Plus className="w-4 h-4 mr-2" />
            Add Event
          </Button>
        </Link>
      </div>

      <div className="flex-grow overflow-y-auto max-h-[300px] space-y-3 pr-2 custom-scrollbar">
        {loading ? (
          <div className="space-y-4">
            {[1, 2].map(i => <div key={i} className="h-20 bg-white/5 rounded-2xl animate-pulse" />)}
          </div>
        ) : joinedEvents.length > 0 ? (
          joinedEvents.map((event) => (
            <div key={event.participantId}>
              <div className="bg-white/5 border border-white/5 rounded-2xl p-4 flex items-center gap-4 hover:border-clay/30 transition-all group">
                {event.image ? (
                  <img src={event.image} alt={event.title} className="w-12 h-12 rounded-xl object-cover" referrerPolicy="no-referrer" loading="lazy" />
                ) : (
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/10 text-[10px] font-bold text-white">
                    TTL
                  </div>
                )}
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
            <p className="text-white/50 text-sm">No events joined yet</p>
          </div>
        )}
      </div>
    </div>
  );
};
