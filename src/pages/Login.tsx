import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { getAdditionalUserInfo, fetchSignInMethodsForEmail, signInWithEmailAndPassword, signInWithPopup, sendPasswordResetEmail } from 'firebase/auth';
import { auth, googleProvider, setAuthPersistence } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { ensureUserProfileDocuments } from '../lib/profileBootstrap';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Mail, Lock, Chrome, ArrowRight, AlertCircle, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import mailcheck from 'mailcheck';

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showForgot, setShowForgot] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [stayLoggedIn, setStayLoggedIn] = useState(false);
  const [emailSuggestion, setEmailSuggestion] = useState<any>(null);
  const returnTo = searchParams.get('returnTo') || '/events';
  const intent = searchParams.get('intent') || '';

  React.useEffect(() => {
    if (!authLoading && user) {
      navigate(returnTo);
    }
  }, [authLoading, navigate, returnTo, user]);

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newEmail = e.target.value;
    setEmail(newEmail);
    setEmailSuggestion(null);
    mailcheck.run({
      email: newEmail,
      suggested: (suggestion) => setEmailSuggestion(suggestion),
      empty: () => setEmailSuggestion(null)
    });
  };

  const getAuthErrorMessage = (error: any, context: 'login' | 'reset' | 'google' = 'login') => {
    const code = (error?.code || error?.message || '').toString().toLowerCase();
    if (context === 'login') {
      if (code.includes('wrong-password') || code.includes('user-not-found') || code.includes('invalid-email')) {
        return 'Invalid credentials';
      }
      if (code.includes('too-many-requests')) {
        return 'Too many login attempts. Please try again later.';
      }
      if (code.includes('user-disabled')) {
        return 'This account has been disabled. Please contact support.';
      }
      return 'Invalid credentials';
    }

    if (context === 'reset') {
      if (code.includes('invalid-email')) {
        return 'Please enter a valid email address.';
      }
      if (code.includes('user-not-found')) {
        return 'No account found with that email.';
      }
      return 'Unable to send reset email. Please try again.';
    }

    return 'Unable to sign in. Please try again.';
  };

  const getGoogleSignInErrorMessage = async (error: any) => {
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
            return 'An account already exists for this email. Sign in with your password, then connect Google from your profile.';
          }
          if (methods.includes('google.com')) {
            return 'This Google account is already linked. Please sign in with Google.';
          }
        } catch (fetchError) {
          console.error('Error checking sign-in methods:', fetchError);
        }
      }
      return 'An account already exists with this email. Please use the same sign-in provider.';
    }
    return getAuthErrorMessage(error, 'google');
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await setAuthPersistence(stayLoggedIn);
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err: any) {
      setError(getAuthErrorMessage(err, 'login'));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
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
      setError(await getGoogleSignInErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setError('Please enter your email address.');
      return;
    }
    if (!emailRegex.test(email)) {
      setError('Please enter a valid email address.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await sendPasswordResetEmail(auth, email);
      setResetSent(true);
    } catch (err: any) {
      setError(getAuthErrorMessage(err, 'reset'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-20 relative overflow-hidden">
      {/* Background Glows */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-clay/10 blur-[100px] -z-10 rounded-full" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-tennis-surface/20 blur-[100px] -z-10 rounded-full" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-tennis-surface/40 backdrop-blur-xl border border-white/5 p-10 rounded-[3rem] shadow-2xl"
      >
        <div className="text-center space-y-4 mb-10">
          <img
            src="https://firebasestorage.googleapis.com/v0/b/toronto-tennis-league.firebasestorage.app/o/LandingPage%2FScreenshot%202026-04-26%20165830.png?alt=media&token=6f61bcf6-6424-4852-83ba-a8f1865849dd"
            alt="Racquets&Strings"
            className="mx-auto h-32 w-full max-w-xs object-contain opacity-80 mix-blend-lighten"
            referrerPolicy="no-referrer"
          />
          {intent === 'join-event' && (
            <p className="text-sm text-gray-400">
              Sign in to join an event. New here? Use sign up to create your league profile first.
            </p>
          )}
          {intent === 'join-league' && (
            <p className="text-sm text-gray-400">
              Sign in to continue, or create a league profile to get updates and event access.
            </p>
          )}
        </div>

        <AnimatePresence mode="wait">
          {resetSent ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center space-y-6 py-8"
            >
              <div className="w-20 h-20 bg-green-500/10 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-10 h-10 text-green-500" />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-bold text-white">Email Sent!</h3>
                <p className="text-gray-400">Check your inbox for instructions to reset your password.</p>
              </div>
              <Button variant="outline" className="w-full" onClick={() => {
                setResetSent(false);
                setShowForgot(false);
              }}>
                Back to Login
              </Button>
            </motion.div>
          ) : (
            <form onSubmit={showForgot ? handleResetPassword : handleLogin} className="space-y-6">
              {error && (
                <div className="flex items-center space-x-3 p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-500 text-sm">
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="space-y-4">
                <Input
                  label="Email Address"
                  type="email"
                  placeholder="name@example.com"
                  value={email}
                  onChange={handleEmailChange}
                  required
                />
                {emailSuggestion && (
                  <div className="text-sm text-blue-400 mt-1">
                    Did you mean <button 
                      className="underline hover:text-blue-300" 
                      onClick={() => {
                        setEmail(emailSuggestion.full);
                        setEmailSuggestion(null);
                      }}
                    >
                      {emailSuggestion.full}
                    </button>?
                  </div>
                )}
                {!showForgot && (
                  <Input
                    label="Password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                )}
              </div>

              {!showForgot && (
                <div className="flex items-center justify-between gap-4">
                  <label className="flex items-center gap-3 text-sm text-gray-300">
                    <input
                      type="checkbox"
                      checked={stayLoggedIn}
                      onChange={(e) => setStayLoggedIn(e.target.checked)}
                      className="h-4 w-4 rounded border-white/10 bg-tennis-surface/50 text-clay focus:ring-clay"
                    />
                    <span>Stay logged in</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowForgot(true)}
                    className="text-sm font-medium text-clay hover:text-clay-dark transition-colors"
                  >
                    Forgot Password?
                  </button>
                </div>
              )}

              <Button type="submit" className="w-full group" isLoading={loading}>
                {showForgot ? 'Send Reset Link' : 'Sign In'}
                {!loading && <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />}
              </Button>

              {!showForgot && (
                <>
                  <div className="relative py-4">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-white/5"></div>
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-tennis-dark px-4 text-gray-500 font-bold tracking-widest">Or continue with</span>
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full border border-white/5"
                    onClick={handleGoogleLogin}
                  >
                    <Chrome className="mr-2 w-5 h-5" />
                    Google Account
                  </Button>
                </>
              )}

              <div className="text-center pt-6">
                <p className="text-gray-400 text-sm">
                  {showForgot ? (
                    <button
                      type="button"
                      onClick={() => setShowForgot(false)}
                      className="text-clay font-bold hover:underline"
                    >
                      Back to Login
                    </button>
                  ) : (
                    <>
                      Don't have an account?{' '}
                      <Link
                        to={`/signup?returnTo=${encodeURIComponent(returnTo)}${intent ? `&intent=${encodeURIComponent(intent)}` : ''}`}
                        className="text-clay font-bold hover:underline"
                      >
                        Sign Up
                      </Link>
                    </>
                  )}
                </p>
              </div>
            </form>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};
