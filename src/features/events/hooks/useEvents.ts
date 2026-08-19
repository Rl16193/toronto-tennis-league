import { useEffect, useMemo, useRef, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { useAuth } from '../../../context/AuthContext';
import { TennisEvent } from '../../../types';
import { isLadderEvent, isTopspinMeetupEvent, isTournamentEvent, isWeekendMatchdaysEvent } from '../../../utils/eventTypes';
import { parseEndInstant, parseValidDate, sortEventsByStartDate, type FirestoreDateLike } from '../../../utils/eventDates';
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

  // Resolve Storage image paths to download URLs, once each.
  //
  // Deliberately keyed on the *list of unresolved paths*, not on `events`. This effect writes to
  // `events`, so depending on the array meant every single resolution re-ran the effect, whose
  // cleanup cancelled the other in-flight fetches and immediately re-issued them — roughly n²/2
  // Storage round-trips for n images. `resolvingRef` then keeps a path from being requested twice
  // even as the key legitimately changes, and makes a path that resolves to nothing stay done
  // instead of being retried on every later pass.
  const resolvingRef = useRef(new Set<string>());
  const unresolvedKey = events.filter((e) => e.imagePath && !e.image).map((e) => e.imagePath).join('|');

  useEffect(() => {
    const paths = unresolvedKey ? unresolvedKey.split('|') : [];
    const todo = paths.filter((p) => !resolvingRef.current.has(p));
    if (todo.length === 0) return;
    todo.forEach((path) => resolvingRef.current.add(path));

    let cancelled = false;
    todo.forEach((path) => {
      resolveStorageUrl(path).then((url) => {
        if (cancelled || !url) return;
        setEvents((prev) => prev.map((e) => e.imagePath === path ? { ...e, image: url, imagePath: undefined } : e));
      }).catch(() => { /* image stays unset; the card renders its placeholder */ });
    });
    return () => { cancelled = true; };
  }, [unresolvedKey]);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'event_participants'), where('uid', '==', user.uid));
    return onSnapshot(q, (snap) => {
      setJoinedRegistrations(snap.docs.map((d) => {
        const data = d.data();
        return { eventId: data.event_id, tournamentChoice: (data.tournament_choice || '') as JoinedRegistration['tournamentChoice'] };
      }));
    });
    // `user?.uid`: a new User object arrives on every token refresh, needlessly re-subscribing.
  }, [user?.uid]);

  const allDisplayableEvents = useMemo(
    () => events.filter((e) => !isTopspinMeetupEvent(e) && !isWeekendMatchdaysEvent(e)),
    [events],
  );

  const visibleEvents = useMemo(() => {
    const now = Date.now();
    // These used to hand-roll their own date parsing with `new Date(str)`, which reads a plain
    // "YYYY-MM-DD" as UTC midnight — in Toronto that's 8pm the previous evening, so an event
    // disappeared from this page most of a day before it ended. parseValidDate/parseEndInstant
    // handle the date-only case as local time, and treat an end date as end-of-day.
    return allDisplayableEvents.filter((e) => {
      const raw = e as unknown as Record<string, unknown>;
      const rawEnd = (raw.endDate ?? raw.end_date) as FirestoreDateLike;
      if (rawEnd) {
        const endMs = parseEndInstant(rawEnd)?.getTime() ?? null;
        if (endMs !== null && endMs < now) return false;
      }
      if (!isTournamentEvent(e) && !isLadderEvent(e)) {
        const rawStart = (raw.startDate ?? raw.start_date ?? raw.date) as FirestoreDateLike;
        if (rawStart) {
          const startMs = parseValidDate(rawStart)?.getTime() ?? null;
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
