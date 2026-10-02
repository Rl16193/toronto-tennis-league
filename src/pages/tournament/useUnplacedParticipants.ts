import { useEffect, useState } from 'react';
import { collection, documentId, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import type { EventParticipant, TennisEvent } from '../../types';
import { skillBand } from '../../utils/skillLevels';
import { isGuest } from '../../utils/guest';
import { choiceOf, choiceOfMatch, effectiveZone, resolveZoneConfig, zoneBucketFor } from './utils';
import type { TournamentMatch, UnplacedEntry } from './types';

/**
 * Moved out of useTournament so the Organizer Dash can show the same list without mounting the
 * whole tournament page. The logic is UNCHANGED — see CLAUDE.md, "Two unplaced lists, deliberately",
 * for why it tests per DRAW rather than per event, and why a zone change is the one thing that
 * brings an already-seated player back. Two copies of this would drift, and its edge cases have
 * cost real players their place in a draw before.
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
    const myEvents = events;
    if (myEvents.length === 0) { setUnplacedParticipants([]); return; }

    let alive = true;
    const chunk = <T,>(xs: T[], n: number) =>
      Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));
    const ids = myEvents.map((e) => e.id);
    const titleById = new Map(myEvents.map((e) => [e.id, e.title ?? '']));

    (async () => {
      try {
        const [pSnaps, mSnaps] = await Promise.all([
          Promise.all(chunk(ids, 30).map((c) => getDocs(query(collection(db, 'event_participants'), where('event_id', 'in', c))))),
          Promise.all(chunk(ids, 30).map((c) => getDocs(query(collection(db, 'matches'), where('event_id', 'in', c))))),
        ]);

        // Draws, never events. One event runs Men's/Women's × band × zone side by side, so an
        // event-level test both keeps registrants whose own draw was never generated and hides
        // registrants of a live draw the moment a sibling draw's final is played.
        // `effectiveZone` normalizes the key, so a zone-less legacy draw and its Downtown twin
        // count as one draw rather than two.
        type Draw = { tc: string; division: string; band: string; zone: string; done: boolean; seats: Set<string> };
        const drawsByEvent = new Map<string, Map<string, Draw>>();
        mSnaps.forEach((s) => s.forEach((d) => {
          const m = d.data() as TournamentMatch;
          if (m.category !== 'tournament') return;
          const draws = drawsByEvent.get(m.event_id) ?? new Map<string, Draw>();
          const zone = effectiveZone(m.zone);
          const key = `${choiceOfMatch(m)}|${m.division}|${m.skill_group}|${zone}`;
          const draw = draws.get(key) ?? {
            tc: choiceOfMatch(m), division: m.division, band: m.skill_group as string,
            zone, done: false, seats: new Set<string>(),
          };
          // participant_uids carries doubles partners, who hold no slot of their own.
          [m.player_1_uid, m.player_2_uid, ...(m.participant_uids ?? [])].forEach((id) => id && draw.seats.add(id));
          if (m.round === 'F' && m.status === 'complete' && m.winner_uid) draw.done = true;
          draws.set(key, draw);
          drawsByEvent.set(m.event_id, draws);
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

        // Zone is needed BEFORE the filter, not just for display: a player who changes zone keeps
        // playing the matches they're already in and appears here for the draw in their NEW zone.
        // For the display value, no Toronto zone (no courts, or courts outside Toronto) shows as
        // "Unassigned" — effectiveZone's Downtown default exists for PLACEMENT only, and showing
        // it would report a choice the player never made.
        const uids = [...new Set(candidates.map((r) => r.uid))];
        const prefs = new Map<string, { zone: string }>();
        const prefSnaps = uids.length === 0 ? [] : await Promise.all(
          chunk(uids, 30).map((c) => getDocs(query(collection(db, 'preferences'), where(documentId(), 'in', c)))),
        );
        prefSnaps.forEach((s) => s.forEach((d) => prefs.set(d.id, {
          zone: (d.data().preferred_zone ?? '') as string,
        })));
        const configById = new Map(myEvents.map((e) => [e.id, resolveZoneConfig(e.zone_draw_config)]));

        // Choice/division/band only. Zone is tested separately because it means different things
        // in the two cases below, and folding it in here listed players the creator had moved
        // across skill groups (a 3.5 seated in the Masters draw looked "missing" from Challengers).
        const covering = (dr: Draw, p: EventParticipant) => {
          // Retired Pro is a division, so its draw (skill 'All') is matched by division alone.
          const band = skillBand(Number(p.skill || 0));
          return dr.tc === choiceOf(p)
            && (dr.division === p.division || dr.division === 'All')
            && (dr.band === band || dr.band === 'All');
        };
        const inZone = (dr: Draw, p: EventParticipant) =>
          dr.zone === zoneBucketFor(prefs.get(p.uid)?.zone, configById.get(p.event_id));

        const rows = candidates.filter((p) => {
          const live = [...(drawsByEvent.get(p.event_id)?.values() ?? [])].filter((dr) => !dr.done);
          const cov = live.filter((dr) => covering(dr, p));
          if (cov.length === 0) return false;
          // A doubles partner is placed when their captain is, even if participant_uids missed them.
          const seats = live.filter((dr) => dr.seats.has(p.uid) || (!!p.partner_uid && dr.seats.has(p.partner_uid)));
          // Registered and never placed — any live draw they belong to is somewhere the organizer
          // could put them, whatever its zone.
          if (seats.length === 0) return true;
          // Zone isn't a doubles draw dimension, so a placed doubles player never resurfaces.
          if (choiceOf(p) === 'Doubles') return false;
          // Already placed. The ONE thing that brings them back is a zone change: every seat they
          // hold is in another zone AND the zone they moved to already has a draw they belong to.
          // They keep every match that has a real opponent (functions/zoneMoves.js gives up the
          // others); this row is so the organizer can place them in the new zone by hand.
          return !seats.some((dr) => inZone(dr, p)) && cov.some((dr) => inZone(dr, p) && !dr.seats.has(p.uid));
        });

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
