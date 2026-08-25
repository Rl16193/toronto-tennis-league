import { FirebaseError } from 'firebase/app';
import { addDoc, collection, doc, setDoc } from 'firebase/firestore';
import { db, functions } from '../../lib/firebase';
import { httpsCallable } from 'firebase/functions';
import { fetchCompletedTournamentMatches } from './matchHistory';

// Volunteer and host claims are reviewed by the event organizer; ambassador claims auto-approve.

export type ClaimType = 'volunteer' | 'ambassador' | 'host';
export type ClaimStatus = 'pending' | 'approved' | 'rejected';

export interface TaskClaim {
  id: string;
  type: ClaimType;
  uid: string;
  user_name: string;
  event_id?: string;
  event_title?: string;
  invitee_id?: string;
  invitee_name?: string;
  meetup_title?: string;
  meetup_date?: string;
  note?: string;
  status: ClaimStatus;
  created_at: string;
  reviewed_at?: string;
  reviewer_note?: string;
}

export async function createVolunteerClaim(
  uid: string,
  name: string,
  eventId: string,
  eventTitle: string,
  note: string,
): Promise<void> {
  await addDoc(collection(db, 'task_claims'), {
    type: 'volunteer',
    uid: uid,
    user_name: name,
    event_id: eventId,
    event_title: eventTitle,
    ...(note.trim() ? { note: note.trim() } : {}),
    status: 'pending',
    created_at: new Date().toISOString(),
  });
}

export async function createHostClaim(
  uid: string,
  name: string,
  eventId: string,
  eventTitle: string,
  meetupTitle: string,
  meetupDate: string,
  note: string,
): Promise<void> {
  await addDoc(collection(db, 'task_claims'), {
    type: 'host',
    uid: uid,
    user_name: name,
    event_id: eventId,
    event_title: eventTitle,
    meetup_title: meetupTitle,
    ...(meetupDate ? { meetup_date: meetupDate } : {}),
    ...(note.trim() ? { note: note.trim() } : {}),
    status: 'pending',
    created_at: new Date().toISOString(),
  });
}

// Real matches only (walkovers/score-less completions don't count) — mirrors the Initiation's
// own "played a match" gate in useTasks.ts so the two definitions of "played" stay identical.
const hasPlayedAMatch = async (uid: string): Promise<boolean> =>
  (await fetchCompletedTournamentMatches(uid)).length > 0;

// Reserved deterministic namespace: Firestore Rules mirror this exact prefix so simultaneous
// claims for the same invitee compete for one document rather than creating duplicate pendings.
export const ambassadorClaimId = (inviteeId: string): string => `ambassador_${inviteeId}`;

// Client-side eligibility is a friendly first pass. The deterministic document + Firestore Rules
// enforce one active inviter per member at write time; the approval trigger retains its legacy
// duplicate guard for older random-id claims.
// Returns an error message on failure, or null on success.
export async function createAmbassadorClaim(
  uid: string,
  name: string,
  inviteeId: string,
  inviteeName: string,
): Promise<string | null> {
  if (inviteeId === uid) return 'You can’t invite yourself.';
  const played = await hasPlayedAMatch(inviteeId);
  if (!played) return `${inviteeName} hasn’t played a match yet — you can claim this once they have.`;
  try {
    await setDoc(doc(db, 'task_claims', ambassadorClaimId(inviteeId)), {
      type: 'ambassador',
      uid: uid,
      user_name: name,
      invitee_id: inviteeId,
      invitee_name: inviteeName,
      status: 'pending',
      created_at: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof FirebaseError && error.code === 'permission-denied') {
      return `${inviteeName} already has an active ambassador claim.`;
    }
    throw error;
  }
  return null;
}

export async function reviewClaim(id: string, approve: boolean, reviewerNote?: string): Promise<void> {
  const review = httpsCallable(functions, 'reviewTaskClaim');
  await review({ id, approve, reviewer_note: reviewerNote?.trim() || '' });
}
