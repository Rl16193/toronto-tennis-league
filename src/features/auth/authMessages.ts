import { fetchSignInMethodsForEmail } from 'firebase/auth';
import { auth } from '../../lib/firebase';

export const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

export const getGoogleSignInErrorMessage = async (error: any, email: string) => {
  const code = (error?.code || error?.message || '').toString().toLowerCase();
  if (code.includes('popup-closed-by-user')) {
    return 'Google sign-in was cancelled.';
  }
  if (code.includes('account-exists-with-different-credential')) {
    const emailFromError = error?.customData?.email || email;
    if (emailFromError && emailRegex.test(emailFromError)) {
      try {
        const methods = await fetchSignInMethodsForEmail(auth, emailFromError);
        if (methods.includes('password')) {
          return 'An account already exists for this email. Sign in with your password.';
        }
        if (methods.includes('google.com')) {
          return 'This Google account is already linked. Please sign in with Google.';
        }
      } catch (fetchError) {
        console.error('Error checking sign-in methods:', fetchError);
      }
    }
    return 'An account already exists with this email. Sign in with your password.';
  }
  return getAuthErrorMessage(error, 'google');
};
