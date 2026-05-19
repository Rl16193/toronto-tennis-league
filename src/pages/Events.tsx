import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence } from 'motion/react';
import { Plus } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/Button';
import { ACCEPTED_EVENT_IMAGE_TYPES, createEvent, EventFormState, INITIAL_EVENT_FORM, uploadEventImage, validateEventForm } from '../features/events/services/eventService';
import { sortEventsByStartDate } from '../utils/eventDates';
import { useEvents } from '../features/events/hooks/useEvents';
import { useJoin } from '../features/events/hooks/useJoin';
import { EventCard } from '../features/events/components/EventCard';
import { JoinModal } from '../features/events/components/JoinModal';
import { CreatorEventModal } from '../features/events/components/CreatorEventModal';

export const Events: React.FC = () => {
  const { user, profile, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const isEventCreator = !!profile?.preferences.event_creator;

  const { events, setEvents, loading, visibleEvents, getJoinedChoices, hasJoinedRegularEvent, hasJoinedTournamentChoice, hasJoinedAnyTournament, isFullyJoinedEvent } = useEvents();
  const { selectedEvent, setSelectedEvent, joinForm, setJoinForm, joinError, joining, slotStatus, slotFallbackConfirmed, setSlotFallbackConfirmed, handleStartJoin, handleSubmitJoin } = useJoin({ user, profile, navigate, hasJoinedRegularEvent, hasJoinedTournamentChoice, hasJoinedAnyTournament });

  const [showEventForm, setShowEventForm] = useState(false);
  const [eventForm, setEventForm] = useState<EventFormState>(INITIAL_EVENT_FORM);
  const [eventImageFile, setEventImageFile] = useState<File | null>(null);
  const [eventFormMessage, setEventFormMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [creatingEvent, setCreatingEvent] = useState(false);

  useEffect(() => { document.title = 'Events — Racquets & Strings'; }, []);

  useEffect(() => {
    if (!eventFormMessage) return;
    const t = setTimeout(() => setEventFormMessage(null), 30_000);
    return () => clearTimeout(t);
  }, [eventFormMessage]);

  const handleEventImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    if (!file) { setEventImageFile(null); return; }
    if (!ACCEPTED_EVENT_IMAGE_TYPES.includes(file.type)) {
      setEventFormMessage({ type: 'error', text: 'Please upload a JPEG, PNG, JPG, WEBP, GIF, HEIC, or HEIF image.' });
      e.target.value = '';
      return;
    }
    setEventFormMessage(null);
    setEventImageFile(file);
  };

  const handleCreateEvent = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user || !isEventCreator) { setEventFormMessage({ type: 'error', text: 'Only event creators can add events.' }); return; }
    const err = validateEventForm(eventForm);
    if (err) { setEventFormMessage({ type: 'error', text: err }); return; }
    setCreatingEvent(true);
    setEventFormMessage(null);
    try {
      const imageUrl = await uploadEventImage(user.uid, eventForm.title, eventImageFile);
      const created = await createEvent(user.uid, eventForm, imageUrl);
      setEvents((prev) => [...prev, created]);
      setEventForm(INITIAL_EVENT_FORM);
      setEventImageFile(null);
      setEventFormMessage({ type: 'success', text: 'Event added successfully.' });
      setShowEventForm(false);
    } catch {
      setEventFormMessage({ type: 'error', text: 'Could not add the event. Please check creator permissions and try again.' });
    } finally {
      setCreatingEvent(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20 pt-4 md:pt-6">
      {isEventCreator && (
        <div className="mb-6 flex justify-end">
          <Button onClick={() => { setEventFormMessage(null); setEventForm((f) => ({ ...f, organizer: f.organizer || profile?.user.name || '' })); setShowEventForm(true); }}>
            <Plus className="w-4 h-4 mr-2" />Add an Event
          </Button>
        </div>
      )}

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
              onJoin={handleStartJoin}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-16">
          <h3 className="text-xl font-bold text-white">No events yet</h3>
          <p className="text-white/60 mt-1">Events will appear here when they are live.</p>
        </div>
      )}

      <AnimatePresence>
        {showEventForm && (
          <CreatorEventModal
            eventForm={eventForm}
            setEventForm={setEventForm}
            eventImageFile={eventImageFile}
            eventFormMessage={eventFormMessage}
            creatingEvent={creatingEvent}
            organizerPlaceholder={profile?.user.name || 'Organizer name'}
            onImageChange={handleEventImageChange}
            onSubmit={handleCreateEvent}
            onClose={() => setShowEventForm(false)}
          />
        )}

        {selectedEvent && (
          <JoinModal
            event={selectedEvent}
            joinForm={joinForm}
            setJoinForm={setJoinForm}
            joinError={joinError}
            joining={joining}
            slotStatus={slotStatus}
            slotFallbackConfirmed={slotFallbackConfirmed}
            setSlotFallbackConfirmed={setSlotFallbackConfirmed}
            user={user}
            skillLevel={profile?.stats.skill_level}
            getJoinedChoices={getJoinedChoices}
            hasJoinedTournamentChoice={hasJoinedTournamentChoice}
            isFullyJoined={isFullyJoinedEvent(selectedEvent)}
            onClose={() => setSelectedEvent(null)}
            onSubmit={handleSubmitJoin}
          />
        )}
      </AnimatePresence>
    </div>
  );
};
