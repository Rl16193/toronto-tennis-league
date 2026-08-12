import { fetchSignInMethodsForEmail } from 'firebase/auth';
import { auth } from '../../lib/firebase';
import { emailExistsInProfiles, secondaryEmailExistsInProfiles } from '../../lib/accountService';
import { EMAIL_REGEX as signupEmailRegex } from '../../utils/emailRegex';

export { signupEmailRegex };

// 'primary' → a real account signs in with this email (normal login flow).
// 'secondary' → this email was merged into another account (see types.ts secondary_email) —
// it's not a real Auth credential, so login won't work; the caller must block signup instead.
// 'none' → no account at all, proceed to create one.
export const emailExistsForSignup = async (emailToCheck: string): Promise<'primary' | 'secondary' | 'none'> => {
  const normalizedEmail = emailToCheck.trim();
  if (!normalizedEmail || !signupEmailRegex.test(normalizedEmail)) return 'none';

  try {
    const [isPrimary, isSecondary] = await Promise.all([
      emailExistsInProfiles(normalizedEmail),
      secondaryEmailExistsInProfiles(normalizedEmail),
    ]);
    if (isPrimary) return 'primary';
    if (isSecondary) return 'secondary';
  } catch {
    // Firestore query fails for unauthenticated users — fail open, let Firebase
    // Auth catch duplicates at account creation
    return 'none';
  }

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
