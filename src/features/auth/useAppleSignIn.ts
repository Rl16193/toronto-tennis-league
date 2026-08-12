import { OAuthProvider } from 'firebase/auth';
import { appleProvider } from '../../lib/firebase';
import { useOAuthSignIn, type UseOAuthSignInOptions } from './useOAuthSignIn';

type UseAppleSignInOptions = Omit<
  UseOAuthSignInOptions, 'provider' | 'providerId' | 'credentialFromError'
>;

/** Apple Sign-In. All behaviour lives in useOAuthSignIn — this only binds the provider. */
export function useAppleSignIn(options: UseAppleSignInOptions) {
  const { handleSignIn } = useOAuthSignIn({
    ...options,
    provider: appleProvider,
    providerId: 'apple.com',
    credentialFromError: (err) => OAuthProvider.credentialFromError(err as any),
  });
  return { handleAppleSignIn: handleSignIn };
}
