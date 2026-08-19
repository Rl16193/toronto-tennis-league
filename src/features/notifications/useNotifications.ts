import { useCallback, useEffect, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';

// Bell-icon feed. Notifications are created server-side (Cloud Functions) and addressed to a
// single recipient; the client only reads its own and marks them read.

export type NotificationType =
  // matches
  | 'match_scheduled'
  | 'draw_published'
  | 'match_advanced'
  | 'match_bye'
  | 'score_rejected'
  | 'group_assigned'
  | 'draw_cancelled'
  // ladder / challenges
  | 'ladder_challenged'
  | 'ladder_reported'
  | 'ladder_cancelled'
  | 'ladder_challenges_reset'
  | 'ladder_cooldown_expired'
  | 'challenge_conversion_proposed'
  | 'challenge_conversion_rejected'
  // tasks
  | 'task_completed'
  | 'initiation_complete'
  | 'task_revoked'
  | 'tasks_unlocked'
  | 'claim_approved'
  | 'claim_rejected'
  | 'group_award_received'
  // ranking
  | 'rank_moved'
  | 'rank_first'
  // account
  | 'welcome'
  | 'profile_incomplete'
  | 'photo_removed'
  | 'suggestion_reviewed'
  // reminders
  | 'reminder_pending_matches'
  | 'reminder_round_deadline'
  | 'reminder_event_tomorrow'
  | 'reminder_signup_closing'
  // organizer
  | 'organizer_score_pending'
  | 'organizer_schedule_request'
  | 'organizer_ladder_pending'
  | 'organizer_event_roster'
  | 'organizer_review_pending';

export interface AppNotification {
  id: string;
  uid: string;
  type: NotificationType | string;
  title: string;
  body?: string;
  link?: string; // in-app route to open on tap
  read?: boolean;
  read_at?: string; // set when marked read — read items are purged 24h after this
  created_at: string;
  // Legacy fields from the pre-bell schedule_request docs (no title/body/link).
  event_id?: string;
  event_title?: string;
  match_round?: string;
  player_1_name?: string;
  player_2_name?: string;
  requested_by_name?: string;
}

const FEED_LIMIT = 30;
const READ_TTL_MS = 24 * 60 * 60 * 1000; // read notifications are deleted 24h after being read

// Fallback wording for notifications written before the bell existed (they carry a `type` and
// raw fields but no title/body/link). Keeps old items readable instead of blank rows.
const normalize = (n: AppNotification): AppNotification => {
  if (n.title) return n;
  const players = [n.player_1_name, n.player_2_name].filter(Boolean).join(' vs ');
  const link = n.link || (n.event_id ? `/tournament?event=${n.event_id}` : undefined);

  if (n.type === 'schedule_request') {
    return {
      ...n,
      link,
      title: `${n.requested_by_name || 'A player'} asked you to schedule a match`,
      body: [players, n.match_round].filter(Boolean).join(' · ') || n.event_title || '',
    };
  }
  return {
    ...n,
    link,
    title: 'Notification',
    body: players || n.event_title || '',
  };
};

export function useNotifications() {
  const { user } = useAuth();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    // Single-field filter + ordering on created_at needs a composite index; the feed is small,
    // so we sort client-side instead and keep the query index-free.
    return onSnapshot(
      query(collection(db, 'notifications'), where('uid', '==', user.uid), limit(100)),
      (snap) => {
        const all = snap.docs.map((d) => normalize({ id: d.id, ...d.data() } as AppNotification));

        // Sweep: read notifications older than 24h (since being read) are deleted for good.
        // Best-effort, client-driven — whichever client next loads the feed does the cleanup.
        const now = Date.now();
        const expired = all.filter((n) => n.read && n.read_at && now - new Date(n.read_at).getTime() > READ_TTL_MS);
        if (expired.length > 0) {
          expired.forEach((n) => {
            deleteDoc(doc(db, 'notifications', n.id)).catch(() => {});
          });
        }
        const expiredIds = new Set(expired.map((n) => n.id));

        const rows = all
          .filter((n) => !expiredIds.has(n.id))
          .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
          .slice(0, FEED_LIMIT);
        setItems(rows);
        setLoading(false);
      },
      () => setLoading(false), // rules not deployed yet — bell stays empty rather than erroring
    );
  }, [user?.uid]);

  const unreadCount = items.filter((n) => !n.read).length;

  const markRead = useCallback(async (id: string) => {
    try {
      await updateDoc(doc(db, 'notifications', id), { read: true, read_at: new Date().toISOString() });
    } catch {
      /* best-effort */
    }
  }, []);

  const markAllRead = useCallback(async () => {
    const unread = items.filter((n) => !n.read);
    if (unread.length === 0) return;
    try {
      const batch = writeBatch(db);
      const readAt = new Date().toISOString();
      unread.forEach((n) => batch.update(doc(db, 'notifications', n.id), { read: true, read_at: readAt }));
      await batch.commit();
    } catch {
      /* best-effort */
    }
  }, [items]);

  return { items, unreadCount, loading, markRead, markAllRead };
}

// "3m", "2h", "5d" — compact relative age for the feed.
export const timeAgo = (iso?: string): string => {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff)) return '';
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return `${Math.floor(days / 7)}w`;
};
