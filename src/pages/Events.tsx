import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { collection, query, getDocs, addDoc, where, onSnapshot } from 'firebase/firestore';
import { getDownloadURL, ref } from 'firebase/storage';
import { db, storage } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { TennisEvent } from '../types';
import { Button } from '../components/Button';
import {
  Calendar,
  MapPin,
  Users,
  Search,
  X,
  CheckCircle2,
  AlertCircle,
  Repeat,
  Mail,
  Clock3,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

type JoinFormState = {
  tournamentChoice: 'Singles' | 'Doubles';
  partnerName: string;
  partnerInApp: 'yes' | 'no' | '';
  combinedSkill: string;
};

type CalendarOccurrence = {
  event: TennisEvent;
  date: Date;
};

type JoinedRegistration = {
  eventId: string;
  tournamentChoice: '' | 'Singles' | 'Doubles';
};

const INITIAL_JOIN_FORM: JoinFormState = {
  tournamentChoice: 'Singles',
  partnerName: '',
  partnerInApp: '',
  combinedSkill: '',
};

type FirestoreDateLike = string | { toDate?: () => Date; seconds?: number; nanoseconds?: number } | undefined;

const getEventStartDate = (event: TennisEvent): FirestoreDateLike => event.startDate || event.start_date || event.date;
const getEventEndDate = (event: TennisEvent): FirestoreDateLike => event.endDate || event.end_date || event.startDate || event.start_date || event.date;
const isRecurringWeekly = (event: TennisEvent) =>
  event.recurring_weekly === true || event.recurring === true || event.recurring === 'Yes';
const isTournamentEvent = (event: TennisEvent) => event.type.toLowerCase().includes('tournament');
const isMeetupEvent = (event: TennisEvent) => event.type.toLowerCase().includes('meetup');
const isSpecialEvent = (event: TennisEvent) => event.type.toLowerCase().includes('special');

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

const resolveStorageUrl = async (imagePath: string) => {
  if (!imagePath) return '';
  if (imagePath.startsWith('gs://')) {
    return getDownloadURL(ref(storage, imagePath));
  }
  return imagePath;
};

const parseValidDate = (value?: FirestoreDateLike) => {
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

const getEventOccurrences = (event: TennisEvent) => {
  const start = parseValidDate(getEventStartDate(event));
  if (!start) return [] as CalendarOccurrence[];

  const end = parseValidDate(getEventEndDate(event)) || start;
  const occurrences: CalendarOccurrence[] = [];

  if (isRecurringWeekly(event)) {
    const eventDays = getEventDays(event);
    const cursor = new Date(start);
    const safeEnd = new Date(end);

    while (cursor <= safeEnd) {
      if (eventDays.length === 0 || eventDays.includes(cursor.getDay())) {
        occurrences.push({ event, date: new Date(cursor) });
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    if (occurrences.length > 0) {
      return occurrences;
    }
  }

  return [{ event, date: start }];
};

const formatDateLabel = (value?: FirestoreDateLike) => {
  const parsed = parseValidDate(value);
  if (!parsed) return 'Date TBD';
  return parsed.toLocaleDateString('en-CA', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
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

const formatDateTimeForCalendar = (value?: FirestoreDateLike) => {
  const parsed = parseValidDate(value);
  if (!parsed || Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
};

const buildGoogleCalendarUrl = (event: TennisEvent) => {
  const start = formatDateTimeForCalendar(getEventStartDate(event));
  const end = formatDateTimeForCalendar(getEventEndDate(event) || getEventStartDate(event));
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    location: event.location,
    details: [
      event.description || 'Toronto Tennis League event',
      isRecurringWeekly(event) ? 'Recurring weekly event' : null,
      event.skill_level ? `Skill level: ${event.skill_level}` : null,
    ].filter(Boolean).join('\n'),
  });

  if (start && end) {
    params.set('dates', `${start}/${end}`);
  }

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
};

const canAddToCalendar = (event: TennisEvent) => {
  return isMeetupEvent(event) || event.title.toLowerCase().includes('weekend matchdays');
};

const getRecurringEventLabel = (event: TennisEvent) => {
  if (!isRecurringWeekly(event)) return null;
  if (isMeetupEvent(event)) return 'Weekly recurring event';
  if (isSpecialEvent(event)) return 'Weekly recurring event while the tournament is in session';
  return null;
};

export const Events: React.FC = () => {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [events, setEvents] = useState<TennisEvent[]>([]);
  const [joinedRegistrations, setJoinedRegistrations] = useState<JoinedRegistration[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<TennisEvent | null>(null);
  const [joining, setJoining] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [joinForm, setJoinForm] = useState<JoinFormState>(INITIAL_JOIN_FORM);
  const [joinError, setJoinError] = useState('');
  const [authPrompt, setAuthPrompt] = useState('');
  const participantName = profile?.user.name?.trim() || user?.displayName || user?.email || '';

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        const snapshot = await getDocs(collection(db, 'events'));
        const eventsData = await Promise.all(
          snapshot.docs.map(async (doc) => {
            const event = { id: doc.id, ...doc.data() } as TennisEvent;
            return {
              ...event,
              image: await resolveStorageUrl(event.image),
            };
          })
        );

        eventsData.sort((a, b) => {
          const aTime = parseValidDate(getEventStartDate(a))?.getTime() ?? Number.MAX_SAFE_INTEGER;
          const bTime = parseValidDate(getEventStartDate(b))?.getTime() ?? Number.MAX_SAFE_INTEGER;
          const safeATime = Number.isNaN(aTime) ? Number.MAX_SAFE_INTEGER : aTime;
          const safeBTime = Number.isNaN(bTime) ? Number.MAX_SAFE_INTEGER : bTime;
          return safeATime - safeBTime;
        });
        setEvents(eventsData);
      } catch (error) {
        console.error('Error fetching events:', error);
        setEvents([]);
      } finally {
        setLoading(false);
      }
    };

    fetchEvents();
  }, []);

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
    }
  }, [selectedEvent]);

  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      const matchesSearch =
        event.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        event.location.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesSearch;
    });
  }, [events, searchTerm]);

  const calendarEvents = useMemo(() => {
    const now = new Date();
    const rangeStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const rangeEnd = new Date(now.getFullYear(), now.getMonth() + 2, 0, 23, 59, 59, 999);

    return events
      .flatMap((event) => getEventOccurrences(event))
      .filter((occurrence) => occurrence.date >= rangeStart && occurrence.date <= rangeEnd)
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .slice(0, 12);
  }, [events]);

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

  const isFullyJoinedEvent = (event: TennisEvent) => {
    if (isTournamentEvent(event)) {
      const joinedChoices = getJoinedChoices(event.id);
      return joinedChoices.has('Singles') && joinedChoices.has('Doubles');
    }

    return hasJoinedRegularEvent(event.id);
  };

  const handleStartJoin = async (event: TennisEvent) => {
    if (!user) {
      setAuthPrompt('Please log in to continue');
      window.setTimeout(() => {
        navigate('/login');
      }, 1200);
      return;
    }

    if (!isTournamentEvent(event)) {
      if (hasJoinedRegularEvent(event.id)) {
        setAuthPrompt('You are already registered for this event.');
        return;
      }

      setJoining(true);
      try {
        await addDoc(collection(db, 'event_participants'), {
          user_id: user.uid,
          user_name: participantName,
          event_id: event.id,
          event_name: event.title,
          tournament_choice: '',
          doubles: '',
          partner_in_app: '',
          skill: Number(profile?.stats.skill_level || 0),
          createdAt: new Date().toISOString(),
        });
      } catch (error) {
        console.error('Error joining event:', error);
      } finally {
        setJoining(false);
      }
      return;
    }

    const joinedChoices = getJoinedChoices(event.id);
    const defaultChoice = joinedChoices.has('Singles') && !joinedChoices.has('Doubles') ? 'Doubles' : 'Singles';

    setSelectedEvent(event);
    setJoinForm({
      ...INITIAL_JOIN_FORM,
      tournamentChoice: defaultChoice,
    });
    setJoinError('');
  };

  const handleAddToCalendar = (event: TennisEvent) => {
    if (!user) {
      setAuthPrompt('Please log in to continue');
      window.setTimeout(() => {
        navigate('/login');
      }, 1200);
      return;
    }

    if (!canAddToCalendar(event)) {
      return;
    }

    window.open(buildGoogleCalendarUrl(event), '_blank', 'noopener,noreferrer');
  };

  const handleSubmitJoin = async () => {
    if (!selectedEvent) return;

    if (!user) {
      setAuthPrompt('Please log in to continue');
      setSelectedEvent(null);
      window.setTimeout(() => {
        navigate('/login');
      }, 1200);
      return;
    }

    if (hasJoinedTournamentChoice(selectedEvent.id, joinForm.tournamentChoice)) {
      setJoinError(`You are already registered for ${joinForm.tournamentChoice.toLowerCase()} in this event.`);
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

    setJoining(true);
    setJoinError('');

    try {
      await addDoc(collection(db, 'event_participants'), {
        user_id: user.uid,
        user_name: participantName,
        event_id: selectedEvent.id,
        event_name: selectedEvent.title,
        tournament_choice: joinForm.tournamentChoice,
        doubles: joinForm.tournamentChoice === 'Doubles' ? joinForm.partnerName.trim() : '',
        partner_in_app: joinForm.tournamentChoice === 'Doubles' ? joinForm.partnerInApp : '',
        skill: joinForm.tournamentChoice === 'Singles'
          ? Number(profile?.stats.skill_level || 0)
          : Number(joinForm.combinedSkill),
        createdAt: new Date().toISOString(),
      });
      setSelectedEvent(null);
    } catch (error) {
      console.error('Error joining event:', error);
      setJoinError('Could not join the event right now. Please try again.');
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-32 pt-4 md:pt-6">
      <div className="space-y-8 mb-12">
        {authPrompt && (
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-5 py-4 text-amber-300">
            {authPrompt}
          </div>
        )}

        <div className="rounded-[2rem] border border-clay/20 bg-gradient-to-r from-clay/10 via-tennis-surface/40 to-tennis-surface/20 p-6 md:p-7 shadow-xl">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
            <div className="space-y-2">
              <h1 className="text-3xl md:text-4xl font-display font-black text-white">Upcoming Events</h1>
              <p className="text-gray-300 text-base md:text-lg max-w-xl">Explore Toronto events, save the dates, and join the right draw for your level.</p>
            </div>
            <div className="rounded-[1.75rem] border border-white/10 bg-white/5 p-5 max-w-xl">
              <p className="text-white font-semibold mb-2">Want to create events? Contact us to learn more.</p>
              <p className="text-gray-400 text-sm mb-4">
                Tell us about the type of event you want to organize, whether it is a meetup or tournament, or send general feedback. Events require admin approval before they go live.
              </p>
              <Link to="/contact">
                <Button>
                  <Mail className="w-4 h-4 mr-2" />
                  Contact Us
                </Button>
              </Link>
            </div>
          </div>
        </div>

        <div className="rounded-[2.5rem] border border-white/5 bg-tennis-surface/30 p-8 shadow-xl">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-white">Event Calendar</h2>
            <p className="text-gray-400 text-sm">Events depend on weather and participation level. Check back often for updates.</p>
          </div>
          {calendarEvents.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-4">
              {calendarEvents.map((occurrence, index) => {
                const { event, date } = occurrence;
                return (
                  <button
                    key={`${event.id}-${date.toISOString()}-${index}`}
                    onClick={() => setSelectedEvent(event)}
                    className="text-left rounded-[1.5rem] border border-white/5 bg-white/5 p-4 hover:border-clay/30 transition-all"
                  >
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-500">
                      {date.toLocaleDateString('en-US', { month: 'short' })}
                    </p>
                    <p className="text-3xl font-black text-clay mt-1">
                      {date.toLocaleDateString('en-US', { day: '2-digit' })}
                    </p>
                    <p className="text-white text-sm font-semibold mt-3 line-clamp-2">{event.title}</p>
                    <p className="text-gray-400 text-xs mt-1 line-clamp-1">{event.time || event.location}</p>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="rounded-[2rem] border border-dashed border-white/10 p-8 text-center text-gray-400">
              No events are live yet. Once admin-approved events are added to Firestore, they will appear here.
            </div>
          )}
        </div>

        <div className="flex w-full md:w-auto">
          <div className="relative flex-grow sm:w-72">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
            <input
              type="text"
              placeholder="Search events..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-tennis-surface/50 border border-white/5 rounded-2xl text-white focus:border-clay outline-none transition-all"
            />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-96 bg-tennis-surface/30 rounded-[2.5rem] animate-pulse" />
          ))}
        </div>
      ) : filteredEvents.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {filteredEvents.map((event, i) => (
            <motion.div
              key={event.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              className="group bg-tennis-surface/30 border border-white/5 rounded-[2.5rem] overflow-hidden hover:border-clay/30 transition-all duration-300 flex flex-col shadow-xl"
            >
              <div className="relative h-80 md:h-[22rem] overflow-hidden">
                <img
                  src={event.image}
                  alt={event.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute top-4 left-4 px-3 py-1 bg-tennis-dark/80 backdrop-blur-md rounded-lg text-xs font-bold text-clay uppercase tracking-wider">
                  {event.type}
                </div>
                {isFullyJoinedEvent(event) && (
                  <div className="absolute top-4 right-4 w-10 h-10 bg-green-500 rounded-full flex items-center justify-center shadow-lg">
                    <CheckCircle2 className="w-6 h-6 text-white" />
                  </div>
                )}
              </div>

              <div className="p-6 flex-grow flex flex-col gap-4">
                <div className="space-y-2">
                  <h3 className="text-2xl font-bold text-white group-hover:text-clay transition-colors leading-tight">{event.title}</h3>
                  {isTournamentEvent(event) && formatTournamentRange(event) && (
                    <p className="text-clay font-semibold">{formatTournamentRange(event)}</p>
                  )}
                  {getRecurringEventLabel(event) && (
                    <p className="text-gray-400 text-sm font-medium">{getRecurringEventLabel(event)}</p>
                  )}
                </div>

                <div className="mt-auto pt-3 border-t border-white/5 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <Button variant="secondary" size="sm" onClick={() => setSelectedEvent(event)}>
                      Details
                    </Button>
                    <Button
                      variant={isFullyJoinedEvent(event) ? 'secondary' : 'primary'}
                      size="sm"
                      onClick={() => handleStartJoin(event)}
                      isLoading={joining && !selectedEvent}
                      disabled={isFullyJoinedEvent(event)}
                    >
                      {isFullyJoinedEvent(event) ? 'Joined' : 'Join Event'}
                    </Button>
                  </div>
                  {canAddToCalendar(event) && (
                    <div className="pt-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={() => handleAddToCalendar(event)}
                      >
                        Add to Google Calendar
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      ) : (
        <div className="text-center py-24 space-y-5">
          <div className="w-20 h-20 bg-tennis-surface/50 rounded-full flex items-center justify-center mx-auto">
            <Search className="w-10 h-10 text-gray-600" />
          </div>
          <div>
            <h3 className="text-2xl font-bold text-white">No events found</h3>
            <p className="text-gray-400">Try adjusting your search or filters.</p>
          </div>
          <Button variant="outline" onClick={() => { setSearchTerm(''); }}>
            Clear All Filters
          </Button>
        </div>
      )}

      <AnimatePresence>
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
                <img
                  src={selectedEvent.image}
                  alt={selectedEvent.title}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-tennis-surface via-transparent to-transparent" />
              </div>

              <div className="p-10 space-y-8">
                <div className="space-y-4">
                  <div className="inline-block px-3 py-1 bg-clay/10 border border-clay/20 rounded-lg text-xs font-bold text-clay uppercase tracking-widest">
                    {selectedEvent.type}
                  </div>
                  <h2 className="text-4xl font-display font-black text-white">{selectedEvent.title}</h2>
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
                      <p className="text-gray-400 text-sm">Choose singles or doubles before we register you.</p>
                    </div>
                    {canAddToCalendar(selectedEvent) && (
                      <button
                        type="button"
                        onClick={() => handleAddToCalendar(selectedEvent)}
                        className="inline-flex items-center text-clay text-sm font-bold hover:underline"
                      >
                        <Clock3 className="w-4 h-4 mr-2" />
                        Add to Google Calendar
                      </button>
                    )}
                  </div>

                  {joinError && (
                    <div className="flex items-center space-x-3 p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                      <AlertCircle className="w-5 h-5 shrink-0" />
                      <span>{joinError}</span>
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
                            <label className="block text-sm font-medium text-gray-300">Tournament Choice</label>
                            <div className="flex gap-3">
                              {(['Singles', 'Doubles'] as const).map((choice) => (
                                <button
                                  key={choice}
                                  onClick={() => setJoinForm({
                                    ...joinForm,
                                    tournamentChoice: choice,
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
                        </>
                      )}

                      <div className="flex flex-col sm:flex-row gap-3 sm:justify-end">
                        <Button variant="ghost" onClick={() => setSelectedEvent(null)}>
                          Cancel
                        </Button>
                        <Button onClick={handleSubmitJoin} isLoading={joining}>
                          Join Event
                        </Button>
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
