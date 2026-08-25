import { useEffect, useMemo, useState } from 'react';
import { analyticsPromise } from '../../../lib/firebase';
import { logEvent } from 'firebase/analytics';
import { SlotResult } from '../types';
import { isTournamentEvent, isSeasonOpener, isWeekendMatchdaysEvent } from '../../../utils/eventTypes';
import { isSeniorsLeague } from '../../../utils/skillLevels';
import { parseValidDate, type FirestoreDateLike } from '../../../utils/eventDates';
import { DisplayEvent } from '../services/eventService';
import { createEventParticipant } from '../services/eventRepository';
import type { EventParticipantWrite } from '../services/eventParticipant';
import { INITIAL_JOIN_FORM, JoinFormState } from '../types';

interface Params {
  user: { uid: string; email: string | null } | null;
  // `preferences.preferred_zone` decides which zone's bracket a late joiner may be seated into
  // once an event has zones enabled.
  profile: {
    user: { name: string };
    stats: { skill_level: number; league?: string };
    preferences?: { preferred_zone?: string };
  } | null;
  hasJoinedRegularEvent: (id: string) => boolean;
  hasJoinedTournamentChoice: (id: string, choice: 'Singles' | 'Doubles') => boolean;
  hasJoinedAnyTournament: () => boolean;
}

export function useJoin({
  user,
  profile,
  hasJoinedRegularEvent,
  hasJoinedTournamentChoice,
  hasJoinedAnyTournament,
}: Params) {
  const [selectedEvent, setSelectedEvent] = useState<DisplayEvent | null>(null);
  const [joinForm, setJoinForm] = useState<JoinFormState>(INITIAL_JOIN_FORM);
  const [joinError, setJoinError] = useState('');
  const [joining, setJoining] = useState(false);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [slotFallbackConfirmed, setSlotFallbackConfirmed] = useState(false);

  const participantName = profile?.user.name?.trim() || user?.email || '';

  // Runs on any event selection so stale registration choices cannot carry to another event.
  useEffect(() => {
    // Seed the format from the event rather than always starting at Singles. An event with a
    // locked `tournament_choice` has exactly one valid format, and the sheet no longer offers a
    // choice for those — starting at Singles and correcting it later from inside the sheet is
    // what let a Doubles registration get saved as Singles.
    setJoinForm({
      ...INITIAL_JOIN_FORM,
      tournamentChoice: selectedEvent?.tournament_choice ?? INITIAL_JOIN_FORM.tournamentChoice,
    });
    setJoinError('');
    setLoadingMatches(false);
  }, [selectedEvent?.id]);

  useEffect(() => {
    setSlotFallbackConfirmed(false);
  }, [joinForm.division, joinForm.tournamentChoice]);

  useEffect(() => {
    if (!joinError) return;
    const t = setTimeout(() => setJoinError(''), 30_000);
    return () => clearTimeout(t);
  }, [joinError]);

  // Draw capacity is deliberately not consulted during registration. The single server-side
  // participant-create trigger owns seating and prevents browser tabs from racing each other.
  const slotStatus = useMemo<SlotResult | null>(() => null, []);

  const handleSubmitJoin = async () => {
    if (!selectedEvent || !user) return;

    // The event's locked format always wins over whatever is in form state. Only an event with
    // no `tournament_choice` (older events) lets the player pick, and only those show the chips.
    const choice = selectedEvent.tournament_choice ?? joinForm.tournamentChoice;

    if (hasJoinedTournamentChoice(selectedEvent.id, choice)) {
      setJoinError(`You are already registered for ${choice.toLowerCase()} in this event.`);
      return;
    }

    const trackJoin = () =>
      analyticsPromise.then((analytics) => {
        if (!analytics) return;
        logEvent(analytics, 'join_event', {
          event_id: selectedEvent.id,
          event_name: selectedEvent.title,
          event_type: selectedEvent.type,
        });
      });

    if (!isTournamentEvent(selectedEvent)) {
      if (hasJoinedRegularEvent(selectedEvent.id)) {
        setJoinError('You are already registered for this event.');
        return;
      }
      if (isWeekendMatchdaysEvent(selectedEvent) && !hasJoinedAnyTournament()) {
        setJoinError('Please join a tournament before joining matchdays.');
        return;
      }
      setJoining(true);
      try {
        const participant: EventParticipantWrite = {
          uid: user.uid,
          user_name: participantName,
          event_id: selectedEvent.id,
          event_name: selectedEvent.title,
          tournament_choice: '',
          doubles: '',
          partner_in_app: '',
          skill: Number(profile?.stats.skill_level || 0),
          zone: profile?.preferences?.preferred_zone || joinForm.preferredZone || undefined,
          status: 'active',
          dateselected: [],
          created_at: new Date().toISOString(),
        };
        await createEventParticipant(participant);
        trackJoin();
        setSelectedEvent(null);
      } catch {
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
    if (selectedEvent.zones?.length && !profile?.preferences?.preferred_zone && !joinForm.preferredZone) {
      setJoinError('Choose a zone before joining this event.');
      return;
    }
    if (choice === 'Singles' && joinForm.division === 'Mixed Doubles') {
      setJoinError('Mixed Doubles is locked for singles.');
      return;
    }
    // Retired Pro draw is gated on the player's League selection (Profile → League).
    if (joinForm.seniors && !isSeniorsLeague(profile?.stats.league)) {
      setJoinError('The Retired Pro draw is for players in the Retired Pro league. Set it on your profile first.');
      return;
    }
    // Keyed on `choice`, not form state — this check silently never ran for the registrations
    // that were saved as Singles despite the player filling in a Doubles form, which is why they
    // all have an empty partner field.
    if (choice === 'Doubles' && joinForm.partnerName.trim()) {
      if (joinForm.partnerName.trim().length < 3 || joinForm.partnerName.length > 80) {
        setJoinError('Partner name must be 3–80 characters.');
        return;
      }
      if (/\d/.test(joinForm.partnerName)) {
        setJoinError('Partner name cannot contain numbers.');
        return;
      }
    }
    if (slotStatus?.status === 'full') {
      setJoinError('No empty spots left.');
      return;
    }
    if (slotStatus?.status === 'fallback' && !slotFallbackConfirmed) {
      setJoinError('Please confirm the draw assignment above.');
      return;
    }

    setJoining(true);
    setJoinError('');
    try {
      const isWeekend = isWeekendMatchdaysEvent(selectedEvent);
      const dateselected = (() => {
        if (isWeekend) return joinForm.dateselected;
        if (isSeasonOpener(selectedEvent)) {
          const d = parseValidDate(
            (selectedEvent.start_date || selectedEvent.startDate || selectedEvent.date) as FirestoreDateLike,
          );
          return d ? [`May ${d.getDate()}, ${d.getFullYear()}`] : [];
        }
        return [];
      })();

      const participant: EventParticipantWrite = {
        uid: user.uid,
        user_name: participantName,
        event_id: selectedEvent.id,
        event_name: selectedEvent.title,
        tournament_choice: choice,
        division: joinForm.division,
        ...(choice === 'Singles' && joinForm.seniors ? { skill_group: 'Retired Pro' } : {}),
        doubles: choice === 'Doubles' ? joinForm.partnerName.trim() : '',
        partner_in_app: choice === 'Doubles' ? joinForm.partnerInApp || 'no' : '',
        partner_uid: choice === 'Doubles' ? joinForm.partnerUid : '',
        partner_name: choice === 'Doubles' && !joinForm.partnerUid ? joinForm.partnerName.trim() : undefined,
        zone: profile?.preferences?.preferred_zone || joinForm.preferredZone || undefined,
        status: 'active',
        skill: choice === 'Singles' ? Number(profile?.stats.skill_level || 0) : Number(joinForm.combinedSkill || 3),
        dateselected,
        created_at: new Date().toISOString(),
      };
      await createEventParticipant(participant);
      trackJoin();

      setSelectedEvent(null);
    } catch {
      setJoinError('Could not join the event right now. Please try again.');
    } finally {
      setJoining(false);
    }
  };

  return {
    selectedEvent,
    setSelectedEvent,
    joinForm,
    setJoinForm,
    joinError,
    joining,
    slotStatus,
    loadingMatches,
    slotFallbackConfirmed,
    setSlotFallbackConfirmed,
    handleSubmitJoin,
  };
}
