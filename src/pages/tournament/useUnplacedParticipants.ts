import { useEffect, useState } from 'react';
import { collection, documentId, getDocs, query, where } from 'firebase/firestore';
import { chunk, db } from '../../lib/firebase';
import type { EventParticipant, TennisEvent } from '../../types';
import { skillBand } from '../../utils/skillLevels';
import { isGuest } from '../../utils/guest';
import { choiceOf, choiceOfMatch, drawKeyOfDoc } from './utils';
import { effectiveZone } from './drawGenerator';
import type { TournamentMatch, UnplacedEntry } from './types';

/**
 * Shared by the Tournament page and the Organizer Dash. A registrant is unplaced when their event
 * isn't complete, a live generated draw they belong to exists, and they hold no seat in any of the
 * event's generated matches. Zone plays no part — see CLAUDE.md, "Two unplaced lists, deliberately".
 *
 * `events` is already filtered to the tournaments the caller runs. `refreshKey` re-runs the
 * one-shot read: useTournament passes a token derived from its matches and participants snapshots,
 * which is what made the original effect re-read after an organizer seated someone.
 */
export function useUnplacedParticipants({ events, enabled, refreshKey }: {
  events: TennisEvent[];
  enabled: boolean;
  refreshKey?: unknown;
}): UnplacedEntry[] {

  // Everyone registered but seated in no match, across every tournament this organizer runs.
  const [unplacedParticipants, setUnplacedParticipants] = useState<UnplacedEntry[]>([]);
  useEffect(() => {
    if (!enabled) { setUnplacedParticipants([]); return; }
    // A completed event has nobody left to place.
    const myEvents = events.filter((e) => !e.completed_at);
    if (myEvents.length === 0) { setUnplacedParticipants([]); return; }

    let alive = true;
    const ids = myEvents.map((e) => e.id);
    const titleById = new Map(myEvents.map((e) => [e.id, e.title ?? '']));
    const championsById = new Map(myEvents.map((e) => [e.id, e.champions ?? {}]));

    (async () => {
      try {
        const [pSnaps, mSnaps] = await Promise.all([
          Promise.all(chunk(ids, 30).map((c) => getDocs(query(collection(db, 'event_participants'), where('event_id', 'in', c))))),
          Promise.all(chunk(ids, 30).map((c) => getDocs(query(collection(db, 'matches'), where('event_id', 'in', c))))),
        ]);

        // Generated draws per event, and everyone seated anywhere in the event. A draw is done once
        // its final is played or a winner is named (`champions`), the same test the server uses.
        type Draw = { tc: string; division: string; band: string; done: boolean };
        const drawsByEvent = new Map<string, Map<string, Draw>>();
        const seatedByEvent = new Map<string, Set<string>>();
        mSnaps.forEach((s) => s.forEach((d) => {
          const m = { ...d.data(), id: d.id } as TournamentMatch;
          if (m.category !== 'tournament' || m.status === 'cancelled') return;
          const draws = drawsByEvent.get(m.event_id) ?? new Map<string, Draw>();
          const key = `${choiceOfMatch(m)}|${m.division}|${m.skill_group}|${effectiveZone(m.zone)}`;
          const draw = draws.get(key) ?? {
            tc: choiceOfMatch(m), division: m.division, band: m.skill_group as string, done: false,
          };
          const seated = seatedByEvent.get(m.event_id) ?? new Set<string>();
          // participant_uids carries doubles partners, who hold no slot of their own.
          [m.player_1_uid, m.player_2_uid, ...(m.participant_uids ?? [])].forEach((id) => id && seated.add(id));
          if (m.round === 'F' && m.status === 'complete' && m.winner_uid) draw.done = true;
          if (championsById.get(m.event_id)?.[drawKeyOfDoc(m)]) draw.done = true;
          draws.set(key, draw);
          drawsByEvent.set(m.event_id, draws);
          seatedByEvent.set(m.event_id, seated);
        }));

        const candidates: EventParticipant[] = [];
        const seen = new Set<string>();
        pSnaps.forEach((s) => s.forEach((d) => {
          const p = { id: d.id, ...d.data() } as EventParticipant;
          const key = `${p.event_id}|${p.uid}`;
          if (!p.uid || isGuest(p.uid) || p.status !== 'active' || !/_tournament$/.test(p.category) || seen.has(key)) return;
          seen.add(key);
          candidates.push(p);
        }));

        // Choice/division/band only, never zone.
        const covering = (dr: Draw, p: EventParticipant) => {
          // Retired Pro is a division, so its draw (skill 'All') is matched by division alone.
          const band = skillBand(Number(p.skill || 0));
          return dr.tc === choiceOf(p)
            && (dr.division === p.division || dr.division === 'All')
            && (dr.band === band || dr.band === 'All');
        };

        const rows = candidates.filter((p) => {
          const live = [...(drawsByEvent.get(p.event_id)?.values() ?? [])].filter((dr) => !dr.done);
          if (!live.some((dr) => covering(dr, p))) return false;
          // A doubles partner is placed when their captain is, even if participant_uids missed them.
          const seated = seatedByEvent.get(p.event_id);
          return !seated?.has(p.uid) && !(p.partner_uid && seated?.has(p.partner_uid));
        });

        // Zone is for display only. No Toronto zone (no courts, or courts outside Toronto) shows as
        // "Unassigned" — effectiveZone's Downtown default exists for PLACEMENT only.
        const uids = [...new Set(rows.map((r) => r.uid))];
        const prefs = new Map<string, { zone: string }>();
        const prefSnaps = uids.length === 0 ? [] : await Promise.all(
          chunk(uids, 30).map((c) => getDocs(query(collection(db, 'preferences'), where(documentId(), 'in', c)))),
        );
        prefSnaps.forEach((s) => s.forEach((d) => prefs.set(d.id, {
          zone: (d.data().preferred_zone ?? '') as string,
        })));

        if (!alive) return;
        setUnplacedParticipants(rows.map((p) => {
          const pref = prefs.get(p.uid);
          return {
            participantId: p.id,
            uid: p.uid,
            name: p.user_name || 'Player',
            eventId: p.event_id,
            eventTitle: titleById.get(p.event_id) ?? '',
            division: p.division,
            tournamentChoice: choiceOf(p),
            skill: p.skill,
            zone: pref?.zone ?? '',
          };
        }));
      } catch (err) {
        console.error('Unplaced participants load failed:', err);
        if (alive) setUnplacedParticipants([]);
      }
    })();

    return () => { alive = false; };
  }, [enabled, events, refreshKey]);

  return unplacedParticipants;
}
