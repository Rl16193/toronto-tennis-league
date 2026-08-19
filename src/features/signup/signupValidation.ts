import { fetchSignInMethodsForEmail } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from '../../lib/firebase';
import { EMAIL_REGEX as signupEmailRegex } from '../../utils/emailRegex';

export { signupEmailRegex };

/**
 * Whether a signup email is already registered.
 *
 * This runs on the signup screen, before anyone is authenticated. It used to be an unauthenticated
 * Firestore query against `users` — which only worked because that collection was world-readable,
 * the very problem the contacts split fixes. Contact details now live in `contacts` behind a
 * sign-in, so the check goes through a callable that answers with booleans and nothing else.
 *
 * Lookup failures block this step. Deployed calls require App Check, so failing open here would
 * silently bypass the repository's pre-auth abuse boundary.
 */
type EmailCheck = { exists: boolean; secondary: boolean };

const check = async (email: string): Promise<EmailCheck> => {
  const normalized = email.trim();
  if (!normalized) return { exists: false, secondary: false };
  const fn = httpsCallable<{ email: string }, EmailCheck>(functions, 'checkSignupEmail');
  const res = await fn({ email: normalized });
  if (typeof res.data?.exists !== 'boolean' || typeof res.data?.secondary !== 'boolean') {
    throw new Error('Account lookup returned an invalid response.');
  }
  return res.data;
};

export const emailExistsInProfiles = async (emailToCheck: string) => (await check(emailToCheck)).exists;

// Matches an email against `secondary_email` — set only by the account-merge admin script when
// a signup turns out to be a known duplicate under a different address (see types.ts).
export const secondaryEmailExistsInProfiles = async (emailToCheck: string) => (await check(emailToCheck)).secondary;

// 'primary' → a real account signs in with this email (normal login flow).
// 'secondary' → this email was merged into another account (see types.ts secondary_email) —
// it's not a real Auth credential, so login won't work; the caller must block signup instead.
// 'none' → no account at all, proceed to create one.
export const emailExistsForSignup = async (emailToCheck: string): Promise<'primary' | 'secondary' | 'none'> => {
  const normalizedEmail = emailToCheck.trim();
  if (!normalizedEmail || !signupEmailRegex.test(normalizedEmail)) return 'none';

  const lookup = await check(normalizedEmail);
  if (lookup.exists) return 'primary';
  if (lookup.secondary) return 'secondary';

  try {
    const methods = await fetchSignInMethodsForEmail(auth, normalizedEmail);
    return methods.length > 0 ? 'primary' : 'none';
  } catch {
    return 'none';
  }
};

export const getSignupErrorMessage = (error: any) => {
  const code = (error?.code || error?.message || '').toString().toLowerCase();
  if (code.includes('account-exists-with-different-credential')) {
    return 'An account already exists with this email. Please sign in with Google or use the same provider.';
  }
  if (code.includes('email-already-in-use')) {
    return 'Email already exists. Please login instead.';
  }
  if (code.includes('invalid-email')) {
    return 'Please enter a valid email address.';
  }
  if (code.includes('weak-password')) {
    return 'Password is too weak. Please use at least 6 characters.';
  }
  if (code.includes('network-request-failed')) {
    return 'Network error. Please try again.';
  }
  return 'Signup failed. Please try again.';
};
