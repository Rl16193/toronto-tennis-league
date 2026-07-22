import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { useAuth } from '../../../context/AuthContext';
import { TennisEvent } from '../../../types';
import { isLadderEvent, isTopspinMeetupEvent, isTournamentEvent, isWeekendMatchdaysEvent } from '../../../utils/eventTypes';
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

  const allDisplayableEvents = useMemo(
    () => events.filter((e) => !isTopspinMeetupEvent(e) && !isWeekendMatchdaysEvent(e)),
    [events],
  );

  const visibleEvents = useMemo(() => {
    const now = Date.now();
    return allDisplayableEvents.filter((e) => {
      const raw = e as unknown as Record<string, unknown>;
      const rawEnd = raw.endDate ?? raw.end_date;
      if (rawEnd) {
        let endMs: number | null = null;
        if (typeof rawEnd === 'string') endMs = new Date(rawEnd).getTime();
        else if (typeof rawEnd === 'object' && rawEnd !== null) {
          const obj = rawEnd as Record<string, unknown>;
          if (typeof obj['toDate'] === 'function') endMs = (obj['toDate'] as () => Date)().getTime();
          else if (typeof obj['seconds'] === 'number') endMs = (obj['seconds'] as number) * 1000;
        }
        if (endMs !== null && endMs < now) return false;
      }
      if (!isTournamentEvent(e) && !isLadderEvent(e)) {
        const rawStart = raw.startDate ?? raw.start_date ?? raw.date;
        if (rawStart) {
          let startMs: number | null = null;
          if (typeof rawStart === 'string') startMs = new Date(rawStart).getTime();
          else if (typeof rawStart === 'object' && rawStart !== null) {
            const obj = rawStart as Record<string, unknown>;
            if (typeof obj['toDate'] === 'function') startMs = (obj['toDate'] as () => Date)().getTime();
            else if (typeof obj['seconds'] === 'number') startMs = (obj['seconds'] as number) * 1000;
          }
          if (startMs !== null && startMs < now) return false;
        }
      }
      return true;
    });
  }, [allDisplayableEvents]);

  const getJoinedChoices = (eventId: string) =>
    new Set(joinedRegistrations.filter((r) => r.eventId === eventId && r.tournamentChoice).map((r) => r.tournamentChoice));

  const hasJoinedRegularEvent = (eventId: string) =>
    joinedRegistrations.some((r) => r.eventId === eventId && !r.tournamentChoice);

  const hasJoinedTournamentChoice = (eventId: string, choice: 'Singles' | 'Doubles') =>
    joinedRegistrations.some((r) => r.eventId === eventId && r.tournamentChoice === choice);

  const hasJoinedAnyTournament = () =>
    joinedRegistrations.some((r) => r.tournamentChoice === 'Singles' || r.tournamentChoice === 'Doubles');

  const isFullyJoinedEvent = (event: TennisEvent) => {
    if (!isTournamentEvent(event)) return hasJoinedRegularEvent(event.id);
    if (event.tournament_choice === 'Singles') return hasJoinedTournamentChoice(event.id, 'Singles');
    if (event.tournament_choice === 'Doubles') return hasJoinedTournamentChoice(event.id, 'Doubles');
    return getJoinedChoices(event.id).has('Singles') && getJoinedChoices(event.id).has('Doubles');
  };

  return {
    events,
    setEvents: (updater: (prev: DisplayEvent[]) => DisplayEvent[]) =>
      setEvents((prev) => sortEventsByStartDate(updater(prev))),
    loading,
    allDisplayableEvents,
    visibleEvents,
    getJoinedChoices,
    hasJoinedRegularEvent,
    hasJoinedTournamentChoice,
    hasJoinedAnyTournament,
    isFullyJoinedEvent,
  };
}
