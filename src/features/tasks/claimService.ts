import { addDoc, collection, doc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { fetchCompletedTournamentMatches } from './matchHistory';

// Volunteer / Ambassador / Host all work the same way: a player submits a claim, the global admin
// approves or rejects it in the review queue, and only an approval awards the points.

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
  meetupTitle: string,
  meetupDate: string,
  note: string,
): Promise<void> {
  await addDoc(collection(db, 'task_claims'), {
    type: 'host',
    uid: uid,
    user_name: name,
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

const alreadyClaimed = async (inviteeId: string): Promise<boolean> => {
  const snap = await getDocs(
    query(collection(db, 'task_claims'), where('type', '==', 'ambassador'), where('invitee_id', '==', inviteeId)),
  );
  return snap.docs.some((d) => ['pending', 'approved'].includes(d.data().status));
};

// Client-side checks are a fast, friendly first pass — the administrator's approval is the real
// gate, and the server enforces "one inviter per member" authoritatively at that point too.
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
  const claimed = await alreadyClaimed(inviteeId);
  if (claimed) return `Someone has already claimed ${inviteeName}.`;
  await addDoc(collection(db, 'task_claims'), {
    type: 'ambassador',
    uid: uid,
    user_name: name,
    invitee_id: inviteeId,
    invitee_name: inviteeName,
    status: 'pending',
    created_at: new Date().toISOString(),
  });
  return null;
}

export async function reviewClaim(id: string, approve: boolean, reviewerNote?: string): Promise<void> {
  await updateDoc(doc(db, 'task_claims', id), {
    status: approve ? 'approved' : 'rejected',
    reviewed_at: new Date().toISOString(),
    ...(reviewerNote?.trim() ? { reviewer_note: reviewerNote.trim() } : {}),
  });
}
