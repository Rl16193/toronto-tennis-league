import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { useAuth } from '../../../context/AuthContext';
import { TennisEvent } from '../../../types';
import { isTopspinMeetupEvent, isTournamentEvent, isWeekendMatchdaysEvent } from '../../../utils/eventTypes';
import { sortEventsByStartDate } from '../../../utils/eventDates';
import { DisplayEvent, fetchEvents, resolveStorageUrl } from '../services/eventService';
import type { JoinedRegistration } from '../types';

export function useEvents() {
  const { user } = useAuth();
  const [events, setEvents] = useState<DisplayEvent[]>([]);
  const [joinedRegistrations, setJoinedRegistrations] = useState<JoinedRegistration[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchEvents()
      .then(setEvents)
      .catch(() => setEvents([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const unresolved = events.filter((e) => e.imagePath && !e.image);
    if (unresolved.length === 0) return;
    let cancelled = false;
    unresolved.forEach((event) => {
      resolveStorageUrl(event.imagePath!).then((url) => {
        if (cancelled || !url) return;
        setEvents((prev) => prev.map((e) => e.id === event.id ? { ...e, image: url, imagePath: undefined } : e));
      }).catch(() => {});
    });
    return () => { cancelled = true; };
  }, [events]);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'event_participants'), where('user_id', '==', user.uid));
    return onSnapshot(q, (snap) => {
      setJoinedRegistrations(snap.docs.map((d) => {
        const data = d.data();
        return { eventId: data.event_id, tournamentChoice: (data.tournament_choice || '') as JoinedRegistration['tournamentChoice'] };
      }));
    });
  }, [user]);

  const visibleEvents = useMemo(
    () => events.filter((e) => !isTopspinMeetupEvent(e) && !isWeekendMatchdaysEvent(e)),
    [events]
  );

  const getJoinedChoices = (eventId: string) =>
    new Set(joinedRegistrations.filter((r) => r.eventId === eventId && r.tournamentChoice).map((r) => r.tournamentChoice));

  const hasJoinedRegularEvent = (eventId: string) =>
    joinedRegistrations.some((r) => r.eventId === eventId && !r.tournamentChoice);

  const hasJoinedTournamentChoice = (eventId: string, choice: 'Singles' | 'Doubles') =>
    joinedRegistrations.some((r) => r.eventId === eventId && r.tournamentChoice === choice);

  const hasJoinedAnyTournament = () =>
    joinedRegistrations.some((r) => r.tournamentChoice === 'Singles' || r.tournamentChoice === 'Doubles');

  const isFullyJoinedEvent = (event: TennisEvent) =>
    isTournamentEvent(event)
      ? getJoinedChoices(event.id).has('Singles') && getJoinedChoices(event.id).has('Doubles')
      : hasJoinedRegularEvent(event.id);

  return {
    events,
    setEvents: (updater: (prev: DisplayEvent[]) => DisplayEvent[]) =>
      setEvents((prev) => sortEventsByStartDate(updater(prev))),
    loading,
    visibleEvents,
    getJoinedChoices,
    hasJoinedRegularEvent,
    hasJoinedTournamentChoice,
    hasJoinedAnyTournament,
    isFullyJoinedEvent,
  };
}
