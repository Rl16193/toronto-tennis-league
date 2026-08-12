import { useEffect, useMemo, useRef, useState } from 'react';
import { collection, doc, getDocs, increment, limit, onSnapshot, query, setDoc, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import type { TaskProgress, UserProfile } from '../../types';
import {
  ALL_TIERS, CATEGORIES, Counters, EMPTY_COUNTERS, SETUP_POINTS, TIER_POINTS,
} from './taskCatalog';
import { fetchCompletedTournamentMatches } from './matchHistory';

export * from './taskCatalog';

// Community tasks. Every single item — the Initiation checklist items AND every category's
// items — is a "task". A "milestone" is completing EVERY task within one category. Completed
// tasks are written to the player's tasks doc so the Community leaderboard can total
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

export const INSTAGRAM_URL = 'https://www.instagram.com/racqnstringstoronto';
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
  { id: 'waitingBoard', title: 'Submit a waiting-board report', label: 'Board Report', kind: 'auto', to: '/tasks?photo=1' },
  { id: 'courtVisit', title: 'Visit one public court', label: 'Court Visit', kind: 'auto', to: '/tasks?checkin=1' },
  { id: 'queuePhoto', title: 'Submit a racquet queue report', label: 'Queue Report', kind: 'auto', to: '/tasks?photo=1' },
  { id: 'playMatch', title: 'Play 1 match', label: 'Match', kind: 'auto', to: '/tournament' },
  { id: 'courtSuggestion', title: 'Submit a court improvement', label: 'Suggestion', kind: 'auto', to: '/courts' },
  { id: 'whatsappGroup', title: 'Join the WhatsApp group', label: 'WhatsApp', kind: 'trust', link: WHATSAPP_URL },
  { id: 'profilePhoto', title: 'Add a profile photo', label: 'Photo', kind: 'auto', to: '/profile' },
  { id: 'joinEvent', title: 'Join your first event', label: 'Event', kind: 'auto', to: '/events' },
  // 'ladderMatch' ("Play a League Ladder Match") was removed from the Initiation checklist —
  // it gated the Member badge behind the ladder, which most new players never reach. The
  // TaskId and the task_progress field are kept so existing docs that already have the flag
  // stay valid; it simply no longer counts toward setupComplete.
  // KEEP IN SYNC with INITIATION_TASK_IDS in functions/lib/points.js.
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
  if (!p.contacts.phone?.trim()) missing.push('Phone');
  if (!(p.contacts.whatsapp_contact?.trim() || p.contacts.whatsapp_same_as_phone)) missing.push('WhatsApp contact');
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
    doc(db, 'tasks', uid),
    { uid, name, category: 'progress', [id]: done, updatedAt: new Date().toISOString() },
    { merge: true },
  );

// Bump a stored counter (used for things the app can't derive from other collections).
export const bumpCounter = (uid: string, name: string, key: string, by = 1) =>
  setDoc(
    doc(db, 'tasks', uid),
    { uid, name, category: 'progress', [key]: increment(by), updatedAt: new Date().toISOString() },
    { merge: true },
  );

// ─── Counters derived from real data ────────────────────────────────────────

type PlayedResult = { at: number; won: boolean };

// Shared by both result loaders below: de-dupes docs appearing in both queries (e.g. a player
// who is both player_1/player_2, or challenger/opponent, across different docs) by id, then maps
// each to a PlayedResult — `toResult` returning null skips that doc (used for the tournament
// walkover/blank-score guard, which the ladder loader doesn't need).
const dedupePlayedResults = (
  docs: { id: string; data: () => Record<string, any> }[],
  toResult: (data: Record<string, any>) => PlayedResult | null,
): PlayedResult[] => {
  const seen = new Set<string>();
  const out: PlayedResult[] = [];
  docs.forEach((d) => {
    if (seen.has(d.id)) return;
    seen.add(d.id);
    const result = toResult(d.data());
    if (result) out.push(result);
  });
  return out;
};

// Completed matches with real set scores — walkovers and score-less completions don't count.
const loadTournamentResults = async (uid: string): Promise<PlayedResult[]> => {
  const docs = await fetchCompletedTournamentMatches(uid);
  return dedupePlayedResults(docs, (m) => ({
    at: new Date(m.completed_at || m.created_at || 0).getTime(),
    won: m.winner_uid === uid,
  }));
};

const loadLadderResults = async (uid: string): Promise<PlayedResult[]> => {
  const [asChallenger, asOpponent] = await Promise.all([
    getDocs(query(collection(db, 'matches'), where('category', '==', 'challenge'), where('player_1_uid', '==', uid), where('status', '==', 'confirmed'))),
    getDocs(query(collection(db, 'matches'), where('category', '==', 'challenge'), where('player_2_uid', '==', uid), where('status', '==', 'confirmed'))),
  ]);
  return dedupePlayedResults([...asChallenger.docs, ...asOpponent.docs], (c) => ({
    at: new Date(c.confirmed_at || c.created_at || 0).getTime(),
    won: c.claimed_winner_uid === uid,
  }));
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
  const written = useRef<Set<string>>(new Set());

  useEffect(() => {
    setProgressLoaded(false);
    written.current.clear();
    if (!user) { setProgress(null); return; }
    return onSnapshot(doc(db, 'tasks', user.uid), (s) => {
      setProgress(s.exists() ? (s.data() as TaskProgress) : null);
      setProgressLoaded(true);
    });
  }, [user?.uid]);

  // One-shot data reads. Each is isolated so one blocked collection can't stop the others.
  useEffect(() => {
    if (!user) return;
    let alive = true;
    const safe = <T,>(p: Promise<T>, fallback: T) => p.catch(() => fallback);
    // The `joinEvent` task used to be awarded from here off an event_participants lookup.
    // functions/taskPoints.js (onEventJoinedAwardPoints) now does it server-side, so that
    // query was dropped along with the client write it fed.
    Promise.all([
      safe(loadTournamentResults(user.uid), [] as PlayedResult[]),
      safe(loadLadderResults(user.uid), [] as PlayedResult[]),
    ]).then(([tournament, ladder]) => {
      if (!alive) return;
      const all = [...tournament, ...ladder];
      setDerived({
        matchesPlayed: tournament.length,
        challengesPlayed: ladder.length,
        challengesWon: ladder.filter((r) => r.won).length,
        bestStreak: longestWinStreak(all),
        monthsActive: distinctMonths(all),
      });
    });
    return () => { alive = false; };
  }, [user?.uid]);

  // Stored counters (things the app can't derive) come straight off task_progress.
  const counters: Counters = useMemo(() => {
    const rec = asRecord(progress);
    const num = (k: string) => (typeof rec[k] === 'number' ? (rec[k] as number) : 0);
    return {
      ...EMPTY_COUNTERS,
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

  // Award the two Initiation tasks that are derived purely from the player's own profile.
  //
  // Everything else the client used to write here — playMatch, joinEvent, ladderMatch, every
  // tier, and the sticky setupComplete award — is now written server-side by
  // functions/taskPoints.js via the Admin SDK. Those fields carry points, and points are
  // spendable on Services, so firestore.rules deliberately rejects a client write to them; the
  // client attempting them anyway produced a permission-denied write on every render.
  //
  // NOTE: a failed write is NOT retried. `written` used to be cleared in .catch(), which turned
  // a rejected write into an endless render→write→reject→render spin (this is what made the
  // Profile page flicker). One attempt per id per session is enough — the server is the real
  // source of truth for anything that matters.
  useEffect(() => {
    if (!user || !profile || !progressLoaded) return;
    const name = profile.user.name || '';
    const rec = asRecord(progress);

    const selfEvident: Partial<Record<TaskId, boolean>> = {
      profileComplete: missing.length === 0,
      profilePhoto: !!profile.user.avatar,
    };
    (Object.keys(selfEvident) as TaskId[]).forEach((id) => {
      if (selfEvident[id] && !rec[id] && !written.current.has(id)) {
        written.current.add(id);
        setTaskDone(user.uid, name, id, true).catch(() => { /* stays marked — see note above */ });
      }
    });
  }, [user?.uid, profile, progress, progressLoaded, missing.length]);

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
    getDocs(collection(db, 'tasks'))
      .then((snap) => {
        const data = snap.docs
          .map((d) => {
            const t = d.data() as TaskProgress;
            return {
              ...t,
              uid: d.id,
              points: taskPoints(t),
              tasksCompleted: tasksCompletedCount(t),
              milestones: milestoneCount(t),
            };
          })
          .filter((r) => {
            const type = (r as Record<string, unknown>).type;
            return !type || (type !== 'offer' && type !== 'group');
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
