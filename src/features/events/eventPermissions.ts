import type { TennisEvent } from '../../types';

/** Mirrors the event-manager rule used by Firestore and Functions. */
export const isEventManager = (event: Pick<TennisEvent, 'creator_id' | 'organizer_ids'> | null, uid?: string | null) =>
  !!uid && ((!!event?.creator_id && event.creator_id === uid) || !!event?.organizer_ids?.includes(uid));
