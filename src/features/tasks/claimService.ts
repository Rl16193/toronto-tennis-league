import { Timestamp, addDoc, collection, doc, getDoc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';

// Volunteer / Ambassador / Host all work the same way: a player submits a claim, an organizer
// approves or rejects it in the review queue, and only an approval moves the stats counter.

export type ClaimType = 'volunteer' | 'ambassador' | 'host';
export type ClaimStatus = 'pending' | 'approved' | 'rejected';

export interface TaskClaim {
  id: string;
  category: ClaimType;
  sub_category: ClaimType;
  status: ClaimStatus;
  uid: string;
  user_name: string;
  event_title: string;
  meetup_title: string;
  meetup_date: string;
  invitee_uid: string;
  invitee_name: string;
  reviewer_note: string;
  reviewed_at: Timestamp | null;
  created_at: Timestamp | null;
}

/** The full claim shape; whatever doesn't apply to this kind is a typed empty. */
const newClaim = (category: ClaimType, uid: string, name: string, fields: Partial<TaskClaim>) => ({
  category,
  sub_category: category,
  status: 'pending' as const,
  uid,
  user_name: name,
  event_title: '',
  meetup_title: '',
  meetup_date: '',
  invitee_uid: '',
  invitee_name: '',
  reviewer_note: '',
  reviewed_at: null,
  created_at: Timestamp.now(),
  ...fields,
});

export async function createVolunteerClaim(uid: string, name: string, eventTitle: string): Promise<void> {
  await addDoc(collection(db, 'task_claims'), newClaim('volunteer', uid, name, { event_title: eventTitle }));
}

export async function createHostClaim(uid: string, name: string, meetupTitle: string, meetupDate: string): Promise<void> {
  await addDoc(collection(db, 'task_claims'), newClaim('host', uid, name, { meetup_title: meetupTitle, meetup_date: meetupDate }));
}

// Played matches only (walkovers don't count) — the same matchesPlayed counter the Initiation's
// "Play 1 match" reads, so the two definitions of "played" stay identical.
const hasPlayedAMatch = async (uid: string): Promise<boolean> => {
  const snap = await getDoc(doc(db, 'stats', uid));
  const played = snap.exists() ? snap.data().matchesPlayed : 0;
  return typeof played === 'number' && played > 0;
};

// Only the member's own claims are readable; another inviter's claim is caught at approval (taskPoints.js).
const alreadyClaimed = async (uid: string, inviteeUid: string): Promise<boolean> => {
  const snap = await getDocs(
    query(collection(db, 'task_claims'), where('uid', '==', uid), where('category', '==', 'ambassador'), where('invitee_uid', '==', inviteeUid)),
  );
  return snap.docs.some((d) => ['pending', 'approved'].includes(d.data().status));
};

// Client-side checks are a fast, friendly first pass — the organizer's approval is the real
// gate, and the server enforces "one inviter per member" authoritatively at that point too.
// Returns an error message on failure, or null on success.
export async function createAmbassadorClaim(
  uid: string, name: string, inviteeUid: string, inviteeName: string,
): Promise<string | null> {
  if (inviteeUid === uid) return 'You can’t invite yourself.';
  const played = await hasPlayedAMatch(inviteeUid);
  if (!played) return `${inviteeName} hasn’t played a match yet — you can claim this once they have.`;
  const claimed = await alreadyClaimed(uid, inviteeUid);
  if (claimed) return `You have already claimed ${inviteeName}.`;
  await addDoc(collection(db, 'task_claims'), newClaim('ambassador', uid, name, { invitee_uid: inviteeUid, invitee_name: inviteeName }));
  return null;
}

export async function reviewClaim(id: string, approve: boolean, reviewerNote?: string): Promise<void> {
  await updateDoc(doc(db, 'task_claims', id), {
    status: approve ? 'approved' : 'rejected',
    reviewed_at: Timestamp.now(),
    ...(reviewerNote?.trim() ? { reviewer_note: reviewerNote.trim() } : {}),
  });
}
