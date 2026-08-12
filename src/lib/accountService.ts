import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

/**
 * Whether a signup email is already registered.
 *
 * This runs on the signup screen, before anyone is authenticated. It used to be an unauthenticated
 * Firestore query against `users` — which only worked because that collection was world-readable,
 * the very problem the contacts split fixes. Contact details now live in `contacts` behind a
 * sign-in, so the check goes through a callable that answers with booleans and nothing else.
 *
 * Fails OPEN, exactly as the old query did: if the lookup errors we let signup proceed rather than
 * blocking a legitimate new member on a transient network problem. The duplicate is then caught by
 * Firebase Auth itself, which rejects an already-registered address.
 */
type EmailCheck = { exists: boolean; secondary: boolean };

const check = async (email: string): Promise<EmailCheck> => {
  const normalized = email.trim();
  if (!normalized) return { exists: false, secondary: false };
  try {
    const fn = httpsCallable<{ email: string }, EmailCheck>(functions, 'checkSignupEmail');
    const res = await fn({ email: normalized });
    return res.data;
  } catch {
    return { exists: false, secondary: false };
  }
};

export const emailExistsInProfiles = async (emailToCheck: string) => (await check(emailToCheck)).exists;

// Matches an email against `secondary_email` — set only by the account-merge admin script when
// a signup turns out to be a known duplicate under a different address (see types.ts).
export const secondaryEmailExistsInProfiles = async (emailToCheck: string) => (await check(emailToCheck)).secondary;
