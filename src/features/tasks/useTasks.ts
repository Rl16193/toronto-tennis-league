import { useEffect, useMemo, useRef, useState } from 'react';
import { collection, doc, getDocs, increment, limit, onSnapshot, query, setDoc, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import type { TaskProgress, UserProfile } from '../../types';
import {
  ALL_TIERS, CATEGORIES, Counters, EMPTY_COUNTERS, SETUP_POINTS, TIER_POINTS,
} from './taskCatalog';

export * from './taskCatalog';

// Community tasks. Every single item — the Initiation checklist items AND every category's
// items — is a "task". A "milestone" is completing EVERY task within one category. Completed
// tasks are written to the player's task_progress doc so the Community leaderboard can total
// anyone's points, tasks and milestones from one read. (The Initiation still pays a flat award
// for finishing its checklist; category items pay their own points.)

export type TaskId =
  | 'profileComplete'
  | 'followSocial'
  | 'tagPost'
  | 'waitingBoard'
  | 'courtVisit'
  | 'queuePhoto'
  | 'playMatch'
  | 'courtSuggestion'
  | 'whatsappGroup'
  | 'profilePhoto'
  | 'joinEvent'
  | 'ladderMatch';

export const INSTAGRAM_URL = 'https://www.instagram.com/racqnstringstoronto?igsh=MTQ0eXA1bXZpbXltaQ==';
export const WHATSAPP_URL = 'https://chat.whatsapp.com/Bh7OVww9e08GP4TuoFF5NX';

export type TaskDef = {
  id: TaskId;
  title: string;
  label: string;
  kind: 'auto' | 'trust';
  locked?: true;
  link?: string;
  to?: string;
};

export const TASKS: TaskDef[] = [
  { id: 'profileComplete', title: 'Complete your profile', label: 'Profile', kind: 'auto', to: '/profile' },
  { id: 'followSocial', title: 'Follow us on Instagram', label: 'Follow', kind: 'trust', link: INSTAGRAM_URL },
  { id: 'tagPost', title: 'Tag us in a story or post', label: 'Tag Post', kind: 'trust', link: INSTAGRAM_URL },
  { id: 'waitingBoard', title: 'Submit a waiting-board photo', label: 'Board Photo', kind: 'auto', to: '/tasks?photo=1' },
  { id: 'courtVisit', title: 'Visit one public court', label: 'Court Visit', kind: 'auto', to: '/tasks?checkin=1' },
  { id: 'queuePhoto', title: 'Submit a racquet queue photo', label: 'Queue Photo', kind: 'auto', to: '/tasks?photo=1' },
  { id: 'playMatch', title: 'Play 1 match', label: 'Match', kind: 'auto', to: '/tournament' },
  { id: 'courtSuggestion', title: 'Submit a court improvement', label: 'Suggestion', kind: 'auto', to: '/courts' },
  { id: 'whatsappGroup', title: 'Join the WhatsApp group', label: 'WhatsApp', kind: 'trust', link: WHATSAPP_URL },
  { id: 'profilePhoto', title: 'Add a profile photo', label: 'Photo', kind: 'auto', to: '/profile' },
  { id: 'joinEvent', title: 'Join your first event', label: 'Event', kind: 'auto', to: '/events' },
  { id: 'ladderMatch', title: 'Play a League Ladder Match', label: 'Ladder', kind: 'auto', to: '/tournament' },
];

export const UNLOCKED_TASK_IDS: TaskId[] = TASKS.filter((t) => !t.locked).map((t) => t.id);

// A category = one group of tasks. The Community Member Initiation is a category too; the rest
// come from the catalogue. TASKS COMPLETED = every done item across all categories. MILESTONES =
// categories where every task is done. Locked categories can't be finished, so they're excluded.
const TASK_CATEGORIES: { id: string; taskIds: string[] }[] = [
  { id: 'initiation', taskIds: UNLOCKED_TASK_IDS },
  ...CATEGORIES.filter((c) => !c.locked).map((c) => ({ id: c.id, taskIds: c.tiers.map((t) => t.id) })),
];
export const TOTAL_TASKS = TASK_CATEGORIES.reduce((n, g) => n + g.taskIds.length, 0);
export const TOTAL_MILESTONES = TASK_CATEGORIES.length;

// Total individual tasks a player has completed, across every category.
export const tasksCompletedCount = (t: Partial<TaskProgress> | null | undefined): number => {
  const rec = asRecord(t);
  return TASK_CATEGORIES.reduce((n, g) => n + g.taskIds.filter((id) => rec[id]).length, 0);
};

// Categories in which the player has completed every task.
export const milestoneCount = (t: Partial<TaskProgress> | null | undefined): number => {
  const rec = asRecord(t);
  return TASK_CATEGORIES.filter((g) => g.taskIds.length > 0 && g.taskIds.every((id) => rec[id])).length;
};

const asRecord = (t: Partial<TaskProgress> | null | undefined) => (t || {}) as Record<string, unknown>;

// Total community points: the flat Initiation award, every earned tier, plus any group/community
// bonus points (Matchday, zone sweeps, …) awarded server-side (see functions/groupAwards.js).
export const taskPoints = (t: Partial<TaskProgress> | null | undefined): number => {
  const rec = asRecord(t);
  const tiers = ALL_TIERS.reduce((n, tier) => n + (rec[tier.id] ? TIER_POINTS[tier.id] : 0), 0);
  const bonus = typeof t?.bonusPoints === 'number' ? t.bonusPoints : 0;
  return (t?.setupComplete ? SETUP_POINTS : 0) + tiers + bonus;
};

// "Complete your profile" gate — the ENTIRE profile must be filled in.
export const profileMissingFields = (p: UserProfile | null): string[] => {
  if (!p) return ['Profile'];
  const missing: string[] = [];
  if (!p.user.name?.trim()) missing.push('Name');
  if (!p.user.phone?.trim()) missing.push('Phone');
  if (!(p.user.whatsapp_contact?.trim() || p.user.whatsapp_same_as_phone)) missing.push('WhatsApp contact');
  if (!p.user.bio?.trim()) missing.push('Bio');
  if (!p.preferences.preferred_courts?.length) missing.push('Preferred courts');
  const grid = p.preferences.availability;
  const hasAvailability =
    (grid && Object.values(grid).some((slots) => slots && slots.length > 0)) ||
    p.preferences.availability_day?.length > 0;
  if (!hasAvailability) missing.push('Availability');
  return missing;
};

// Owner marks their own task; the organizer calls this with done=false to revoke someone else's.
export const setTaskDone = (uid: string, name: string, id: string, done: boolean) =>
  setDoc(
    doc(db, 'task_progress', uid),
    { user_id: uid, name, [id]: done, updatedAt: new Date().toISOString() },
    { merge: true },
  );

// Bump a stored counter (used for things the app can't derive from other collections).
export const bumpCounter = (uid: string, name: string, key: string, by = 1) =>
  setDoc(
    doc(db, 'task_progress', uid),
    { user_id: uid, name, [key]: increment(by), updatedAt: new Date().toISOString() },
    { merge: true },
  );

// ─── Counters derived from real data ────────────────────────────────────────

type PlayedResult = { at: number; won: boolean };

// Completed matches with real set scores — walkovers and score-less completions don't count.
const loadTournamentResults = async (uid: string): Promise<PlayedResult[]> => {
  const [p1, p2] = await Promise.all([
    getDocs(query(collection(db, 'tournament_matches'), where('player_1_user_id', '==', uid), where('status', '==', 'complete'))),
    getDocs(query(collection(db, 'tournament_matches'), where('player_2_user_id', '==', uid), where('status', '==', 'complete'))),
  ]);
  const seen = new Set<string>();
  const out: PlayedResult[] = [];
  [...p1.docs, ...p2.docs].forEach((d) => {
    if (seen.has(d.id)) return;
    seen.add(d.id);
    const m = d.data();
    // A walkover is recorded as sets of 0-0 — still non-null, so the blank check alone doesn't
    // catch it. Both conditions are needed: a real score, and not a walkover.
    if (m.walkover === true) return;
    if (m.set_1_player_1 == null || m.set_1_player_2 == null) return; // no real score
    out.push({
      at: new Date(m.completed_at || m.created_at || 0).getTime(),
      won: m.winner_user_id === uid,
    });
  });
  return out;
};

const loadLadderResults = async (uid: string): Promise<PlayedResult[]> => {
  const [asChallenger, asOpponent] = await Promise.all([
    getDocs(query(collection(db, 'ladder_challenges'), where('challenger_id', '==', uid), where('status', '==', 'confirmed'))),
    getDocs(query(collection(db, 'ladder_challenges'), where('opponent_id', '==', uid), where('status', '==', 'confirmed'))),
  ]);
  const seen = new Set<string>();
  const out: PlayedResult[] = [];
  [...asChallenger.docs, ...asOpponent.docs].forEach((d) => {
    if (seen.has(d.id)) return;
    seen.add(d.id);
    const c = d.data();
    out.push({
      at: new Date(c.confirmed_at || c.created_at || 0).getTime(),
      won: c.claimed_winner_id === uid,
    });
  });
  return out;
};

// Longest run of wins across every result, oldest first.
const longestWinStreak = (results: PlayedResult[]): number => {
  let best = 0;
  let run = 0;
  [...results].sort((a, b) => a.at - b.at).forEach((r) => {
    run = r.won ? run + 1 : 0;
    if (run > best) best = run;
  });
  return best;
};

const distinctMonths = (results: PlayedResult[]): number =>
  new Set(results.filter((r) => r.at > 0).map((r) => new Date(r.at).toISOString().slice(0, 7))).size;

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useTasks() {
  const { user, profile } = useAuth();
  const [progress, setProgress] = useState<TaskProgress | null>(null);
  const [progressLoaded, setProgressLoaded] = useState(false);
  const [derived, setDerived] = useState<Partial<Counters>>({});
  const [joinedEvent, setJoinedEvent] = useState(false);
  const written = useRef<Set<string>>(new Set());

  useEffect(() => {
    setProgressLoaded(false);
    written.current.clear();
    if (!user) { setProgress(null); return; }
    return onSnapshot(doc(db, 'task_progress', user.uid), (s) => {
      setProgress(s.exists() ? (s.data() as TaskProgress) : null);
      setProgressLoaded(true);
    });
  }, [user?.uid]);

  // One-shot data reads. Each is isolated so one blocked collection can't stop the others.
  useEffect(() => {
    if (!user) return;
    let alive = true;
    const safe = <T,>(p: Promise<T>, fallback: T) => p.catch(() => fallback);
    Promise.all([
      safe(loadTournamentResults(user.uid), [] as PlayedResult[]),
      safe(loadLadderResults(user.uid), [] as PlayedResult[]),
      safe(getDocs(query(collection(db, 'event_participants'), where('user_id', '==', user.uid), limit(1))).then((s) => !s.empty), false),
    ]).then(([tournament, ladder, joinedEvent]) => {
      if (!alive) return;
      const all = [...tournament, ...ladder];
      setDerived({
        matchesPlayed: tournament.length,
        challengesPlayed: ladder.length,
        challengesWon: ladder.filter((r) => r.won).length,
        bestStreak: longestWinStreak(all),
        monthsActive: distinctMonths(all),
      });
      setJoinedEvent(joinedEvent);
    });
    return () => { alive = false; };
  }, [user?.uid]);

  // Stored counters (things the app can't derive) come straight off task_progress.
  const counters: Counters = useMemo(() => {
    const rec = asRecord(progress);
    const num = (k: string) => (typeof rec[k] === 'number' ? (rec[k] as number) : 0);
    return {
      ...EMPTY_COUNTERS,
      climbSpots: num('climbSpots'),
      suggestions: num('suggestions'),
      courtsVisited: num('courtsVisited'),
      zoneComplete: num('zoneComplete'),
      boardPhotos: num('boardPhotos'),
      queueUpdates: num('queueUpdates'),
      volunteerEvents: num('volunteerEvents'),
      invites: num('invites'),
      meetups: num('meetups'),
      ...derived,
    };
  }, [progress, derived]);

  const missing = profileMissingFields(profile);

  // Award anything newly qualified: Initiation auto-tasks, then every tier whose counter is met,
  // then the sticky Initiation award. Each write happens once per session.
  useEffect(() => {
    if (!user || !profile || !progressLoaded) return;
    const name = profile.user.name || '';
    const rec = asRecord(progress);

    const initiation: Partial<Record<TaskId, boolean>> = {
      profileComplete: missing.length === 0,
      profilePhoto: !!profile.user.avatar,
      playMatch: (counters.matchesPlayed ?? 0) > 0,
      joinEvent: joinedEvent,
      ladderMatch: (counters.challengesPlayed ?? 0) > 0,
    };
    (Object.keys(initiation) as TaskId[]).forEach((id) => {
      if (initiation[id] && !rec[id] && !written.current.has(id)) {
        written.current.add(id);
        setTaskDone(user.uid, name, id, true).catch(() => written.current.delete(id));
      }
    });

    ALL_TIERS.forEach((tier) => {
      if (rec[tier.id] || written.current.has(tier.id)) return;
      if ((counters[tier.counter] ?? 0) < tier.need) return;
      written.current.add(tier.id);
      setTaskDone(user.uid, name, tier.id, true).catch(() => written.current.delete(tier.id));
    });

    if (
      progress && !progress.setupComplete && !written.current.has('setupComplete') &&
      UNLOCKED_TASK_IDS.every((id) => rec[id])
    ) {
      written.current.add('setupComplete');
      setTaskDone(user.uid, name, 'setupComplete', true).catch(() => written.current.delete('setupComplete'));
    }
  }, [user?.uid, profile, progress, progressLoaded, counters, joinedEvent, missing.length]);

  return {
    user,
    profile,
    progress,
    progressLoaded,
    missing,
    counters,
    points: taskPoints(progress),
  };
}

// ─── Community leaderboard ──────────────────────────────────────────────────

export type CommunityRow = TaskProgress & {
  points: number;
  tasksCompleted: number; // total individual tasks done across all categories
  milestones: number;     // categories fully completed
};

export function useCommunityStandings() {
  const [rows, setRows] = useState<CommunityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    getDocs(collection(db, 'task_progress'))
      .then((snap) => {
        const data = snap.docs
          .map((d) => {
            const t = d.data() as TaskProgress;
            return {
              ...t,
              user_id: d.id,
              points: taskPoints(t),
              tasksCompleted: tasksCompletedCount(t),
              milestones: milestoneCount(t),
            };
          })
          .filter((r) => r.points > 0 || r.tasksCompleted > 0)
          .sort((a, b) =>
            b.points - a.points ||
            b.tasksCompleted - a.tasksCompleted ||
            b.milestones - a.milestones ||
            (a.name || '').localeCompare(b.name || ''));
        setRows(data);
      })
      .catch(() => { /* rules not deployed yet — board shows its empty state */ })
      .finally(() => setLoading(false));
  }, [reloadKey]);

  return { rows, loading, reload: () => setReloadKey((k) => k + 1) };
}
