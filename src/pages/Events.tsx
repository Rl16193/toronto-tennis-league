import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { collection, query, getDocs, addDoc, updateDoc, doc, where, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { TennisEvent } from '../types';
import { TournamentMatch } from './tournament/types';
import { PLAYER_LOADING, parseDateValue } from './tournament/utils';
import { Button } from '../components/Button';
import {
  Calendar,
  MapPin,
  Users,
  X,
  CheckCircle2,
  AlertCircle,
  Repeat,
  Clock3,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ACCEPTED_EVENT_IMAGE_TYPES,
  createEvent,
  DisplayEvent,
  fetchEvents,
  INITIAL_EVENT_FORM,
  EventFormState,
  resolveStorageUrl,
  uploadEventImage,
  validateEventForm,
} from '../features/events/services/eventService';
import { formatDateLabel, getEventEndDate, getEventStartDate, parseValidDate, sortEventsByStartDate } from '../utils/eventDates';
import {
  isMeetupEvent,
  isRecurringWeekly,
  isSeasonOpener,
  isSpecialEvent,
  isTopspinMeetupEvent,
  isTournamentEvent,
  isWeekendMatchdaysEvent,
} from '../utils/eventTypes';
import { EventsHeader } from '../features/events/components/EventsHeader';
import { CreatorEventModal } from '../features/events/components/CreatorEventModal';

type JoinFormState = {
  tournamentChoice: 'Singles' | 'Doubles';
  division: '' | "Men's" | "Women's" | 'Mixed Doubles';
  partnerName: string;
  partnerInApp: 'yes' | 'no' | '';
  combinedSkill: string;
  dateselected: string[];
};

type JoinedRegistration = {
  eventId: string;
  tournamentChoice: '' | 'Singles' | 'Doubles';
};

const INITIAL_JOIN_FORM: JoinFormState = {
  tournamentChoice: 'Singles',
  division: '',
  partnerName: '',
  partnerInApp: '',
  combinedSkill: '',
  dateselected: [],
};

const WEEKDAY_MAP: Record<string, number> = {
  sunday: 0,
  sun: 0,
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  tues: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  thurs: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
};

const getEventDays = (event: TennisEvent) => {
  const rawDay = event.day;
  const dayValues = Array.isArray(rawDay)
    ? rawDay
    : typeof rawDay === 'string'
      ? rawDay.split(/,|&|and|\//i).map((part) => part.trim()).filter(Boolean)
      : [];

  return dayValues
    .map((day) => WEEKDAY_MAP[day.toLowerCase()])
    .filter((day): day is number => day !== undefined);
};

const formatEventSchedule = (event: TennisEvent) => {
  const days = getEventDays(event);
  const dayLabel = days.length > 0
    ? days
        .map((day) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][day])
        .join(', ')
    : null;

  if (isRecurringWeekly(event) && dayLabel && event.time) {
    return `Every ${dayLabel} • ${event.time}`;
  }

  if (isRecurringWeekly(event) && dayLabel) {
    return `Every ${dayLabel}`;
  }

  if (event.time) {
    return event.time;
  }

  return null;
};

const formatTournamentRange = (event: TennisEvent) => {
  const start = parseValidDate(getEventStartDate(event));
  const end = parseValidDate(getEventEndDate(event));
  if (!start || !end) return null;

  const formatPretty = (date: Date) =>
    date.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
    });

  return `${formatPretty(start)} - ${formatPretty(end)}`;
};

const getRecurringEventLabel = (event: TennisEvent) => {
  if (!isRecurringWeekly(event)) return null;
  if (isMeetupEvent(event)) return 'Weekly Skill-Based Meetups';
  if (isSpecialEvent(event)) return 'Play Tourney Matches on Selected Matchdays';
  return null;
};

export const Events: React.FC = () => {
  const { user, profile, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [events, setEvents] = useState<DisplayEvent[]>([]);
  const [joinedRegistrations, setJoinedRegistrations] = useState<JoinedRegistration[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<DisplayEvent | null>(null);
  const [joining, setJoining] = useState(false);
  const [joinForm, setJoinForm] = useState<JoinFormState>(INITIAL_JOIN_FORM);
  const [joinError, setJoinError] = useState('');
  const [authPrompt, setAuthPrompt] = useState('');
  const [tournamentMatches, setTournamentMatches] = useState<TournamentMatch[]>([]);
  const [slotFallbackConfirmed, setSlotFallbackConfirmed] = useState(false);
  const [showEventForm, setShowEventForm] = useState(false);
  const [eventForm, setEventForm] = useState<EventFormState>(INITIAL_EVENT_FORM);
  const [eventImageFile, setEventImageFile] = useState<File | null>(null);
  const [eventFormMessage, setEventFormMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [creatingEvent, setCreatingEvent] = useState(false);
  const loginRoute = '/login?returnTo=%2Fevents&intent=join-event';
  const signupRoute = '/signup?returnTo=%2Fevents&intent=join-event';
  const participantName = profile?.user.name?.trim() || user?.displayName || user?.email || '';
  const isEventCreator = !!profile?.preferences.event_creator;

  useEffect(() => {
    const loadEvents = async () => {
      try {
        setEvents(await fetchEvents());
      } catch (error) {
        console.error('Error fetching events:', error);
        setEvents([]);
      } finally {
        setLoading(false);
      }
    };

    loadEvents();
  }, []);

  useEffect(() => {
    const unresolvedEvents = events.filter((event) => event.imagePath && !event.image);
    if (unresolvedEvents.length === 0) return;

    let isCancelled = false;

    unresolvedEvents.forEach((event) => {
      resolveStorageUrl(event.imagePath!)
        .then((imageUrl) => {
          if (isCancelled || !imageUrl) return;

          setEvents((currentEvents) =>
            currentEvents.map((currentEvent) =>
              currentEvent.id === event.id
                ? {
                    ...currentEvent,
                    image: imageUrl,
                    imagePath: undefined,
                  }
                : currentEvent
            )
          );

          setSelectedEvent((currentSelectedEvent) =>
            currentSelectedEvent?.id === event.id
              ? {
                  ...currentSelectedEvent,
                  image: imageUrl,
                  imagePath: undefined,
                }
              : currentSelectedEvent
          );
        })
        .catch((error) => {
          console.error('Error resolving event image:', error);
        });
    });

    return () => {
      isCancelled = true;
    };
  }, [events]);

  useEffect(() => {
    if (!user) return;

    const q = query(collection(db, 'event_participants'), where('user_id', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setJoinedRegistrations(
        snapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            eventId: data.event_id,
            tournamentChoice: (data.tournament_choice || '') as JoinedRegistration['tournamentChoice'],
          };
        })
      );
    });

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!selectedEvent) {
      setJoinForm(INITIAL_JOIN_FORM);
      setJoinError('');
      setTournamentMatches([]);
    }
  }, [selectedEvent]);

  useEffect(() => {
    if (!selectedEvent || !isTournamentEvent(selectedEvent)) { setTournamentMatches([]); return; }
    getDocs(query(collection(db, 'tournament_matches'), where('event_id', '==', selectedEvent.id)))
      .then((snap) => setTournamentMatches(snap.docs.map((d) => ({ id: d.id, ...d.data() } as TournamentMatch))));
  }, [selectedEvent?.id]);

  useEffect(() => { setSlotFallbackConfirmed(false); }, [joinForm.division, joinForm.tournamentChoice]);

  const visibleEvents = useMemo(() => {
    return events.filter((event) => !isTopspinMeetupEvent(event) && !isWeekendMatchdaysEvent(event));
  }, [events]);

  const featuredEvents = useMemo(() => {
    return visibleEvents.filter((event) => isSeasonOpener(event));
  }, [visibleEvents]);

  const getJoinedChoices = (eventId: string) => {
    return new Set(
      joinedRegistrations
        .filter((entry) => entry.eventId === eventId && entry.tournamentChoice)
        .map((entry) => entry.tournamentChoice)
    );
  };

  const hasJoinedRegularEvent = (eventId: string) => {
    return joinedRegistrations.some((entry) => entry.eventId === eventId && !entry.tournamentChoice);
  };

  const hasJoinedTournamentChoice = (eventId: string, choice: 'Singles' | 'Doubles') => {
    return joinedRegistrations.some(
      (entry) => entry.eventId === eventId && entry.tournamentChoice === choice
    );
  };

  const hasJoinedAnyTournament = () => {
    return joinedRegistrations.some((entry) => entry.tournamentChoice === 'Singles' || entry.tournamentChoice === 'Doubles');
  };

  type SlotResult = {
    status: 'available' | 'fallback' | 'full';
    match?: TournamentMatch;
    slot?: 'player_1' | 'player_2';
    skillOverride: number;
    intendedGroup?: string;
    actualGroup?: string;
  };

  const slotStatus = useMemo((): SlotResult | null => {
    if (!selectedEvent || !isTournamentEvent(selectedEvent) || !joinForm.division || tournamentMatches.length === 0) return null;

    const findSlot = (tc: string, div: string, group: string) => {
      for (const m of tournamentMatches) {
        if (m.tournament_choice !== tc || m.division !== div || m.skill_group !== group) continue;
        if (m.player_1_name === PLAYER_LOADING) return { match: m, slot: 'player_1' as const };
        if (m.player_2_name === PLAYER_LOADING) return { match: m, slot: 'player_2' as const };
      }
      return null;
    };

    if (joinForm.tournamentChoice === 'Singles') {
      const skill = Number(profile?.stats.skill_level || 0);
      const intendedGroup = skill >= 4 ? 'Masters' : 'Challengers';
      const altGroup = skill >= 4 ? 'Challengers' : 'Masters';

      const mergedDrawExists = tournamentMatches.some(
        (m) => m.tournament_choice === 'Singles' && m.division === joinForm.division && m.skill_group === 'All'
      );

      if (mergedDrawExists) {
        const slot = findSlot('Singles', joinForm.division, 'All');
        if (slot) return { status: 'available', ...slot, skillOverride: skill };
        return { status: 'full', skillOverride: skill };
      }

      const intended = findSlot('Singles', joinForm.division, intendedGroup);
      if (intended) return { status: 'available', ...intended, skillOverride: skill };

      const alt = findSlot('Singles', joinForm.division, altGroup);
      if (alt) return { status: 'fallback', ...alt, skillOverride: altGroup === 'Masters' ? 4 : 3, intendedGroup, actualGroup: altGroup };

      return { status: 'full', skillOverride: skill };
    }

    if (joinForm.tournamentChoice === 'Doubles') {
      const skill = Number(joinForm.combinedSkill || 0);

      const consolidatedDrawExists = tournamentMatches.some(
        (m) => m.tournament_choice === 'Doubles' && m.division === 'All'
      );

      if (consolidatedDrawExists) {
        const slot = findSlot('Doubles', 'All', 'All');
        if (slot) return { status: 'available', ...slot, skillOverride: skill };
        return { status: 'full', skillOverride: skill };
      }

      const slot = findSlot('Doubles', joinForm.division, 'All');
      if (slot) return { status: 'available', ...slot, skillOverride: skill };
      return { status: 'full', skillOverride: skill };
    }

    return null;
  }, [selectedEvent, tournamentMatches, joinForm.division, joinForm.tournamentChoice, joinForm.combinedSkill, profile]);

  const registerForRegularEvent = async (event: DisplayEvent) => {
    if (isWeekendMatchdaysEvent(event) && !hasJoinedAnyTournament()) {
      const weekendMatchdaysMessage = 'Please join a tournament before joining matchdays';
      if (selectedEvent?.id === event.id) {
        setJoinError(weekendMatchdaysMessage);
      } else {
        setAuthPrompt(weekendMatchdaysMessage);
      }
      return false;
    }

    await addDoc(collection(db, 'event_participants'), {
      user_id: user!.uid,
      user_name: participantName,
      event_id: event.id,
      event_name: event.title,
      tournament_choice: '',
      doubles: '',
      partner_in_app: '',
      skill: Number(profile?.stats.skill_level || 0),
      dateselected: [],
      createdAt: new Date().toISOString(),
    });

    return true;
  };

  const isFullyJoinedEvent = (event: TennisEvent) => {
    if (isTournamentEvent(event)) {
      const joinedChoices = getJoinedChoices(event.id);
      return joinedChoices.has('Singles') && joinedChoices.has('Doubles');
    }

    return hasJoinedRegularEvent(event.id);
  };

  const handleStartJoin = async (event: DisplayEvent) => {
    if (!user) {
      setAuthPrompt('Join the league to get updates and reserve your spot.');
      window.setTimeout(() => {
        navigate(loginRoute);
      }, 1200);
      return;
    }

    if (!isTournamentEvent(event)) {
      if (hasJoinedRegularEvent(event.id)) {
        setAuthPrompt('You are already registered for this event.');
        return;
      }
    }

    setSelectedEvent(event);
    setJoinError('');
  };

  const handleSubmitJoin = async () => {
    if (!selectedEvent) return;

    if (!user) {
      setAuthPrompt('Join the league to get updates and reserve your spot.');
      setSelectedEvent(null);
      window.setTimeout(() => {
        navigate(loginRoute);
      }, 1200);
      return;
    }

    if (hasJoinedTournamentChoice(selectedEvent.id, joinForm.tournamentChoice)) {
      setJoinError(`You are already registered for ${joinForm.tournamentChoice.toLowerCase()} in this event.`);
      return;
    }

    if (!isTournamentEvent(selectedEvent)) {
      if (hasJoinedRegularEvent(selectedEvent.id)) {
        setJoinError('You are already registered for this event.');
        return;
      }

      setJoining(true);
      setJoinError('');

      try {
        const joined = await registerForRegularEvent(selectedEvent);
        if (joined) {
          setSelectedEvent(null);
        }
      } catch (error) {
        console.error('Error joining event:', error);
        setJoinError('Could not join the event right now. Please try again.');
      } finally {
        setJoining(false);
      }
      return;
    }

    if (!joinForm.division) {
      setJoinError('Please select a division.');
      return;
    }

    if (joinForm.tournamentChoice === 'Singles' && joinForm.division === 'Mixed Doubles') {
      setJoinError('Mixed Doubles is locked for singles.');
      return;
    }

    if (joinForm.tournamentChoice === 'Doubles') {
      if (!joinForm.partnerName.trim()) {
        setJoinError('Please enter your partner name for doubles.');
        return;
      }
      if (!joinForm.partnerInApp) {
        setJoinError('Please tell us whether your partner is already in the app.');
        return;
      }
      if (!joinForm.combinedSkill || Number.isNaN(Number(joinForm.combinedSkill))) {
        setJoinError('Please enter the combined average skill level for doubles.');
        return;
      }
    }

    if (slotStatus?.status === 'full') {
      const label = joinForm.tournamentChoice === 'Doubles'
        ? 'Doubles'
        : `${joinForm.division} Singles`;
      setJoinError(`The ${label} draw is full. Please join the next event.`);
      return;
    }
    if (slotStatus?.status === 'fallback' && !slotFallbackConfirmed) {
      setJoinError('Please confirm the draw assignment above.');
      return;
    }

    setJoining(true);
    setJoinError('');

    try {
      const isWeekendEvent = isWeekendMatchdaysEvent(selectedEvent);
      const dateselected = (() => {
        if (isWeekendEvent) return joinForm.dateselected;
        if (isSeasonOpener(selectedEvent)) {
          const d = parseDateValue(selectedEvent.start_date || selectedEvent.startDate || selectedEvent.date);
          return d ? [`May ${d.getDate()}, ${d.getFullYear()}`] : [];
        }
        return [];
      })();
      await addDoc(collection(db, 'event_participants'), {
        user_id: user.uid,
        user_name: participantName,
        event_id: selectedEvent.id,
        event_name: selectedEvent.title,
        tournament_choice: joinForm.tournamentChoice,
        division: joinForm.division,
        doubles: joinForm.tournamentChoice === 'Doubles' ? joinForm.partnerName.trim() : '',
        partner_in_app: joinForm.tournamentChoice === 'Doubles' ? joinForm.partnerInApp : '',
        skill: slotStatus?.skillOverride ?? (joinForm.tournamentChoice === 'Singles'
          ? Number(profile?.stats.skill_level || 0)
          : Number(joinForm.combinedSkill)),
        dateselected,
        createdAt: new Date().toISOString(),
      });

      if (slotStatus?.match && slotStatus.slot) {
        await updateDoc(doc(db, 'tournament_matches', slotStatus.match.id), {
          [`${slotStatus.slot}_name`]: participantName,
          [`${slotStatus.slot}_user_id`]: user.uid,
          [`${slotStatus.slot}_contact`]: user.email || '',
        });
      }

      setSelectedEvent(null);
    } catch (error) {
      console.error('Error joining event:', error);
      setJoinError('Could not join the event right now. Please try again.');
    } finally {
      setJoining(false);
    }
  };

  const handleEventImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    if (!file) {
      setEventImageFile(null);
      return;
    }

    if (!ACCEPTED_EVENT_IMAGE_TYPES.includes(file.type)) {
      setEventFormMessage({
        type: 'error',
        text: 'Please upload a JPEG, PNG, JPG, WEBP, GIF, HEIC, or HEIF image.',
      });
      e.target.value = '';
      return;
    }

    setEventFormMessage(null);
    setEventImageFile(file);
  };

  const handleCreateEvent = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user || !isEventCreator) {
      setEventFormMessage({ type: 'error', text: 'Only event creators can add events.' });
      return;
    }

    const validationError = validateEventForm(eventForm);
    if (validationError) {
      setEventFormMessage({ type: 'error', text: validationError });
      return;
    }

    setCreatingEvent(true);
    setEventFormMessage(null);

    try {
      const imageUrl = await uploadEventImage(user.uid, eventForm.title, eventImageFile);
      const created = await createEvent(user.uid, eventForm, imageUrl);
      setEvents((current) => sortEventsByStartDate([...current, created]));
      setEventForm(INITIAL_EVENT_FORM);
      setEventImageFile(null);
      setEventFormMessage({ type: 'success', text: 'Event added successfully.' });
      setShowEventForm(false);
    } catch (error) {
      console.error('Event creation failed:', error);
      setEventFormMessage({
        type: 'error',
        text: 'Could not add the event. Please check creator permissions and try again.',
      });
    } finally {
      setCreatingEvent(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20 pt-4 md:pt-6">
      <div className="space-y-6 mb-8">
        {authPrompt && (
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-5 py-4 text-amber-300 space-y-3">
            <p>{authPrompt}</p>
            {!user && (
              <div className="flex flex-col sm:flex-row gap-3">
                <Link to={loginRoute} className="w-full sm:w-auto">
                  <Button size="sm" className="w-full sm:w-auto">
                    Log In
                  </Button>
                </Link>
                <Link to={signupRoute} className="w-full sm:w-auto">
                  <Button variant="outline" size="sm" className="w-full sm:w-auto">
                    Join the League
                  </Button>
                </Link>
              </div>
            )}
          </div>
        )}

        {eventFormMessage && !showEventForm && (
          <div className={`rounded-2xl border px-5 py-4 ${
            eventFormMessage.type === 'success'
              ? 'border-green-500/20 bg-green-500/10 text-green-300'
              : 'border-red-500/20 bg-red-500/10 text-red-300'
          }`}>
            {eventFormMessage.text}
          </div>
        )}

        <EventsHeader
          isEventCreator={isEventCreator}
          onAddEvent={() => {
            setEventFormMessage(null);
            setEventForm((current) => ({
              ...current,
              organizer: current.organizer || profile?.user.name || '',
            }));
            setShowEventForm(true);
          }}
        />

      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-96 bg-tennis-surface/30 rounded-[2.5rem] animate-pulse" />
          ))}
        </div>
      ) : visibleEvents.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-6">
          {visibleEvents.map((event, i) => (
            <motion.div
              key={event.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              className="group bg-tennis-surface/30 border border-white/5 rounded-[2.5rem] overflow-hidden hover:border-clay/30 transition-all duration-300 flex flex-col shadow-xl"
            >
              <div className="relative h-[460px] md:h-[540px] overflow-hidden rounded-t-3xl">
              {event.image ? (
                <img
                  src={event.image}
                  alt={event.title}
                  className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-500"
                  referrerPolicy="no-referrer"
                  loading="lazy"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-tennis-dark via-tennis-surface to-clay/20 px-6 text-center text-white">
                  <span className="text-lg font-bold">{event.title}</span>
                </div>
              )}

              <div className="absolute top-4 left-4 px-3 py-1 bg-tennis-dark/80 backdrop-blur-md rounded-lg text-xs font-bold text-clay uppercase tracking-wider">
                {event.type}
              </div>

              {isFullyJoinedEvent(event) && (
                <div className="absolute top-4 right-4 w-10 h-10 bg-green-500 rounded-full flex items-center justify-center shadow-lg">
                  <CheckCircle2 className="w-6 h-6 text-white" />
                </div>
              )}
            </div>

              <div className="p-5 flex-grow flex flex-col gap-4">
                <div className="space-y-2">
                  <h3 className="text-xl md:text-2xl font-bold text-white group-hover:text-clay transition-colors leading-tight">{event.title}</h3>
                  {isSeasonOpener(event) && (
                    <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-300">First Tournament of 2026</p>
                  )}
                  {isTournamentEvent(event) && formatTournamentRange(event) && (
                    <p className="text-clay font-semibold">{formatTournamentRange(event)}</p>
                  )}
                  {getRecurringEventLabel(event) && (
                    <p className="text-gray-400 text-sm font-medium">{getRecurringEventLabel(event)}</p>
                  )}
                </div>

                <div className="mt-auto pt-3 border-t border-white/5 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <Button
                      variant={isFullyJoinedEvent(event) ? 'secondary' : 'primary'}
                      size="sm"
                      onClick={() => handleStartJoin(event)}
                      isLoading={joining && !selectedEvent}
                      disabled={isFullyJoinedEvent(event)}
                    >
                      {isFullyJoinedEvent(event)
                        ? 'Joined'
                        : authLoading
                          ? 'Loading...'
                          : user
                            ? 'Join Event'
                            : 'Log In to Join'}
                    </Button>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      ) : (
        <div className="text-center py-24 space-y-5">
          <div>
            <h3 className="text-2xl font-bold text-white">No events yet</h3>
            <p className="text-gray-400">Events will appear here when they are live.</p>
          </div>
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
          <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedEvent(null)}
              className="absolute inset-0 bg-tennis-dark/80 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 20 }}
              className="relative w-full max-w-3xl bg-tennis-surface border border-white/10 rounded-[3rem] overflow-hidden shadow-2xl max-h-[90vh] overflow-y-auto"
            >
              <button
                onClick={() => setSelectedEvent(null)}
                className="absolute top-6 right-6 z-10 w-10 h-10 bg-tennis-dark/50 hover:bg-tennis-dark rounded-full flex items-center justify-center text-white transition-colors"
              >
                <X className="w-6 h-6" />
              </button>

              <div className="h-64 relative">
                {selectedEvent.image ? (
                  <img
                    src={selectedEvent.image}
                    alt={selectedEvent.title}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-tennis-dark via-tennis-surface to-clay/20 px-8 text-center text-white">
                    <span className="text-2xl font-bold">{selectedEvent.title}</span>
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-tennis-surface via-transparent to-transparent" />
              </div>

              <div className="p-10 space-y-8">
                <div className="space-y-4">
                  <div className="inline-block px-3 py-1 bg-clay/10 border border-clay/20 rounded-lg text-xs font-bold text-clay uppercase tracking-widest">
                    {selectedEvent.type}
                  </div>
                  <h2 className="text-4xl font-display font-black text-white">{selectedEvent.title}</h2>
                  {isSeasonOpener(selectedEvent) && (
                    <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-300">First Tournament of 2026</p>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-gray-300">
                    <div className="flex items-center">
                      <Calendar className="w-5 h-5 mr-2 text-clay" />
                      <span className="font-medium">
                        {formatDateLabel(getEventStartDate(selectedEvent))}
                        {getEventEndDate(selectedEvent) && getEventEndDate(selectedEvent) !== getEventStartDate(selectedEvent)
                          ? ` to ${formatDateLabel(getEventEndDate(selectedEvent))}`
                          : ''}
                      </span>
                    </div>
                    <div className="flex items-center">
                      <MapPin className="w-5 h-5 mr-2 text-clay" />
                      <span className="font-medium">{selectedEvent.location}</span>
                    </div>
                    <div className="flex items-center">
                      <Users className="w-5 h-5 mr-2 text-clay" />
                      <span className="font-medium">Skill level: {selectedEvent.skill_level || selectedEvent.type}</span>
                    </div>
                    {formatEventSchedule(selectedEvent) && (
                      <div className="flex items-center">
                        <Clock3 className="w-5 h-5 mr-2 text-clay" />
                        <span className="font-medium">{formatEventSchedule(selectedEvent)}</span>
                      </div>
                    )}
                    {isRecurringWeekly(selectedEvent) && (
                      <div className="flex items-center">
                        <Repeat className="w-5 h-5 mr-2 text-clay" />
                        <span className="font-medium">Recurring weekly</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="text-white font-bold uppercase tracking-widest text-xs">About the Event</h4>
                  <p className="text-gray-400 leading-relaxed">
                    {selectedEvent.about || selectedEvent.description || 'Join us for a Toronto Tennis League event and connect with the community.'}
                  </p>
                </div>

                <div className="rounded-[2rem] border border-white/5 bg-white/5 p-6 space-y-5">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                      <h4 className="text-white font-bold">Join Event</h4>
                      <p className="text-gray-400 text-sm">
                        {isTournamentEvent(selectedEvent)
                          ? 'Choose singles or doubles before we register you.'
                          : 'Reserve your spot for this event.'}
                      </p>
                    </div>
                  </div>

                  {joinError && (
                    <div className="flex items-center space-x-3 p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                      <AlertCircle className="w-5 h-5 shrink-0" />
                      <span>{joinError}</span>
                    </div>
                  )}

                  {!user && (
                    <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-200">
                      Guest event join is not available with the current signup system. Join the league to get updates and register for events.
                    </div>
                  )}

                  {isFullyJoinedEvent(selectedEvent) ? (
                    <div className="flex items-center space-x-2 text-green-500 font-bold">
                      <CheckCircle2 className="w-6 h-6" />
                      <span>You're already registered for all available draws in this event.</span>
                    </div>
                  ) : (
                    <div className="space-y-5">
                      {isTournamentEvent(selectedEvent) && (
                        <>
                          {getJoinedChoices(selectedEvent.id).size > 0 && (
                            <div className="rounded-2xl border border-green-500/20 bg-green-500/10 p-4 text-sm text-green-400">
                              Already joined: {[...getJoinedChoices(selectedEvent.id)].join(', ')}
                            </div>
                          )}
                          <div className="space-y-2">
                            <label className="block text-sm font-medium text-gray-300">Format</label>
                            <div className="flex gap-3">
                              {(['Singles', 'Doubles'] as const).map((choice) => (
                                <button
                                  key={choice}
                                  onClick={() => setJoinForm({
                                    ...joinForm,
                                    tournamentChoice: choice,
                                    division:
                                      choice === 'Singles' && joinForm.division === 'Mixed Doubles'
                                        ? ''
                                        : joinForm.division,
                                    partnerName: choice === 'Singles' ? '' : joinForm.partnerName,
                                    partnerInApp: choice === 'Singles' ? '' : joinForm.partnerInApp,
                                    combinedSkill: choice === 'Singles' ? '' : joinForm.combinedSkill,
                                  })}
                                  className={`px-4 py-3 rounded-2xl border font-semibold transition-all ${
                                    joinForm.tournamentChoice === choice
                                      ? 'bg-clay/10 border-clay text-clay'
                                      : 'bg-tennis-surface/50 border-white/10 text-gray-400'
                                  } ${hasJoinedTournamentChoice(selectedEvent.id, choice) ? 'opacity-50 cursor-not-allowed' : ''}`}
                                  disabled={hasJoinedTournamentChoice(selectedEvent.id, choice)}
                                >
                                  {choice}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="space-y-2">
                            <label className="block text-sm font-medium text-gray-300">Select Division</label>
                            <div className="flex flex-wrap gap-3">
                              {(["Men's", "Women's", 'Mixed Doubles'] as const).map((division) => {
                                const isLocked =
                                  joinForm.tournamentChoice === 'Singles' && division === 'Mixed Doubles';

                                return (
                                  <button
                                    key={division}
                                    type="button"
                                    onClick={() => {
                                      if (isLocked) return;
                                      setJoinForm({ ...joinForm, division });
                                    }}
                                    disabled={isLocked}
                                    className={`px-4 py-3 rounded-2xl border font-semibold transition-all ${
                                      joinForm.division === division
                                        ? 'bg-clay/10 border-clay text-clay'
                                        : isLocked
                                          ? 'bg-tennis-dark/70 border-white/5 text-gray-600 cursor-not-allowed opacity-70'
                                          : 'bg-tennis-surface/50 border-white/10 text-gray-400'
                                    }`}
                                  >
                                    {division}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {joinForm.tournamentChoice === 'Doubles' && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="space-y-2 md:col-span-2">
                                <label className="block text-sm font-medium text-gray-300">Partner Name</label>
                                <input
                                  value={joinForm.partnerName}
                                  onChange={(e) => setJoinForm({ ...joinForm, partnerName: e.target.value })}
                                  className="w-full rounded-2xl bg-tennis-surface/50 border border-white/10 px-4 py-3 text-white placeholder-gray-500 focus:border-clay outline-none"
                                  placeholder="Enter partner name"
                                />
                              </div>
                              <div className="space-y-2">
                                <label className="block text-sm font-medium text-gray-300">Is your partner in the app?</label>
                                <select
                                  value={joinForm.partnerInApp}
                                  onChange={(e) => setJoinForm({ ...joinForm, partnerInApp: e.target.value as 'yes' | 'no' | '' })}
                                  className="w-full rounded-2xl bg-tennis-surface/50 border border-white/10 px-4 py-3 text-white focus:border-clay outline-none"
                                >
                                  <option value="">Select one</option>
                                  <option value="yes">Yes</option>
                                  <option value="no">No</option>
                                </select>
                              </div>
                              <div className="space-y-2">
                                <label className="block text-sm font-medium text-gray-300">Combined Skill Level (Average)</label>
                                <input
                                  type="number"
                                  min="1"
                                  max="5"
                                  step="0.5"
                                  value={joinForm.combinedSkill}
                                  onChange={(e) => setJoinForm({ ...joinForm, combinedSkill: e.target.value })}
                                  className="w-full rounded-2xl bg-tennis-surface/50 border border-white/10 px-4 py-3 text-white placeholder-gray-500 focus:border-clay outline-none"
                                  placeholder="3.5"
                                />
                              </div>
                            </div>
                          )}

                          {joinForm.tournamentChoice === 'Singles' && (
                            <div className="rounded-2xl border border-clay/20 bg-clay/5 p-4 text-sm text-gray-300">
                              Your current skill level will be used for this registration: <span className="text-clay font-bold">{profile?.stats.skill_level ?? 'Not set'}</span>
                            </div>
                          )}

                          {slotStatus?.status === 'fallback' && (
                            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 space-y-3">
                              <div className="flex items-start gap-3 text-amber-300">
                                <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
                                <p className="text-sm">
                                  <span className="font-bold">{slotStatus.intendedGroup} Draw is full.</span> Joining will add you to the {slotStatus.actualGroup} draw.
                                </p>
                              </div>
                              <label className="flex items-center gap-3 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={slotFallbackConfirmed}
                                  onChange={(e) => setSlotFallbackConfirmed(e.target.checked)}
                                  className="w-4 h-4 accent-clay"
                                />
                                <span className="text-sm text-amber-200">I understand and wish to continue</span>
                              </label>
                            </div>
                          )}

                          {slotStatus?.status === 'full' && (
                            <div className="flex items-start gap-3 p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400">
                              <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
                              <p className="text-sm">
                                {joinForm.tournamentChoice === 'Doubles' ? 'Doubles' : `${joinForm.division} Singles`} draw is full. Please join the next event.
                              </p>
                            </div>
                          )}
                        </>
)}
                          <div className="flex flex-col sm:flex-row gap-3 sm:justify-end">
                        <Button variant="ghost" onClick={() => setSelectedEvent(null)}>
                          Cancel
                        </Button>
                        {user ? (
                          <Button
                            onClick={handleSubmitJoin}
                            isLoading={joining}
                            disabled={slotStatus?.status === 'full' || (slotStatus?.status === 'fallback' && !slotFallbackConfirmed)}
                          >
                            Join Event
                          </Button>
                        ) : (
                          <div className="flex flex-col sm:flex-row gap-3">
                            <Link to={loginRoute}>
                              <Button>Log In</Button>
                            </Link>
                            <Link to={signupRoute}>
                              <Button variant="outline">Join the League</Button>
                            </Link>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
