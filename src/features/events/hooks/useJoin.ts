import { useEffect, useMemo, useState } from 'react';
import { addDoc, arrayUnion, collection, getDocs, query, updateDoc, doc, where } from 'firebase/firestore';
import { db, analyticsPromise } from '../../../lib/firebase';
import { logEvent } from 'firebase/analytics';
import { TennisEvent } from '../../../types';
import { TournamentMatch } from '../../../pages/tournament/types';
import { BYE, PLAYER_LOADING, parseDateValue, zoneBucketFor } from '../../../pages/tournament/utils';
import { isTournamentEvent, isSeasonOpener, isWeekendMatchdaysEvent } from '../../../utils/eventTypes';
import { isSeniorsLeague } from '../../../utils/skillLevels';
import { DisplayEvent } from '../services/eventService';
import { INITIAL_JOIN_FORM, JoinFormState, SlotResult } from '../types';

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

export function useJoin({ user, profile, hasJoinedRegularEvent, hasJoinedTournamentChoice, hasJoinedAnyTournament }: Params) {
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
    // Seed the format from the event rather than always starting at Singles. An event with a
    // locked `tournament_choice` has exactly one valid format, and the sheet no longer offers a
    // choice for those — starting at Singles and correcting it later from inside the sheet is
    // what let a Doubles registration get saved as Singles.
    setJoinForm({
      ...INITIAL_JOIN_FORM,
      tournamentChoice: selectedEvent?.tournament_choice ?? INITIAL_JOIN_FORM.tournamentChoice,
    });
    setJoinError('');
    setTournamentMatches([]);

    if (!selectedEvent || !isTournamentEvent(selectedEvent)) { setLoadingMatches(false); return; }

    let cancelled = false;
    setLoadingMatches(true);
    getDocs(query(collection(db, 'matches'), where('event_id', '==', selectedEvent.id), where('category', 'in', ['singles', 'doubles'])))
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

    // With zones on, a late joiner may only take a slot in THEIR zone's bracket — the whole point
    // of splitting by zone is that you don't get sent across the city. Zones off: no restriction.
    const zoneCfg = selectedEvent.zone_draw_config;
    const myZone = zoneCfg?.enabled
      ? zoneBucketFor(profile?.preferences?.preferred_zone, zoneCfg)
      : undefined;

    // Match a draw slot — `div` is what the user selected; also accept 'All' in Firestore
    // (consolidated/merged draws store division as 'All' rather than the specific gender).
    const findSlot = (tc: string, div: string, group: string) => {
      for (const m of tournamentMatches) {
        if (m.tournament_choice !== tc) continue;
        if (m.division !== div && m.division !== 'All') continue;
        if (m.skill_group !== group) continue;
        if (myZone && (m.zone ?? undefined) !== myZone) continue;
        if (isOpenSlot(m.player_1_name)) return { match: m, slot: 'player_1' as const };
        if (isOpenSlot(m.player_2_name)) return { match: m, slot: 'player_2' as const };
      }
      return null;
    };

    if (joinForm.tournamentChoice === 'Singles') {
      const skill = Number(profile?.stats.skill_level || 0);
      // Retired Pro is a deliberate opt-in — no skill fallback into another draw.
      if (joinForm.seniors) {
        const slot = findSlot('Singles', joinForm.division, 'Retired Pro');
        return slot ? { status: 'available', ...slot, skillOverride: skill } : { status: 'full', skillOverride: skill };
      }
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
  }, [selectedEvent, tournamentMatches, joinForm.division, joinForm.tournamentChoice, joinForm.seniors, joinForm.combinedSkill, profile]);

  const handleSubmitJoin = async () => {
    if (!selectedEvent || !user) return;

    // Defense in depth: the UI disables submit while matches are loading, but never act on a
    // tournament event's slotStatus/matches before they've actually loaded for THIS event.
    if (isTournamentEvent(selectedEvent) && loadingMatches) return;

    // The event's locked format always wins over whatever is in form state. Only an event with
    // no `tournament_choice` (older events) lets the player pick, and only those show the chips.
    const choice = selectedEvent.tournament_choice ?? joinForm.tournamentChoice;

    if (hasJoinedTournamentChoice(selectedEvent.id, choice)) {
      setJoinError(`You are already registered for ${choice.toLowerCase()} in this event.`);
      return;
    }

    const trackJoin = () => analyticsPromise.then((analytics) => {
      if (!analytics) return;
      logEvent(analytics, 'join_event', {
        event_id:   selectedEvent.id,
        event_name: selectedEvent.title,
        event_type: selectedEvent.type,
      });
    });

    if (!isTournamentEvent(selectedEvent)) {
      if (hasJoinedRegularEvent(selectedEvent.id)) { setJoinError('You are already registered for this event.'); return; }
      if (isWeekendMatchdaysEvent(selectedEvent) && !hasJoinedAnyTournament()) { setJoinError('Please join a tournament before joining matchdays.'); return; }
      setJoining(true);
      try {
        await addDoc(collection(db, 'event_participants'), {
          uid: user.uid, user_name: participantName,
          event_id: selectedEvent.id, event_name: selectedEvent.title,
          tournament_choice: '', doubles: '', partner_in_app: '',
          skill: Number(profile?.stats.skill_level || 0), dateselected: [],
          created_at: new Date().toISOString(),
        });
        trackJoin();
        setSelectedEvent(null);
      } catch { setJoinError('Could not join the event right now. Please try again.'); }
      finally { setJoining(false); }
      return;
    }

    if (!joinForm.division) { setJoinError('Please select a division.'); return; }
    if (choice === 'Singles' && joinForm.division === 'Mixed Doubles') { setJoinError('Mixed Doubles is locked for singles.'); return; }
    // Retired Pro draw is gated on the player's League selection (Profile → League).
    if (joinForm.seniors && !isSeniorsLeague(profile?.stats.league)) {
      setJoinError('The Retired Pro draw is for players in the Retired Pro league. Set it on your profile first.');
      return;
    }
    // Keyed on `choice`, not form state — this check silently never ran for the registrations
    // that were saved as Singles despite the player filling in a Doubles form, which is why they
    // all have an empty partner field.
    if (choice === 'Doubles') {
      if (!joinForm.partnerName.trim()) { setJoinError('Please enter your partner name for doubles.'); return; }
      if (joinForm.partnerName.trim().length < 3 || joinForm.partnerName.length > 80) { setJoinError('Partner name must be 3–80 characters.'); return; }
      if (/\d/.test(joinForm.partnerName)) { setJoinError('Partner name cannot contain numbers.'); return; }
    }
    if (slotStatus?.status === 'full') { setJoinError('No empty spots left.'); return; }
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
        uid: user.uid, user_name: participantName,
        event_id: selectedEvent.id, event_name: selectedEvent.title,
        tournament_choice: choice, division: joinForm.division,
        ...(choice === 'Singles' && joinForm.seniors ? { skill_group: 'Retired Pro' } : {}),
        doubles: choice === 'Doubles' ? joinForm.partnerName.trim() : '',
        partner_in_app: choice === 'Doubles' ? (joinForm.partnerInApp || 'no') : '',
        partner_uid: choice === 'Doubles' ? joinForm.partnerUid : '',
        skill: slotStatus?.skillOverride ?? (choice === 'Singles' ? Number(profile?.stats.skill_level || 0) : Number(joinForm.combinedSkill || 3)),
        dateselected, created_at: new Date().toISOString(),
      });
      trackJoin();

      // Best-effort: seating a player into a match slot is organizer-only (Firestore
      // rules). For regular players this is skipped silently and the organizer seats
      // them via the draw — the registration above has already succeeded.
      if (slotStatus?.match && slotStatus.slot) {
        try {
          await updateDoc(doc(db, 'matches', slotStatus.match.id), {
            [`${slotStatus.slot}_name`]: participantName,
            [`${slotStatus.slot}_uid`]: user.uid,
          });
        } catch (err) {
          // Expected for ordinary players (organizer-only by rules) — but it also fires when an
          // ORGANIZER joins their own event and the write genuinely fails, in which case they'd
          // be told they joined while their slot stayed empty. Log it so that case is
          // diagnosable rather than invisible; the registration itself already succeeded.
          console.warn('Could not seat player into draw slot; organizer will place them.', err);
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
    handleSubmitJoin,
  };
}
