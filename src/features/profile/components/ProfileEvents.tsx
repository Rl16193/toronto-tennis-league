import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../../components/Button';
import { Calendar, Plus, Trash2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
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

const isTournamentEvent = (event: JoinedEventCard) => event.type.toLowerCase().includes('tournament');
const isWeekendMatchdaysEvent = (event: JoinedEventCard) => event.title.toLowerCase().includes('weekend matchdays');

export const ProfileEvents: React.FC<ProfileEventsProps> = ({
  joinedEvents,
  loading,
  onRemoveEvent,
}) => {
  const [pendingRemovalEvent, setPendingRemovalEvent] = useState<JoinedEventCard | null>(null);

  const handleRemoveEvent = (event: JoinedEventCard) => {
    const eventStartDate = parseEventDate(event.startDate || event.start_date || event.date);

    if (isTournamentEvent(event) && eventStartDate) {
      const twoDaysBeforeStart = new Date(eventStartDate);
      twoDaysBeforeStart.setDate(twoDaysBeforeStart.getDate() - 2);

      if (new Date() >= twoDaysBeforeStart) {
        alert('Tournament withdrawal is unavailable within 2 days of the start date.');
        return;
      }
    }

    setPendingRemovalEvent(event);
  };

  const handleConfirmRemoveEvent = () => {
    if (!pendingRemovalEvent) return;
    onRemoveEvent(pendingRemovalEvent);
    setPendingRemovalEvent(null);
  };

  return (
    <>
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

        <div className="flex-grow overflow-y-auto max-h-[300px] space-y-4 pr-2 custom-scrollbar">
          {loading ? (
            <div className="space-y-4">
              {[1, 2].map(i => <div key={i} className="h-20 bg-white/5 rounded-2xl animate-pulse" />)}
            </div>
          ) : joinedEvents.length > 0 ? (
            joinedEvents.map((event) => (
              <div key={event.participantId} className="bg-white/5 border border-white/5 rounded-2xl p-4 flex items-center gap-4 hover:border-clay/30 transition-all group">
                {event.image ? (
                  <img src={event.image} alt={event.title} className="w-12 h-12 rounded-xl object-cover" referrerPolicy="no-referrer" loading="lazy" />
                ) : (
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/10 text-[10px] font-bold text-gray-300">
                    TTL
                  </div>
                )}
                <div className="flex-grow">
                  <h4 className="text-white font-bold text-sm truncate">{event.title}</h4>
                  <p className="text-gray-500 text-[10px]">
                    {(() => {
                      const eventDate = parseEventDate(event.startDate || event.start_date || event.date);
                      return eventDate
                        ? eventDate.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })
                        : 'Date TBD';
                    })()}
                  </p>
                </div>
                <button onClick={() => handleRemoveEvent(event)} className="p-2 text-gray-600 hover:text-red-500 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          ) : (
            <div className="text-center py-10">
              <p className="text-gray-500 text-sm">No events joined yet</p>
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {pendingRemovalEvent && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setPendingRemovalEvent(null)}
              className="absolute inset-0 bg-tennis-dark/80 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 16 }}
              className="relative w-full max-w-lg rounded-[2rem] border border-white/10 bg-tennis-surface p-8 shadow-2xl"
            >
              <h3 className="text-2xl font-bold text-white mb-4">Confirm Event Withdrawal</h3>
              <p className="text-gray-300 leading-relaxed mb-6">
                Deleting event here will remove you from the list participants. Please confirm withdrawal from the draw/meetup.
              </p>
              <div className="rounded-2xl border border-white/5 bg-white/5 p-4 mb-6">
                <p className="text-white font-semibold">{pendingRemovalEvent.title}</p>
                <p className="text-gray-400 text-sm mt-1">{pendingRemovalEvent.type}</p>
              </div>
              <div className="flex flex-col sm:flex-row justify-end gap-3">
                <Button variant="ghost" onClick={() => setPendingRemovalEvent(null)}>
                  Cancel
                </Button>
                <Button variant="danger" onClick={handleConfirmRemoveEvent}>
                  Confirm Removal
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};