import { httpsCallable } from 'firebase/functions';
import { functions } from '../../../lib/firebase';

export type WithdrawalReason = 'injury' | 'unavailable' | 'cannot_contact' | 'other';

export const withdrawEventParticipant = async (
  eventId: string,
  uid: string,
  reason: WithdrawalReason = 'other',
  note = '',
) => {
  const callable = httpsCallable<
    { eventId: string; uid: string; reason: WithdrawalReason; note: string },
    { withdrawn: boolean; affectedMatches: number }
  >(functions, 'withdrawEventParticipant');
  const result = await callable({ eventId, uid, reason, note });
  return result.data;
};
