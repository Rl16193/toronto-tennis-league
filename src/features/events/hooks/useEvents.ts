import { useEffect, useMemo, useRef, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { useAuth } from '../../../context/AuthContext';
import { TennisEvent } from '../../../types';
import { isTopspinMeetupEvent, isTournamentEvent, isWeekendMatchdaysEvent } from '../../../utils/eventTypes';
import { isCurrentEvent, sortEventsByStartDate } from '../../../utils/eventDates';
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
  // "Still mounted?" is a REF, not a per-run `cancelled` local, and that distinction is the whole
  // bug this once had. A per-run flag meant the FIRST image to come back changed `unresolvedKey`,
  // which re-ran the effect, whose cleanup then cancelled every other fetch still in flight — and
  // `resolvingRef` had already marked those paths done, so they never retried. Exactly one event
  // got its picture and every other card silently rendered blank. Only unmounting may stop a
  // resolution; a sibling finishing first must not.
  const resolvingRef = useRef(new Set<string>());
  const aliveRef = useRef(true);
  // Set on the way IN as well as cleared on the way out. StrictMode mounts, unmounts and
  // remounts in development, so a cleanup-only effect leaves the flag stuck false after that
  // cycle and every resolved image is thrown away — no posters at all, which is worse than the
  // race this replaced.
  useEffect(() => {
    aliveRef.current = true;
    return () => { aliveRef.current = false; };
  }, []);

  const unresolvedKey = events.filter((e) => e.imagePath && !e.image).map((e) => e.imagePath).join('|');

  useEffect(() => {
    const paths = unresolvedKey ? unresolvedKey.split('|') : [];
    // Deduped: two events can share one poster (both Summer Gauntlet draws do), and that is one
    // file, not two round-trips.
    const todo = [...new Set(paths)].filter((p) => !resolvingRef.current.has(p));
    if (todo.length === 0) return;
    todo.forEach((path) => resolvingRef.current.add(path));

    todo.forEach((path) => {
      resolveStorageUrl(path).then((url) => {
        if (!aliveRef.current || !url) return;
        setEvents((prev) => prev.map((e) => e.imagePath === path ? { ...e, image: url, imagePath: undefined } : e));
      }).catch(() => { /* image stays unset; the card renders without a banner */ });
    });
  }, [unresolvedKey]);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'event_participants'), where('uid', '==', user.uid));
    return onSnapshot(q, (snap) => {
      // A row the organizer removed (`removal: true`) no longer counts as joined, so the player can
      // register again; rejoining adds a fresh row and the removed one stays as the record.
      setJoinedRegistrations(snap.docs.filter((d) => d.data().removal !== true).map((d) => {
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

  // `isCurrentEvent` (eventDates.ts) is shared with the homepage's Upcoming Events strip — it
  // carries the timezone fix for date-only values, so never re-implement it at a call site.
  const visibleEvents = useMemo(() => {
    const now = Date.now();
    return allDisplayableEvents.filter((e) => isCurrentEvent(e, now));
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
