import { useEffect } from 'react';
import { NavigateFunction } from 'react-router-dom';
import {
  getAdditionalUserInfo, getRedirectResult, signInWithPopup, signInWithRedirect,
  GoogleAuthProvider, type OAuthCredential,
} from 'firebase/auth';
import { auth, googleProvider, setAuthPersistence } from '../../lib/firebase';
import { track } from '../../lib/analytics';
import { ensureUserProfileDocuments } from '../../lib/profileBootstrap';
import { getGoogleSignInErrorMessage } from './authMessages';

interface UseGoogleSignInOptions {
  navigate: NavigateFunction;
  setError: (msg: string) => void;
  setLoading: (v: boolean) => void;
  // Called when the Google email matches an existing email/password account.
  // Caller should prompt for the password, sign in, then link the credential.
  onAccountExists?: (email: string, credential: OAuthCredential) => void;
}

/**
 * Manages Google Sign-In for the Login page.
 *
 * - Uses signInWithPopup on all platforms.
 * - Falls back to signInWithRedirect when the popup is blocked (iOS in-app browsers,
 *   popup-blocking environments) by catching auth/popup-blocked.
 * - Handles the redirect return via a getRedirectResult effect on mount.
 */
export function useGoogleSignIn({
  navigate,
  setError,
  setLoading,
  onAccountExists,
}: UseGoogleSignInOptions) {
  // Handle the return from signInWithRedirect (fires on mount after a redirect).
  useEffect(() => {
    getRedirectResult(auth)
      .then(async (result) => {
        if (!result) return;
        setLoading(true);
        try {
          const isNewGoogleUser = getAdditionalUserInfo(result)?.isNewUser === true;
          await ensureUserProfileDocuments(result.user);
          sessionStorage.setItem(`profile-bootstrap-pending:${result.user.uid}`, '1');
          sessionStorage.removeItem(`profile-bootstrap-retry:${result.user.uid}`);
          track(isNewGoogleUser ? 'sign_up' : 'login', { method: 'google' });
          navigate(isNewGoogleUser ? '/login' : '/profile');
        } catch (err: any) {
          setError(await getGoogleSignInErrorMessage(err, ''));
        } finally {
          setLoading(false);
        }
      })
      .catch(async (err: any) => {
        setError(await getGoogleSignInErrorMessage(err, ''));
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError('');
    try {
      await setAuthPersistence(true);
      const result = await signInWithPopup(auth, googleProvider);
      const isNewGoogleUser = getAdditionalUserInfo(result)?.isNewUser === true;
      await ensureUserProfileDocuments(result.user);
      sessionStorage.setItem(`profile-bootstrap-pending:${result.user.uid}`, '1');
      sessionStorage.removeItem(`profile-bootstrap-retry:${result.user.uid}`);
      track(isNewGoogleUser ? 'sign_up' : 'login', { method: 'google' });
      navigate(isNewGoogleUser ? '/login' : '/profile');
    } catch (err: any) {
      // Google email matches an existing email/password account → let caller handle linking.
      if (err.code === 'auth/account-exists-with-different-credential') {
        const email: string = err.customData?.email ?? '';
        const credential = GoogleAuthProvider.credentialFromError(err);
        if (credential && onAccountExists) {
          onAccountExists(email, credential);
          return;
        }
      }
      // Fall back to redirect when popup is blocked (iOS in-app browsers, strict popup policy).
      if (err.code === 'auth/popup-blocked' || err.code === 'auth/popup-closed-by-user') {
        try {
          await signInWithRedirect(auth, googleProvider);
          return; // redirect takes over — no further handling needed here
        } catch (redirectErr: any) {
          setError(await getGoogleSignInErrorMessage(redirectErr, ''));
        }
      } else {
        setError(await getGoogleSignInErrorMessage(err, ''));
      }
    } finally {
      setLoading(false);
    }
  };

  return { handleGoogleSignIn };
}
