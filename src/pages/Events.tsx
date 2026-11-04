import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AnimatePresence } from 'motion/react';
import { Plus } from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { Fab } from '../components/Fab';
import { SegmentedControl } from '../components/SegmentedControl';
import { CompletedEvent, createEvent, fetchCompletedEvents, updateEvent, uploadEventImage, formFromEvent, DisplayEvent, EventFormState, INITIAL_EVENT_FORM, validateEventForm } from '../features/events/services/eventService';
import { useEvents } from '../features/events/hooks/useEvents';
import { useJoin } from '../features/events/hooks/useJoin';
import { CourtsEditor } from '../features/profile/components/CourtsEditor';
import { useProfileActions } from '../features/profile/hooks/useProfileActions';
import { EventCarousel } from '../features/events/EventCarousel';
import {
  CompletedEventRow, CreatorEventModal, EventCard, JoinEventSheet, isLateRegistration, nextOccurrence,
} from '../features/events/EventsElements';
import { getEventEndDate, parseValidDate } from '../utils/eventDates';
import { track } from '../lib/analytics';
import { resolveZoneConfig } from './tournament/drawGenerator';
import { isSeniorsLeague, leagueDivision } from '../utils/skillLevels';
import { isEventManager, isLadderEvent, isOrganizerProfile, isRecurringWeekly, isTournamentCategoryEvent, isTournamentCategoryType, isTournamentEvent } from '../utils/eventTypes';

type EventsTab = 'upcoming' | 'completed';
type EventCategory = 'socials' | 'tournaments';

export const Events: React.FC = () => {
  const { user, profile, loading: authLoading } = useAuth();
  const isEventCreator = isOrganizerProfile(profile);

  const { setEvents, loading, visibleEvents, hasJoinedEvent, hasJoinedAnyTournament, isFullyJoinedEvent } = useEvents();
  const { selectedEvent, setSelectedEvent, joinForm, setJoinForm, joinError, joining, handleSubmitJoin } = useJoin({ user, profile, hasJoinedEvent, hasJoinedAnyTournament });
  // Zone-enabled tournaments need courts to place a player; the join sheet asks for them inline.
  const { updateLoading: courtsSaving, actions: courtsActions } = useProfileActions();
  const [pendingCourts, setPendingCourts] = useState<{ courts: string[]; zone: string; custom: string[] }>({ courts: [], zone: '', custom: [] });
  // Resolved, not raw: an event that never saved a zone config still has zones on by default.
  const needsCourts = !!selectedEvent && isTournamentEvent(selectedEvent)
    && resolveZoneConfig(selectedEvent.zone_draw_config).enabled
    && !profile?.preferences.preferred_courts?.length && !profile?.preferences.custom_courts?.length;

  const [category, setCategory] = useState<EventCategory>('tournaments');
  const [tab, setTab] = useState<EventsTab>('upcoming');
  const [completedEvents, setCompletedEvents] = useState<CompletedEvent[]>([]);
  const [completedLoading, setCompletedLoading] = useState(false);
  const [showEventForm, setShowEventForm] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [eventForm, setEventForm] = useState<EventFormState>(INITIAL_EVENT_FORM);
  const [eventFormMessage, setEventFormMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [creatingEvent, setCreatingEvent] = useState(false);
  // A picked event image stays local until Save, so abandoning the form uploads nothing.
  const [eventImageFile, setEventImageFile] = useState<File | null>(null);

  // Deep link from the Player Dash: /events?event=ID opens that event's tab and brings its card
  // into view. Handled once per id, after the list has loaded. The param is deliberately left in
  // the URL — changing it re-runs ScrollToTop (App.tsx), which would undo the scroll.
  const [searchParams] = useSearchParams();
  const linkedEventId = searchParams.get('event');
  const [linkMissing, setLinkMissing] = useState(false);
  const handledLinkRef = useRef<string | null>(null);

  useEffect(() => { document.title = 'Tennis Events & Tournaments in Toronto · Racquets & Strings'; }, []);

  // Event structured data for search: current public events, located by city (events name no court).
  // A weekly meetup is its next occurrence; the ladder runs all season and private events are left out.
  useEffect(() => {
    const SITE = 'https://www.racquetsandstrings.ca';
    const day = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const org = { '@type': 'Organization', name: 'Racquets & Strings', url: SITE };
    const schema = visibleEvents.filter((e) => !e.private && !isLadderEvent(e)).flatMap((e) => {
      const start = nextOccurrence(e);
      const end = isRecurringWeekly(e) ? start : parseValidDate(getEventEndDate(e));
      if (!start || !end) return [];
      return [{
        '@context': 'https://schema.org', '@type': 'Event',
        name: e.title, startDate: day(start), endDate: day(end),
        eventStatus: 'https://schema.org/EventScheduled',
        eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
        location: { '@type': 'Place', name: 'Toronto',
          address: { '@type': 'PostalAddress', addressLocality: 'Toronto', addressRegion: 'ON', addressCountry: 'CA' } },
        ...(e.image?.startsWith('https://') ? { image: e.image } : {}),
        url: `${SITE}/events?event=${e.id}`,
        organizer: org,
      }];
    });
    if (!schema.length) return;
    const tag = document.createElement('script');
    tag.type = 'application/ld+json';
    tag.text = JSON.stringify(schema).replace(/</g, '\\u003c');
    document.head.appendChild(tag);
    return () => tag.remove();
  }, [visibleEvents]);

  useEffect(() => {
    if (!linkedEventId || loading || handledLinkRef.current === linkedEventId) return;
    handledLinkRef.current = linkedEventId;
    const target = visibleEvents.find((e) => e.id === linkedEventId);
    if (!target) { setLinkMissing(true); return; }
    setLinkMissing(false);
    setTab('upcoming');
    setCategory(isTournamentCategoryEvent(target) ? 'tournaments' : 'socials');
  }, [linkedEventId, loading, visibleEvents]);

  // Posters load after the text and grow the cards above the target, so keep re-aiming for a
  // moment, and stop the instant the visitor scrolls or taps. `inline: 'center'` also lands the
  // phone carousel on the right card, so the carousel needs no knowledge of the link.
  useEffect(() => {
    if (!linkedEventId || loading || linkMissing) return;
    let stopped = false;
    const aim = () => {
      if (!stopped) document.getElementById(`event-${linkedEventId}`)?.scrollIntoView({ block: 'start', inline: 'center' });
    };
    const stop = () => { stopped = true; };
    aim();
    const timer = window.setInterval(aim, 250);
    const deadline = window.setTimeout(() => { stop(); window.clearInterval(timer); }, 2000);
    window.addEventListener('wheel', stop, { passive: true });
    window.addEventListener('touchstart', stop, { passive: true });
    window.addEventListener('keydown', stop);
    return () => {
      stop();
      window.clearInterval(timer);
      window.clearTimeout(deadline);
      window.removeEventListener('wheel', stop);
      window.removeEventListener('touchstart', stop);
      window.removeEventListener('keydown', stop);
    };
  }, [linkedEventId, loading, linkMissing, category]);

  useEffect(() => {
    if (!eventFormMessage) return;
    const t = setTimeout(() => setEventFormMessage(null), 30_000);
    return () => clearTimeout(t);
  }, [eventFormMessage]);

  // Completed events, loaded on first visit to the Completed tab: `completed_at` is stamped by
  // scoring once every draw has played its final (or named its winner).
  useEffect(() => {
    if (tab !== 'completed' || completedEvents.length > 0) return;
    setCompletedLoading(true);
    fetchCompletedEvents()
      .then(setCompletedEvents)
      .catch(() => {})
      .finally(() => setCompletedLoading(false));
  }, [tab, completedEvents.length]);

  const categoryEvents = visibleEvents.filter((e) =>
    category === 'tournaments' ? isTournamentCategoryEvent(e) : !isTournamentCategoryEvent(e));
  const categoryCompletedEvents = completedEvents.filter((e) =>
    category === 'tournaments' ? isTournamentCategoryType(e.category) : !isTournamentCategoryType(e.category));

  // Join at once when the sheet would have nothing to ask: a Singles tournament with a division and
  // courts already on the profile (and no Retired Pro choice or late-registration notice), or any
  // non-tournament event. The draw is still checked for an open spot before anything is written.
  const [quickJoinId, setQuickJoinId] = useState<string | null>(null);
  const quickRunning = useRef(false);
  const nothingToAsk = (event: DisplayEvent) => !isTournamentEvent(event) || (
    event.category === 'singles_tournament'
    && !!leagueDivision(profile?.stats.league)
    && !isSeniorsLeague(profile?.stats.league)
    && !isLateRegistration(event)
    && (!resolveZoneConfig(event.zone_draw_config).enabled || !!profile?.preferences.preferred_courts?.length || !!profile?.preferences.custom_courts?.length)
  );

  useEffect(() => {
    if (!quickJoinId || quickRunning.current || !selectedEvent || selectedEvent.id !== quickJoinId) return;
    // A tournament waits for useJoin to seed the division.
    if (isTournamentEvent(selectedEvent) && !joinForm.division) return;
    quickRunning.current = true;
    // The confirmation is the "You're in" notification onParticipantJoined sends, not a toast.
    handleSubmitJoin()
      .finally(() => { quickRunning.current = false; setQuickJoinId(null); });
  }, [quickJoinId, selectedEvent, joinForm.division, handleSubmitJoin]);

  const handleJoin = (event: DisplayEvent) => {
    setSelectedEvent(event);
    if (nothingToAsk(event)) setQuickJoinId(event.id);
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
      // The picked image is uploaded only now, on Save, so a form abandoned midway leaves nothing behind.
      const image = eventImageFile ? await uploadEventImage(user.uid, eventImageFile) : eventForm.image;
      if (editingEventId) {
        const patch = await updateEvent(editingEventId, { ...eventForm, image });
        // Mirror fetchEvents: a legacy gs:// path is shown through imagePath, never as an <img> src.
        const shown = image.startsWith('gs://') ? { image: '', imagePath: image } : { image, imagePath: undefined };
        setEvents((prev) => prev.map((ev) => (ev.id === editingEventId ? { ...ev, ...patch, ...shown } : ev)));
        setEventFormMessage({ type: 'success', text: 'Event updated successfully.' });
      } else {
        const created = await createEvent(user.uid, profile?.user.name || '', eventForm, image);
        setEvents((prev) => [...prev, created]);
        setEventFormMessage({ type: 'success', text: 'Event added successfully.' });
      }
      setEventForm(INITIAL_EVENT_FORM);
      setEventImageFile(null);
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

      {linkMissing && (
        <div role="status" className="mb-5 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-5 py-4 text-sm text-badge">
          That event is no longer listed.
        </div>
      )}

      {eventFormMessage && !showEventForm && (
        <div className={`mb-6 rounded-2xl border px-5 py-4 text-sm ${eventFormMessage.type === 'success' ? 'border-green-500/20 bg-green-500/10 text-badge-win' : 'border-red-500/20 bg-red-500/10 text-badge-loss'}`}>
          {eventFormMessage.text}
        </div>
      )}

      {tab === 'completed' ? (
        completedLoading ? (
          <div className="space-y-2 max-w-xl">
            {[1, 2].map((i) => <div key={i} className="h-14 bg-fg/5 rounded-2xl animate-pulse" />)}
          </div>
        ) : categoryCompletedEvents.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-fg/70 text-sm">No completed events yet.</p>
          </div>
        ) : (
          <div className="rounded-2xl bg-fg/5 overflow-hidden divide-y divide-white/5 max-w-xl">
            {categoryCompletedEvents.map((e) => <CompletedEventRow key={e.id} e={e} />)}
          </div>
        )
      ) : loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => <div key={i} className="h-48 bg-fg/5 rounded-2xl animate-pulse" />)}
        </div>
      ) : categoryEvents.length > 0 ? (
        // One card per screen with arrows on a phone; the plain stacked list everywhere else.
        <EventCarousel count={categoryEvents.length}>
          {categoryEvents.map((event, i) => (
            <EventCard
              key={event.id}
              event={event}
              index={i}
              isJoined={isFullyJoinedEvent(event)}
              authLoading={authLoading}
              isLoggedIn={!!user}
              onJoin={handleJoin}
              onEdit={isEventManager(event, user?.uid) ? handleEditEvent : undefined}
            />
          ))}
        </EventCarousel>
      ) : (
        <div className="text-center py-16">
          <h3 className="text-lg font-bold text-fg">No upcoming events</h3>
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
        {selectedEvent && !quickJoinId && !isFullyJoinedEvent(selectedEvent) && (
          <JoinEventSheet
            event={selectedEvent}
            isLate={isLateRegistration(selectedEvent)}
            seniorsEligible={isSeniorsLeague(profile?.stats.league)}
            joinForm={joinForm}
            setJoinForm={setJoinForm}
            joinError={joinError}
            joining={joining}
            onSubmitJoin={() => handleSubmitJoin(needsCourts ? {
              courts: [...pendingCourts.courts, ...pendingCourts.custom],
              save: () => courtsActions.updatePreferredCourts(pendingCourts.courts, pendingCourts.zone, pendingCourts.custom),
            } : undefined)}
            onClose={() => setSelectedEvent(null)}
            courtsPicker={needsCourts && profile ? (
              <CourtsEditor
                preferences={profile.preferences}
                saving={courtsSaving}
                onSave={() => {}}
                onDraftChange={(courts, zone, custom) => setPendingCourts({ courts, zone, custom })}
              />
            ) : undefined}
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
            isEditing={!!editingEventId}
            onSubmit={handleCreateEvent}
            imageFile={eventImageFile}
            onImageFileChange={setEventImageFile}
            onClose={() => { setShowEventForm(false); setEditingEventId(null); setEventImageFile(null); }}
          />
        )}
      </AnimatePresence>

    </div>
  );
};
