import { addDoc, collection } from 'firebase/firestore';
import { db } from './firebase';

/**
 * Volunteer sign-ups from the "Volunteer with Us" button.
 *
 * Unlike the newsletter, this ALWAYS shows the form, member or not: the activity and the note are
 * per-submission and an account cannot answer them for you. A member's row carries `uid` and
 * `user_name` on top of what a visitor's row carries, and `firestore.rules` enforces that the uid,
 * when present, is the caller's own.
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
    // Omitted rather than written empty: the rules whitelist allows these keys but a blank string
    // is not data, and an absent field is cheaper to filter on.
    ...(note?.trim() ? { note: note.trim() } : {}),
    ...(uid ? { uid } : {}),
    ...(uid && userName?.trim() ? { user_name: userName.trim() } : {}),
    source: 'homepage',
    created_at: new Date().toISOString(),
  });
};
