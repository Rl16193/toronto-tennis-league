import React, { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import {
  createUserWithEmailAndPassword, updateProfile,
  signInWithEmailAndPassword, sendPasswordResetEmail,
  linkWithCredential, type OAuthCredential,
} from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db, setAuthPersistence } from '../lib/firebase';
import { track } from '../lib/analytics';
import { useAuth } from '../context/AuthContext';
import { SKILL_LEVEL_TIERS, SELECTABLE_SKILL_LEVELS } from '../utils/skillLevels';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import {
  Trophy, MapPin, CheckCircle2, ChevronRight, ArrowRight,
  AlertCircle, Info, Star,
  Eye, EyeOff, Chrome, Apple, X,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { UserData, UserStats, UserPreferences } from '../types';
import mailcheck from 'mailcheck';
import { defaultCourtOptions, extractCourtsWithCoords, extractDropdownCourts, getCourtSuggestions, mergeCourtOptions } from '../features/signup/utils/courtSearch';
import { getZoneWithBorderCheck } from '../utils/zones';
import { formatPhone } from '../utils/formatPhone';
import { getSignupErrorMessage, signupEmailRegex, emailExistsForSignup } from '../features/signup/signupValidation';
import { getAuthErrorMessage } from '../features/auth/authMessages';
import { useGoogleSignIn } from '../features/auth/useGoogleSignIn';
import { useAppleSignIn } from '../features/auth/useAppleSignIn';

const FAVOURITE_PLAYERS = [
  "Jannik Sinner", "Carlos Alcaraz", "Rafael Nadal",
  "Roger Federer", "Novak Djokovic"
];

type AuthPhase = 'email' | 'login' | 'account' | 'preferences' | 'done';

// Wordmark used in place of the logo image on every auth phase.
const BrandMark: React.FC = () => (
  <div className="mx-auto mb-2 text-center">
    <span className="text-2xl font-black font-display tracking-tight">
      <span className="text-fg">RACQUETS</span><span className="text-clay"> &amp; </span><span className="text-fg">STRINGS</span>
    </span>
    <p className="text-clay font-bold text-xs tracking-widest uppercase mt-1">L&apos;ŒUF FOR THE GAME</p>
  </div>
);

export const Signup: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, profile, loading: authLoading, refreshProfile } = useAuth();
  const [phase, setPhase] = useState<AuthPhase>('email');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [prefStep, setPrefStep] = useState<1 | 2>(1);
  const [emailSuggestion, setEmailSuggestion] = useState<any>(null);
  const [courtOptions, setCourtOptions] = useState<string[]>(defaultCourtOptions);
  const [courtCoordsMap, setCourtCoordsMap] = useState<Map<string, { lat: number; lng: number }>>(new Map());
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Login sub-flow (existing email)
  const [loginPassword, setLoginPassword] = useState('');
  const [showForgot, setShowForgot] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [pendingGoogleCredential, setPendingGoogleCredential] = useState<OAuthCredential | null>(null);
  const [pendingAppleCredential, setPendingAppleCredential] = useState<OAuthCredential | null>(null);
  const loginPasswordRef = React.useRef<HTMLInputElement>(null);

  const intent = searchParams.get('intent') || '';

  const { handleGoogleSignIn } = useGoogleSignIn({
    navigate,
    setError,
    setLoading,
    onAccountExists: (email, credential) => {
      setFormData((prev) => ({ ...prev, email }));
      setPendingGoogleCredential(credential);
      setPhase('login');
      setStatusMessage('This email already has a password. Enter it below to sign in — this will also enable Google sign-in for next time.');
    },
  });

  const { handleAppleSignIn } = useAppleSignIn({
    navigate,
    setError,
    setLoading,
    onAccountExists: (email, credential) => {
      setFormData((prev) => ({ ...prev, email }));
      setPendingAppleCredential(credential);
      setPhase('login');
      setStatusMessage('This email already has a password. Enter it below to sign in — this will also enable Apple sign-in for next time.');
    },
  });

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    phone: '',
    skillLevel: 2,
    league: '' as "Men's" | "Women's" | '',
    retiredPro: false,
    juniors: false,
    preferredCourts: [] as string[],
    customCourtEntry: '',
    favouritePlayers: [] as string[],
    customPlayerEntry: '',
    organizer: false,
    schedulingPreference: 'I will schedule matches on my own' as any,
    preferredZone: '',
    pendingZoneChoice: null as { primary: string; adjacent: string } | null,
  });
  const selectedSkillIdxRaw = SELECTABLE_SKILL_LEVELS.indexOf(formData.skillLevel as typeof SELECTABLE_SKILL_LEVELS[number]);
  const selectedSkillIndex = selectedSkillIdxRaw >= 0 ? selectedSkillIdxRaw : SELECTABLE_SKILL_LEVELS.length - 1;

  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => { document.title = 'Sign In — Racquets & Strings'; }, []);

  // Funnel: entering step 1 (email gate) on first load.
  useEffect(() => {
    track('signup_step', { step_number: 1, step_name: 'email', action: 'enter' });
  }, []);

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(''), 30_000);
    return () => clearTimeout(t);
  }, [error]);

  useEffect(() => {
    if (!statusMessage) return;
    const t = setTimeout(() => setStatusMessage(''), 30_000);
    return () => clearTimeout(t);
  }, [statusMessage]);

  // Google/Apple sign-in matched an existing email/password account: neither can finish the
  // sign-in itself, so pull focus to the password field the user actually needs to fill in.
  useEffect(() => {
    if (pendingGoogleCredential || pendingAppleCredential) loginPasswordRef.current?.focus();
  }, [pendingGoogleCredential, pendingAppleCredential]);

  // Auth routing state machine (no email-verification step):
  //  - signed in but profile not filled in (name empty) → open the completion form
  //  - mid-signup (account / preferences / done success screen) → stay put
  //  - otherwise (existing account, complete profile) → /profile
  useEffect(() => {
    if (authLoading || !user) return;
    if (phase === 'account' || phase === 'preferences' || phase === 'done') return;
    const incomplete = !profile || profile.user.name.trim() === '';
    if (incomplete) { setPhase('preferences'); setPrefStep(1); return; }
    navigate('/profile');
  }, [authLoading, user, profile, phase, navigate]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [phase]);

  useEffect(() => {
    let isMounted = true;
    fetch('/Tennis Courts Facilities - 4326.csv')
      .then((response) => response.ok ? response.text() : '')
      .then((csvText) => {
        if (!isMounted || !csvText) return;
        setCourtOptions(mergeCourtOptions(extractDropdownCourts(csvText)));
        setCourtCoordsMap(extractCourtsWithCoords(csvText));
      })
      .catch((err) => { console.error('Unable to load tennis court list:', err); });
    return () => { isMounted = false; };
  }, []);

  // Account step now collects only the password (email already entered; name/phone come after
  // verification, in the completion step).
  const validatePassword = () => {
    const newErrors: Record<string, string> = {};
    const sequential = '1234567890abcdefghijklmnopqrstuvwxyz';
    if (
      formData.password.length < 6 ||
      formData.password.length > 80 ||
      formData.password.trim().length < 3 ||
      sequential.includes(formData.password.toLowerCase())
    ) {
      newErrors.password = 'Password should be between 6-80 characters and non-sequential.';
    }
    if (formData.confirmPassword !== formData.password) {
      newErrors.confirmPassword = 'Passwords do not match';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const isNameValid = () =>
    formData.name.trim().length >= 3 &&
    formData.name.length <= 80 &&
    !/\d/.test(formData.name);

  const validateCompletion = () => {
    const newErrors: Record<string, string> = {};
    if (formData.name.trim().length < 3 || formData.name.length > 80) newErrors.name = 'Name must be 3-80 characters';
    if (/\d/.test(formData.name)) newErrors.name = 'Name cannot contain numbers';
    const rawPhone = formData.phone.replace(/\D/g, '');
    if (rawPhone.length > 0 && rawPhone.length !== 10) newErrors.phone = 'Phone number must be exactly 10 digits';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Email gate: decide between login (existing) and account creation (new)
  const handleEmailContinue = async () => {
    const trimmedEmail = formData.email.trim();
    if (!signupEmailRegex.test(trimmedEmail)) {
      setErrors({ ...errors, email: 'Please enter a valid email address' });
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await emailExistsForSignup(trimmedEmail);
      if (result === 'secondary') {
        // This address was merged into another account — it has no real Auth credential, so
        // normal login won't work here. Block signup instead of creating a third duplicate.
        setError('This email is linked to an existing account under a different address. Please sign in with the email you originally registered with.');
        return;
      }
      if (result === 'none') {
        // Signup funnel: step 1 (email) complete → entering step 2 (account).
        track('signup_step', { step_number: 1, step_name: 'email', action: 'complete' });
        track('signup_step', { step_number: 2, step_name: 'account', action: 'enter' });
      }
      setPhase(result === 'primary' ? 'login' : 'account');
    } catch {
      // Fail open → treat as new; Firebase Auth will catch a real duplicate at creation.
      track('signup_step', { step_number: 1, step_name: 'email', action: 'complete' });
      track('signup_step', { step_number: 2, step_name: 'account', action: 'enter' });
      setPhase('account');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    if (loginPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await setAuthPersistence(true);
      const credential = await signInWithEmailAndPassword(auth, formData.email.trim(), loginPassword);
      // Direction 1 — email-first user now signing in via Google/Apple: link the pending credential.
      if (pendingGoogleCredential) {
        try {
          await linkWithCredential(credential.user, pendingGoogleCredential);
        } catch {
          // Linking failed (already linked, etc.) — user is still signed in, so continue.
        }
        setPendingGoogleCredential(null);
      }
      if (pendingAppleCredential) {
        try {
          await linkWithCredential(credential.user, pendingAppleCredential);
        } catch {
          // Linking failed (already linked, etc.) — user is still signed in, so continue.
        }
        setPendingAppleCredential(null);
      }
      track('login', { method: 'email' });
      navigate('/profile');
    } catch (err: any) {
      // Direction 2 — Google-first user trying email/password.
      // fetchSignInMethodsForEmail is deprecated and returns [] when Firebase email-enumeration
      // protection is enabled, so we can't rely on it. We already know the account exists
      // (user reached the login phase), so an invalid-credential error almost certainly means
      // they signed up with Google and have no password set.
      const code = err?.code ?? '';
      if (code === 'auth/wrong-password' || code === 'auth/invalid-credential' || code === 'auth/invalid-login-credentials') {
        setError('Incorrect password. If you previously signed in with Google, tap "Google Account" below.');
        return;
      }
      setError(getAuthErrorMessage(err, 'login'));
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    const trimmedEmail = formData.email.trim();
    if (!signupEmailRegex.test(trimmedEmail)) {
      setError('Please enter a valid email address.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await sendPasswordResetEmail(auth, trimmedEmail);
      setResetSent(true);
    } catch (err: any) {
      setError(getAuthErrorMessage(err, 'reset'));
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAccount = async () => {
    setLoading(true);
    setError('');
    try {
      await setAuthPersistence(true);
      const credential = await createUserWithEmailAndPassword(auth, formData.email.trim(), formData.password);
      const u = credential.user;
      // No email verification — profile docs are bootstrapped by AuthContext (name ''); name +
      // preferences are collected in the next step, which we go straight to.
      sessionStorage.setItem(`profile-bootstrap-pending:${u.uid}`, '1');
      sessionStorage.removeItem(`profile-bootstrap-retry:${u.uid}`);

      track('signup_step', { step_number: 2, step_name: 'account', action: 'complete' });
      track('sign_up', { method: 'email' });

      setPhase('preferences');
      setPrefStep(1);
    } catch (err: any) {
      setError(getSignupErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteProfile = async () => {
    if (!validateCompletion()) return;
    setLoading(true);
    try {
      const u = auth.currentUser!;
      await updateProfile(u, { displayName: formData.name });
      await setDoc(doc(db, 'users', u.uid), { name: formData.name, phone: formData.phone }, { merge: true });
      const ageCategory = formData.retiredPro ? ' Retired Pro' : formData.juniors ? ' Juniors' : '';
      const leagueValue = formData.league ? `${formData.league}${ageCategory}` : '';
      await setDoc(doc(db, 'stats', u.uid), { name: formData.name, skill_level: formData.skillLevel, ...(leagueValue ? { league: leagueValue } : {}) }, { merge: true });
      await setDoc(doc(db, 'preferences', u.uid), {
        preferred_courts: formData.preferredCourts,
        favourite_players: formData.favouritePlayers,
        preferred_zone: formData.preferredZone,
        scheduling_preference: formData.schedulingPreference,
      }, { merge: true });
      await refreshProfile(u);
      track('signup_step', { step_number: 3, step_name: 'preferences', action: 'complete' });
      track('complete_profile', { method: 'email' });
      setPhase('done');
    } catch {
      // Write failed — still show the success screen; the user can finish from /profile.
      track('complete_profile', { method: 'email' });
      setPhase('done');
    } finally {
      setLoading(false);
    }
  };

  const handleAccountContinue = async () => {
    if (validatePassword()) await handleCreateAccount();
  };

  const goToEmailPhase = () => {
    setPhase('email');
    setLoginPassword('');
    setShowForgot(false);
    setResetSent(false);
    setError('');
    setErrors({});
    setPendingGoogleCredential(null);
  };

  const nameOnlyRegex = /^[A-Za-z ]+$/;

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newEmail = e.target.value;
    setFormData({ ...formData, email: newEmail });
    if (errors.email) setErrors({ ...errors, email: '' });
    setEmailSuggestion(null);
    mailcheck.run({
      email: newEmail,
      suggested: (suggestion) => setEmailSuggestion(suggestion),
      empty: () => setEmailSuggestion(null),
    });
  };

  const addCustomCourt = () => {
    const court = formData.customCourtEntry.trim();
    if (!court) return;
    setFormData({
      ...formData,
      preferredCourts: formData.preferredCourts.includes(court)
        ? formData.preferredCourts
        : [...formData.preferredCourts, court],
      customCourtEntry: '',
    });
    setErrors({ ...errors, customCourtEntry: '' });
  };

  const addCustomPlayer = () => {
    const player = formData.customPlayerEntry.trim();
    if (!player) return;
    if (!nameOnlyRegex.test(player)) {
      setErrors({ ...errors, customPlayerEntry: 'Favourite player names can only contain letters and spaces.' });
      return;
    }
    setFormData({
      ...formData,
      favouritePlayers: formData.favouritePlayers.includes(player)
        ? formData.favouritePlayers
        : [...formData.favouritePlayers, player],
      customPlayerEntry: '',
    });
    setErrors({ ...errors, customPlayerEntry: '' });
  };

  // Recompute zone whenever the first preferred court changes
  useEffect(() => {
    const firstCourt = formData.preferredCourts[0];
    if (!firstCourt || !courtCoordsMap.size) {
      setFormData((prev) => ({ ...prev, preferredZone: '', pendingZoneChoice: null }));
      return;
    }
    const coords = courtCoordsMap.get(firstCourt.toLowerCase());
    if (!coords) {
      setFormData((prev) => ({ ...prev, preferredZone: '', pendingZoneChoice: null }));
      return;
    }
    const { primary, adjacent } = getZoneWithBorderCheck(coords.lat, coords.lng);
    if (adjacent) {
      setFormData((prev) => ({ ...prev, preferredZone: '', pendingZoneChoice: { primary, adjacent } }));
    } else {
      setFormData((prev) => ({ ...prev, preferredZone: primary, pendingZoneChoice: null }));
    }
  }, [formData.preferredCourts, courtCoordsMap]); // eslint-disable-line react-hooks/exhaustive-deps

  const courtSuggestions = getCourtSuggestions(courtOptions, formData.preferredCourts, formData.customCourtEntry);

  const selectCourt = (court: string) => {
    setFormData({
      ...formData,
      preferredCourts: formData.preferredCourts.includes(court)
        ? formData.preferredCourts
        : [...formData.preferredCourts, court],
      customCourtEntry: '',
    });
    setErrors({ ...errors, customCourtEntry: '' });
  };

  const isSignupPhase = phase === 'account' || phase === 'preferences';

  // Avoid flashing the email form while Firebase resolves an existing session, or in the brief
  // window after an authenticated user lands here before the redirect/phase effect fires.
  if (authLoading || (user && phase === 'email')) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-14 h-14 border-4 border-clay border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen py-8 px-4 relative overflow-hidden">
      {/* Background Glows */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-clay/5 blur-[120px] -z-10 rounded-full" />
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-tennis-surface/20 blur-[100px] -z-10 rounded-full" />

      <div className="max-w-4xl mx-auto">
        {/* Progress Bar — signup phases only */}
        {isSignupPhase && (
          <div className="mb-12">
            {(intent === 'join-event' || intent === 'join-league') && (
              <div className="mb-6 rounded-2xl border border-clay/20 bg-clay/10 px-5 py-4 text-sm text-fg">
                {intent === 'join-league'
                  ? 'Create your league profile to access events and get match updates.'
                  : 'Create your league profile to join events and receive updates.'}
              </div>
            )}
            <div className="flex justify-between items-center mb-4">
              {[1, 2].map((i) => {
                const stepNum = phase === 'account' ? 1 : 2;
                return (
                  <div key={i} className="flex flex-col items-center space-y-2">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-lg transition-all duration-300 ${
                      stepNum >= i ? 'clay-gradient text-white shadow-lg shadow-clay/20' : 'bg-tennis-surface/50 text-fg border border-fg/5'
                    }`}>
                      {stepNum > i ? <CheckCircle2 className="w-6 h-6" /> : i}
                    </div>
                    <span className={`text-xs font-bold uppercase tracking-widest ${stepNum >= i ? 'text-clay' : 'text-fg'}`}>
                      {i === 1 ? 'Account' : 'Preferences'}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="h-1.5 w-full bg-tennis-surface/50 rounded-full overflow-hidden">
              <motion.div
                className="h-full clay-gradient"
                initial={{ width: '50%' }}
                animate={{ width: `${((phase === 'account' ? 1 : 2) / 2) * 100}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>
          </div>
        )}

        <AnimatePresence mode="wait">
        <motion.div
          key={phase}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.25 }}
          className="p-6 md:p-10"
        >
          {error && (
            <div className="mb-8 p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-500 flex items-center space-x-3">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {statusMessage && (
            <div className="mb-8 p-4 rounded-2xl bg-green-500/10 border border-green-500/20 text-green-400 flex items-center space-x-3">
              <CheckCircle2 className="w-5 h-5 shrink-0" />
              <span>{statusMessage}</span>
            </div>
          )}

          {/* PHASE: EMAIL GATE */}
          {phase === 'email' && (
            <div className="max-w-md mx-auto space-y-6">
              <div className="text-center space-y-2">
                <BrandMark />
                {intent === 'join-event' && (
                  <p className="text-sm text-fg">Sign in to join an event.</p>
                )}
                {intent === 'join-league' && (
                  <p className="text-sm text-fg">Create a profile to get updates on events.</p>
                )}
              </div>

              <div className="space-y-4">
                <div>
                  <Input
                    label="Email Address"
                    type="email"
                    placeholder="roger@hotmail.com"
                    value={formData.email}
                    onChange={handleEmailChange}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleEmailContinue(); } }}
                    error={errors.email}
                    autoFocus
                    required
                  />
                  {emailSuggestion && (
                    <div className="text-sm text-blue-400 mt-1">
                      Did you mean{' '}
                      <button
                        className="underline hover:text-blue-300"
                        onClick={() => { setFormData({ ...formData, email: emailSuggestion.full }); setEmailSuggestion(null); }}
                      >
                        {emailSuggestion.full}
                      </button>?
                    </div>
                  )}
                </div>
                <Button onClick={handleEmailContinue} className="w-full group" isLoading={loading}>
                  Continue
                  <ChevronRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </Button>
              </div>

              {/* Google / Apple — bottom of the page */}
              <div className="space-y-2.5">
                <div className="relative py-2">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-fg/5" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-tennis-dark px-4 text-fg/40 font-bold tracking-widest">Or</span>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full border border-fg/5"
                  onClick={handleGoogleSignIn}
                  isLoading={loading}
                >
                  <Chrome className="mr-2 w-5 h-5" />
                  Google Account
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full border border-fg/5"
                  onClick={handleAppleSignIn}
                  isLoading={loading}
                >
                  <Apple className="mr-2 w-5 h-5" />
                  Apple Account
                </Button>
              </div>
            </div>
          )}

          {/* PHASE: LOGIN (existing email) */}
          {phase === 'login' && (
            <div className="max-w-md mx-auto space-y-6">
              {resetSent ? (
                <div className="text-center space-y-6 py-8">
                  <div className="w-20 h-20 bg-green-500/10 rounded-full flex items-center justify-center mx-auto">
                    <CheckCircle2 className="w-10 h-10 text-green-500" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-xl font-bold text-fg">Reset Link Sent</h3>
                    <p className="text-fg/70">If the email is linked with an account, you will receive a reset link.</p>
                    <p className="text-fg/50 text-sm">Check your spam folder too.</p>
                  </div>
                  <Button variant="outline" className="w-full" onClick={() => { setResetSent(false); setShowForgot(false); }}>
                    Back to Sign In
                  </Button>
                </div>
              ) : (
                <>
                  <div className="text-center space-y-2">
                    <BrandMark />
                    {showForgot && <h1 className="text-3xl font-black text-fg">Reset Password</h1>}
                    <p className="text-fg/60 text-sm">
                      {formData.email}{' '}
                      <button type="button" onClick={goToEmailPhase} className="text-clay hover:underline font-semibold">
                        (change)
                      </button>
                    </p>
                  </div>

                  {!showForgot && (
                    <div className="space-y-1.5">
                      <label className="block text-sm font-medium text-fg">Password</label>
                      <div className="relative">
                        <input
                          ref={loginPasswordRef}
                          type={showPassword ? 'text' : 'password'}
                          placeholder="••••••••"
                          value={loginPassword}
                          onChange={(e) => setLoginPassword(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleLogin(); } }}
                          autoFocus
                          className="w-full rounded-2xl bg-tennis-surface/50 border border-fg/10 px-4 py-3 pr-10 text-fg placeholder-fg/40 transition-all duration-200 focus:border-clay focus:ring-2 focus:ring-clay/20 outline-none"
                        />
                        <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-fg transition-colors" tabIndex={-1}>
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  )}

                  {!showForgot && (
                    <div className="flex items-center justify-end">
                      <button
                        type="button"
                        onClick={() => { setShowForgot(true); setError(''); }}
                        className="text-sm font-medium text-clay hover:text-clay-dark transition-colors"
                      >
                        Forgot Password?
                      </button>
                    </div>
                  )}

                  <Button onClick={showForgot ? handleResetPassword : handleLogin} className="w-full group" isLoading={loading}>
                    {showForgot ? 'Send Reset Link' : 'Sign In'}
                    {!loading && <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />}
                  </Button>

                  {showForgot && (
                    <div className="text-center">
                      <button
                        type="button"
                        onClick={() => { setShowForgot(false); setError(''); }}
                        className="text-clay font-bold hover:underline text-sm"
                      >
                        Back to Sign In
                      </button>
                    </div>
                  )}

                  {/* Google/Apple can't complete sign-in for an email that already has a password —
                      hide both while a linking flow is pending so the user isn't tempted to
                      retry and loop back to this same screen. */}
                  {!showForgot && !pendingGoogleCredential && !pendingAppleCredential && (
                    <div className="space-y-2.5">
                      <div className="relative py-2">
                        <div className="absolute inset-0 flex items-center">
                          <div className="w-full border-t border-fg/5" />
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="secondary"
                        className="w-full border border-fg/5"
                        onClick={handleGoogleSignIn}
                        isLoading={loading}
                      >
                        <Chrome className="mr-2 w-5 h-5" />
                        Google Account
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        className="w-full border border-fg/5"
                        onClick={handleAppleSignIn}
                        isLoading={loading}
                      >
                        <Apple className="mr-2 w-5 h-5" />
                        Apple Account
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* PHASE: ACCOUNT (new email) */}
          {phase === 'account' && (
            <div className="space-y-8">
              <div className="text-center space-y-2">
                <BrandMark />
                <p className="text-fg/60 text-sm">
                  {formData.email}{' '}
                  <button type="button" onClick={goToEmailPhase} className="text-clay hover:underline font-semibold">
                    (change)
                  </button>
                </p>
              </div>

              <div className="grid grid-cols-1 gap-6">
                {/* Password | Confirm Password */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="w-full space-y-1.5">
                    <label className="block text-sm font-medium text-fg">
                      Password <span className="text-orange-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        placeholder="••••••••"
                        value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        className={`w-full rounded-2xl bg-tennis-surface/50 border px-4 py-3 pr-10 text-fg placeholder-fg/40 transition-all duration-200 focus:ring-2 outline-none ${errors.password ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20' : 'border-fg/10 focus:border-clay focus:ring-clay/20'}`}
                      />
                      <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-fg transition-colors" tabIndex={-1}>
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {errors.password && <p className="text-xs text-red-500 mt-1 ml-1">{errors.password}</p>}
                  </div>

                  <div className="w-full space-y-1.5">
                    <label className="block text-sm font-medium text-fg">
                      Re-enter Password <span className="text-orange-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type={showConfirmPassword ? 'text' : 'password'}
                        placeholder="••••••••"
                        value={formData.confirmPassword}
                        onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                        className={`w-full rounded-2xl bg-tennis-surface/50 border px-4 py-3 pr-10 text-fg placeholder-fg/40 transition-all duration-200 focus:ring-2 outline-none ${
                          (errors.confirmPassword || (formData.confirmPassword && formData.confirmPassword !== formData.password))
                            ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20'
                            : 'border-fg/10 focus:border-clay focus:ring-clay/20'
                        }`}
                      />
                      <button type="button" onClick={() => setShowConfirmPassword((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-fg transition-colors" tabIndex={-1}>
                        {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {formData.confirmPassword && formData.confirmPassword !== formData.password && (
                      <p className="text-xs text-red-500 mt-1 ml-1">Passwords do not match</p>
                    )}
                    {errors.confirmPassword && !formData.confirmPassword && (
                      <p className="text-xs text-red-500 mt-1 ml-1">{errors.confirmPassword}</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* PHASE: VERIFY EMAIL */}
          {phase === 'done' && (
            <div className="relative max-w-md mx-auto text-center rounded-3xl border border-green-500/25 bg-green-500/5 p-8">
              {/* Cross — closes the message and opens the app (Matches page). */}
              <button
                type="button"
                onClick={() => navigate('/profile')}
                aria-label="Close and continue to the app"
                className="absolute top-4 right-4 text-fg/40 hover:text-fg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="mx-auto w-16 h-16 rounded-full bg-green-500/15 border border-green-500/30 flex items-center justify-center mb-5">
                <CheckCircle2 className="w-9 h-9 text-green-400" />
              </div>
              <h1 className="text-2xl font-black text-fg mb-3">Thank you for joining the league</h1>
              <p className="text-fg/70 text-sm leading-relaxed">
                A welcome email containing further instructions has been sent. Please check your
                junk / spam folder if you don't see it.
              </p>

              <Button size="lg" className="w-full mt-7" onClick={() => navigate('/profile')}>
                Continue
              </Button>
            </div>
          )}

          {/* PHASE: PREFERENCES — 3 screens */}
          {phase === 'preferences' && (
            <div className="space-y-8">

              {/* Screen 1: Name + Phone + Skill */}
              {prefStep === 1 && (
                <div className="space-y-8">
                  <div className="grid grid-cols-1 gap-6">
                    <div>
                      <Input
                        label="Full Name"
                        placeholder="Roger Federer"
                        value={formData.name}
                        onChange={(e) => { setFormData({ ...formData, name: e.target.value }); setErrors({ ...errors, name: '' }); }}
                        error={errors.name}
                        required
                      />
                      {formData.name && !isNameValid() && !errors.name && (
                        <p className="text-xs text-red-500 mt-1 ml-1">Name must be 3–80 letters, no numbers.</p>
                      )}
                    </div>
                    <Input
                      label="Phone Number"
                      placeholder="(416)-555-0123"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: formatPhone(e.target.value) })}
                      error={errors.phone}
                    />
                  </div>

                  <div className="space-y-6">
                    <div className="flex justify-between items-end">
                      <h3 className="text-xl font-bold text-fg flex items-center">
                        <Trophy className="w-5 h-5 mr-2 text-clay" />
                        NTRP Skill Level
                      </h3>
                      <div className="text-4xl font-black text-clay">{formData.skillLevel}</div>
                    </div>
                    <div className="relative pt-6">
                      <input
                        type="range"
                        min="0" max={SELECTABLE_SKILL_LEVELS.length - 1} step="1"
                        value={selectedSkillIndex}
                        onChange={(e) => setFormData({ ...formData, skillLevel: SELECTABLE_SKILL_LEVELS[Number(e.target.value)] })}
                        className="w-full h-3 rounded-full"
                      />
                      <div className="mt-4 flex items-start justify-between gap-2 text-center">
                        {SELECTABLE_SKILL_LEVELS.map((level) => (
                          <div key={level} className="flex flex-col items-center gap-2">
                            <span className={`w-2.5 h-2.5 rounded-full ${formData.skillLevel === level ? 'bg-clay' : 'bg-fg/20'}`} />
                            <span className={`text-[10px] font-black tracking-widest ${formData.skillLevel === level ? 'text-clay' : 'text-fg'}`}>
                              {level.toFixed(1)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-clay/10 border border-clay/20 text-center">
                      <Info className="w-5 h-5 text-clay shrink-0" />
                      {SKILL_LEVEL_TIERS.map((t) => (
                        <p key={t.label} className="text-sm font-medium text-fg">{t.range} {t.label}</p>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Screen 2: Courts + Players */}
              {prefStep === 2 && (
                <div className="space-y-8">
                  <div className="space-y-4">
                    <label className="block text-sm font-bold text-fg uppercase tracking-wider">Preferred Courts</label>
                    <p className="text-xs text-fg/50">Tip: select <span className="text-clay font-semibold">Stanley Park South - Toronto</span> for the downtown area.</p>

                    {formData.preferredCourts.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {formData.preferredCourts.map((court) => (
                          <button
                            key={court}
                            type="button"
                            onClick={() => setFormData({ ...formData, preferredCourts: formData.preferredCourts.filter((c) => c !== court) })}
                            className="px-3 py-1 rounded-xl text-xs font-bold bg-clay text-white flex items-center gap-1.5 shadow-lg shadow-clay/20"
                          >
                            {court} <span className="opacity-70">✕</span>
                          </button>
                        ))}
                      </div>
                    )}

                    <div className="relative">
                      <div className="flex gap-3">
                        <Input
                          placeholder="Search courts by name..."
                          value={formData.customCourtEntry}
                          error={errors.customCourtEntry}
                          onChange={(e) => {
                            setFormData({ ...formData, customCourtEntry: e.target.value });
                            if (errors.customCourtEntry) setErrors({ ...errors, customCourtEntry: '' });
                          }}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomCourt(); } }}
                        />
                        <Button type="button" variant="clay" size="sm" className="px-3 shrink-0" onClick={addCustomCourt} disabled={!formData.customCourtEntry.trim()}>
                          Add
                        </Button>
                      </div>
                      {courtSuggestions.length > 0 && (
                        <div className="mt-3 max-h-48 overflow-y-auto rounded-2xl border border-fg/10 bg-tennis-dark/95 p-2 shadow-2xl">
                          {courtSuggestions.map((court) => (
                            <button
                              key={court}
                              type="button"
                              onClick={() => selectCourt(court)}
                              className="w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-fg transition-colors hover:bg-clay/20 hover:text-fg"
                            >
                              {court}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {formData.pendingZoneChoice ? (
                      <div className="mt-3 p-4 rounded-2xl bg-clay/10 border border-clay/20 space-y-3">
                        <p className="text-xs font-bold text-fg uppercase tracking-wider flex items-center gap-2">
                          <MapPin className="w-3.5 h-3.5 text-clay" />
                          Your court is near a zone boundary — choose your zone
                        </p>
                        <div className="flex gap-2">
                          {[formData.pendingZoneChoice.primary, formData.pendingZoneChoice.adjacent].map((zone) => (
                            <button
                              key={zone}
                              type="button"
                              onClick={() => setFormData({ ...formData, preferredZone: zone, pendingZoneChoice: null })}
                              className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold border transition-all ${
                                formData.preferredZone === zone
                                  ? 'bg-clay border-clay text-white shadow-lg shadow-clay/20'
                                  : 'bg-fg/5 border-fg/10 text-fg hover:bg-fg/10'
                              }`}
                            >
                              {zone}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : formData.preferredZone ? (
                      <div className="mt-3 flex items-center gap-2">
                        <MapPin className="w-3.5 h-3.5 text-clay shrink-0" />
                        <span className="text-xs text-fg/70">Zone auto-assigned:</span>
                        <span className="px-2.5 py-1 rounded-lg bg-clay/20 border border-clay/30 text-clay text-xs font-bold">
                          {formData.preferredZone}
                        </span>
                      </div>
                    ) : null}
                  </div>

                  <div className="space-y-4">
                    <label className="block text-sm font-bold text-fg uppercase tracking-wider flex items-center">
                      <Star className="w-4 h-4 mr-2 text-clay" />
                      Favourite Players
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {[...new Set([...FAVOURITE_PLAYERS, ...formData.favouritePlayers])].map((player) => (
                        <button
                          key={player}
                          onClick={() => {
                            const current = formData.favouritePlayers;
                            setFormData({
                              ...formData,
                              favouritePlayers: current.includes(player)
                                ? current.filter((p) => p !== player)
                                : [...current, player],
                            });
                          }}
                          className={`px-4 py-2 rounded-full text-xs font-bold border transition-all ${
                            formData.favouritePlayers.includes(player)
                              ? 'bg-clay border-clay text-white shadow-lg shadow-clay/20'
                              : 'bg-fg/5 border-fg/5 text-fg hover:bg-fg/10'
                          }`}
                        >
                          {player}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-3">
                      <Input
                        placeholder="Add your own player..."
                        value={formData.customPlayerEntry}
                        error={errors.customPlayerEntry}
                        onChange={(e) => {
                          setFormData({ ...formData, customPlayerEntry: e.target.value });
                          if (errors.customPlayerEntry) setErrors({ ...errors, customPlayerEntry: '' });
                        }}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomPlayer(); } }}
                      />
                      <Button type="button" variant="clay" size="sm" onClick={addCustomPlayer} disabled={!formData.customPlayerEntry.trim()}>
                        Add
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <label className="block text-sm font-bold text-fg uppercase tracking-wider">League</label>
                    <div className="flex flex-wrap gap-2">
                      {(["Men's", "Women's"] as const).map((league) => (
                        <button
                          key={league}
                          type="button"
                          onClick={() => setFormData({ ...formData, league })}
                          className={`px-4 py-2 rounded-full text-xs font-bold border transition-all ${
                            formData.league === league
                              ? 'bg-clay border-clay text-white shadow-lg shadow-clay/20'
                              : 'bg-fg/5 border-fg/5 text-fg hover:bg-fg/10'
                          }`}
                        >
                          {league}
                        </button>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={!formData.league}
                        onClick={() => setFormData({ ...formData, retiredPro: !formData.retiredPro, juniors: false })}
                        className={`px-4 py-2 rounded-full text-xs font-bold border transition-all ${
                          !formData.league
                            ? 'bg-fg/5 border-fg/5 text-fg/30 cursor-not-allowed'
                            : formData.retiredPro
                              ? 'bg-clay border-clay text-white shadow-lg shadow-clay/20'
                              : 'bg-fg/5 border-fg/5 text-fg hover:bg-fg/10'
                        }`}
                      >
                        Retired Pro <span className="ml-1 opacity-70 font-normal normal-case">(age: 55+)</span>
                      </button>
                      <button
                        type="button"
                        disabled={!formData.league}
                        onClick={() => setFormData({ ...formData, juniors: !formData.juniors, retiredPro: false })}
                        className={`px-4 py-2 rounded-full text-xs font-bold border transition-all ${
                          !formData.league
                            ? 'bg-fg/5 border-fg/5 text-fg/30 cursor-not-allowed'
                            : formData.juniors
                              ? 'bg-clay border-clay text-white shadow-lg shadow-clay/20'
                              : 'bg-fg/5 border-fg/5 text-fg hover:bg-fg/10'
                        }`}
                      >
                        Juniors
                      </button>
                    </div>
                    {!formData.league && (
                      <p className="text-[11px] text-fg/40">Choose a league above to unlock Retired Pro / Juniors.</p>
                    )}
                  </div>

                  <p className="text-xs text-fg/50 text-center px-2">
                    By joining you agree to our{' '}
                    <Link to="/terms" className="text-clay hover:underline">terms of service</Link>.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Navigation — signup phases only */}
          {phase === 'account' && (
            <div className="flex justify-end items-center gap-3 mt-4 pt-8 border-t border-fg/5">
              <Button onClick={handleAccountContinue} className="group" isLoading={loading}>
                Continue
                <ChevronRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Button>
            </div>
          )}
          {phase === 'preferences' && (
            <div className="flex justify-between items-center gap-3 mt-4 pt-8 border-t border-fg/5">
              {prefStep > 1 ? (
                <Button variant="outline" onClick={() => setPrefStep((s) => (s - 1) as 1 | 2)}>
                  Back
                </Button>
              ) : <div />}
              {prefStep < 2 ? (
                <Button
                  onClick={() => setPrefStep((s) => (s + 1) as 1 | 2)}
                  disabled={prefStep === 1 && !isNameValid()}
                  className="group"
                >
                  Next
                  <ChevronRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </Button>
              ) : (
                <Button onClick={handleCompleteProfile} isLoading={loading}>
                  Complete Profile
                  <CheckCircle2 className="ml-2 w-5 h-5" />
                </Button>
              )}
            </div>
          )}
        </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};
