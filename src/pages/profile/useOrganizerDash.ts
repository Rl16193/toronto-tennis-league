import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Timestamp, collection, doc, documentId, getDoc, getDocs, limit, onSnapshot, orderBy, query, startAfter, where, writeBatch, type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { SUPER_ADMIN_UID, isOrganizerProfile, isTournamentEvent } from '../../utils/eventTypes';
import { type DisputeRow, disputeRow, resetScore, settleDispute } from '../../features/matches/scoring';
import { type Submission, fetchResultsFor, isResultEntry, isWalkover, scoreLine } from '../../features/matches/results';
import type { TaskClaim } from '../../features/tasks/claimService';
import { taskState, tasksCompletedCount } from '../../features/tasks/useTasks';
import { usePendingRefunds } from '../../features/services/useServices';
import { useUnplacedParticipants } from '../tournament/useUnplacedParticipants';
import type { TournamentMatch, UnplacedEntry } from '../tournament/types';
import { PLAYER_LOADING, formatPlayerName } from '../tournament/utils';
import { timeAgo } from '../../features/notifications/useNotifications';
import { type FirestoreDateLike, toMillis } from '../../utils/eventDates';
import type { EventParticipant, TennisEvent, UserStats } from '../../types';

/**
 * Data for the Organizer Dash on /profile. Profile mounts this whether the dash is switched on or
 * not, because the switch shows a count — so EVERY read here bails on `isOrganizer` before touching
 * Firestore, or every member pays for reads they can't use. Presentation is
 * OrganizerDashElements.tsx.
 *
 * This is the only place in the app an organizer can see rallies and challenges at all, which is
 * why undoing a recorded one lives here and nowhere else.
 */

/** How far back signups and court reports are listed. */
const RECENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
/** The newest played results listed, of any age; read in pages because most entries are filtered out. */
const RECENT_LIMIT = 50;
const RECENT_PAGE = 100;

/** The pills, and the withdrawn_reason each one stores. */
export const REMOVAL_REASONS = ['Wrong zone', 'Unavailable', 'Other'] as const;
export type RemovalReason = typeof REMOVAL_REASONS[number];
const REASON_CODE: Record<RemovalReason, 'wrong_zone' | 'unavailable' | 'other'> = {
  'Wrong zone': 'wrong_zone', Unavailable: 'unavailable', Other: 'other',
};

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

/** A court condition report (a `courts` report row), as the dash lists it. */
export type CourtReportRow = {
  id: string;
  court_name: string;
  note: string;
  uid: string;
  user_name: string;
  created_at: Timestamp | null;
};

type MatchDoc = TournamentMatch & { id: string };

const agoText = (at?: FirestoreDateLike) => {
  const age = timeAgo(at);
  return age === 'now' ? 'just now' : age ? `${age} ago` : '';
};

const chunk = <T,>(xs: T[], n: number) =>
  Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

/** Match docs by id, 30 per `in` query (a missing one is simply absent). */
const fetchMatches = async (ids: string[]): Promise<Map<string, MatchDoc>> => {
  const snaps = await Promise.all(chunk([...new Set(ids)], 30)
    .map((c) => getDocs(query(collection(db, 'matches'), where(documentId(), 'in', c))).catch(() => null)));
  return new Map(snaps.flatMap((s) => (s ? s.docs.map((d) => [d.id, { ...d.data(), id: d.id } as MatchDoc] as const) : [])));
};

export function useOrganizerDash() {
  const { user, profile } = useAuth();
  const uid = user?.uid;
  // Renders and reads only; the rules are the actual boundary.
  const isOrganizer = isOrganizerProfile(profile);

  const [events, setEvents] = useState<TennisEvent[]>([]);
  const [participants, setParticipants] = useState<EventParticipant[]>([]);
  const [eventMatches, setEventMatches] = useState<MatchDoc[]>([]);
  const [recorded, setRecorded] = useState<RecordedRow[]>([]);
  const [signups, setSignups] = useState<SignupRow[]>([]);
  const [disputes, setDisputes] = useState<DisputeRow[]>([]);
  const [courtIssues, setCourtIssues] = useState<CourtReportRow[]>([]);
  const [claims, setClaims] = useState<TaskClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; text: string } | null>(null);
  // Bumped after a write, to re-run the one-shot reads. The live listeners look after themselves.
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  // Frozen for the session on purpose: deriving it per render would re-run every read each frame.
  // A tab left open overnight keeps yesterday's window, which is acceptable for a 7-day list.
  const cutoff = useMemo(() => Timestamp.fromMillis(Date.now() - RECENT_WINDOW_MS), []);

  // ── The organizer's own tournaments (all of them for the super admin) ─────
  useEffect(() => {
    if (!isOrganizer || !uid) { setEvents([]); return; }
    let alive = true;
    const q = uid === SUPER_ADMIN_UID
      ? collection(db, 'events')
      : query(collection(db, 'events'), where('organizer_ids', 'array-contains', uid));
    getDocs(q)
      .then((snap) => {
        if (!alive) return;
        setEvents(snap.docs.map((d) => ({ ...d.data(), id: d.id } as TennisEvent)).filter(isTournamentEvent));
      })
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
    (async () => {
      try {
        const [pSnaps, mSnaps] = await Promise.all([
          Promise.all(chunk(ids, 30).map((c) => getDocs(query(collection(db, 'event_participants'), where('event_id', 'in', c))))),
          Promise.all(chunk(ids, 30).map((c) => getDocs(query(collection(db, 'matches'), where('event_id', 'in', c))))),
        ]);
        if (!alive) return;
        setParticipants(pSnaps.flatMap((s) => s.docs.map((d) => ({ ...d.data(), id: d.id } as EventParticipant))));
        setEventMatches(mSnaps.flatMap((s) => s.docs.map((d) => ({ ...d.data(), id: d.id } as MatchDoc))));
      } catch {
        if (alive) { setParticipants([]); setEventMatches([]); }
      }
    })();
    return () => { alive = false; };
  }, [isOrganizer, events, nonce]);

  // ── Recently recorded ──────────────────────────────────────────────────────
  // The newest applied result entries, walkovers left out, joined to their match docs for names
  // and context. Ordered by completed_at alone (single-field index, no composite needed) and
  // filtered here, so pages are read until 50 are found.
  useEffect(() => {
    if (!isOrganizer) { setRecorded([]); setLoading(false); return; }
    let alive = true;
    (async () => {
      try {
        const entries: Submission[] = [];
        let last: QueryDocumentSnapshot | undefined;
        while (entries.length < RECENT_LIMIT) {
          const snap = await getDocs(query(
            collection(db, 'submissions'),
            orderBy('completed_at', 'desc'),
            ...(last ? [startAfter(last)] : []),
            limit(RECENT_PAGE),
          ));
          entries.push(...snap.docs
            .map((d) => ({ ...d.data(), id: d.id } as Submission))
            .filter((e) => isResultEntry(e) && !isWalkover(e)));
          if (snap.docs.length < RECENT_PAGE) break;
          last = snap.docs[snap.docs.length - 1];
        }
        const matches = await fetchMatches(entries.map((e) => e.match_id));
        if (!alive) return;
        setRecorded(entries.flatMap((e): RecordedRow[] => {
          const m = matches.get(e.match_id);
          if (!m || m.status !== 'complete') return [];
          const kind = e.category;
          return [{
            id: m.id,
            kind,
            players: `${formatPlayerName(m.player_1_name)} vs ${formatPlayerName(m.player_2_name)}`,
            result: [`${formatPlayerName(e.winner_name || '')} won`, scoreLine(e)].filter(Boolean).join(' · '),
            when: agoText(e.completed_at),
            context: kind === 'rally' ? 'Rally'
              : kind === 'challenge' ? 'Ladder challenge'
                : [m.division, m.round].filter(Boolean).join(' · ') || 'Tournament',
          }];
        }).slice(0, RECENT_LIMIT));
      } catch {
        if (alive) setRecorded([]);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [isOrganizer, nonce]);

  // ── New signups, with what they've done since (their stats counters) ──────
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
        const people = snap.docs.map((d) => ({ uid: d.id, name: (d.data().name as string) || '', created_at: d.data().created_at }));
        if (people.length === 0) { if (alive) setSignups([]); return; }
        // Each read caught on its own: a missing stats doc just means nothing done yet.
        const statSnaps = await Promise.all(people.map((p) => getDoc(doc(db, 'stats', p.uid)).catch(() => null)));
        if (!alive) return;
        setSignups(people.map((p, i) => {
          const s = (statSnaps[i]?.exists() ? statSnaps[i]?.data() : null) as UserStats | null;
          const state = taskState(s);
          const done = tasksCompletedCount(state);
          const joined = s?.eventsJoined ?? 0;
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
  // Every disputed entry of any kind, joined to its match and the result that stands.
  useEffect(() => {
    if (!isOrganizer) { setDisputes([]); return; }
    let generation = 0;
    const off = onSnapshot(
      query(collection(db, 'submissions'), where('status', '==', 'disputed')),
      async (snap) => {
        const mine = ++generation;
        const disputed = snap.docs.map((d) => ({ ...d.data(), id: d.id } as Submission));
        if (disputed.length === 0) { setDisputes([]); return; }
        const ids = disputed.map((s) => s.match_id);
        const [matches, standing] = await Promise.all([fetchMatches(ids), fetchResultsFor(ids)]);
        if (mine !== generation) return;
        setDisputes(disputed.flatMap((s) => {
          const m = matches.get(s.match_id);
          return m ? [disputeRow(m, standing.get(s.match_id), s)] : [];
        }));
      },
      () => setDisputes([]),
    );
    return () => { generation += 1; off(); };
  }, [isOrganizer]);

  // ── Court issue reports (live) ─────────────────────────────────────────────
  // Condition reports from the last week, members' and signed-out visitors' alike. A created_at
  // range alone needs no composite index; the category filter runs here.
  useEffect(() => {
    if (!isOrganizer) { setCourtIssues([]); return; }
    return onSnapshot(
      query(collection(db, 'courts'), where('created_at', '>=', cutoff)),
      (snap) => setCourtIssues(snap.docs
        .map((d) => ({ ...d.data(), id: d.id } as CourtReportRow & { category: string; sub_category: string }))
        .filter((c) => c.category === 'report' && c.sub_category === 'condition')
        .sort((a, b) => toMillis(b.created_at) - toMillis(a.created_at))),
      () => setCourtIssues([]),
    );
  }, [isOrganizer, cutoff]);

  // ── Claims and refunds (live) ──────────────────────────────────────────────
  // Owned here rather than inside ReviewQueue, so the one "Needs you" count includes them.
  useEffect(() => {
    if (!isOrganizer) { setClaims([]); return; }
    return onSnapshot(
      query(collection(db, 'task_claims'), where('status', '==', 'pending')),
      (snap) => setClaims(snap.docs.map((d) => ({ ...d.data(), id: d.id } as TaskClaim))),
      () => setClaims([]),
    );
  }, [isOrganizer]);
  const coupons = usePendingRefunds(isOrganizer);

  // ── Each event at a glance ─────────────────────────────────────────────────
  const eventStats = useMemo<EventStatRow[]>(() => events.map((e) => {
    const mine = eventMatches.filter((m) => m.event_id === e.id && !m.id.startsWith('preview_'));
    const real = mine.filter((m) => m.player_1_uid && m.player_2_uid);
    const played = real.filter((m) => m.status === 'complete').length;
    return {
      id: e.id,
      title: e.title ?? '',
      registered: participants.filter((p) => p.event_id === e.id && p.status === 'active').length,
      played,
      outstanding: real.length - played,
      finished: mine.some((m) => m.round === 'F' && m.status === 'complete'),
      href: `/tournament?event=${e.id}`,
    };
  }), [events, eventMatches, participants]);

  const run = async (id: string, fn: () => Promise<unknown>, failText: string) => {
    setBusyId(id);
    setRowError(null);
    try { await fn(); } catch { setRowError({ id, text: failText }); } finally { setBusyId(null); }
  };

  /**
   * Withdraws an unplaced registrant from that event, with the organizer's reason — the same
   * status the Tournament page writes, so the row survives and they can be added back. Their name
   * also comes out of any unplayed match in that event, in the same batch. Played matches keep
   * their record.
   */
  const removeUnplaced = (row: UnplacedEntry, reason: RemovalReason) =>
    run(row.participantId, async () => {
      const batch = writeBatch(db);
      const now = Timestamp.now();
      participants
        .filter((p) => p.uid === row.uid && p.event_id === row.eventId && p.status === 'active')
        .forEach((p) => batch.update(doc(db, 'event_participants', p.id), {
          status: 'withdrawn',
          withdrawn_reason: REASON_CODE[reason],
          withdrawn_at: now,
          withdrawn_by: uid ?? '',
        }));
      eventMatches
        .filter((m) => m.event_id === row.eventId && m.status !== 'complete')
        .forEach((m) => {
          if (m.player_1_uid === row.uid) batch.update(doc(db, 'matches', m.id), { player_1_uid: '', player_1_name: PLAYER_LOADING, updated_at: now });
          if (m.player_2_uid === row.uid) batch.update(doc(db, 'matches', m.id), { player_2_uid: '', player_2_name: PLAYER_LOADING, updated_at: now });
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
