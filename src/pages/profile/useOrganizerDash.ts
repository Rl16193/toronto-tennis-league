import { useCallback, useEffect, useMemo, useState } from 'react';
import { collection, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, where, writeBatch } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { fetchEvents } from '../../features/events/services/eventService';
import { isTournamentEvent } from '../../utils/eventTypes';
import { type DisputeRow, disputeRow, resetScore, settleDispute } from '../../features/matches/scoring';
import { type CourtImprovementRow, watchCourtImprovements } from '../../lib/courtImprovements';
import type { TaskClaim } from '../../features/tasks/claimService';
import { usePendingRedemptionReviews } from '../../features/services/useServices';
import { useUnplacedParticipants } from '../tournament/useUnplacedParticipants';
import type { TournamentMatch, UnplacedEntry } from '../tournament/types';
import { PLAYER_LOADING, formatSetScores, formatPlayerName } from '../tournament/utils';
import { timeAgo } from '../../features/notifications/useNotifications';
import type { EventParticipant, TennisEvent } from '../../types';

/**
 * Data for the Organizer Dash on /profile. Profile mounts this whether the dash is switched on or
 * not, because the switch shows a count — so EVERY read here bails on `isOrganizer` before touching
 * Firestore, or every member pays for reads they can't use. Presentation is
 * OrganizerDashElements.tsx.
 *
 * This is the only place in the app an organizer can see rallies and challenges at all, which is
 * why undoing a recorded one lives here and nowhere else.
 */

/** How far back a recorded result stays listed and undoable — the score-edit window. */
const RECENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
/** Per category, so one busy week can't flood the list. */
const RECENT_PER_CATEGORY = 50;

const CATEGORIES = ['rally', 'challenge', 'singles', 'doubles'] as const;

export const REMOVAL_REASONS = ['Wrong zone', 'Unavailable', 'Other'] as const;
export type RemovalReason = typeof REMOVAL_REASONS[number];

export type RecordedRow = {
  id: string;
  kind: 'tournament' | 'challenge' | 'rally';
  players: string;
  /** "Ana won · 6-4 6-3" */
  result: string;
  when: string;
  /** Event and round, or "Rally" / "Ladder challenge". */
  context: string;
};

export type SignupRow = {
  uid: string;
  name: string;
  when: string;
  /** "2 tasks · 1 event", or "No activity" — the ones worth reaching out to. */
  activity: string;
  idle: boolean;
};

export type EventStatRow = {
  id: string;
  title: string;
  registered: number;
  played: number;
  outstanding: number;
  finished: boolean;
  href: string;
};

/** One recorded result of any kind. See the status note where this is read. */
type RecordedMatch = Omit<TournamentMatch, 'status'> & { category: string; status: string };

const agoText = (iso?: string) => {
  const age = timeAgo(iso);
  return age === 'now' ? 'just now' : age ? `${age} ago` : '';
};

const kindOf = (category: string): RecordedRow['kind'] =>
  category === 'rally' ? 'rally' : category === 'challenge' ? 'challenge' : 'tournament';

export function useOrganizerDash() {
  const { user, profile } = useAuth();
  const uid = user?.uid;
  // The same global gate Tasks.tsx and Matches.tsx use. Super admin is covered by the rules, which
  // are the actual boundary; this only decides what is rendered and read.
  const isOrganizer = profile?.preferences?.event_creator === true;

  const [events, setEvents] = useState<TennisEvent[]>([]);
  const [participants, setParticipants] = useState<EventParticipant[]>([]);
  const [eventMatches, setEventMatches] = useState<TournamentMatch[]>([]);
  const [recorded, setRecorded] = useState<RecordedRow[]>([]);
  const [signups, setSignups] = useState<SignupRow[]>([]);
  const [disputes, setDisputes] = useState<DisputeRow[]>([]);
  const [courtIssues, setCourtIssues] = useState<CourtImprovementRow[]>([]);
  const [claims, setClaims] = useState<TaskClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; text: string } | null>(null);
  // Bumped after a write, to re-run the one-shot reads. The live listeners look after themselves.
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  // Frozen for the session on purpose: deriving it per render would re-run every read each frame.
  // A tab left open overnight keeps yesterday's window, which is acceptable for a 7-day list.
  const cutoff = useMemo(() => new Date(Date.now() - RECENT_WINDOW_MS).toISOString(), []);

  // ── The organizer's own tournaments ────────────────────────────────────────
  useEffect(() => {
    if (!isOrganizer || !uid) { setEvents([]); return; }
    let alive = true;
    fetchEvents()
      .then((all) => { if (alive) setEvents(all.filter((e) => isTournamentEvent(e) && e.creator_id === uid)); })
      .catch(() => { if (alive) setEvents([]); });
    return () => { alive = false; };
  }, [isOrganizer, uid, nonce]);

  // Same list, same rules, as the Tournament page's panel — see useUnplacedParticipants.
  const unplacedRefresh = useMemo(() => ({}), [nonce]);
  const unplaced = useUnplacedParticipants({
    events,
    enabled: isOrganizer && !!uid,
    refreshKey: unplacedRefresh,
  });

  // ── Registrations and matches for those events, for the stats strip ────────
  // These re-read what useUnplacedParticipants reads internally. Kept separate so that hook stays
  // a pure move of the Tournament page's logic; it is a handful of queries over ~6 events.
  useEffect(() => {
    if (!isOrganizer || events.length === 0) { setParticipants([]); setEventMatches([]); return; }
    let alive = true;
    const ids = events.map((e) => e.id);
    const chunk = <T,>(xs: T[], n: number) =>
      Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));
    (async () => {
      try {
        const [pSnaps, mSnaps] = await Promise.all([
          Promise.all(chunk(ids, 30).map((c) => getDocs(query(collection(db, 'event_participants'), where('event_id', 'in', c))))),
          Promise.all(chunk(ids, 30).map((c) => getDocs(query(collection(db, 'matches'), where('event_id', 'in', c))))),
        ]);
        if (!alive) return;
        setParticipants(pSnaps.flatMap((s) => s.docs.map((d) => ({ id: d.id, ...d.data() } as EventParticipant))));
        setEventMatches(mSnaps.flatMap((s) => s.docs.map((d) => ({ id: d.id, ...d.data() } as TournamentMatch))));
      } catch {
        if (alive) { setParticipants([]); setEventMatches([]); }
      }
    })();
    return () => { alive = false; };
  }, [isOrganizer, events, nonce]);

  // ── Recently recorded ──────────────────────────────────────────────────────
  // One query per category, ASCENDING, then reversed here. The deployed index
  // (matches: category + completed_at) serves ascending only — asking for descending, or for
  // several categories at once, fails outright. The 7-day window keeps this to a couple of dozen
  // rows, so sorting in the browser costs nothing and saves an index deploy.
  useEffect(() => {
    if (!isOrganizer) { setRecorded([]); setLoading(false); return; }
    let alive = true;
    (async () => {
      try {
        const snaps = await Promise.all(CATEGORIES.map((c) => getDocs(query(
          collection(db, 'matches'),
          where('category', '==', c),
          where('completed_at', '>=', cutoff),
          orderBy('completed_at', 'asc'),
          limit(RECENT_PER_CATEGORY),
        ))));
        if (!alive) return;
        // `status` is widened here on purpose: a played tournament fixture is 'complete', while a
        // played challenge or rally is 'confirmed', which TournamentMatch's union doesn't carry.
        const rows = snaps
          .flatMap((s) => s.docs.map((d) => ({ id: d.id, ...d.data() } as RecordedMatch)))
          .filter((m) => !!m.winner_uid && (m.status === 'complete' || m.status === 'confirmed'))
          .sort((a, b) => (b.completed_at || '').localeCompare(a.completed_at || ''))
          .map((m): RecordedRow => {
            const kind = kindOf(m.category);
            const score = formatSetScores(m);
            return {
              id: m.id,
              kind,
              players: `${formatPlayerName(m.player_1_name)} vs ${formatPlayerName(m.player_2_name)}`,
              result: [`${formatPlayerName(m.winner_name || '')} won`, m.walkover ? 'walkover' : score]
                .filter(Boolean).join(' · '),
              when: agoText(m.completed_at),
              context: kind === 'rally' ? 'Rally'
                : kind === 'challenge' ? 'Ladder challenge'
                  : [m.division, m.round].filter(Boolean).join(' · ') || 'Tournament',
            };
          });
        setRecorded(rows);
      } catch {
        if (alive) setRecorded([]);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [isOrganizer, cutoff, nonce]);

  // ── New signups, with what they've done since ──────────────────────────────
  useEffect(() => {
    if (!isOrganizer) { setSignups([]); return; }
    let alive = true;
    (async () => {
      try {
        const snap = await getDocs(query(
          collection(db, 'users'),
          where('created_at', '>=', cutoff),
          orderBy('created_at', 'desc'),
          limit(50),
        ));
        const people = snap.docs.map((d) => ({ uid: d.id, ...d.data() } as { uid: string; name?: string; created_at?: string }));
        if (people.length === 0) { if (alive) setSignups([]); return; }
        // Their progress doc, read by id — `tasks` is also where the Services catalog lives, and
        // those rows carry a `uid` too, so querying by uid returns several docs per person.
        // Each read is caught on its own: no tasks doc is the normal state for someone who has
        // done nothing, which is exactly who this list is looking for.
        const [taskSnaps, joinSnaps] = await Promise.all([
          Promise.all(people.map((p) => getDoc(doc(db, 'tasks', p.uid)).catch(() => null))),
          Promise.all(people.map((p) => getDocs(query(collection(db, 'event_participants'), where('uid', '==', p.uid))).catch(() => null))),
        ]);
        if (!alive) return;
        setSignups(people.map((p, i) => {
          const taskDoc = (taskSnaps[i]?.exists() ? taskSnaps[i]?.data() : {}) ?? {};
          const done = Object.entries(taskDoc).filter(([k, v]) => v === true && k !== 'setupComplete').length;
          const joined = joinSnaps[i]?.docs.filter((d) => !d.data().removal).length ?? 0;
          const bits = [done ? `${done} task${done === 1 ? '' : 's'}` : '', joined ? `${joined} event${joined === 1 ? '' : 's'}` : ''].filter(Boolean);
          return {
            uid: p.uid,
            name: formatPlayerName(p.name || 'New member'),
            when: agoText(p.created_at),
            activity: bits.length ? bits.join(' · ') : 'No activity',
            idle: bits.length === 0,
          };
        }));
      } catch {
        if (alive) setSignups([]);
      }
    })();
    return () => { alive = false; };
  }, [isOrganizer, cutoff, nonce]);

  // ── Disputed results (live) ────────────────────────────────────────────────
  // No category filter: this is the one place every kind of dispute is collected.
  useEffect(() => {
    if (!isOrganizer) { setDisputes([]); return; }
    return onSnapshot(
      query(collection(db, 'matches'), where('score_disputed', '==', true)),
      (snap) => setDisputes(snap.docs.map((d) => disputeRow({ id: d.id, ...d.data() } as Parameters<typeof disputeRow>[0]))),
      () => setDisputes([]),
    );
  }, [isOrganizer]);

  // ── Court issue reports (live) ─────────────────────────────────────────────
  useEffect(() => watchCourtImprovements(isOrganizer, setCourtIssues), [isOrganizer]);

  // ── Claims and coupons (live) ──────────────────────────────────────────────
  // Owned here rather than inside ReviewQueue, so the one "Needs you" count includes them.
  useEffect(() => {
    if (!isOrganizer) { setClaims([]); return; }
    return onSnapshot(
      query(collection(db, 'task_claims'), where('status', '==', 'pending')),
      (snap) => setClaims(snap.docs.map((d) => ({ id: d.id, ...d.data() } as TaskClaim))),
      () => setClaims([]),
    );
  }, [isOrganizer]);
  const coupons = usePendingRedemptionReviews(isOrganizer);

  // ── Each event at a glance ─────────────────────────────────────────────────
  const eventStats = useMemo<EventStatRow[]>(() => events.map((e) => {
    const mine = eventMatches.filter((m) => m.event_id === e.id && !m.id.startsWith('preview_'));
    const real = mine.filter((m) => m.player_1_uid && m.player_2_uid);
    const played = real.filter((m) => m.status === 'complete' && m.winner_uid).length;
    return {
      id: e.id,
      title: e.title ?? '',
      registered: participants.filter((p) => p.event_id === e.id && !p.removal).length,
      played,
      outstanding: real.length - played,
      finished: mine.some((m) => m.round === 'F' && m.status === 'complete' && m.winner_uid),
      href: `/tournament?event=${e.id}`,
    };
  }), [events, eventMatches, participants]);

  const run = async (id: string, fn: () => Promise<unknown>, failText: string) => {
    setBusyId(id);
    setRowError(null);
    try { await fn(); } catch { setRowError({ id, text: failText }); } finally { setBusyId(null); }
  };

  /**
   * Withdraws an unplaced registrant from that event, with the organizer's reason. The same soft
   * delete the Tournament page uses (`removal: true`), so the row survives and they can be added
   * back. Their name also comes out of any unplayed match in that event — a zone-changer can still
   * be holding a seat in their old zone's draw. Played matches keep their record.
   */
  const removeUnplaced = (row: UnplacedEntry, reason: RemovalReason) =>
    run(row.participantId, async () => {
      const batch = writeBatch(db);
      participants
        .filter((p) => p.uid === row.uid && p.event_id === row.eventId && !p.removal)
        .forEach((p) => batch.update(doc(db, 'event_participants', p.id), {
          removal: true,
          removal_at: new Date().toISOString(),
          removal_reason: reason,
        }));
      eventMatches
        .filter((m) => m.event_id === row.eventId && m.status !== 'complete')
        .forEach((m) => {
          if (m.player_1_uid === row.uid) batch.update(doc(db, 'matches', m.id), { player_1_uid: '', player_1_name: PLAYER_LOADING });
          if (m.player_2_uid === row.uid) batch.update(doc(db, 'matches', m.id), { player_2_uid: '', player_2_name: PLAYER_LOADING });
        });
      await batch.commit();
      reload();
    }, 'Could not remove that player. Try again.');

  return {
    isOrganizer,
    loading,
    // Waiting on the organizer.
    disputes,
    unplaced,
    courtIssues,
    claims,
    coupons,
    // Awareness.
    recorded,
    signups,
    eventStats,
    /**
     * The switch count: only what genuinely awaits an action. Recent results, signups and event
     * stats are there to be glanced at — counting them would leave the badge permanently lit.
     * Coupons and claims are counted by ReviewQueue, which owns its own listeners.
     */
    count: disputes.length + unplaced.length + courtIssues.length + claims.length + coupons.length,
    busyId,
    rowError,
    reload,
    settle: (matchId: string, approve: boolean) =>
      run(matchId, () => settleDispute(matchId, approve), 'Could not settle that result. Try again.'),
    // The server answers false rather than throwing when the match is already unplayed — someone
    // else got there first. Surface it on the row like any other failure.
    undo: (matchId: string) => run(matchId, async () => {
      const ok = await resetScore(matchId);
      if (!ok) throw new Error('already reset');
      reload();
    }, 'Could not undo that score. It may already have been undone.'),
    removeUnplaced,
  };
}
