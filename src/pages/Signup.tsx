import React, { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import {
  createUserWithEmailAndPassword, updateProfile,
  signInWithEmailAndPassword, sendPasswordResetEmail,
  linkWithCredential, type OAuthCredential,
} from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db, storage, setAuthPersistence } from '../lib/firebase';
import { getDownloadURL, ref } from 'firebase/storage';
import { track } from '../lib/analytics';
import { useAuth } from '../context/AuthContext';
import { SKILL_DESCRIPTIONS, SKILL_LEVELS } from '../utils/skillLevels';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import {
  Trophy, MapPin, CheckCircle2, ChevronRight, ArrowRight,
  AlertCircle, Info, Star, Calendar, Clock,
  Eye, EyeOff, Chrome,
} from 'lucide-react';
import { motion } from 'motion/react';
import { UserData, UserStats, UserPreferences } from '../types';
import mailcheck from 'mailcheck';
import { defaultCourtOptions, extractCourtsWithCoords, extractDropdownCourts, getCourtSuggestions, mergeCourtOptions } from '../features/signup/utils/courtSearch';
import { getZoneWithBorderCheck } from '../utils/zones';
import { getSignupErrorMessage, signupEmailRegex, emailExistsForSignup } from '../features/signup/signupValidation';
import { getAuthErrorMessage } from '../features/auth/authMessages';
import { useGoogleSignIn } from '../features/auth/useGoogleSignIn';

const FAVOURITE_PLAYERS = [
  "Jannik Sinner", "Carlos Alcaraz", "Rafael Nadal",
  "Roger Federer", "Novak Djokovic"
];

type AuthPhase = 'email' | 'login' | 'account' | 'preferences';

export const Signup: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, loading: authLoading, refreshProfile } = useAuth();
  const [phase, setPhase] = useState<AuthPhase>('email');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [shouldRedirectToProfile, setShouldRedirectToProfile] = useState(false);
  const [emailSuggestion, setEmailSuggestion] = useState<any>(null);
  const [courtOptions, setCourtOptions] = useState<string[]>(defaultCourtOptions);
  const [courtCoordsMap, setCourtCoordsMap] = useState<Map<string, { lat: number; lng: number }>>(new Map());
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [logoUrl, setLogoUrl] = useState('');

  // Login sub-flow (existing email)
  const [loginPassword, setLoginPassword] = useState('');
  const [showForgot, setShowForgot] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [pendingGoogleCredential, setPendingGoogleCredential] = useState<OAuthCredential | null>(null);

  const intent = searchParams.get('intent') || '';

  const { handleGoogleSignIn } = useGoogleSignIn({
    navigate,
    setError,
    setLoading,
    onAccountExists: (email, credential) => {
      setFormData((prev) => ({ ...prev, email }));
      setPendingGoogleCredential(credential);
      setPhase('login');
      setStatusMessage('Sign in with your password to also enable Google sign-in on this account.');
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
    preferredCourts: [] as string[],
    customCourtEntry: '',
    favouritePlayers: [] as string[],
    customPlayerEntry: '',
    availabilityDay: [] as string[],
    availabilityTime: [] as string[],
    organizer: false,
    schedulingPreference: 'I will schedule matches on my own' as any,
    preferredZone: '',
    pendingZoneChoice: null as { primary: string; adjacent: string } | null,
  });
  const selectedSkillIndex = Math.max(0, SKILL_LEVELS.indexOf(formData.skillLevel as typeof SKILL_LEVELS[number]));

  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => { document.title = 'Sign In — Racquets & Strings'; }, []);

  // Funnel: entering step 1 (email gate) on first load.
  useEffect(() => {
    track('signup_step', { step_number: 1, step_name: 'email', action: 'enter' });
  }, []);

  useEffect(() => {
    getDownloadURL(ref(storage, 'LandingPage/Screenshot 2026-06-01 130844.png'))
      .then(setLogoUrl)
      .catch(() => {});
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

  // Single post-auth redirect, keyed off phase so destinations don't race:
  //  - new email signup → /events (via shouldRedirectToProfile)
  //  - while filling the signup form → wait (don't navigate)
  //  - everything else (existing-email login, Google, already-authenticated) → /profile
  useEffect(() => {
    if (authLoading || !user) return;
    if (shouldRedirectToProfile) { navigate('/events'); return; }
    if (phase === 'account' || phase === 'preferences') return;
    navigate('/profile');
  }, [authLoading, user, shouldRedirectToProfile, phase, navigate]);

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

  const validateAccount = () => {
    const newErrors: Record<string, string> = {};
    const trimmedEmail = formData.email.trim();
    if (formData.name.trim().length < 3 || formData.name.length > 80) newErrors.name = 'Name must be 3-80 characters';
    if (/\d/.test(formData.name)) newErrors.name = 'Name cannot contain numbers';
    if (!signupEmailRegex.test(trimmedEmail)) newErrors.email = 'Please enter a valid email address';
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
      const exists = await emailExistsForSignup(trimmedEmail);
      if (!exists) {
        // Signup funnel: step 1 (email) complete → entering step 2 (account).
        track('signup_step', { step_number: 1, step_name: 'email', action: 'complete' });
        track('signup_step', { step_number: 2, step_name: 'account', action: 'enter' });
      }
      setPhase(exists ? 'login' : 'account');
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
      // Direction 1 — email-first user now signing in via Google: link the pending Google credential.
      if (pendingGoogleCredential) {
        try {
          await linkWithCredential(credential.user, pendingGoogleCredential);
        } catch {
          // Linking failed (already linked, etc.) — user is still signed in, so continue.
        }
        setPendingGoogleCredential(null);
      }
      track('login', { method: 'email' });
      // Success → redirect effect (phase === 'login') navigates to /profile.
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
      await updateProfile(u, { displayName: formData.name });

      const userData: UserData = {
        name: formData.name,
        email: formData.email.trim(),
        phone: formData.phone,
        preferred_mode_of_contact: 'email',
        avatar: '',
        created_at: new Date().toISOString(),
      };
      const userStats: UserStats = {
        name: formData.name,
        skill_level: formData.skillLevel,
        tournament_preference: 'Challengers',
        matchesPlayed: 0, wins: 0, loses: 0, leaguePoints26: 0,
        tournamentsPlayed: 0, league: '', pointswon: 0, totalPointsPlayed: 0,
      };
      const userPreferences: UserPreferences = {
        availability_day: [], availability_time: [],
        preferred_courts: [], favourite_players: [],
        scheduling_preference: 'I will schedule matches on my own',
        event_creator: false, preferred_zone: '',
      };

      await setDoc(doc(db, 'users', u.uid), userData);
      await setDoc(doc(db, 'stats', u.uid), userStats);
      await setDoc(doc(db, 'preferences', u.uid), userPreferences);

      await refreshProfile(u);
      sessionStorage.setItem(`profile-bootstrap-pending:${u.uid}`, '1');
      sessionStorage.removeItem(`profile-bootstrap-retry:${u.uid}`);

      // Account exists now → fire sign_up immediately (not after optional prefs).
      track('signup_step', { step_number: 2, step_name: 'account', action: 'complete' });
      track('sign_up', { method: 'email' });
      track('signup_step', { step_number: 3, step_name: 'preferences', action: 'enter' });

      setPhase('preferences');
    } catch (err: any) {
      setError(getSignupErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteProfile = async () => {
    setLoading(true);
    try {
      const u = auth.currentUser!;
      await setDoc(doc(db, 'stats', u.uid), { skill_level: formData.skillLevel }, { merge: true });
      await setDoc(doc(db, 'preferences', u.uid), {
        availability_day: formData.availabilityDay,
        availability_time: formData.availabilityTime,
        preferred_courts: formData.preferredCourts,
        favourite_players: formData.favouritePlayers,
        preferred_zone: formData.preferredZone,
        scheduling_preference: formData.schedulingPreference,
      }, { merge: true });
      track('signup_step', { step_number: 3, step_name: 'preferences', action: 'complete' });
      track('complete_profile', { method: 'email' });
      setShouldRedirectToProfile(true);
    } catch {
      // Preferences failed — navigate anyway, user can update from /profile
      track('signup_step', { step_number: 3, step_name: 'preferences', action: 'complete' });
      track('complete_profile', { method: 'email' });
      setShouldRedirectToProfile(true);
    } finally {
      setLoading(false);
    }
  };

  const handleAccountContinue = async () => {
    if (validateAccount()) await handleCreateAccount();
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

  const formatPhone = (value: string) => {
    const numbers = value.replace(/\D/g, '');
    if (numbers.length <= 3) return numbers;
    if (numbers.length <= 6) return `(${numbers.slice(0, 3)})-${numbers.slice(3)}`;
    return `(${numbers.slice(0, 3)})-${numbers.slice(3, 6)}-${numbers.slice(6, 10)}`;
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
              <div className="mb-6 rounded-2xl border border-clay/20 bg-clay/10 px-5 py-4 text-sm text-white">
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
                      stepNum >= i ? 'clay-gradient text-white shadow-lg shadow-clay/20' : 'bg-tennis-surface/50 text-white border border-white/5'
                    }`}>
                      {stepNum > i ? <CheckCircle2 className="w-6 h-6" /> : i}
                    </div>
                    <span className={`text-xs font-bold uppercase tracking-widest ${stepNum >= i ? 'text-clay' : 'text-white'}`}>
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

        <motion.div
          key={phase}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
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
                {logoUrl && (
                  <img src={logoUrl} alt="Racquets & Strings" className="mx-auto h-20 w-auto object-contain mb-2" />
                )}
                {intent === 'join-event' && (
                  <p className="text-sm text-white">Sign in to join an event.</p>
                )}
                {intent === 'join-league' && (
                  <p className="text-sm text-white">Create a profile to get updates on events.</p>
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

              {/* Google — bottom of the page */}
              <div>
                <div className="relative py-2">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-white/5" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-tennis-dark px-4 text-white/40 font-bold tracking-widest">Or continue with</span>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full border border-white/5"
                  onClick={handleGoogleSignIn}
                  isLoading={loading}
                >
                  <Chrome className="mr-2 w-5 h-5" />
                  Google Account
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
                    <h3 className="text-xl font-bold text-white">Reset Link Sent</h3>
                    <p className="text-white/70">If the email is linked with an account, you will receive a reset link.</p>
                    <p className="text-white/50 text-sm">Check your spam folder too.</p>
                  </div>
                  <Button variant="outline" className="w-full" onClick={() => { setResetSent(false); setShowForgot(false); }}>
                    Back to Sign In
                  </Button>
                </div>
              ) : (
                <>
                  <div className="text-center space-y-2">
                    {logoUrl && (
                      <img src={logoUrl} alt="Racquets & Strings" className="mx-auto h-20 w-auto object-contain mb-2" />
                    )}
                    <h1 className="text-3xl font-black text-white">{showForgot ? 'Reset Password' : 'Welcome Back'}</h1>
                    <p className="text-white/60 text-sm">
                      {formData.email}{' '}
                      <button type="button" onClick={goToEmailPhase} className="text-clay hover:underline font-semibold">
                        (change)
                      </button>
                    </p>
                  </div>

                  {!showForgot && (
                    <div className="space-y-1.5">
                      <label className="block text-sm font-medium text-white">Password</label>
                      <div className="relative">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          placeholder="••••••••"
                          value={loginPassword}
                          onChange={(e) => setLoginPassword(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleLogin(); } }}
                          autoFocus
                          className="w-full rounded-2xl bg-tennis-surface/50 border border-white/10 px-4 py-3 pr-10 text-white placeholder-gray-500 transition-all duration-200 focus:border-clay focus:ring-2 focus:ring-clay/20 outline-none"
                        />
                        <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white transition-colors" tabIndex={-1}>
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

                  {!showForgot && (
                    <div>
                      <div className="relative py-2">
                        <div className="absolute inset-0 flex items-center">
                          <div className="w-full border-t border-white/5" />
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                          <span className="bg-tennis-dark px-4 text-white/40 font-bold tracking-widest">Or continue with</span>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="secondary"
                        className="w-full border border-white/5"
                        onClick={handleGoogleSignIn}
                        isLoading={loading}
                      >
                        <Chrome className="mr-2 w-5 h-5" />
                        Google Account
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
                {logoUrl && (
                  <img src={logoUrl} alt="Racquets & Strings" className="mx-auto h-20 w-auto object-contain mb-2" />
                )}
                <h1 className="text-3xl font-black text-white">Create Your Account</h1>
                <p className="text-white/60 text-sm">
                  {formData.email}{' '}
                  <button type="button" onClick={goToEmailPhase} className="text-clay hover:underline font-semibold">
                    (change)
                  </button>
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Name | Phone */}
                <Input
                  label="Full Name"
                  placeholder="Roger Federer"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  error={errors.name}
                  required
                />
                <Input
                  label="Phone Number"
                  placeholder="(416)-555-0123"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: formatPhone(e.target.value) })}
                  error={errors.phone}
                />

                {/* Password | Confirm Password */}
                <div className="col-span-1 md:col-span-2 grid grid-cols-2 gap-4">
                  <div className="w-full space-y-1.5">
                    <label className="block text-sm font-medium text-white">
                      Password <span className="text-orange-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        placeholder="••••••••"
                        value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        className={`w-full rounded-2xl bg-tennis-surface/50 border px-4 py-3 pr-10 text-white placeholder-gray-500 transition-all duration-200 focus:ring-2 outline-none ${errors.password ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20' : 'border-white/10 focus:border-clay focus:ring-clay/20'}`}
                      />
                      <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white transition-colors" tabIndex={-1}>
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {errors.password && <p className="text-xs text-red-500 mt-1 ml-1">{errors.password}</p>}
                  </div>

                  <div className="w-full space-y-1.5">
                    <label className="block text-sm font-medium text-white">
                      Re-enter Password <span className="text-orange-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type={showConfirmPassword ? 'text' : 'password'}
                        placeholder="••••••••"
                        value={formData.confirmPassword}
                        onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                        className={`w-full rounded-2xl bg-tennis-surface/50 border px-4 py-3 pr-10 text-white placeholder-gray-500 transition-all duration-200 focus:ring-2 outline-none ${
                          (errors.confirmPassword || (formData.confirmPassword && formData.confirmPassword !== formData.password))
                            ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20'
                            : 'border-white/10 focus:border-clay focus:ring-clay/20'
                        }`}
                      />
                      <button type="button" onClick={() => setShowConfirmPassword((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white transition-colors" tabIndex={-1}>
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

          {/* PHASE: PREFERENCES */}
          {phase === 'preferences' && (
            <div className="space-y-10">
              {/* Skill Level Slider — unboxed */}
              <div className="space-y-6">
                <div className="flex justify-between items-end">
                  <h3 className="text-xl font-bold text-white flex items-center">
                    <Trophy className="w-5 h-5 mr-2 text-clay" />
                    NTRP Skill Level
                  </h3>
                  <div className="text-4xl font-black text-clay">{formData.skillLevel}</div>
                </div>
                <div className="relative pt-6">
                  <input
                    type="range"
                    min="0" max={SKILL_LEVELS.length - 1} step="1"
                    value={selectedSkillIndex}
                    onChange={(e) => setFormData({ ...formData, skillLevel: SKILL_LEVELS[Number(e.target.value)] })}
                    className="w-full h-3 rounded-full"
                  />
                  <div className="mt-4 flex items-start justify-between gap-2 text-center">
                    {SKILL_LEVELS.map((level) => (
                      <div key={level} className="flex flex-col items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${formData.skillLevel === level ? 'bg-clay' : 'bg-white/20'}`} />
                        <span className={`text-[10px] font-black tracking-widest ${formData.skillLevel === level ? 'text-clay' : 'text-white'}`}>
                          {level.toFixed(1)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex items-center space-x-3 p-4 rounded-2xl bg-clay/10 border border-clay/20">
                  <Info className="w-5 h-5 text-clay shrink-0" />
                  <p className="text-sm font-medium text-white italic">"{SKILL_DESCRIPTIONS[formData.skillLevel]}"</p>
                </div>
              </div>

              {/* Court Selection */}
              <div className="space-y-4">
                <label className="block text-sm font-bold text-white uppercase tracking-wider">Preferred Courts</label>
                <p className="text-xs text-white/50">Tip: select <span className="text-clay font-semibold">Stanley Park South - Toronto</span> for the downtown area.</p>

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
                    <Button type="button" variant="clay" size="sm" onClick={addCustomCourt} disabled={!formData.customCourtEntry.trim()}>
                      Add
                    </Button>
                  </div>
                  {courtSuggestions.length > 0 && (
                    <div className="mt-3 max-h-64 overflow-y-auto rounded-2xl border border-white/10 bg-tennis-dark/95 p-2 shadow-2xl">
                      {courtSuggestions.map((court) => (
                        <button
                          key={court}
                          type="button"
                          onClick={() => selectCourt(court)}
                          className="w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-white transition-colors hover:bg-clay/20 hover:text-white"
                        >
                          {court}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {formData.pendingZoneChoice ? (
                  <div className="mt-3 p-4 rounded-2xl bg-clay/10 border border-clay/20 space-y-3">
                    <p className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
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
                              : 'bg-white/5 border-white/10 text-white hover:bg-white/10'
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
                    <span className="text-xs text-white/70">Zone auto-assigned:</span>
                    <span className="px-2.5 py-1 rounded-lg bg-clay/20 border border-clay/30 text-clay text-xs font-bold">
                      {formData.preferredZone}
                    </span>
                  </div>
                ) : null}
              </div>

              {/* Favourite Players */}
              <div className="space-y-4">
                <label className="block text-sm font-bold text-white uppercase tracking-wider flex items-center">
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
                      className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                        formData.favouritePlayers.includes(player)
                          ? 'bg-clay text-white shadow-lg shadow-clay/20'
                          : 'bg-white/5 text-white hover:bg-white/10 border border-white/5'
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

              {/* Availability */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-10 pt-6 border-t border-white/5">
                <div className="space-y-4">
                  <label className="block text-sm font-bold text-white uppercase tracking-wider flex items-center">
                    <Calendar className="w-4 h-4 mr-2 text-clay" />
                    Availability Day
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map((day) => (
                      <button
                        key={day}
                        onClick={() => {
                          const current = formData.availabilityDay;
                          setFormData({ ...formData, availabilityDay: current.includes(day) ? current.filter((d) => d !== day) : [...current, day] });
                        }}
                        className={`w-12 h-12 flex items-center justify-center rounded-xl text-xs font-black transition-all ${
                          formData.availabilityDay.includes(day) ? 'bg-clay text-white shadow-lg shadow-clay/20' : 'bg-white/5 text-white border border-white/5 hover:bg-white/10'
                        }`}
                      >
                        {day}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-4">
                  <label className="block text-sm font-bold text-white uppercase tracking-wider flex items-center">
                    <Clock className="w-4 h-4 mr-2 text-clay" />
                    Availability Time
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {['AM', 'PM'].map((time) => (
                      <button
                        key={time}
                        onClick={() => {
                          const current = formData.availabilityTime;
                          setFormData({ ...formData, availabilityTime: current.includes(time) ? current.filter((t) => t !== time) : [...current, time] });
                        }}
                        className={`w-16 h-12 flex items-center justify-center rounded-xl text-xs font-black transition-all ${
                          formData.availabilityTime.includes(time) ? 'bg-clay text-white shadow-lg shadow-clay/20' : 'bg-white/5 text-white border border-white/5 hover:bg-white/10'
                        }`}
                      >
                        {time}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Consent */}
              <p className="text-xs text-white/50 text-center px-2 pt-2">
                By joining you agree to our{' '}
                <Link to="/rules" className="text-clay hover:underline">league rules</Link>
                {' '}and{' '}
                <Link to="/terms" className="text-clay hover:underline">terms of service</Link>.
              </p>
            </div>
          )}

          {/* Navigation — signup phases only */}
          {phase === 'account' && (
            <div className="flex justify-end items-center gap-3 mt-4 pt-8 border-t border-white/5">
              <Button onClick={handleAccountContinue} className="group" isLoading={loading}>
                Continue
                <ChevronRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Button>
            </div>
          )}
          {phase === 'preferences' && (
            <div className="flex justify-end items-center gap-3 mt-4 pt-8 border-t border-white/5">
              <Button onClick={handleCompleteProfile} isLoading={loading}>
                Complete Sign Up
                <CheckCircle2 className="ml-2 w-5 h-5" />
              </Button>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
};
