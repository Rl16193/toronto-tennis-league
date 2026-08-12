import { useEffect } from 'react';
import { NavigateFunction } from 'react-router-dom';
import {
  GoogleAuthProvider, OAuthProvider,
  getAdditionalUserInfo, getRedirectResult, signInWithPopup, signInWithRedirect,
  type AuthProvider, type OAuthCredential,
} from 'firebase/auth';
import { appleProvider, auth, googleProvider, setAuthPersistence } from '../../lib/firebase';
import { track } from '../../lib/analytics';
import { ensureUserProfileDocuments } from '../../lib/profileBootstrap';
import { getOAuthSignInErrorMessage } from './authMessages';

export type OAuthProviderId = 'google.com' | 'apple.com';

export interface UseOAuthSignInOptions {
  navigate: NavigateFunction;
  setError: (msg: string) => void;
  setLoading: (v: boolean) => void;
  // Called when the provider's email matches an existing email/password account.
  // Caller should prompt for the password, sign in, then link the credential.
  onAccountExists?: (email: string, credential: OAuthCredential) => void;
  provider: AuthProvider;
  providerId: OAuthProviderId;
  // Provider-specific static: GoogleAuthProvider.credentialFromError / OAuthProvider.credentialFromError
  credentialFromError: (err: unknown) => OAuthCredential | null;
}

/**
 * Shared OAuth sign-in flow, used by useGoogleSignIn and useAppleSignIn.
 *
 * - Uses signInWithPopup on all platforms.
 * - Falls back to signInWithRedirect when the popup is blocked (iOS in-app browsers,
 *   popup-blocking environments) by catching auth/popup-blocked.
 * - Handles the redirect return via a getRedirectResult effect on mount. Each provider's hook
 *   runs its own effect, so both filter on providerId to ignore the other's result.
 */
export function useOAuthSignIn({
  navigate,
  setError,
  setLoading,
  onAccountExists,
  provider,
  providerId,
  credentialFromError,
}: UseOAuthSignInOptions) {
  const method = providerId === 'google.com' ? 'google' : 'apple';

  // Shared post-sign-in bookkeeping for both the popup and the redirect-return path.
  const completeSignIn = async (result: Awaited<ReturnType<typeof signInWithPopup>>) => {
    const isNewUser = getAdditionalUserInfo(result)?.isNewUser === true;
    await ensureUserProfileDocuments(result.user);
    sessionStorage.setItem(`profile-bootstrap-pending:${result.user.uid}`, '1');
    sessionStorage.removeItem(`profile-bootstrap-retry:${result.user.uid}`);
    track(isNewUser ? 'sign_up' : 'login', { method });
    navigate(isNewUser ? '/login' : '/profile');
  };

  // Handle the return from signInWithRedirect (fires on mount after a redirect).
  useEffect(() => {
    getRedirectResult(auth)
      .then(async (result) => {
        if (!result) return;
        // Only handle results from this provider — the sibling hook handles its own.
        if (getAdditionalUserInfo(result)?.providerId !== providerId) return;
        setLoading(true);
        try {
          await completeSignIn(result);
        } catch (err: any) {
          setError(await getOAuthSignInErrorMessage(err, '', providerId));
        } finally {
          setLoading(false);
        }
      })
      .catch(async (err: any) => {
        setError(await getOAuthSignInErrorMessage(err, '', providerId));
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSignIn = async () => {
    setLoading(true);
    setError('');
    try {
      await setAuthPersistence(true);
      await completeSignIn(await signInWithPopup(auth, provider));
    } catch (err: any) {
      // Provider email matches an existing email/password account → let caller handle linking.
      if (err.code === 'auth/account-exists-with-different-credential') {
        const email: string = err.customData?.email ?? '';
        const credential = credentialFromError(err);
        if (credential && onAccountExists) {
          onAccountExists(email, credential);
          return;
        }
      }
      // Fall back to redirect when popup is blocked (iOS in-app browsers, strict popup policy).
      if (err.code === 'auth/popup-blocked' || err.code === 'auth/popup-closed-by-user') {
        try {
          await signInWithRedirect(auth, provider);
          return; // redirect takes over — no further handling needed here
        } catch (redirectErr: any) {
          setError(await getOAuthSignInErrorMessage(redirectErr, '', providerId));
        }
      } else {
        setError(await getOAuthSignInErrorMessage(err, '', providerId));
      }
    } finally {
      setLoading(false);
    }
  };

  return { handleSignIn };
}

/**
 * Provider bindings. Google and Apple were two byte-identical 16-line files differing only in the
 * provider, the providerId string, and which class exposes credentialFromError. Both keep their
 * original return names so Signup.tsx is unchanged. Add a provider by adding a binding here.
 */
type ProviderBoundOptions = Omit<
  UseOAuthSignInOptions, 'provider' | 'providerId' | 'credentialFromError'
>;

/** Google Sign-In. All behaviour lives in useOAuthSignIn — this only binds the provider. */
export function useGoogleSignIn(options: ProviderBoundOptions) {
  const { handleSignIn } = useOAuthSignIn({
    ...options,
    provider: googleProvider,
    providerId: 'google.com',
    credentialFromError: (err) => GoogleAuthProvider.credentialFromError(err as any),
  });
  return { handleGoogleSignIn: handleSignIn };
}

/** Apple Sign-In. All behaviour lives in useOAuthSignIn — this only binds the provider. */
export function useAppleSignIn(options: ProviderBoundOptions) {
  const { handleSignIn } = useOAuthSignIn({
    ...options,
    provider: appleProvider,
    providerId: 'apple.com',
    credentialFromError: (err) => OAuthProvider.credentialFromError(err as any),
  });
  return { handleAppleSignIn: handleSignIn };
}
