import { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, query, updateDoc, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import type { ContactData, TaskProgress } from '../../types';
import { useContacts } from '../../features/contacts/useContacts';
import { cancelRally, respondRally, useRallies } from '../../features/rallies/rallyService';
import { cancelChallenge, respondChallenge } from '../../features/leagues/ladderService';
import { useLadder } from '../../features/leagues/useLadder';
import { useActiveLadder } from '../../features/leagues/useChallengeRules';
import { useRequestScoring } from '../../features/matches/useRequestScoring';
import { bookingStage, useMyBookings } from '../../features/services/useServices';
import { cancelBooking, confirmBooking } from '../../features/services/servicesApi';
import { type UserMatch, playerRecord, useUserMatches } from '../../features/matches/useUserMatches';
import { ROUND_LABEL, deriveResults } from '../../features/matches/tournamentResults';
import type { JoinedEventCard } from '../../features/profile/hooks/useProfileData';
import { CATEGORIES, COUNTER_NOUN, type Counters } from '../../features/tasks/taskCatalog';
import { timeAgo } from '../../features/notifications/useNotifications';
import { SCORE_EDIT_WINDOW_MS, formatPlayerName } from '../tournament/utils';
import type { TournamentMatch } from '../tournament/types';
import { getEventEndDate, isCurrentEvent, parseEndInstant } from '../../utils/eventDates';
import { isLadderEvent, isTournamentEvent } from '../../utils/eventTypes';
import { leagueDivision, skillBand } from '../../utils/skillLevels';

// Data for the Player Dash on /profile. Profile mounts this whether the dash is switched on or not,
// because the switch shows a count. Every read here reuses an existing hook; the only new query is
// useNeedsYou's and useScheduleAsks' live listeners. Presentation lives in PlayerDashElements.tsx.

export type DashKind = 'tournament' | 'challenge' | 'rally';
type RequestCategory = 'rally' | 'challenge';

export type NeedsYouRow = {
  id: string;
  category: RequestCategory;
  from: { uid: string; name: string };
  age: string;
  /** What they're asking for, e.g. "Ladder challenge". */
  line: string;
};

/** A tournament opponent asked this member to arrange a time. Done clears the request. */
export type ScheduleAskRow = {
  id: string;
  opponent: { uid: string; name: string };
  line: string;
  contact?: ContactData;
};

/**
 * A live job with a provider, from the moment they confirm it. Every step after that shows here so
 * the member can see where their racquet or lesson is, and the provider's contacts are on every
 * row. `ask` is the one step that needs an answer: "ready for pickup" or "Did your lesson happen?".
 */
export type BookingAskRow = {
  id: string;
  title: string;
  line: string;
  ask: boolean;
  /** Still New, or a group lesson not yet marked done. Redeemed points go to review. */
  cancellable: boolean;
  provider: string;
  contact?: ContactData;
};

export type OutgoingRow = {
  id: string;
  category: RequestCategory;
  to: { uid: string; name: string };
  line: string;
};

export type ToPlayRow = {
  id: string;
  kind: DashKind;
  opponent: { uid: string; name: string };
  viewerIsP1: boolean;
  subtitle: string;
  nextUp: boolean;
  /** Challenges and rallies only: either player may call one off until a score is in. */
  canCancel: boolean;
  contact?: ContactData;
  tournamentMatch?: TournamentMatch;
};

export type PastMatchRow = {
  id: string;
  kind: DashKind;
  won: boolean;
  scoreLine: string;
  when: string;
  context: string;
  /** Games-only correction still allowed: within 7 days, not a walkover, nothing pending. */
  editable: boolean;
  match: UserMatch;
};

export type HeadToHeadRow = {
  opponent: { uid: string; name: string };
  wins: number;
  losses: number;
  lastScore: string;
  matches: PastMatchRow[];
};

export type TaskGroupRow = {
  id: string;
  title: string;
  pct: number;
  have: number;
  need: number;
  earned: number;
  tiers: number;
  nextTitle: string;
  nextPoints: number;
  remainingLine: string;
  href: string;
};

export type DashEventRow = {
  id: string;
  title: string;
  live: boolean;
  detail: string;
  champion: boolean;
  played?: { done: number; total: number };
  href: string;
};

const kindOf = (category: string): DashKind =>
  category === 'challenge' ? 'challenge' : category === 'rally' ? 'rally' : 'tournament';

const requestCategoryOf = (kind: DashKind): RequestCategory => (kind === 'rally' ? 'rally' : 'challenge');

/** "2d ago", "just now", or '' when there's no date. */
const agoText = (iso?: string) => {
  const age = timeAgo(iso);
  return age === 'now' ? 'just now' : age ? `${age} ago` : '';
};

const shortDate = (ms: number) =>
  ms ? new Date(ms).toLocaleDateString('en-CA', { day: 'numeric', month: 'short' }) : '';

const stageOf = (round: string, groupLabel?: string) =>
  round === 'RR' ? (groupLabel || 'Group stage') : (ROUND_LABEL[round] || round);

export function usePlayerDash({ joinedEvents, progress, counters, rsPoints }: {
  joinedEvents: JoinedEventCard[];
  progress: TaskProgress | null;
  counters: Counters;
  rsPoints: number;
}) {
  const { user, profile } = useAuth();
  const uid = user?.uid;
  const myName = profile?.user.name || '';

  const needs = useNeedsYou(uid);
  const asks = useScheduleAsks(uid);
  const { bookings } = useMyBookings();
  const { sent, received, contactMap: rallyContacts } = useRallies();
  const ladder = useActiveLadder();
  const { challenges, myChallenges, contactMap: challengeContacts } = useLadder(ladder?.id, uid);
  const { matches, upcoming, reload } = useUserMatches(uid);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; text: string } | null>(null);

  const scoring = useRequestScoring(uid ? { uid, name: myName } : null, reload);

  const eventTitle = useMemo(() => new Map(joinedEvents.map((e) => [e.id, e.title])), [joinedEvents]);

  // One contacts read per tournament opponent, each caught on its own: a denied read is normal
  // (the connection doc may not exist yet) and must not blank everyone else's contact buttons.
  const fixtureOpponentIds = useMemo(
    () => [...new Set(upcoming.filter((u) => u.source === 'tournament').map((u) => u.opponentId).filter(Boolean))].sort().join(','),
    [upcoming],
  );
  const fixtureContacts = useContacts(fixtureOpponentIds ? fixtureOpponentIds.split(',') : []);

  const needsYou: NeedsYouRow[] = useMemo(() => needs.map((n) => ({
    id: n.id,
    category: n.category,
    from: { uid: n.fromUid, name: formatPlayerName(n.fromName) },
    age: timeAgo(n.createdAt),
    line: n.category === 'rally' ? 'Rally request' : n.isConversion ? 'Count a played match' : 'Ladder challenge',
  })), [needs]);

  // The asker is this member's fixture opponent, so their contacts are already in fixtureContacts.
  const scheduleAsks: ScheduleAskRow[] = useMemo(() => asks.map((a) => ({
    id: a.id,
    opponent: { uid: a.fromUid, name: formatPlayerName(a.fromName) },
    line: ['Schedule match', eventTitle.get(a.eventId), 'requested to schedule'].filter(Boolean).join(' · '),
    contact: fixtureContacts[a.fromUid],
  })), [asks, eventTitle, fixtureContacts]);

  // Every live job, from New onwards. Booking connects the two accounts, so contacts/{provider} is
  // readable and the row always carries their phone and email.
  const liveBookings = useMemo(
    () => bookings.filter((b) => ['new', 'in_progress', 'confirming'].includes(bookingStage(b))),
    [bookings],
  );
  const bookingProviderIds = useMemo(
    () => [...new Set(liveBookings.flatMap((b) => b.provider_uids ?? []))].sort().join(','),
    [liveBookings],
  );
  const bookingContacts = useContacts(bookingProviderIds ? bookingProviderIds.split(',') : []);

  const bookingAsks: BookingAskRow[] = useMemo(() => liveBookings.map((b) => {
    const ask = bookingStage(b) === 'confirming';
    const fresh = bookingStage(b) === 'new';
    const when = agoText(ask ? b.completion_requested_at : fresh ? b.created_at : b.started_at);
    const provider = b.provider_name || 'the provider';
    return {
      id: b.id,
      title: fresh ? (b.group_lesson ? `Waiting for ${provider} to add you to a group` : `Waiting for ${provider} to confirm`)
        : ask
        ? b.category === 'coaching' ? 'Did your lesson happen?' : 'Your racquet is ready for pickup. Did you collect it?'
        : b.group_lesson ? `You're in ${provider}'s group lesson`
        : b.category === 'coaching' ? 'Lesson confirmed' : 'Your racquet is with the provider',
      line: [b.provider_name, b.offer, when && `${ask ? 'ready' : fresh ? 'booked' : 'since'} ${when}`].filter(Boolean).join(' · '),
      ask,
      // A group lesson member may leave until the coach marks it done (functions/lib/bookingState.js).
      cancellable: fresh || (!!b.group_lesson && !ask),
      provider: b.provider_name || 'Provider',
      contact: (b.provider_uids ?? []).map((u) => bookingContacts[u]).find(Boolean),
    };
  }), [liveBookings, bookingContacts]);

  const outgoing: OutgoingRow[] = useMemo(() => [
    ...sent.filter((r) => r.status === 'open').map((r) => ({
      id: r.id, category: 'rally' as const,
      to: { uid: r.player_2_uid, name: formatPlayerName(r.player_2_name) },
      line: ['Rally · waiting for a reply', agoText(r.created_at) && `sent ${agoText(r.created_at)}`].filter(Boolean).join(' · '),
    })),
    ...myChallenges.map((c) => ({
      id: c.id, category: 'challenge' as const,
      to: { uid: c.player_2_uid, name: formatPlayerName(c.player_2_name) },
      line: ['Challenge · waiting for a reply', agoText(c.created_at) && `sent ${agoText(c.created_at)}`].filter(Boolean).join(' · '),
    })),
  ], [sent, myChallenges]);

  const toPlay: ToPlayRow[] = useMemo(() => {
    if (!uid) return [];
    const rows: ToPlayRow[] = [];
    const seen = new Set<string>();

    // Tournament fixtures with no submission waiting on the organizer — once either player files a
    // score, the match leaves this list. Knockout rounds sort ahead of group matches.
    upcoming
      .filter((u) => u.source === 'tournament')
      .sort((a, b) => Number(a.round === 'RR') - Number(b.round === 'RR'))
      .forEach((u, i) => {
        rows.push({
          id: u.id,
          kind: 'tournament',
          opponent: { uid: u.opponentId, name: formatPlayerName(u.opponentName) },
          viewerIsP1: u.viewerIsP1,
          subtitle: [eventTitle.get(u.eventId) || 'Tournament', stageOf(u.round, u.rrGroupLabel)].filter(Boolean).join(' · '),
          nextUp: i === 0,
          canCancel: false,
          contact: fixtureContacts[u.opponentId],
          tournamentMatch: u.tournamentMatch,
        });
        seen.add(u.id);
      });

    // Accepted challenges and rallies, live — an accepted request lands here the moment it's
    // accepted, and leaves the moment either player records a score.
    challenges
      .filter((c) => c.status === 'accepted' && (c.player_1_uid === uid || c.player_2_uid === uid))
      .forEach((c) => {
        const iAmP1 = c.player_1_uid === uid;
        const oppUid = iAmP1 ? c.player_2_uid : c.player_1_uid;
        rows.push({
          id: c.id,
          kind: 'challenge',
          opponent: { uid: oppUid, name: formatPlayerName(iAmP1 ? c.player_2_name : c.player_1_name) },
          viewerIsP1: iAmP1,
          subtitle: ['Ladder challenge', agoText(c.responded_at) && `accepted ${agoText(c.responded_at)}`].filter(Boolean).join(' · '),
          nextUp: false,
          canCancel: true,
          contact: challengeContacts[oppUid],
        });
        seen.add(c.id);
      });
    [...sent, ...received]
      .filter((r) => r.status === 'accepted')
      .forEach((r) => {
        const iAmP1 = r.player_1_uid === uid;
        const oppUid = iAmP1 ? r.player_2_uid : r.player_1_uid;
        rows.push({
          id: r.id,
          kind: 'rally',
          opponent: { uid: oppUid, name: formatPlayerName(iAmP1 ? r.player_2_name : r.player_1_name) },
          viewerIsP1: iAmP1,
          subtitle: ['Rally', agoText(r.responded_at) && `accepted ${agoText(r.responded_at)}`].filter(Boolean).join(' · '),
          nextUp: false,
          canCancel: true,
          contact: rallyContacts[oppUid],
        });
        seen.add(r.id);
      });

    // An accepted challenge on a ladder other than the active one only reaches the one-time fetch.
    upcoming
      .filter((u) => u.source !== 'tournament' && !seen.has(u.id))
      .forEach((u) => {
        rows.push({
          id: u.id,
          kind: u.source === 'rally' ? 'rally' : 'challenge',
          opponent: { uid: u.opponentId, name: formatPlayerName(u.opponentName) },
          viewerIsP1: u.viewerIsP1,
          subtitle: [u.source === 'rally' ? 'Rally' : 'Ladder challenge', agoText(u.respondedAt) && `accepted ${agoText(u.respondedAt)}`].filter(Boolean).join(' · '),
          nextUp: false,
          canCancel: true,
        });
      });
    return rows;
  }, [uid, upcoming, eventTitle, fixtureContacts, challenges, challengeContacts, sent, received, rallyContacts]);

  const { recent, form, headToHead } = useMemo(() => {
    const now = Date.now();
    const pastRow = (m: UserMatch): PastMatchRow => {
      const kind = kindOf(m.category);
      // One rule for every kind; the server decides whether the correction replaces the score.
      const editable = !m.walkover && !m.tournamentMatch?.no_show && !!m.winnerUid &&
        m.completedAt > 0 && now - m.completedAt <= SCORE_EDIT_WINDOW_MS;
      const context = kind === 'tournament'
        ? [eventTitle.get(m.eventId) || 'Tournament', stageOf(m.round, m.tournamentMatch?.rr_group_label)].filter(Boolean).join(' · ')
        : kind === 'challenge' ? 'Ladder challenge' : 'Rally';
      return {
        id: m.id, kind, won: m.won, scoreLine: m.walkover ? 'W/O' : m.scoreLine,
        when: shortDate(m.completedAt), context, editable, match: m,
      };
    };

    // `matches` is newest first, so each opponent's first entry is their latest meeting and the
    // Map keeps opponents in order of who was played most recently.
    const groups = new Map<string, HeadToHeadRow>();
    matches.forEach((m) => {
      const key = m.opponentId || m.opponentName;
      const row = groups.get(key) ?? {
        opponent: { uid: m.opponentId, name: formatPlayerName(m.opponentName) },
        wins: 0, losses: 0, lastScore: '', matches: [],
      };
      if (m.won) row.wins += 1; else row.losses += 1;
      row.matches.push(pastRow(m));
      groups.set(key, row);
    });

    return {
      recent: matches.slice(0, 5).map(pastRow),
      form: matches.slice(0, 8).map((m) => m.won),
      headToHead: [...groups.values()].map((g) => ({ ...g, lastScore: g.matches[0]?.scoreLine ?? '' })),
    };
  }, [matches, uid, eventTitle]);

  const season = useMemo(() => {
    // Walkovers are excluded from every count here: nobody played, so nobody won or lost one.
    // `playerRecord` filters them itself; these counters have to do the same or they disagree.
    const played = matches.filter((m) => !m.walkover);
    const wins = played.filter((m) => m.won).length;
    const { streak, pgWon } = playerRecord(matches, profile?.stats);
    let bestStreak = 0;
    let run = 0;
    [...played].reverse().forEach((m) => { run = m.won ? run + 1 : 0; bestStreak = Math.max(bestStreak, run); });
    const activeMonths = new Set(matches.filter((m) => m.completedAt).map((m) => {
      const d = new Date(m.completedAt);
      return `${d.getFullYear()}-${d.getMonth()}`;
    })).size;
    const trend = profile?.stats.rankTrend;
    return {
      streak,
      wins,
      losses: played.length - wins,
      matches: played.length,
      pgWon,
      rsPoints,
      rankPosition: profile?.stats.rankPosition,
      rankTrend: (trend === 'same' ? 'flat' : trend) as 'up' | 'down' | 'flat' | undefined,
      rankMove: profile?.stats.rankMove ?? 0,
      bestStreak,
      activeMonths,
    };
  }, [matches, profile, rsPoints]);

  const taskGroups: TaskGroupRow[] = useMemo(() => {
    const rec = (progress ?? {}) as unknown as Record<string, unknown>;
    return CATEGORIES
      .filter((c) => !c.locked)
      .map((c): TaskGroupRow | null => {
        const next = c.tiers.find((t) => !rec[t.id]);
        if (!next) return null;
        const earned = c.tiers.filter((t) => rec[t.id]).length;
        const have = counters[next.counter] ?? 0;
        const remaining = Math.max(0, next.need - have);
        const noun = remaining === 1 ? COUNTER_NOUN[next.counter].one : COUNTER_NOUN[next.counter].many;
        return {
          id: c.id,
          title: c.title,
          pct: Math.min(100, Math.round((have / Math.max(1, next.need)) * 100)),
          have,
          need: next.need,
          earned,
          tiers: c.tiers.length,
          nextTitle: next.title,
          nextPoints: next.points,
          remainingLine: remaining === 0 ? 'ready to claim' : `${remaining} more ${noun}`,
          href: c.to ?? '/tasks',
        };
      })
      .filter((g): g is TaskGroupRow => !!g && (g.earned > 0 || g.pct > 0))
      .sort((a, b) => b.pct - a.pct);
  }, [progress, counters]);

  const events: DashEventRow[] = useMemo(() => {
    const fixtures = [
      ...matches.map((m) => m.tournamentMatch),
      ...upcoming.map((u) => u.tournamentMatch),
    ].filter((m): m is TournamentMatch => !!m);
    // One registration row per division or partner, so an event can appear twice; a removed
    // registration (the organizer's soft delete) doesn't count.
    const unique = [...new Map(joinedEvents.filter((e) => !e.removal).map((e) => [e.id, e])).values()];
    return unique
      .map((e) => {
        const live = isCurrentEvent(e);
        const ladderEvent = isLadderEvent(e);
        const tournament = isTournamentEvent(e);
        const mine = fixtures.filter((m) => m.event_id === e.id);
        const done = mine.filter((m) => m.status === 'complete').length;
        const end = parseEndInstant(getEventEndDate(e));
        const result = !live && mine.length ? deriveResults(mine, uid ?? '').bestResult : '—';
        const detail = ladderEvent
          ? 'All Season'
          : live
            ? (end ? `Ends ${end.toLocaleDateString('en-CA', { day: 'numeric', month: 'short' })}` : 'On now')
            : result !== '—'
              ? result
              : end ? end.toLocaleDateString('en-CA', { month: 'short', year: 'numeric' }) : '';
        return {
          id: e.id,
          title: e.title,
          live,
          detail,
          champion: result === 'Champion',
          played: tournament && live && mine.length ? { done, total: mine.length } : undefined,
          href: ladderEvent
            ? '/matches?mode=challenges'
            : tournament ? `/matches?mode=tournament&event=${e.id}` : `/events?event=${e.id}`,
        };
      })
      .sort((a, b) => Number(b.live) - Number(a.live));
  }, [joinedEvents, matches, upcoming, uid]);

  const identity = profile
    ? {
      // The member's own name, on their own profile page — shown in full, not abbreviated.
      name: formatPlayerName(profile.user.name, { full: true }) || 'You',
      line: [
        leagueDivision(profile.stats.league),
        profile.stats.skill_level ? skillBand(profile.stats.skill_level) : '',
        profile.stats.skill_level ? `Skill ${profile.stats.skill_level}` : '',
        // Optional: a member who has never picked a court has no `preferred_courts` at all, and
        // indexing it threw, taking the whole Profile page down with the error boundary.
        profile.preferences.preferred_courts?.[0],
        profile.preferences.preferred_zone,
      ].filter(Boolean).join(' · '),
    }
    : null;

  const run = async (id: string, fn: () => Promise<unknown>, failText: string) => {
    setBusyId(id);
    setRowError(null);
    try { await fn(); } catch { setRowError({ id, text: failText }); } finally { setBusyId(null); }
  };

  return {
    identity,
    count: needsYou.length + scheduleAsks.length + bookingAsks.length + toPlay.length,
    needsYouCount: needsYou.length + scheduleAsks.length + bookingAsks.length,
    needsYou,
    scheduleAsks,
    bookingAsks,
    outgoing,
    toPlay,
    season,
    recent,
    form,
    headToHead,
    taskGroups,
    events,
    busyId,
    rowError,
    scoring,
    // Players may write `schedule_requested` (firestore.rules match carve-out).
    doneScheduling: (id: string) => run(
      id,
      () => updateDoc(doc(db, 'matches', id), { schedule_requested: false }),
      'Could not clear that. Try again.',
    ),
    // Yes completes the job; Not yet sends it back to the provider (functions/bookings.js).
    cancelBooking: (id: string) => run(
      id,
      () => cancelBooking({ bookingId: id }),
      'Could not cancel that. Try again.',
    ),
    answerBooking: (id: string, yes: boolean) => run(
      id,
      () => confirmBooking({ bookingId: id, confirmed: yes }),
      'Could not send that. Try again.',
    ),
    respond: (row: NeedsYouRow, accept: boolean) => run(
      row.id,
      () => (row.category === 'rally' ? respondRally(row.id, accept) : respondChallenge(row.id, accept)),
      accept ? 'Could not accept that. Try again.' : 'Could not decline that. Try again.',
    ),
    cancel: (id: string, category: RequestCategory) => run(
      id,
      async () => { await (category === 'rally' ? cancelRally(id) : cancelChallenge(id)); reload(); },
      'Could not cancel that. Try again.',
    ),
    score: (row: ToPlayRow) => scoring.open({
      kind: row.kind,
      docId: row.id,
      opponent: row.opponent,
      viewerIsP1: row.viewerIsP1,
      title: `vs ${row.opponent.name}`,
    }),
    edit: (row: PastMatchRow) => scoring.open({
      kind: row.kind,
      docId: row.id,
      opponent: { uid: row.match.opponentId, name: formatPlayerName(row.match.opponentName) },
      viewerIsP1: row.match.viewerIsP1,
      edit: { winnerUid: row.match.winnerUid, sets: row.match.sets },
      title: `vs ${formatPlayerName(row.match.opponentName)}`,
    }),
    requestCategoryOf,
  };
}

// ─── Needs you: open requests and schedule asks ────────────────────────────────────────────────

/** A rally or challenge request waiting on the signed-in member's answer. */
export type NeedsYouItem = {
  id: string;
  category: 'rally' | 'challenge';
  fromUid: string;
  fromName: string;
  createdAt: string;
  /** Challenges only: the ladder division, 'mens' | 'womens'. */
  division?: string;
  /** A match already played, proposed as a challenge. It arrives with its result on it. */
  isConversion: boolean;
  winnerUid?: string;
  /** Absolute [player_1, player_2] games of the played sets, for a conversion's proposed score. */
  sets: [number, number][];
};

const num = (v: unknown) => (typeof v === 'number' ? v : 0);

/**
 * Requests the member has to answer: open rallies and challenges where they are player_2.
 * One live query for the Player Dash and its count. Two equality filters need no composite index,
 * and a read error leaves the list empty rather than breaking the page.
 */
export function useNeedsYou(uid?: string): NeedsYouItem[] {
  const [items, setItems] = useState<NeedsYouItem[]>([]);

  useEffect(() => {
    if (!uid) { setItems([]); return; }
    return onSnapshot(
      query(collection(db, 'matches'), where('player_2_uid', '==', uid), where('status', '==', 'open')),
      (snap) => setItems(
        snap.docs
          .map((d) => ({ id: d.id, raw: d.data() }))
          .filter(({ raw }) => raw.category === 'rally' || raw.category === 'challenge')
          .map(({ id, raw }): NeedsYouItem => ({
            id,
            category: raw.category,
            fromUid: raw.player_1_uid || '',
            fromName: raw.player_1_name || 'A player',
            createdAt: raw.created_at || '',
            division: raw.division,
            isConversion: !!raw.source && !!raw.winner_uid,
            winnerUid: raw.winner_uid,
            sets: ([
              [num(raw.set_1_player_1), num(raw.set_1_player_2)],
              [num(raw.set_2_player_1), num(raw.set_2_player_2)],
              [num(raw.set_3_player_1), num(raw.set_3_player_2)],
            ] as [number, number][]).filter(([a, b]) => a > 0 || b > 0),
          }))
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      ),
      () => setItems([]),
    );
  }, [uid]);

  return items;
}

/** A tournament match whose opponent asked the signed-in member to arrange a time. */
export type ScheduleAskItem = {
  id: string;
  eventId: string;
  fromUid: string;
  fromName: string;
};

/**
 * Tournament matches flagged `schedule_requested` by the member's opponent. One listener per side
 * (player_1 / player_2) since Firestore can't OR two fields; each keeps its own half of the list.
 */
export function useScheduleAsks(uid?: string): ScheduleAskItem[] {
  const [sides, setSides] = useState<Record<'player_1' | 'player_2', ScheduleAskItem[]>>({ player_1: [], player_2: [] });

  useEffect(() => {
    if (!uid) { setSides({ player_1: [], player_2: [] }); return; }
    const listen = (me: 'player_1' | 'player_2') => {
      const them = me === 'player_1' ? 'player_2' : 'player_1';
      return onSnapshot(
        query(collection(db, 'matches'), where(`${me}_uid`, '==', uid), where('schedule_requested', '==', true)),
        (snap) => setSides((prev) => ({
          ...prev,
          [me]: snap.docs
            .map((d) => ({ id: d.id, raw: d.data() }))
            .filter(({ raw }) => raw.status !== 'complete' && raw.schedule_requested_by && raw.schedule_requested_by !== uid)
            .map(({ id, raw }): ScheduleAskItem => ({
              id,
              eventId: raw.event_id || '',
              fromUid: raw[`${them}_uid`] || '',
              fromName: raw[`${them}_name`] || 'Your opponent',
            })),
        })),
        () => setSides((prev) => ({ ...prev, [me]: [] })),
      );
    };
    const offs = [listen('player_1'), listen('player_2')];
    return () => offs.forEach((off) => off());
  }, [uid]);

  return [...sides.player_1, ...sides.player_2];
}
