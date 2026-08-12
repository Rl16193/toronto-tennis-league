import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence } from 'motion/react';
import { ChevronRight, Plus, Trophy } from 'lucide-react';
import { collection, getDocs, query, where } from 'firebase/firestore';

import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/Button';
import { Fab } from '../components/Fab';
import { SegmentedControl } from '../components/SegmentedControl';
import { createEvent, updateEvent, formFromEvent, DisplayEvent, EventFormState, INITIAL_EVENT_FORM, validateEventForm } from '../features/events/services/eventService';
import { useEvents } from '../features/events/hooks/useEvents';
import { useJoin } from '../features/events/hooks/useJoin';
import { EventCard, isLateRegistration } from '../features/events/components/EventCard';
import { CreatorEventModal } from '../features/events/components/CreatorEventModal';
import { JoinEventSheet } from '../features/events/components/JoinEventSheet';
import { track } from '../lib/analytics';
import { getEventDate } from './tournament/utils';
import { isSeniorsLeague } from '../utils/skillLevels';
import { isTournamentCategoryEvent, isTournamentCategoryType } from '../utils/eventTypes';

type EventsTab = 'upcoming' | 'completed';
type EventCategory = 'socials' | 'tournaments';
type CompletedEvent = { id: string; title: string; type: string; when: Date | null };

export const Events: React.FC = () => {
  const { user, profile, loading: authLoading } = useAuth();
  const isEventCreator = !!profile?.preferences.event_creator;

  const { events, setEvents, loading, visibleEvents, hasJoinedRegularEvent, hasJoinedTournamentChoice, hasJoinedAnyTournament, isFullyJoinedEvent } = useEvents();
  const { selectedEvent, setSelectedEvent, joinForm, setJoinForm, joinError, joining, slotStatus, loadingMatches, slotFallbackConfirmed, setSlotFallbackConfirmed, handleSubmitJoin } = useJoin({ user, profile, hasJoinedRegularEvent, hasJoinedTournamentChoice, hasJoinedAnyTournament });

  const [category, setCategory] = useState<EventCategory>('tournaments');
  const [tab, setTab] = useState<EventsTab>('upcoming');
  const [completedEvents, setCompletedEvents] = useState<CompletedEvent[]>([]);
  const [completedLoading, setCompletedLoading] = useState(false);
  const [showEventForm, setShowEventForm] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [eventForm, setEventForm] = useState<EventFormState>(INITIAL_EVENT_FORM);
  const [eventFormMessage, setEventFormMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [creatingEvent, setCreatingEvent] = useState(false);

  useEffect(() => { document.title = 'Events · Racquets & Strings'; }, []);

  useEffect(() => {
    if (!eventFormMessage) return;
    const t = setTimeout(() => setEventFormMessage(null), 30_000);
    return () => clearTimeout(t);
  }, [eventFormMessage]);

  // Completed events, loaded on first visit to the Completed tab (final has a winner —
  // same classification the Tournament/History pages use).
  useEffect(() => {
    if (tab !== 'completed' || completedEvents.length > 0) return;
    setCompletedLoading(true);
    Promise.all([
      getDocs(collection(db, 'events')),
      getDocs(query(collection(db, 'matches'), where('round', '==', 'F'), where('status', '==', 'complete'))),
    ])
      .then(([eventsSnap, finalsSnap]) => {
        const completedIds = new Set(
          finalsSnap.docs.filter((d) => d.data().winner_uid).map((d) => d.data().event_id as string),
        );
        setCompletedEvents(
          eventsSnap.docs
            .filter((d) => completedIds.has(d.id))
            .map((d) => ({
              id: d.id,
              title: (d.data().title as string) || 'Tournament',
              type: (d.data().type as string) || '',
              when: getEventDate(d.data() as Record<string, unknown>),
            }))
            .sort((a, b) => (b.when?.getTime() ?? 0) - (a.when?.getTime() ?? 0)),
        );
      })
      .catch(() => {})
      .finally(() => setCompletedLoading(false));
  }, [tab, completedEvents.length]);

  const categoryEvents = visibleEvents.filter((e) =>
    category === 'tournaments' ? isTournamentCategoryEvent(e) : !isTournamentCategoryEvent(e));
  const categoryCompletedEvents = completedEvents.filter((e) =>
    category === 'tournaments' ? isTournamentCategoryType(e.type) : !isTournamentCategoryType(e.type));

  const handleJoin = (event: DisplayEvent) => {
    setSelectedEvent(event);
    track('select_content', { content_type: 'tennis_event', content_id: event.id });
  };

  const handleCreateEvent = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user || !isEventCreator) { setEventFormMessage({ type: 'error', text: 'Only event creators can add events.' }); return; }
    const err = validateEventForm(eventForm);
    if (err) { setEventFormMessage({ type: 'error', text: err }); return; }
    setCreatingEvent(true);
    setEventFormMessage(null);
    try {
      if (editingEventId) {
        const patch = await updateEvent(editingEventId, eventForm);
        setEvents((prev) => prev.map((ev) => (ev.id === editingEventId ? { ...ev, ...patch } : ev)));
        setEventFormMessage({ type: 'success', text: 'Event updated successfully.' });
      } else {
        const created = await createEvent(user.uid, eventForm, '');
        setEvents((prev) => [...prev, created]);
        setEventFormMessage({ type: 'success', text: 'Event added successfully.' });
      }
      setEventForm(INITIAL_EVENT_FORM);
      setEditingEventId(null);
      setShowEventForm(false);
    } catch {
      setEventFormMessage({ type: 'error', text: `Could not ${editingEventId ? 'save' : 'add'} the event. Please check creator permissions and try again.` });
    } finally {
      setCreatingEvent(false);
    }
  };

  const handleEditEvent = (event: DisplayEvent) => {
    setEventFormMessage(null);
    setEventForm(formFromEvent(event));
    setEditingEventId(event.id);
    setShowEventForm(true);
  };

  return (
    <div className="max-w-xl mx-auto px-4 pb-20 pt-4">
      <SegmentedControl<EventCategory>
        options={[{ value: 'socials', label: 'Socials' }, { value: 'tournaments', label: 'Tournaments' }]}
        value={category}
        onChange={setCategory}
        className="mb-3 max-w-xs"
      />
      <SegmentedControl<EventsTab>
        options={[{ value: 'upcoming', label: 'Upcoming' }, { value: 'completed', label: 'Completed' }]}
        value={tab}
        onChange={setTab}
        className="mb-5 max-w-xs"
      />

      {eventFormMessage && !showEventForm && (
        <div className={`mb-6 rounded-2xl border px-5 py-4 text-sm ${eventFormMessage.type === 'success' ? 'border-green-500/20 bg-green-500/10 text-green-300' : 'border-red-500/20 bg-red-500/10 text-red-300'}`}>
          {eventFormMessage.text}
        </div>
      )}

      {tab === 'completed' ? (
        completedLoading ? (
          <div className="space-y-2 max-w-xl">
            {[1, 2].map((i) => <div key={i} className="h-14 bg-tennis-surface/30 rounded-2xl animate-pulse" />)}
          </div>
        ) : categoryCompletedEvents.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-fg/70 text-sm">No completed events yet.</p>
          </div>
        ) : (
          <div className="rounded-3xl bg-tennis-surface/30 overflow-hidden divide-y divide-white/5 max-w-xl">
            {categoryCompletedEvents.map((e) => (
              <Link
                key={e.id}
                to={`/matches?mode=tournament&event=${e.id}`}
                className="flex items-center gap-3 px-4 py-3.5 hover:bg-fg/[0.04] transition-colors"
              >
                <span className="w-8 h-8 shrink-0 rounded-xl bg-clay/15 border border-clay/25 flex items-center justify-center">
                  <Trophy className="w-4 h-4 text-clay" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-fg truncate">{e.title}</p>
                  {e.when && (
                    <p className="text-[11px] text-fg/70">
                      {e.when.toLocaleDateString('en-CA', { month: 'short', year: 'numeric' })}
                    </p>
                  )}
                </div>
                <ChevronRight className="w-4 h-4 text-fg/70 shrink-0" />
              </Link>
            ))}
          </div>
        )
      ) : loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => <div key={i} className="h-48 bg-tennis-surface/30 rounded-2xl animate-pulse" />)}
        </div>
      ) : categoryEvents.length > 0 ? (
        <div className="space-y-4">
          {categoryEvents.map((event, i) => (
            <EventCard
              key={event.id}
              event={event}
              index={i}
              isJoined={isFullyJoinedEvent(event)}
              authLoading={authLoading}
              isLoggedIn={!!user}
              onJoin={handleJoin}
              onEdit={!!user && event.creator_id === user.uid ? handleEditEvent : undefined}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-16">
          <h3 className="text-xl font-bold text-fg">No upcoming events</h3>
          <p className="text-fg/70 mt-1">Events will appear here when available.</p>
        </div>
      )}

      {/* Organizer "Add Event" — floating action button (wireframe 1g) */}
      {isEventCreator && tab === 'upcoming' && (
        <Fab
          ariaLabel="Add an event"
          onClick={() => {
            setEventFormMessage(null);
            setEditingEventId(null);
            setEventForm(() => INITIAL_EVENT_FORM);
            setShowEventForm(true);
          }}
        >
          <Plus className="w-6 h-6" />
        </Fab>
      )}

      {/* Join flow — bottom sheet */}
      <AnimatePresence>
        {selectedEvent && !isFullyJoinedEvent(selectedEvent) && (
          <JoinEventSheet
            event={selectedEvent}
            isLate={isLateRegistration(selectedEvent)}
            seniorsEligible={isSeniorsLeague(profile?.stats.league)}
            joinForm={joinForm}
            setJoinForm={setJoinForm}
            joinError={joinError}
            slotStatus={slotStatus}
            loadingMatches={loadingMatches}
            slotFallbackConfirmed={slotFallbackConfirmed}
            setSlotFallbackConfirmed={setSlotFallbackConfirmed}
            joining={joining}
            onSubmitJoin={handleSubmitJoin}
            onClose={() => setSelectedEvent(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showEventForm && (
          <CreatorEventModal
            eventForm={eventForm}
            setEventForm={setEventForm}
            eventFormMessage={eventFormMessage}
            creatingEvent={creatingEvent}
            organizerPlaceholder={profile?.user.name || 'Organizer name'}
            isEditing={!!editingEventId}
            onSubmit={handleCreateEvent}
            onClose={() => { setShowEventForm(false); setEditingEventId(null); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
};
