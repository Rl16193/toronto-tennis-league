import { fetchSignInMethodsForEmail } from 'firebase/auth';
import { auth } from '../../lib/firebase';
import { EMAIL_REGEX as emailRegex } from '../../utils/emailRegex';

export const getAuthErrorMessage = (error: any, context: 'login' | 'reset' | 'google' = 'login') => {
  const code = (error?.code || error?.message || '').toString().toLowerCase();
  if (context === 'login') {
    if (code.includes('too-many-requests')) {
      return 'Too many login attempts. Please wait a moment and try again.';
    }
    if (code.includes('user-disabled')) {
      return 'This account has been disabled. Please contact support.';
    }
    // Firebase no longer distinguishes wrong email from wrong password — show one message
    return 'Invalid credentials. Please check your email and password.';
  }

  if (context === 'reset') {
    if (code.includes('invalid-email')) {
      return 'Please enter a valid email address.';
    }
    return 'Unable to send reset email. Please try again.';
  }

  return 'Unable to sign in. Please try again.';
};

// One implementation for every OAuth provider — the Google and Apple versions were byte-identical
// apart from the provider id and the words in three strings.
export const getOAuthSignInErrorMessage = async (
  error: any,
  email: string,
  providerId: 'google.com' | 'apple.com',
) => {
  const label = providerId === 'google.com' ? 'Google' : 'Apple';
  const code = (error?.code || error?.message || '').toString().toLowerCase();
  if (code.includes('popup-closed-by-user')) {
    return `${label} sign-in was cancelled.`;
  }
  if (code.includes('account-exists-with-different-credential')) {
    const emailFromError = error?.customData?.email || email;
    if (emailFromError && emailRegex.test(emailFromError)) {
      try {
        const methods = await fetchSignInMethodsForEmail(auth, emailFromError);
        if (methods.includes('password')) {
          return 'An account already exists for this email. Sign in with your password.';
        }
        if (methods.includes(providerId)) {
          return `This ${label} account is already linked. Please sign in with ${label}.`;
        }
      } catch (fetchError) {
        console.error('Error checking sign-in methods:', fetchError);
      }
    }
    return 'An account already exists with this email. Sign in with your password.';
  }
  return getAuthErrorMessage(error, 'google');
};

export const getGoogleSignInErrorMessage = (error: any, email: string) =>
  getOAuthSignInErrorMessage(error, email, 'google.com');

export const getAppleSignInErrorMessage = (error: any, email: string) =>
  getOAuthSignInErrorMessage(error, email, 'apple.com');
