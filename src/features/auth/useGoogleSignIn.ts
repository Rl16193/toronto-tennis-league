import { GoogleAuthProvider } from 'firebase/auth';
import { googleProvider } from '../../lib/firebase';
import { useOAuthSignIn, type UseOAuthSignInOptions } from './useOAuthSignIn';

type UseGoogleSignInOptions = Omit<
  UseOAuthSignInOptions, 'provider' | 'providerId' | 'credentialFromError'
>;

/** Google Sign-In. All behaviour lives in useOAuthSignIn — this only binds the provider. */
export function useGoogleSignIn(options: UseGoogleSignInOptions) {
  const { handleSignIn } = useOAuthSignIn({
    ...options,
    provider: googleProvider,
    providerId: 'google.com',
    credentialFromError: (err) => GoogleAuthProvider.credentialFromError(err as any),
  });
  return { handleGoogleSignIn: handleSignIn };
}
