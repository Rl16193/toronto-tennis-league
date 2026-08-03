import { useEffect } from 'react';
import { NavigateFunction } from 'react-router-dom';
import {
  getAdditionalUserInfo, getRedirectResult, signInWithPopup, signInWithRedirect,
  OAuthProvider, type OAuthCredential,
} from 'firebase/auth';
import { auth, appleProvider, setAuthPersistence } from '../../lib/firebase';
import { track } from '../../lib/analytics';
import { ensureUserProfileDocuments } from '../../lib/profileBootstrap';
import { getAppleSignInErrorMessage } from './authMessages';

interface UseAppleSignInOptions {
  navigate: NavigateFunction;
  setError: (msg: string) => void;
  setLoading: (v: boolean) => void;
  // Called when the Apple email matches an existing email/password account.
  // Caller should prompt for the password, sign in, then link the credential.
  onAccountExists?: (email: string, credential: OAuthCredential) => void;
}

/**
 * Manages Apple Sign-In — mirrors useGoogleSignIn.ts exactly (same popup → redirect fallback,
 * same account-exists-with-different-credential linking flow).
 */
export function useAppleSignIn({
  navigate,
  setError,
  setLoading,
  onAccountExists,
}: UseAppleSignInOptions) {
  // Handle the return from signInWithRedirect (fires on mount after a redirect).
  useEffect(() => {
    getRedirectResult(auth)
      .then(async (result) => {
        if (!result) return;
        // Only handle results from Apple — Google's own hook has its own getRedirectResult effect.
        if (getAdditionalUserInfo(result)?.providerId !== 'apple.com') return;
        setLoading(true);
        try {
          const isNewAppleUser = getAdditionalUserInfo(result)?.isNewUser === true;
          await ensureUserProfileDocuments(result.user);
          sessionStorage.setItem(`profile-bootstrap-pending:${result.user.uid}`, '1');
          sessionStorage.removeItem(`profile-bootstrap-retry:${result.user.uid}`);
          track(isNewAppleUser ? 'sign_up' : 'login', { method: 'apple' });
          navigate(isNewAppleUser ? '/login' : '/profile');
        } catch (err: any) {
          setError(await getAppleSignInErrorMessage(err, ''));
        } finally {
          setLoading(false);
        }
      })
      .catch(async (err: any) => {
        setError(await getAppleSignInErrorMessage(err, ''));
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAppleSignIn = async () => {
    setLoading(true);
    setError('');
    try {
      await setAuthPersistence(true);
      const result = await signInWithPopup(auth, appleProvider);
      const isNewAppleUser = getAdditionalUserInfo(result)?.isNewUser === true;
      await ensureUserProfileDocuments(result.user);
      sessionStorage.setItem(`profile-bootstrap-pending:${result.user.uid}`, '1');
      sessionStorage.removeItem(`profile-bootstrap-retry:${result.user.uid}`);
      track(isNewAppleUser ? 'sign_up' : 'login', { method: 'apple' });
      navigate(isNewAppleUser ? '/login' : '/profile');
    } catch (err: any) {
      // Apple email matches an existing email/password account → let caller handle linking.
      if (err.code === 'auth/account-exists-with-different-credential') {
        const email: string = err.customData?.email ?? '';
        const credential = OAuthProvider.credentialFromError(err);
        if (credential && onAccountExists) {
          onAccountExists(email, credential);
          return;
        }
      }
      // Fall back to redirect when popup is blocked (iOS in-app browsers, strict popup policy).
      if (err.code === 'auth/popup-blocked' || err.code === 'auth/popup-closed-by-user') {
        try {
          await signInWithRedirect(auth, appleProvider);
          return; // redirect takes over — no further handling needed here
        } catch (redirectErr: any) {
          setError(await getAppleSignInErrorMessage(redirectErr, ''));
        }
      } else {
        setError(await getAppleSignInErrorMessage(err, ''));
      }
    } finally {
      setLoading(false);
    }
  };

  return { handleAppleSignIn };
}
