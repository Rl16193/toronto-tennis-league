import React, { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, db, setAuthPersistence, storage } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { SKILL_DESCRIPTIONS, SKILL_LEVELS } from '../utils/skillLevels';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import {
  User, Mail, Lock, Phone, Trophy, MapPin,
  CheckCircle2, ChevronRight, ChevronLeft,
  Camera, AlertCircle, Info, Star, Calendar, Clock,
  Eye, EyeOff
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { UserData, UserStats, UserPreferences } from '../types';
import mailcheck from 'mailcheck';
import { defaultCourtOptions, extractDropdownCourts, getCourtSuggestions, mergeCourtOptions } from '../features/signup/utils/courtSearch';
import { emailExistsForSignup, getSignupErrorMessage, signupEmailRegex } from '../features/signup/signupValidation';

const FAVOURITE_PLAYERS = [
  "Jannik Sinner", "Carlos Alcaraz", "Rafael Nadal", 
  "Roger Federer", "Novak Djokovic"
];

export const Signup: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, loading: authLoading, refreshProfile } = useAuth();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [shouldRedirectToProfile, setShouldRedirectToProfile] = useState(false);
  const [emailSuggestion, setEmailSuggestion] = useState<any>(null);
  const [checkingEmail, setCheckingEmail] = useState(false);
  const [courtOptions, setCourtOptions] = useState<string[]>(defaultCourtOptions);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const returnTo = searchParams.get('returnTo') || '/profile';
  const intent = searchParams.get('intent') || '';

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    phone: '',
    contactMode: 'email' as 'email' | 'phone',
    skillLevel: 2,
    preferredCourts: [] as string[],
    customCourtEntry: '',
    favouritePlayers: [] as string[],
    customPlayerEntry: '',
    availabilityDay: [] as string[],
    availabilityTime: [] as string[],
    organizer: false,
    schedulingPreference: 'I will schedule matches on my own' as any,
    agreeToRules: false,
  });
  const selectedSkillIndex = Math.max(0, SKILL_LEVELS.indexOf(formData.skillLevel as typeof SKILL_LEVELS[number]));

  // Validation
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => { document.title = 'Sign Up — Racquets & Strings'; }, []);

  // Auto-dismiss banners after 30 seconds
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

  useEffect(() => {
    if (!authLoading && user && shouldRedirectToProfile) {
      navigate(returnTo);
    }
  }, [authLoading, navigate, returnTo, shouldRedirectToProfile, user]);

  useEffect(() => {
  window.scrollTo({
    top: 0,
    behavior: 'smooth',
  });
}, [step]);

  useEffect(() => {
    let isMounted = true;

    fetch('/Tennis Courts Facilities - 4326.csv')
      .then((response) => response.ok ? response.text() : '')
      .then((csvText) => {
        if (!isMounted || !csvText) return;
        setCourtOptions(mergeCourtOptions(extractDropdownCourts(csvText)));
      })
      .catch((error) => {
        console.error('Unable to load tennis court list:', error);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const validateStep1 = async () => {
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

  const validateStep2 = () => {
    return true; // Mostly selection based
  };

  const handleNext = async () => {
    if (step === 1) {
      setCheckingEmail(true);
      try {
        if (await validateStep1()) {
          setStep(2);
        }
      } finally {
        setCheckingEmail(false);
      }
    } else if (step === 2 && validateStep2()) {
      setStep(3);
    }
  };

  const handleBack = () => setStep(step - 1);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAvatarFile(file);
      const reader = new FileReader();
      reader.onloadend = () => setAvatarPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
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
    if (errors.email) {
      setErrors({ ...errors, email: '' });
    }
    setEmailSuggestion(null);
    mailcheck.run({
      email: newEmail,
      suggested: (suggestion) => setEmailSuggestion(suggestion),
      empty: () => setEmailSuggestion(null)
    });
  };

  const handleEmailBlur = () => {
    // Email-in-use check happens at account creation — Firebase Auth handles duplicates
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
      setErrors({
        ...errors,
        customPlayerEntry: 'Favourite player names can only contain letters and spaces.',
      });
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

  const handleSignup = async () => {
    setLoading(true);
    setError('');
    try {
      await setAuthPersistence(false);
      const userCredential = await createUserWithEmailAndPassword(auth, formData.email, formData.password);
      const user = userCredential.user;

      let avatarUrl = '';
      if (avatarFile) {
        const storageRef = ref(storage, `avatars/${user.uid}`);
        await uploadBytes(storageRef, avatarFile);
        avatarUrl = await getDownloadURL(storageRef);
      }

      await updateProfile(user, { displayName: formData.name, photoURL: avatarUrl });

      // Create users collection document
      const userData: UserData = {
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        preferred_mode_of_contact: formData.contactMode,
        avatar: avatarUrl,
        created_at: new Date().toISOString(),
      };

      // Create stats collection document
      const userStats: UserStats = {
        user_id: user.uid,
        name: formData.name,
        skill_level: formData.skillLevel,
        tournament_preference: 'Challengers',
        matches_played: 0,
        matches_won: 0,
        points_won_percentage: 0,
      };

      // Create preferences collection document
      const userPreferences: UserPreferences = {
        user_id: user.uid,
        name: formData.name,
        availability_day: formData.availabilityDay,
        availability_time: formData.availabilityTime,
        preferred_courts: formData.preferredCourts,
        favourite_players: formData.favouritePlayers,
        scheduling_preference: formData.schedulingPreference,
        event_creator: formData.organizer,
      };

      // Write to all three collections
      
      try {
        await setDoc(doc(db, 'users', user.uid), userData);
      } catch (err) {
        console.error("Failed to create users document:", err);
        throw new Error("Failed to create user profile. Please try again.");
      }

      try {
        await setDoc(doc(db, 'stats', user.uid), userStats);
      } catch (err) {
        console.error("Failed to create stats document:", err);
        throw new Error("Failed to create user stats. Please try again.");
      }

      try {
        await setDoc(doc(db, 'preferences', user.uid), userPreferences);
      } catch (err) {
        console.error("Failed to create preferences document:", err);
        throw new Error("Failed to create user preferences. Please try again.");
      }
      await refreshProfile(user);
      setShouldRedirectToProfile(true);
      setStatusMessage('Your account is ready. Taking you to your profile...');
      sessionStorage.setItem(`profile-bootstrap-pending:${user.uid}`, '1');
      sessionStorage.removeItem(`profile-bootstrap-retry:${user.uid}`);
    } catch (err: any) {
      setError(getSignupErrorMessage(err));
      setShouldRedirectToProfile(false);
    } finally {
      setLoading(false);
    }
  };

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

  return (
    <div className="min-h-screen py-20 px-4 relative overflow-hidden">
      {/* Background Glows */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-clay/5 blur-[120px] -z-10 rounded-full" />
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-tennis-surface/20 blur-[100px] -z-10 rounded-full" />

      <div className="max-w-4xl mx-auto">
        {/* Progress Bar */}
        <div className="mb-12">
          {intent === 'join-event' && (
            <div className="mb-6 rounded-2xl border border-clay/20 bg-clay/10 px-5 py-4 text-sm text-white">
              Create your league profile to join events and receive updates.
            </div>
          )}
          <div className="flex justify-between items-center mb-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex flex-col items-center space-y-2">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-lg transition-all duration-300 ${
                  step >= i ? 'clay-gradient text-white shadow-lg shadow-clay/20' : 'bg-tennis-surface/50 text-white border border-white/5'
                }`}>
                  {step > i ? <CheckCircle2 className="w-6 h-6" /> : i}
                </div>
                <span className={`text-xs font-bold uppercase tracking-widest ${step >= i ? 'text-clay' : 'text-white'}`}>
                  {i === 1 ? 'Personal' : i === 2 ? 'Skills' : 'Review'}
                </span>
              </div>
            ))}
          </div>
          <div className="h-1.5 w-full bg-tennis-surface/50 rounded-full overflow-hidden">
            <motion.div 
              className="h-full clay-gradient"
              initial={{ width: '33.33%' }}
              animate={{ width: `${(step / 3) * 100}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
        </div>

        <motion.div
          key={step}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          className="bg-tennis-surface/40 backdrop-blur-xl border border-white/5 p-8 md:p-12 rounded-[3rem] shadow-2xl"
        >
          {error && step !== 3 && (
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

          {/* STEP 1: CONTACT & PERSONAL INFO */}
          {step === 1 && (
            <div className="space-y-8">
              <div className="flex flex-col md:flex-row gap-10 items-start">
                {/* Avatar Upload */}
                <div className="flex flex-col items-center space-y-4">
                  <div className="relative group">
                    <div className="w-32 h-32 rounded-[2.5rem] bg-tennis-surface border-2 border-dashed border-white/10 flex items-center justify-center overflow-hidden transition-all group-hover:border-clay/50">
                      {avatarPreview ? (
                        <img src={avatarPreview} alt="Preview" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <User className="w-12 h-12 text-white" />
                      )}
                    </div>
                    <label className="absolute -bottom-2 -right-2 w-10 h-10 clay-gradient rounded-xl flex items-center justify-center cursor-pointer shadow-lg hover:scale-110 transition-transform">
                      <Camera className="w-5 h-5 text-white" />
                      <input type="file" className="hidden" accept="image/*" onChange={handleAvatarChange} />
                    </label>
                  </div>
                  <p className="text-xs text-white font-medium">Profile Image (Optional)</p>
                </div>

                <div className="flex-grow grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Row 1: Name | Email */}
                  <Input
                    label="Full Name"
                    placeholder="Roger Federer"
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    error={errors.name}
                    required
                  />
                  <div>
                    <Input
                      label="Email Address"
                      type="email"
                      placeholder="roger@hotmail.com"
                      value={formData.email}
                      onChange={handleEmailChange}
                      onBlur={handleEmailBlur}
                      error={errors.email}
                      required
                    />
                    {emailSuggestion && (
                      <div className="text-sm text-blue-400 mt-1">
                        Did you mean <button
                          className="underline hover:text-blue-300"
                          onClick={() => {
                            setFormData({ ...formData, email: emailSuggestion.full });
                            setEmailSuggestion(null);
                          }}
                        >
                          {emailSuggestion.full}
                        </button>?
                      </div>
                    )}
                  </div>

                  {/* Row 2: Password | Confirm Password — always side-by-side */}
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
                          onChange={(e) => setFormData({...formData, password: e.target.value})}
                          className={`w-full rounded-2xl bg-tennis-surface/50 border px-4 py-3 pr-10 text-white placeholder-gray-500 transition-all duration-200 focus:ring-2 outline-none ${errors.password ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20' : 'border-white/10 focus:border-clay focus:ring-clay/20'}`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((v) => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-white hover:text-white transition-colors"
                          tabIndex={-1}
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      {errors.password && (
                        <p className="text-xs text-red-500 mt-1 ml-1">{errors.password}</p>
                      )}
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
                          onChange={(e) => setFormData({...formData, confirmPassword: e.target.value})}
                          className={`w-full rounded-2xl bg-tennis-surface/50 border px-4 py-3 pr-10 text-white placeholder-gray-500 transition-all duration-200 focus:ring-2 outline-none ${
                            (errors.confirmPassword || (formData.confirmPassword && formData.confirmPassword !== formData.password))
                              ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20'
                              : 'border-white/10 focus:border-clay focus:ring-clay/20'
                          }`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword((v) => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-white hover:text-white transition-colors"
                          tabIndex={-1}
                        >
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

                  {/* Row 3: Phone | Preferred Contact */}
                  <Input
                    label="Phone Number"
                    placeholder="(416)-555-0123"
                    value={formData.phone}
                    onChange={(e) => setFormData({...formData, phone: formatPhone(e.target.value)})}
                    error={errors.phone}
                  />

                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-white">Preferred Contact Mode</label>
                    <div className="flex space-x-4">
                      {['email', 'phone'].map((mode) => (
                        <label key={mode} className={`flex-1 flex items-center justify-center p-3 rounded-2xl border cursor-pointer transition-all ${
                          formData.contactMode === mode ? 'bg-clay/10 border-clay text-clay' : 'bg-white/5 border-white/5 text-white hover:bg-white/10'
                        }`}>
                          <input
                            type="radio"
                            className="hidden"
                            name="contactMode"
                            value={mode}
                            checked={formData.contactMode === mode}
                            onChange={() => setFormData({...formData, contactMode: mode as any})}
                          />
                          <span className="capitalize font-bold">{mode}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: SKILLS & PREFERENCES */}
          {step === 2 && (
            <div className="space-y-10">
              {/* Skill Level Slider */}
              <div className="space-y-6 bg-white/5 p-8 rounded-[2rem] border border-white/5">
                <div className="flex justify-between items-end">
                  <div className="space-y-1">
                    <h3 className="text-xl font-bold text-white flex items-center">
                      <Trophy className="w-5 h-5 mr-2 text-clay" />
                      NTRP Skill Level
                    </h3>
                  </div>
                  <div className="text-4xl font-black text-clay">{formData.skillLevel}</div>
                </div>
                <div className="relative pt-6">
                  <input 
                    type="range" 
                    min="0" max={SKILL_LEVELS.length - 1} step="1" 
                    value={selectedSkillIndex}
                    onChange={(e) => setFormData({...formData, skillLevel: SKILL_LEVELS[Number(e.target.value)]})}
                    className="w-full h-3 bg-tennis-dark rounded-full appearance-none cursor-pointer accent-clay"
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

              <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                {/* Court Selection — full width since Tournament Type removed */}
                <div className="space-y-4 md:col-span-2">
                  <label className="block text-sm font-bold text-white uppercase tracking-wider">Preferred Courts</label>

                  {/* Selected courts chips */}
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

                  {/* Search + add */}
                  <div className="relative space-y-3">
                    <Input
                      placeholder="Search courts by name..."
                      value={formData.customCourtEntry}
                      error={errors.customCourtEntry}
                      onChange={(e) => {
                        setFormData({ ...formData, customCourtEntry: e.target.value });
                        if (errors.customCourtEntry) setErrors({ ...errors, customCourtEntry: '' });
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); addCustomCourt(); }
                      }}
                    />
                    {courtSuggestions.length > 0 && (
                      <div className="max-h-64 overflow-y-auto rounded-2xl border border-white/10 bg-tennis-dark/95 p-2 shadow-2xl">
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
                    <Button type="button" variant="clay" size="sm" onClick={addCustomCourt} disabled={!formData.customCourtEntry.trim()}>
                      Add
                    </Button>
                  </div>
                </div>

              </div>

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
                      if (errors.customPlayerEntry) {
                        setErrors({ ...errors, customPlayerEntry: '' });
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addCustomPlayer();
                      }
                    }}
                  />
                  <Button type="button" variant="secondary" size="sm" onClick={addCustomPlayer} disabled={!formData.customPlayerEntry.trim()}>
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
                    {['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map(day => (
                      <button
                        key={day}
                        onClick={() => {
                          const current = formData.availabilityDay;
                          setFormData({
                            ...formData, 
                            availabilityDay: current.includes(day) ? current.filter(d => d !== day) : [...current, day]
                          });
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
                    {['AM', 'PM'].map(time => (
                      <button
                        key={time}
                        onClick={() => {
                          const current = formData.availabilityTime;
                          setFormData({
                            ...formData, 
                            availabilityTime: current.includes(time) ? current.filter(t => t !== time) : [...current, time]
                          });
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
            </div>
          )}

          {/* STEP 3: REVIEW & SUBMIT */}
          {step === 3 && (
            <div className="space-y-10">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-6">
                  <div className="bg-white/5 p-6 rounded-3xl border border-white/5">
                    <h4 className="text-clay font-bold text-xs uppercase tracking-widest mb-4">Personal Info</h4>
                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-white text-sm">Name</span>
                        <span className="text-white font-medium">{formData.name}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-white text-sm">Email</span>
                        <span className="text-white font-medium">{formData.email}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-white text-sm">Phone</span>
                        <span className="text-white font-medium">{formData.phone}</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white/5 p-6 rounded-3xl border border-white/5">
                    <h4 className="text-clay font-bold text-xs uppercase tracking-widest mb-4">Skill & Tournament</h4>
                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-white text-sm">Skill Level</span>
                        <span className="text-white font-medium">{formData.skillLevel}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="bg-white/5 p-6 rounded-3xl border border-white/5">
                    <h4 className="text-clay font-bold text-xs uppercase tracking-widest mb-4">Preferences</h4>
                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-white text-sm">Availability</span>
                        <span className="text-white font-medium">{formData.availabilityDay.join(', ') || 'None'}</span>
                      </div>
                      <div className="space-y-1">
                        <span className="text-white text-sm">Courts</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {formData.preferredCourts.map(c => (
                            <span key={c} className="px-2 py-1 bg-clay/10 text-clay text-[10px] font-bold rounded-md">{c}</span>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <span className="text-white text-sm">Favourite Players</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {formData.favouritePlayers.map(player => (
                            <span key={player} className="px-2 py-1 bg-clay/10 text-clay text-[10px] font-bold rounded-md">{player}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-3 p-6 rounded-3xl bg-clay/5 border border-clay/20">
                    <input 
                      type="checkbox" 
                      id="agree" 
                      className="w-5 h-5 rounded-md border-clay text-clay focus:ring-clay"
                      checked={formData.agreeToRules}
                      onChange={(e) => setFormData({...formData, agreeToRules: e.target.checked})}
                    />
                    <label htmlFor="agree" className="text-sm text-white font-medium cursor-pointer">
                      I agree to the league rules and code of conduct
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Navigation Buttons */}
          {error && step === 3 && (
            <div className="mt-8 p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-500 flex items-center space-x-3">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          <div className="flex justify-between items-center mt-4 pt-8 border-t border-white/5">
            {step > 1 ? (
              <Button variant="ghost" onClick={handleBack} disabled={loading}>
                <ChevronLeft className="mr-2 w-5 h-5" />
                Back
              </Button>
            ) : (
              <div />
            )}
            
            {step < 3 ? (
              <Button onClick={handleNext} className="group" isLoading={checkingEmail}>
                Continue
                <ChevronRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Button>
            ) : (
              <Button onClick={handleSignup} isLoading={loading} disabled={!formData.agreeToRules}>
                Complete Signup
                <CheckCircle2 className="ml-2 w-5 h-5" />
              </Button>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
};
