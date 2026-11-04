// One registration lifecycle: new → withdrawn → active again, always on the same row.
// Pure (no Firestore reads or writes), so Join, the Tournament page and the dashes share it.
import { Timestamp } from 'firebase/firestore';

// MIRRORS registrationId in functions/lib/participantSeat.js and the event_participants id rule.
const DOUBLES_ID: Record<string, string> = { "men's": 'mensdoubles', "women's": 'womensdoubles', 'mixed doubles': 'mixeddoubles' };

export const registrationId = (eventId: string, uid: string, category: string, division?: string) =>
  `${eventId}_${uid}${category === 'doubles_tournament' ? `_${DOUBLES_ID[(division || '').toLowerCase()] || 'doubles'}` : ''}`;

/** The withdrawal pills, and the withdrawn_reason each one stores. */
export const REMOVAL_REASONS = ['Wrong zone', 'Unavailable', 'Other'] as const;
export type RemovalReason = typeof REMOVAL_REASONS[number];
const REASON_CODE: Record<RemovalReason, 'wrong_zone' | 'unavailable' | 'other'> = {
  'Wrong zone': 'wrong_zone', Unavailable: 'unavailable', Other: 'other',
};

type EventRef = { id: string; title: string; category: string; sub_category: string };
type JoinFields = { division?: string; skill?: number; partner_uid?: string; partner_name?: string };

/** A full v3 event_participants row. */
export const newRegistration = (event: EventRef, uid: string, userName: string, fields: JoinFields = {}) => ({
  uid, user_name: userName,
  event_id: event.id, event_name: event.title,
  category: event.category, sub_category: event.sub_category,
  division: fields.division ?? '', skill: fields.skill ?? 0,
  partner_uid: fields.partner_uid ?? '', partner_name: fields.partner_name ?? '',
  status: 'active', withdrawn_reason: '', withdrawn_at: null, withdrawn_by: '',
  created_at: Timestamp.now(),
});

/** `by` is whoever withdrew them: an organizer, or the member themselves. */
export const withdrawal = (by: string, reason?: RemovalReason) => ({
  status: 'withdrawn', withdrawn_reason: reason ? REASON_CODE[reason] : '', withdrawn_at: Timestamp.now(), withdrawn_by: by,
});

export const reactivation = () => ({ status: 'active', withdrawn_reason: '', withdrawn_at: null, withdrawn_by: '' });

/**
 * What joining writes on the row's id: nothing when already active, the withdrawn row set active
 * again with the new details (only the fields the owner's rule allows), else a new row.
 */
export const joinWrite = (existing: { status?: string } | undefined, row: ReturnType<typeof newRegistration>) =>
  existing?.status === 'active' ? null
    : existing ? { update: { ...reactivation(), user_name: row.user_name, division: row.division, skill: row.skill, partner_uid: row.partner_uid, partner_name: row.partner_name } }
      : { set: row };
