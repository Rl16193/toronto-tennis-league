import { useEffect, useRef, useState } from 'react';
import type { TaskProgress } from '../../types';
import { earnedBadges } from './badges';
import type { Counters } from './taskCatalog';

const SEEN_KEY = 'rs-seen-badges';

const readSeen = (): string[] => {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch { return []; }
};

const writeSeen = (ids: string[]) => {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify(ids)); } catch { /* private mode */ }
};

/**
 * Fires a one-line toast the first time a badge is earned, instead of expanding the badges
 * section or otherwise moving the page under the player.
 *
 * `progressLoaded` matters: before the tasks read resolves, `earnedBadges` returns an
 * empty list, and treating that as "nothing earned" would wipe the seen-list and then re-toast
 * every badge a moment later.
 *
 * On the very first run (no stored list) the current badges are recorded silently — otherwise a
 * long-standing player opening the app on a new device gets a toast for badges they earned
 * months ago.
 */
export function useBadgeToast(
  progress: TaskProgress | null,
  counters: Counters,
  progressLoaded: boolean,
): { toast: string | null; dismissToast: () => void } {
  const [toast, setToast] = useState<string | null>(null);
  const seeded = useRef(false);

  const earnedIds = progressLoaded ? earnedBadges(progress, counters).map((b) => b.id).join(',') : '';

  useEffect(() => {
    if (!progressLoaded) return;
    const current = earnedIds ? earnedIds.split(',') : [];

    if (!seeded.current) {
      seeded.current = true;
      // No stored list at all — this device has never seen the player's badges. Record and stay quiet.
      if (localStorage.getItem(SEEN_KEY) === null) { writeSeen(current); return; }
    }

    const seen = new Set(readSeen());
    const fresh = current.filter((id) => !seen.has(id));
    if (fresh.length === 0) return;

    writeSeen([...seen, ...fresh]);
    setToast('You have earned a badge! Add it to your profile.');
  }, [earnedIds, progressLoaded]);

  return { toast, dismissToast: () => setToast(null) };
}
