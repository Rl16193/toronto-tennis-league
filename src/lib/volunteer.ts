import { addDoc, collection, Timestamp } from 'firebase/firestore';
import { db } from './firebase';

/**
 * Volunteer sign-ups from the "Volunteer with Us" button.
 *
 * Unlike the newsletter, this ALWAYS shows the form, member or not: the activity and the note are
 * per-submission and an account cannot answer them for you. A member's row carries their `uid` and
 * `user_name`; a visitor's carries 'not_a_member' / 'anonymous'. `firestore.rules` enforces both.
 *
 * Auto-id, never keyed on uid, because someone may volunteer more than once for different
 * activities and each note is its own message. Deduplicate by email when you work the list.
 */

/** The activities offered. Order is the order they appear in the dropdown. */
export const VOLUNTEER_ACTIVITIES = [
  'Tournaments',
  'Meetups',
  'Socials',
  'Marketing',
  'Tech',
  'Research',
  'Others',
] as const;

export type VolunteerSignup = {
  email: string;
  activity: string;
  note?: string;
  /** Present only when a signed-in member submits. Must match their own auth uid. */
  uid?: string;
  userName?: string;
};

export const submitVolunteerSignup = async ({ email, activity, note, uid, userName }: VolunteerSignup) => {
  await addDoc(collection(db, 'volunteer_signups'), {
    email: email.trim().toLowerCase(),
    activity,
    note: note?.trim() || '',
    uid: uid || 'not_a_member',
    user_name: uid ? (userName?.trim() || '') : 'anonymous',
    created_at: Timestamp.now(),
  });
};
