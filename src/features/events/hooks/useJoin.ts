import { useEffect, useMemo, useState } from 'react';
import { addDoc, collection, getDocs, query, updateDoc, doc, where } from 'firebase/firestore';
import { NavigateFunction } from 'react-router-dom';
import { auth, db, analyticsPromise } from '../../../lib/firebase';
import { logEvent } from 'firebase/analytics';
import { TennisEvent } from '../../../types';
import { TournamentMatch } from '../../../pages/tournament/types';
import { BYE, PLAYER_LOADING, parseDateValue } from '../../../pages/tournament/utils';
import { isTournamentEvent, isSeasonOpener, isWeekendMatchdaysEvent } from '../../../utils/eventTypes';
import { DisplayEvent } from '../services/eventService';
import { INITIAL_JOIN_FORM, JoinFormState, SlotResult } from '../types';

export const LOGIN_ROUTE = '/login?returnTo=%2Fevents&intent=join-event';
export const SIGNUP_ROUTE = '/signup?returnTo=%2Fevents&intent=join-event';

interface Params {
  user: { uid: string; email: string | null } | null;
  profile: { user: { name: string }; stats: { skill_level: number } } | null;
  navigate: NavigateFunction;
  hasJoinedRegularEvent: (id: string) => boolean;
  hasJoinedTournamentChoice: (id: string, choice: 'Singles' | 'Doubles') => boolean;
  hasJoinedAnyTournament: () => boolean;
}

export function useJoin({ user, profile, navigate, hasJoinedRegularEvent, hasJoinedTournamentChoice, hasJoinedAnyTournament }: Params) {
  const [selectedEvent, setSelectedEvent] = useState<DisplayEvent | null>(null);
  const [joinForm, setJoinForm] = useState<JoinFormState>(INITIAL_JOIN_FORM);
  const [joinError, setJoinError] = useState('');
  const [joining, setJoining] = useState(false);
  const [tournamentMatches, setTournamentMatches] = useState<TournamentMatch[]>([]);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [slotFallbackConfirmed, setSlotFallbackConfirmed] = useState(false);

  const participantName = profile?.user.name?.trim() || user?.email || '';

  // Runs on ANY change of which event is selected — including switching directly from one
  // event to another without passing through null (e.g. clicking "Join Event" on a different
  // card while one is already expanded). Clearing joinForm/tournamentMatches here (rather than
  // only when selectedEvent becomes null) prevents the previous event's division/matches from
  // ever being used to compute slotStatus or get submitted against the newly selected event.
  useEffect(() => {
    setJoinForm(INITIAL_JOIN_FORM);
    setJoinError('');
    setTournamentMatches([]);

    if (!selectedEvent || !isTournamentEvent(selectedEvent)) { setLoadingMatches(false); return; }

    let cancelled = false;
    setLoadingMatches(true);
    getDocs(query(collection(db, 'tournament_matches'), where('event_id', '==', selectedEvent.id)))
      .then((snap) => {
        if (cancelled) return;
        setTournamentMatches(snap.docs.map((d) => ({ id: d.id, ...d.data() } as TournamentMatch)));
      })
      .finally(() => { if (!cancelled) setLoadingMatches(false); });
    return () => { cancelled = true; };
  }, [selectedEvent?.id]);

  useEffect(() => { setSlotFallbackConfirmed(false); }, [joinForm.division, joinForm.tournamentChoice]);

  useEffect(() => {
    if (!joinError) return;
    const t = setTimeout(() => setJoinError(''), 30_000);
    return () => clearTimeout(t);
  }, [joinError]);

  const slotStatus = useMemo((): SlotResult | null => {
    if (!selectedEvent || !isTournamentEvent(selectedEvent) || !joinForm.division || tournamentMatches.length === 0) return null;

    // RR draws fill every slot with a real player at generation, so there are no open
    // slots to "find" — placement happens by (re)grouping the participant list, not by
    // seating into empty slots. Never gate RR registration on slot availability.
    if (selectedEvent.tournament_format === 'rr' || tournamentMatches.some((m) => m.format === 'rr')) return null;

    const isOpenSlot = (name: string) => name === PLAYER_LOADING || name === BYE;

    // Match a draw slot — `div` is what the user selected; also accept 'All' in Firestore
    // (consolidated/merged draws store division as 'All' rather than the specific gender).
    const findSlot = (tc: string, div: string, group: string) => {
      for (const m of tournamentMatches) {
        if (m.tournament_choice !== tc) continue;
        if (m.division !== div && m.division !== 'All') continue;
        if (m.skill_group !== group) continue;
        if (isOpenSlot(m.player_1_name)) return { match: m, slot: 'player_1' as const };
        if (isOpenSlot(m.player_2_name)) return { match: m, slot: 'player_2' as const };
      }
      return null;
    };

    if (joinForm.tournamentChoice === 'Singles') {
      const skill = Number(profile?.stats.skill_level || 0);
      const intendedGroup = skill >= 4 ? 'Masters' : 'Challengers';
      const altGroup = skill >= 4 ? 'Challengers' : 'Masters';
      // Merged draw: skill_group 'All', division matches selected or 'All'
      const mergedDraw = tournamentMatches.some(
        (m) => m.tournament_choice === 'Singles' &&
          (m.division === joinForm.division || m.division === 'All') &&
          m.skill_group === 'All',
      );
      if (mergedDraw) {
        const slot = findSlot('Singles', joinForm.division, 'All');
        return slot ? { status: 'available', ...slot, skillOverride: skill } : { status: 'full', skillOverride: skill };
      }
      const intended = findSlot('Singles', joinForm.division, intendedGroup);
      if (intended) return { status: 'available', ...intended, skillOverride: skill };
      const alt = findSlot('Singles', joinForm.division, altGroup);
      if (alt) return { status: 'fallback', ...alt, skillOverride: altGroup === 'Masters' ? 4 : 3, intendedGroup, actualGroup: altGroup };
      return { status: 'full', skillOverride: skill };
    }

    if (joinForm.tournamentChoice === 'Doubles') {
      const skill = Number(joinForm.combinedSkill || 0);
      const consolidated = tournamentMatches.some(
        (m) => m.tournament_choice === 'Doubles' && (m.division === 'All' || m.division === joinForm.division),
      );
      if (consolidated) {
        const slot = findSlot('Doubles', 'All', 'All') ?? findSlot('Doubles', joinForm.division, 'All');
        return slot ? { status: 'available', ...slot, skillOverride: skill } : { status: 'full', skillOverride: skill };
      }
      const slot = findSlot('Doubles', joinForm.division, 'All');
      return slot ? { status: 'available', ...slot, skillOverride: skill } : { status: 'full', skillOverride: skill };
    }

    return null;
  }, [selectedEvent, tournamentMatches, joinForm.division, joinForm.tournamentChoice, joinForm.combinedSkill, profile]);

  const handleStartJoin = (event: DisplayEvent) => {
    if (!user) { navigate(LOGIN_ROUTE); return; }
    setSelectedEvent(event);
    setJoinError('');
  };

  const handleSubmitJoin = async () => {
    if (!selectedEvent || !user) return;

    // Defense in depth: the UI disables submit while matches are loading, but never act on a
    // tournament event's slotStatus/matches before they've actually loaded for THIS event.
    if (isTournamentEvent(selectedEvent) && loadingMatches) return;

    if (hasJoinedTournamentChoice(selectedEvent.id, joinForm.tournamentChoice)) {
      setJoinError(`You are already registered for ${joinForm.tournamentChoice.toLowerCase()} in this event.`);
      return;
    }

    if (!isTournamentEvent(selectedEvent)) {
      if (hasJoinedRegularEvent(selectedEvent.id)) { setJoinError('You are already registered for this event.'); return; }
      if (isWeekendMatchdaysEvent(selectedEvent) && !hasJoinedAnyTournament()) { setJoinError('Please join a tournament before joining matchdays.'); return; }
      setJoining(true);
      try {
        await addDoc(collection(db, 'event_participants'), {
          user_id: user.uid, user_name: participantName,
          event_id: selectedEvent.id, event_name: selectedEvent.title,
          tournament_choice: '', doubles: '', partner_in_app: '',
          skill: Number(profile?.stats.skill_level || 0), dateselected: [],
          createdAt: new Date().toISOString(),
        });
        analyticsPromise.then((analytics) => {
          if (!analytics) return;
          logEvent(analytics, 'join_event', {
            event_id:   selectedEvent.id,
            event_name: selectedEvent.title,
            event_type: selectedEvent.type,
          });
        });
        setSelectedEvent(null);
      } catch { setJoinError('Could not join the event right now. Please try again.'); }
      finally { setJoining(false); }
      return;
    }

    if (!joinForm.division) { setJoinError('Please select a division.'); return; }
    if (joinForm.tournamentChoice === 'Singles' && joinForm.division === 'Mixed Doubles') { setJoinError('Mixed Doubles is locked for singles.'); return; }
    if (joinForm.tournamentChoice === 'Doubles') {
      if (!joinForm.partnerName.trim()) { setJoinError('Please enter your partner name for doubles.'); return; }
      if (joinForm.partnerName.trim().length < 3 || joinForm.partnerName.length > 80) { setJoinError('Partner name must be 3–80 characters.'); return; }
      if (/\d/.test(joinForm.partnerName)) { setJoinError('Partner name cannot contain numbers.'); return; }
    }
    if (slotStatus?.status === 'full') { setJoinError(`The ${joinForm.tournamentChoice === 'Doubles' ? 'Doubles' : `${joinForm.division} Singles`} draw is full.`); return; }
    if (slotStatus?.status === 'fallback' && !slotFallbackConfirmed) { setJoinError('Please confirm the draw assignment above.'); return; }

    setJoining(true);
    setJoinError('');
    try {
      const isWeekend = isWeekendMatchdaysEvent(selectedEvent);
      const dateselected = (() => {
        if (isWeekend) return joinForm.dateselected;
        if (isSeasonOpener(selectedEvent)) {
          const d = parseDateValue(selectedEvent.start_date || selectedEvent.startDate || selectedEvent.date);
          return d ? [`May ${d.getDate()}, ${d.getFullYear()}`] : [];
        }
        return [];
      })();

      await addDoc(collection(db, 'event_participants'), {
        user_id: user.uid, user_name: participantName,
        event_id: selectedEvent.id, event_name: selectedEvent.title,
        tournament_choice: joinForm.tournamentChoice, division: joinForm.division,
        doubles: joinForm.tournamentChoice === 'Doubles' ? joinForm.partnerName.trim() : '',
        partner_in_app: joinForm.tournamentChoice === 'Doubles' ? (joinForm.partnerInApp || 'no') : '',
        skill: slotStatus?.skillOverride ?? (joinForm.tournamentChoice === 'Singles' ? Number(profile?.stats.skill_level || 0) : Number(joinForm.combinedSkill || 3)),
        dateselected, createdAt: new Date().toISOString(),
      });
      analyticsPromise.then((analytics) => {
        if (!analytics) return;
        logEvent(analytics, 'join_event', {
          event_id:   selectedEvent.id,
          event_name: selectedEvent.title,
          event_type: selectedEvent.type,
        });
      });

      // Best-effort: seating a player into a match slot is organizer-only (Firestore
      // rules). For regular players this is skipped silently and the organizer seats
      // them via the draw — the registration above has already succeeded.
      if (slotStatus?.match && slotStatus.slot) {
        try {
          await updateDoc(doc(db, 'tournament_matches', slotStatus.match.id), {
            [`${slotStatus.slot}_name`]: participantName,
            [`${slotStatus.slot}_user_id`]: user.uid,
            [`${slotStatus.slot}_contact`]: user.email || '',
          });
        } catch {
          /* player not permitted to seat themselves; organizer will place them */
        }
      }
      setSelectedEvent(null);
    } catch { setJoinError('Could not join the event right now. Please try again.'); }
    finally { setJoining(false); }
  };

  return {
    selectedEvent, setSelectedEvent,
    joinForm, setJoinForm,
    joinError,
    joining, slotStatus, loadingMatches,
    slotFallbackConfirmed, setSlotFallbackConfirmed,
    handleStartJoin, handleSubmitJoin,
  };
}
