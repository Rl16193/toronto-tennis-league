import { useEffect, useMemo, useState } from 'react';
import { Timestamp, collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { db, analyticsPromise } from '../../../lib/firebase';
import { logEvent } from 'firebase/analytics';
import { BYE, PLAYER_LOADING, resolveZoneConfig, zoneBucketFor } from '../../../pages/tournament/utils';
import { isDoublesEvent, isTournamentEvent, isWeekendMatchdaysEvent } from '../../../utils/eventTypes';
import { isSeniorsLeague, leagueDivision } from '../../../utils/skillLevels';
import { guestUid } from '../../../utils/guest';
import { DisplayEvent } from '../services/eventService';
import { INITIAL_JOIN_FORM, JoinFormState, SlotResult } from '../types';

interface Params {
  user: { uid: string; email: string | null } | null;
  // `preferences.preferred_zone` decides which zone's bracket has an open spot for a late joiner
  // once an event has zones enabled.
  profile: {
    user: { name: string };
    stats: { skill_level: number; league?: string };
    preferences?: { preferred_zone?: string; preferred_courts?: string[]; custom_courts?: string[] };
  } | null;
  hasJoinedEvent: (id: string) => boolean;
  hasJoinedAnyTournament: () => boolean;
}

/** The fields of a draw match the open-spot check reads. */
type DrawMatch = {
  id: string; sub_category: string; division: string; skill_group: string; zone: string; format: string;
  player_1_name: string; player_2_name: string;
};

// A doubles registration's id carries its division (firestore.rules checks the pattern).
const DOUBLES_ID: Record<string, string> = { "Men's": 'mensdoubles', "Women's": 'womensdoubles', 'Mixed Doubles': 'mixeddoubles' };
const registrationId =(eventId: string, uid: string, doublesDivision?: string) =>
  `${eventId}_${uid}${doublesDivision ? `_${DOUBLES_ID[doublesDivision]}` : ''}`;

export function useJoin({ user, profile, hasJoinedEvent, hasJoinedAnyTournament }: Params) {
  const [selectedEvent, setSelectedEvent] = useState<DisplayEvent | null>(null);
  const [joinForm, setJoinForm] = useState<JoinFormState>(INITIAL_JOIN_FORM);
  const [joinError, setJoinError] = useState('');
  const [joining, setJoining] = useState(false);
  const [tournamentMatches, setTournamentMatches] = useState<DrawMatch[]>([]);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [slotFallbackConfirmed, setSlotFallbackConfirmed] = useState(false);

  const participantName = profile?.user.name?.trim() || user?.email || '';

  // Runs on ANY change of which event is selected, so the previous event's division/matches are
  // never used for the newly selected one. Singles takes the division saved on the profile.
  useEffect(() => {
    setJoinForm({
      ...INITIAL_JOIN_FORM,
      division: selectedEvent && !isDoublesEvent(selectedEvent) ? leagueDivision(profile?.stats.league) : '',
    });
    setJoinError('');
    setTournamentMatches([]);

    if (!selectedEvent || !isTournamentEvent(selectedEvent)) { setLoadingMatches(false); return; }

    let cancelled = false;
    setLoadingMatches(true);
    getDocs(query(collection(db, 'matches'), where('event_id', '==', selectedEvent.id), where('category', '==', 'tournament')))
      .then((snap) => {
        if (cancelled) return;
        setTournamentMatches(snap.docs.map((d) => ({ id: d.id, ...d.data() } as DrawMatch)));
      })
      .finally(() => { if (!cancelled) setLoadingMatches(false); });
    return () => { cancelled = true; };
  }, [selectedEvent?.id]);

  useEffect(() => { setSlotFallbackConfirmed(false); }, [joinForm.division]);

  useEffect(() => {
    if (!joinError) return;
    const t = setTimeout(() => setJoinError(''), 30_000);
    return () => clearTimeout(t);
  }, [joinError]);

  // Is there an open spot for this player? Only decides what the sheet says and the skill written;
  // the server (onParticipantSeat) does the seating itself, knockout only.
  const slotStatus = useMemo((): SlotResult | null => {
    if (!selectedEvent || !isTournamentEvent(selectedEvent) || !joinForm.division || tournamentMatches.length === 0) return null;

    // RR placement is by the organizer, never by open slots — never gate RR registration on them.
    if (selectedEvent.sub_category === 'rr' || tournamentMatches.some((m) => m.format === 'rr')) return null;

    const isOpenSlot = (name: string) => name === PLAYER_LOADING || name === BYE;

    // With zones on, a late joiner may only take a slot in THEIR zone's bracket.
    const zoneCfg = resolveZoneConfig(selectedEvent.zone_draw_config as Parameters<typeof resolveZoneConfig>[0]);
    const myZone = zoneCfg.enabled
      ? zoneBucketFor(profile?.preferences?.preferred_zone, zoneCfg)
      : undefined;

    // `div` is what the user selected; a merged draw stores division 'All'. `group` null = any.
    const hasSlot = (sub: string, div: string, group: string | null) => tournamentMatches.some((m) =>
      m.sub_category === sub &&
      (m.division === div || m.division === 'All') &&
      (group === null || m.skill_group === group) &&
      (!myZone || (m.zone || undefined) === myZone) &&
      (isOpenSlot(m.player_1_name) || isOpenSlot(m.player_2_name)));

    if (!isDoublesEvent(selectedEvent)) {
      const skill = Number(profile?.stats.skill_level || 0);
      // Retired Pro is a deliberate opt-in division — no skill fallback into another draw.
      if (joinForm.seniors) {
        return { status: hasSlot('singles', `${joinForm.division} Retired Pro`, null) ? 'available' : 'full', skillOverride: skill };
      }
      const intendedGroup = skill >= 4 ? 'Masters' : 'Challengers';
      const altGroup = skill >= 4 ? 'Challengers' : 'Masters';
      const mergedDraw = tournamentMatches.some(
        (m) => m.sub_category === 'singles' && (m.division === joinForm.division || m.division === 'All') && m.skill_group === 'All',
      );
      if (mergedDraw) return { status: hasSlot('singles', joinForm.division, 'All') ? 'available' : 'full', skillOverride: skill };
      if (hasSlot('singles', joinForm.division, intendedGroup)) return { status: 'available', skillOverride: skill };
      if (hasSlot('singles', joinForm.division, altGroup)) {
        return { status: 'fallback', skillOverride: altGroup === 'Masters' ? 4 : 3, intendedGroup, actualGroup: altGroup };
      }
      return { status: 'full', skillOverride: skill };
    }

    const skill = Number(joinForm.combinedSkill || 0);
    return { status: hasSlot('doubles', joinForm.division, 'All') ? 'available' : 'full', skillOverride: skill };
  }, [selectedEvent, tournamentMatches, joinForm.division, joinForm.seniors, joinForm.combinedSkill, profile]);

  /**
   * Writes the registration on its deterministic id. A member withdrawn from this event re-joins
   * by deleting the withdrawn row and creating it again: the rules let an owner delete their row
   * but not change its status.
   */
  const writeRegistration = async (id: string, fields: Record<string, unknown>) => {
    const ref = doc(db, 'event_participants', id);
    const existing = await getDoc(ref);
    if (existing.exists()) {
      if (existing.data().status === 'active') return 'already';
      await deleteDoc(ref);
    }
    await setDoc(ref, {
      uid: user!.uid, user_name: participantName,
      event_id: selectedEvent!.id, event_name: selectedEvent!.title,
      category: selectedEvent!.category, sub_category: selectedEvent!.sub_category,
      division: '', skill: 0, partner_uid: '', partner_name: '',
      status: 'active', withdrawn_reason: '', withdrawn_at: null, withdrawn_by: '',
      created_at: Timestamp.now(),
      ...fields,
    });
    return 'joined';
  };

  // pendingCourts: courts picked in the join sheet, saved to the profile by Join itself.
  // Resolves true once the registration is written, so a caller can confirm it.
  const handleSubmitJoin = async (pendingCourts?: { courts: string[]; save: () => Promise<boolean> }): Promise<boolean | undefined> => {
    if (!selectedEvent || !user) return;

    // Never act on a tournament's slotStatus before its matches have loaded for THIS event.
    if (isTournamentEvent(selectedEvent) && loadingMatches) return;

    if (hasJoinedEvent(selectedEvent.id)) { setJoinError('You are already registered for this event.'); return; }

    const trackJoin = () => analyticsPromise.then((analytics) => {
      if (!analytics) return;
      logEvent(analytics, 'join_event', {
        event_id:   selectedEvent.id,
        event_name: selectedEvent.title,
        event_type: selectedEvent.category,
      });
    });

    if (!isTournamentEvent(selectedEvent)) {
      if (isWeekendMatchdaysEvent(selectedEvent) && !hasJoinedAnyTournament()) { setJoinError('Please join a tournament before joining matchdays.'); return; }
      setJoining(true);
      try {
        if (await writeRegistration(registrationId(selectedEvent.id, user.uid), {}) === 'already') {
          setJoinError('You are already registered for this event.');
          return;
        }
        trackJoin();
        setSelectedEvent(null);
        return true;
      } catch { setJoinError('Could not join the event right now. Please try again.'); }
      finally { setJoining(false); }
      return;
    }

    const doubles = isDoublesEvent(selectedEvent);
    if (!joinForm.division) { setJoinError('Please select a division.'); return; }
    // Courts decide the zone, and a zone-enabled draw can't place a player without one.
    if (resolveZoneConfig(selectedEvent.zone_draw_config as Parameters<typeof resolveZoneConfig>[0]).enabled && !profile?.preferences?.preferred_courts?.length && !profile?.preferences?.custom_courts?.length) {
      if (!pendingCourts?.courts.length) { setJoinError('Choose at least one preferred court before joining this event.'); return; }
      setJoining(true);
      const saved = await pendingCourts.save();
      setJoining(false);
      if (!saved) { setJoinError('Could not save your courts. Please try again.'); return; }
    }
    if (!doubles && joinForm.division === 'Mixed Doubles') { setJoinError('Mixed Doubles is locked for singles.'); return; }
    // The Retired Pro division is gated on the player's League selection (Profile → League).
    if (joinForm.seniors && !isSeniorsLeague(profile?.stats.league)) {
      setJoinError('The Retired Pro draw is for players in the Retired Pro league. Set it on your profile first.');
      return;
    }
    // A doubles player with no partner joins with partner_uid '' — that row IS the partner pool.
    const partnerName = doubles ? joinForm.partnerName.trim() : '';
    if (partnerName) {
      if (partnerName.length < 3 || partnerName.length > 80) { setJoinError('Partner name must be 3–80 characters.'); return; }
      if (/\d/.test(partnerName)) { setJoinError('Partner name cannot contain numbers.'); return; }
    }
    if (slotStatus?.status === 'full') { setJoinError('No empty spots left.'); return; }
    if (slotStatus?.status === 'fallback' && !slotFallbackConfirmed) { setJoinError('Please confirm the draw assignment above.'); return; }

    // A partner not on the app gets a guest id, so partner_uid '' keeps meaning "looking for one".
    const partnerUid = !partnerName ? '' : joinForm.partnerUid || guestUid();
    const division = !doubles && joinForm.seniors ? `${joinForm.division} Retired Pro` : joinForm.division;

    setJoining(true);
    setJoinError('');
    try {
      const outcome = await writeRegistration(registrationId(selectedEvent.id, user.uid, doubles ? joinForm.division : undefined), {
        division,
        skill: slotStatus?.skillOverride ?? (doubles ? Number(joinForm.combinedSkill || 3) : Number(profile?.stats.skill_level || 0)),
        partner_uid: partnerUid,
        partner_name: partnerName,
      });
      if (outcome === 'already') { setJoinError('You are already registered for this event.'); return; }
      trackJoin();
      // A new member's first pick becomes their profile division. Never overwrites a saved one.
      if (!leagueDivision(profile?.stats.league) && (joinForm.division === "Men's" || joinForm.division === "Women's")) {
        await updateDoc(doc(db, 'stats', user.uid), { league: joinForm.division, updated_at: Timestamp.now() })
          .catch((err) => console.warn('Could not save your division.', err));
      }

      setSelectedEvent(null);
      return true;
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
