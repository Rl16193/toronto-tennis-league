import { fetchSignInMethodsForEmail } from 'firebase/auth';
import { auth } from '../../lib/firebase';
import { emailExistsInProfiles } from '../../services/accountService';

export const signupEmailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const emailExistsForSignup = async (emailToCheck: string) => {
  const normalizedEmail = emailToCheck.trim();
  if (!normalizedEmail || !signupEmailRegex.test(normalizedEmail)) return false;

  if (await emailExistsInProfiles(normalizedEmail)) return true;

  try {
    const methods = await fetchSignInMethodsForEmail(auth, normalizedEmail);
    return methods.length > 0;
  } catch (error) {
    console.error('Error checking signup email:', error);
    return false;
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
