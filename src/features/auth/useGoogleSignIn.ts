import { useEffect } from 'react';
import { NavigateFunction } from 'react-router-dom';
import { getAdditionalUserInfo, getRedirectResult, signInWithPopup, signInWithRedirect } from 'firebase/auth';
import { auth, googleProvider, setAuthPersistence } from '../../lib/firebase';
import { ensureUserProfileDocuments } from '../../lib/profileBootstrap';
import { getGoogleSignInErrorMessage } from './authMessages';

interface UseGoogleSignInOptions {
  stayLoggedIn: boolean;
  returnTo: string;
  intent: string;
  navigate: NavigateFunction;
  setError: (msg: string) => void;
  setLoading: (v: boolean) => void;
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
  stayLoggedIn,
  returnTo,
  intent,
  navigate,
  setError,
  setLoading,
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
          if (isNewGoogleUser) {
            navigate(`/signup?returnTo=${encodeURIComponent(returnTo)}&intent=${encodeURIComponent(intent || 'join-league')}`);
          }
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
      await setAuthPersistence(stayLoggedIn);
      const result = await signInWithPopup(auth, googleProvider);
      const isNewGoogleUser = getAdditionalUserInfo(result)?.isNewUser === true;
      await ensureUserProfileDocuments(result.user);
      sessionStorage.setItem(`profile-bootstrap-pending:${result.user.uid}`, '1');
      sessionStorage.removeItem(`profile-bootstrap-retry:${result.user.uid}`);
      if (isNewGoogleUser) {
        navigate(`/signup?returnTo=${encodeURIComponent(returnTo)}&intent=${encodeURIComponent(intent || 'join-league')}`);
      }
    } catch (err: any) {
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
