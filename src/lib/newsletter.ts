import { useEffect, useState } from 'react';
import { addDoc, collection, doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { db } from './firebase';

export type NewsletterSource = 'newsletter' | 'court report submission';

/**
 * The one mailing list, in two deliberately different shapes. `firestore.rules` enforces the
 * split, so this file and that rule must change together:
 *
 * - A signed-in member owns exactly ONE row, keyed by their uid, carrying `uid` and `user_name`.
 *   Re-subscribing overwrites that row, so a member can never be listed twice.
 * - A signed-out visitor adds an auto-id row with uid 'not_a_member' and user_name 'anonymous'. The
 *   rules accept only those values on that path, so nobody can write a row claiming to be someone else.
 *
 * `source` says where they signed up: the homepage button or the court report form.
 */

const NEWSLETTER_COLLECTION = 'mailing_list';

/** Signed-in member. Idempotent: the uid is the doc id, so this overwrites rather than duplicates. */
export const subscribeMemberToNewsletter = async (
  uid: string,
  email: string,
  userName: string,
  source: NewsletterSource = 'newsletter',
) => {
  await setDoc(doc(db, NEWSLETTER_COLLECTION, uid), {
    email: email.trim().toLowerCase(),
    uid,
    user_name: userName.trim(),
    source,
    created_at: Timestamp.now(),
  });
};

/**
 * Signed-in member: whether their own row exists (null while checking), and a subscribe that
 * marks it, so Subscribe can disappear once they're on the list. The confirmation arrives as a
 * notification (onNewsletterSubscribed), not a toast.
 */
export const useMemberNewsletter = (uid?: string, email?: string | null, userName = '') => {
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  useEffect(() => {
    if (!uid) { setSubscribed(null); return; }
    let live = true;
    getDoc(doc(db, NEWSLETTER_COLLECTION, uid))
      .then((s) => { if (live) setSubscribed(s.exists()); })
      .catch(() => { if (live) setSubscribed(false); });
    return () => { live = false; };
  }, [uid]);
  const subscribe = async () => {
    if (!uid || !email) return;
    await subscribeMemberToNewsletter(uid, email, userName);
    setSubscribed(true);
  };
  return { subscribed, subscribe };
};

/** Signed-out visitor. Always 'not_a_member' / 'anonymous' — the rules reject anything else here. */
export const subscribeVisitorToNewsletter = async (
  email: string,
  source: NewsletterSource = 'newsletter',
) => {
  await addDoc(collection(db, NEWSLETTER_COLLECTION), {
    email: email.trim().toLowerCase(),
    uid: 'not_a_member',
    user_name: 'anonymous',
    source,
    created_at: Timestamp.now(),
  });
};
