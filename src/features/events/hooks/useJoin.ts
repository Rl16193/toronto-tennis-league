import { useEffect, useState } from 'react';
import { Timestamp, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { db, analyticsPromise } from '../../../lib/firebase';
import { logEvent } from 'firebase/analytics';
import { resolveZoneConfig } from '../../../pages/tournament/drawGenerator';
import { isDoublesEvent, isTournamentEvent, isWeekendMatchdaysEvent } from '../../../utils/eventTypes';
import { isSeniorsLeague, leagueDivision } from '../../../utils/skillLevels';
import { guestUid } from '../../../utils/guest';
import { DisplayEvent } from '../services/eventService';
import { INITIAL_JOIN_FORM, JoinFormState } from '../types';
import { joinWrite, newRegistration, registrationId } from '../registrations';

interface Params {
  user: { uid: string; email: string | null } | null;
  profile: {
    user: { name: string };
    stats: { skill_level: number; league?: string };
    preferences?: { preferred_zone?: string; preferred_courts?: string[]; custom_courts?: string[] };
  } | null;
  hasJoinedEvent: (id: string) => boolean;
  hasJoinedAnyTournament: () => boolean;
}

export function useJoin({ user, profile, hasJoinedEvent, hasJoinedAnyTournament }: Params) {
  const [selectedEvent, setSelectedEvent] = useState<DisplayEvent | null>(null);
  const [joinForm, setJoinForm] = useState<JoinFormState>(INITIAL_JOIN_FORM);
  const [joinError, setJoinError] = useState('');
  const [joining, setJoining] = useState(false);

  const participantName = profile?.user.name?.trim() || user?.email || '';

  // Runs on ANY change of which event is selected, so the previous event's division/matches are
  // never used for the newly selected one. Singles takes the division saved on the profile.
  useEffect(() => {
    setJoinForm({
      ...INITIAL_JOIN_FORM,
      division: selectedEvent && !isDoublesEvent(selectedEvent) ? leagueDivision(profile?.stats.league) : '',
    });
    setJoinError('');
  }, [selectedEvent?.id]);

  useEffect(() => {
    if (!joinError) return;
    const t = setTimeout(() => setJoinError(''), 30_000);
    return () => clearTimeout(t);
  }, [joinError]);

  // Writes the registration on its deterministic id; a withdrawn member rejoins on the same row.
  const writeRegistration = async (id: string, fields: Parameters<typeof newRegistration>[3] = {}) => {
    const ref = doc(db, 'event_participants', id);
    const existing = await getDoc(ref);
    const w = joinWrite(existing.exists() ? existing.data() : undefined, newRegistration(selectedEvent!, user!.uid, participantName, fields));
    if (!w) return 'already';
    if ('update' in w) await updateDoc(ref, w.update); else await setDoc(ref, w.set);
    return 'joined';
  };

  // pendingCourts: courts picked in the join sheet, saved to the profile by Join itself.
  // Resolves true once the registration is written, so a caller can confirm it.
  const handleSubmitJoin = async (pendingCourts?: { courts: string[]; save: () => Promise<boolean> }): Promise<boolean | undefined> => {
    if (!selectedEvent || !user) return;

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
        if (await writeRegistration(registrationId(selectedEvent.id, user.uid, selectedEvent.category)) === 'already') {
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

    // A partner not on the app gets a guest id, so partner_uid '' keeps meaning "looking for one".
    const partnerUid = !partnerName ? '' : joinForm.partnerUid || guestUid();
    const division = !doubles && joinForm.seniors ? `${joinForm.division} Retired Pro` : joinForm.division;

    setJoining(true);
    setJoinError('');
    try {
      const outcome = await writeRegistration(registrationId(selectedEvent.id, user.uid, selectedEvent.category, joinForm.division), {
        division,
        skill: (doubles ? Number(joinForm.combinedSkill || 3) : Number(profile?.stats.skill_level || 0)),
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
    joining,
    handleSubmitJoin,
  };
}
