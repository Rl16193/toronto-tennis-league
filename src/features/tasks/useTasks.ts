import { useEffect, useMemo, useRef, useState } from 'react';
import { Timestamp, collection, doc, getDocs, onSnapshot, query, updateDoc, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { toMillis } from '../../utils/eventDates';
import { isGuest } from '../../utils/guest';
import { useAuth } from '../../context/AuthContext';
import type { UserProfile, UserStats } from '../../types';
import {
  CATEGORIES, Counters, INITIATION, TaskProgress, countersOf, taskState,
} from './taskCatalog';
import { INSTAGRAM_URL, WHATSAPP_URL } from '../../components/FooterElements';

export * from './taskCatalog';

// Every item — Initiation checklist and category items alike — is a "task"; a "milestone" is
// completing every task in one category. Progress is the member's stats doc: the server keeps the
// counters and stats.rsPoints; the member writes only the five self-reported booleans.

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
  | 'joinEvent';

export type TaskDef = {
  id: TaskId;
  title: string;
  label: string;
  kind: 'auto' | 'trust';
  locked?: true;
  link?: string;
  to?: string;
};

// KEEP IN SYNC with INITIATION in taskCatalog.ts and functions/lib/points.js.
export const TASKS: TaskDef[] = [
  { id: 'profileComplete', title: 'Complete your profile', label: 'Profile', kind: 'auto', to: '/profile' },
  { id: 'followSocial', title: 'Follow us on Instagram', label: 'Follow', kind: 'trust', link: INSTAGRAM_URL },
  { id: 'tagPost', title: 'Tag us in a story or post', label: 'Tag Post', kind: 'trust', link: INSTAGRAM_URL },
  { id: 'waitingBoard', title: 'Submit a waiting-board report', label: 'Board Report', kind: 'auto', to: '/tasks?photo=waiting_board' },
  { id: 'courtVisit', title: 'Visit one public court', label: 'Court Visit', kind: 'auto', to: '/tasks?checkin=1' },
  { id: 'queuePhoto', title: 'Submit a racquet queue report', label: 'Queue Report', kind: 'auto', to: '/tasks?photo=queue' },
  { id: 'playMatch', title: 'Play 1 match', label: 'Match', kind: 'auto', to: '/tournament' },
  { id: 'courtSuggestion', title: 'Submit a court improvement', label: 'Suggestion', kind: 'auto', to: '/tasks?photo=condition' },
  { id: 'whatsappGroup', title: 'Join the WhatsApp group', label: 'WhatsApp', kind: 'trust', link: WHATSAPP_URL },
  { id: 'profilePhoto', title: 'Add a profile photo', label: 'Photo', kind: 'auto', to: '/profile' },
  { id: 'joinEvent', title: 'Join your first event', label: 'Event', kind: 'auto', to: '/events' },
];

export const UNLOCKED_TASK_IDS: TaskId[] = TASKS.filter((t) => !t.locked).map((t) => t.id);

/** The initiation checklist opens by default (Tasks and Profile) until this many are done. */
export const INITIATION_OPEN_UNTIL = 7;
export const initiationDoneCount = (progress: TaskProgress | null) =>
  UNLOCKED_TASK_IDS.filter((id) => !!progress?.[id]).length;

// A category = one group of tasks. The Community Member Initiation is a category too; the rest
// come from the catalogue. TASKS COMPLETED = every done item across all categories. MILESTONES =
// categories where every task is done. Locked categories can't be finished, so they're excluded.
const TASK_CATEGORIES: { id: string; taskIds: string[] }[] = [
  { id: 'initiation', taskIds: INITIATION.map((i) => i.id) },
  ...CATEGORIES.filter((c) => !c.locked).map((c) => ({ id: c.id, taskIds: c.tiers.map((t) => t.id) })),
];
export const TOTAL_TASKS = TASK_CATEGORIES.reduce((n, g) => n + g.taskIds.length, 0);
export const TOTAL_MILESTONES = TASK_CATEGORIES.length;

// Total individual tasks a player has completed, across every category.
export const tasksCompletedCount = (t: TaskProgress | null | undefined): number =>
  TASK_CATEGORIES.reduce((n, g) => n + g.taskIds.filter((id) => t?.[id]).length, 0);

// Categories in which the player has completed every task.
export const milestoneCount = (t: TaskProgress | null | undefined): number =>
  TASK_CATEGORIES.filter((g) => g.taskIds.length > 0 && g.taskIds.every((id) => t?.[id])).length;

// "Complete your profile" gate — the ENTIRE profile must be filled in.
export const profileMissingFields = (p: UserProfile | null): string[] => {
  if (!p) return ['Profile'];
  const missing: string[] = [];
  if (!p.user.name?.trim()) missing.push('Name');
  if (!p.contacts.phone?.trim()) missing.push('Phone');
  if (!p.contacts.whatsapp_contact?.trim()) missing.push('WhatsApp contact');
  if (!p.user.bio?.trim()) missing.push('Bio');
  if (!p.preferences.preferred_courts?.length && !p.preferences.custom_courts?.length) missing.push('Preferred courts');
  if (!p.preferences.availability_tags?.length) missing.push('Availability');
  return missing;
};

/**
 * A self-reported initiation item on stats/{uid}. The owner ticks their own; an organizer calls
 * this with done=false to revoke someone else's (rules allow organizers only these five booleans).
 */
export const setTaskDone = (uid: string, id: string, done: boolean) =>
  updateDoc(doc(db, 'stats', uid), { [id]: done, updated_at: Timestamp.now() });

/**
 * Sweep progress: courts covered this cycle out of the courts it needs, from a site_stats sweep doc
 * kept by onCourtActivityZoneSweep — 'city_sweep' (Explorer) or 'zone_sweep_{zone slug}'.
 * null while there's no doc yet, or when docId is null.
 */
export function useSweep(docId: string | null) {
  const [sweep, setSweep] = useState<{ covered: number; total: number } | null>(null);
  useEffect(() => {
    if (!docId) { setSweep(null); return; }
    return onSnapshot(
      doc(db, 'site_stats', docId),
      (snap) => {
        const d = snap.data();
        setSweep(d && d.total_courts ? { covered: (d.covered_keys || []).length, total: d.total_courts } : null);
      },
      () => setSweep(null),
    );
  }, [docId]);
  return sweep;
}

/**
 * Per group bonus (`awards.category`): when it was last paid (`updated_at` moves with each new
 * awardee), how many distinct members it has ever paid, and how many payouts in all (a member paid
 * on five Matchdays is five). One read of the task awards.
 */
export function useGroupAwardStats() {
  const [byAward, setByAward] = useState<Record<string, { last: Date | null; players: number; payouts: number }>>({});
  useEffect(() => {
    getDocs(query(collection(db, 'awards'), where('sub_category', '==', 'task')))
      .then((snap) => {
        const acc: Record<string, { last: number; uids: Set<string>; payouts: number }> = {};
        snap.forEach((d) => {
          const a = d.data();
          const e = (acc[a.category] ??= { last: 0, uids: new Set(), payouts: 0 });
          e.last = Math.max(e.last, toMillis(a.updated_at));
          (a.awardees || []).forEach((u: string) => e.uids.add(u));
          e.payouts += (a.awardees || []).length;
        });
        setByAward(Object.fromEntries(Object.entries(acc)
          .map(([k, e]) => [k, { last: e.last ? new Date(e.last) : null, players: e.uids.size, payouts: e.payouts }])));
      })
      .catch(() => { /* unreadable — cards show no tally */ });
  }, []);
  return byAward;
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useTasks() {
  const { user, profile } = useAuth();
  const [stats, setStats] = useState<UserStats | null>(null);
  const [progressLoaded, setProgressLoaded] = useState(false);
  const written = useRef<Set<string>>(new Set());

  useEffect(() => {
    setProgressLoaded(false);
    written.current.clear();
    if (!user) { setStats(null); return; }
    return onSnapshot(
      doc(db, 'stats', user.uid),
      (s) => {
        setStats(s.exists() ? (s.data() as UserStats) : null);
        setProgressLoaded(true);
      },
      () => setProgressLoaded(true),
    );
  }, [user?.uid]);

  const progress: TaskProgress | null = useMemo(() => (stats ? taskState(stats) : null), [stats]);
  const counters: Counters = useMemo(() => countersOf(stats), [stats]);

  const missing = profileMissingFields(profile);

  // Only the two Initiation tasks derived purely from the player's own profile. Everything else
  // is a server counter. A failed write is NOT retried: clearing `written` in .catch() turned a
  // rejected write into an endless render→write→reject spin (the Profile page flicker).
  useEffect(() => {
    if (!user || !profile || !progressLoaded || !stats) return;
    const selfEvident: Partial<Record<TaskId, boolean>> = {
      profileComplete: missing.length === 0,
      profilePhoto: !!profile.user.avatar,
    };
    (Object.keys(selfEvident) as TaskId[]).forEach((id) => {
      if (selfEvident[id] && stats[id as keyof UserStats] !== true && !written.current.has(id)) {
        written.current.add(id);
        setTaskDone(user.uid, id, true).catch(() => { /* stays marked — see note above */ });
      }
    });
  }, [user?.uid, profile, stats, progressLoaded, missing.length]);

  return {
    user,
    profile,
    stats,
    progress,
    progressLoaded,
    missing,
    counters,
    // Server-computed (tiers reached + initiation + task awards); shown as stored, never recomputed.
    points: stats?.rsPoints ?? 0,
  };
}

// ─── Community leaderboard ──────────────────────────────────────────────────

export type CommunityRow = {
  uid: string;
  name: string;
  points: number;
  tasksCompleted: number; // total individual tasks done across all categories
  milestones: number;     // categories fully completed
};

export function useCommunityStandings() {
  const [rows, setRows] = useState<CommunityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    getDocs(collection(db, 'stats'))
      .then((snap) => {
        const data = snap.docs
          .filter((d) => !isGuest(d.id))
          .map((d) => {
            const s = d.data() as UserStats;
            const state = taskState(s);
            return {
              uid: d.id,
              name: s.name || '',
              points: s.rsPoints ?? 0,
              tasksCompleted: tasksCompletedCount(state),
              milestones: milestoneCount(state),
            };
          })
          .filter((r) => r.points > 0)
          .sort((a, b) =>
            b.points - a.points ||
            b.tasksCompleted - a.tasksCompleted ||
            b.milestones - a.milestones ||
            a.name.localeCompare(b.name));
        setRows(data);
      })
      .catch(() => { /* unreadable — board shows its empty state */ })
      .finally(() => setLoading(false));
  }, [reloadKey]);

  return { rows, loading, reload: () => setReloadKey((k) => k + 1) };
}
