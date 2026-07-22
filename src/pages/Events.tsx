import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AnimatePresence } from 'motion/react';

import { useAuth } from '../context/AuthContext';
import { Button } from '../components/Button';
import { createEvent, DisplayEvent, EventFormState, INITIAL_EVENT_FORM, validateEventForm } from '../features/events/services/eventService';
import { useEvents } from '../features/events/hooks/useEvents';
import { useJoin } from '../features/events/hooks/useJoin';
import { EventCard } from '../features/events/components/EventCard';
import { CreatorEventModal } from '../features/events/components/CreatorEventModal';
import { track } from '../lib/analytics';
import { useProfileData } from '../features/profile/hooks/useProfileData';
import { useProfileActions } from '../features/profile/hooks/useProfileActions';
import { ProfileEvents } from '../features/profile/components/ProfileEvents';

export const Events: React.FC = () => {
  const { user, profile, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const isEventCreator = !!profile?.preferences.event_creator;

  const { events, setEvents, loading, visibleEvents, hasJoinedRegularEvent, hasJoinedTournamentChoice, hasJoinedAnyTournament, isFullyJoinedEvent } = useEvents();
  const { selectedEvent, setSelectedEvent, joinForm, setJoinForm, joinError, joining, slotStatus, loadingMatches, slotFallbackConfirmed, setSlotFallbackConfirmed, handleSubmitJoin } = useJoin({ user, profile, navigate, hasJoinedRegularEvent, hasJoinedTournamentChoice, hasJoinedAnyTournament });

  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [showEventForm, setShowEventForm] = useState(false);
  const [eventForm, setEventForm] = useState<EventFormState>(INITIAL_EVENT_FORM);
  const [eventFormMessage, setEventFormMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [creatingEvent, setCreatingEvent] = useState(false);

  const { joinedEvents, loading: joinedLoading } = useProfileData();
  const { actions } = useProfileActions();

  useEffect(() => { document.title = 'Events — Racquets & Strings'; }, []);

  useEffect(() => {
    if (!eventFormMessage) return;
    const t = setTimeout(() => setEventFormMessage(null), 30_000);
    return () => clearTimeout(t);
  }, [eventFormMessage]);

  useEffect(() => {
    if (!selectedEvent) setExpandedEventId(null);
  }, [selectedEvent]);

  const handleExpand = (event: DisplayEvent | null) => {
    if (event) {
      setExpandedEventId(event.id);
      setSelectedEvent(event);
      track('select_content', { content_type: 'tennis_event', content_id: event.id });
    } else {
      setExpandedEventId(null);
      setSelectedEvent(null);
    }
  };

  const handleCreateEvent = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user || !isEventCreator) { setEventFormMessage({ type: 'error', text: 'Only event creators can add events.' }); return; }
    const err = validateEventForm(eventForm);
    if (err) { setEventFormMessage({ type: 'error', text: err }); return; }
    setCreatingEvent(true);
    setEventFormMessage(null);
    try {
      const created = await createEvent(user.uid, eventForm, '');
      setEvents((prev) => [...prev, created]);
      setEventForm(INITIAL_EVENT_FORM);
      setEventFormMessage({ type: 'success', text: 'Event added successfully.' });
      setShowEventForm(false);
    } catch {
      setEventFormMessage({ type: 'error', text: 'Could not add the event. Please check creator permissions and try again.' });
    } finally {
      setCreatingEvent(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pb-20 pt-4 md:pt-6">
      <div className="mb-4 flex items-center justify-end gap-3">
        {isEventCreator && (
          <Button onClick={() => { setEventFormMessage(null); setEventForm((f) => ({ ...f, organizer: f.organizer || profile?.user.name || '' })); setShowEventForm(true); }}>
            Add an Event
          </Button>
        )}
        <Link to="/tournament?tab=completed">
          <Button variant="outline">Completed Events</Button>
        </Link>
      </div>

      {eventFormMessage && !showEventForm && (
        <div className={`mb-6 rounded-2xl border px-5 py-4 text-sm ${eventFormMessage.type === 'success' ? 'border-green-500/20 bg-green-500/10 text-green-300' : 'border-red-500/20 bg-red-500/10 text-red-300'}`}>
          {eventFormMessage.text}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <div key={i} className="h-48 bg-tennis-surface/30 rounded-2xl animate-pulse" />)}
        </div>
      ) : visibleEvents.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleEvents.map((event, i) => (
            <EventCard
              key={event.id}
              event={event}
              index={i}
              isJoined={isFullyJoinedEvent(event)}
              joining={joining}
              authLoading={authLoading}
              isLoggedIn={!!user}
              isExpanded={expandedEventId === event.id}
              onExpand={handleExpand}
              joinForm={joinForm}
              setJoinForm={setJoinForm}
              joinError={expandedEventId === event.id ? joinError : ''}
              slotStatus={expandedEventId === event.id ? slotStatus : null}
              loadingMatches={expandedEventId === event.id ? loadingMatches : false}
              slotFallbackConfirmed={slotFallbackConfirmed}
              setSlotFallbackConfirmed={setSlotFallbackConfirmed}
              onSubmitJoin={handleSubmitJoin}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-16">
          <h3 className="text-xl font-bold text-white">No upcoming events</h3>
          <p className="text-white/60 mt-1">Events will appear here when available.</p>
        </div>
      )}

      {user && (
        <div className="mt-10 max-w-2xl mx-auto">
          <ProfileEvents
            joinedEvents={joinedEvents}
            loading={joinedLoading}
            onRemoveEvent={(event) => actions.removeEvent(event.participantId, event.id)}
          />
        </div>
      )}

      <AnimatePresence>
        {showEventForm && (
          <CreatorEventModal
            eventForm={eventForm}
            setEventForm={setEventForm}
            eventFormMessage={eventFormMessage}
            creatingEvent={creatingEvent}
            organizerPlaceholder={profile?.user.name || 'Organizer name'}
            onSubmit={handleCreateEvent}
            onClose={() => setShowEventForm(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
};
