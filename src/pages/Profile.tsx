import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { collection, query, where, getDocs, deleteDoc, doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { EmailAuthProvider, reauthenticateWithCredential, reload, verifyBeforeUpdateEmail } from 'firebase/auth';
import { db, auth } from '../lib/firebase';
import { SKILL_DESCRIPTIONS, SKILL_LEVELS } from '../lib/skillLevels';
import { useAuth } from '../context/AuthContext';
import { TennisEvent, EventParticipant, UserProfile } from '../types';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { 
  User, Mail, Phone, Trophy, MapPin, 
  Settings, LogOut, Calendar, Trash2, 
  Plus, ChevronRight, Star, Clock, 
  CheckCircle2, AlertCircle, Edit2, Save, X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

type ProfileEditData = Partial<UserProfile> & {
  customCourtInput?: string;
  customFavouritePlayerInput?: string;
};

const PRELOADED_COURTS = [
  "Sorauren Park", "High Park", "Riverdale", "Trinity Bellwoods", 
  "Ramsden Park", "Stanley Park", "Moss Park", "Dovercourt"
];

const FAVOURITE_PLAYERS = [
  "Jannik Sinner",
  "Carlos Alcaraz",
  "Rafael Nadal",
  "Roger Federer",
  "Novak Djokovic"
];

const parseEventDate = (value?: string | { toDate?: () => Date; seconds?: number; nanoseconds?: number }) => {
  if (!value) return null;
  if (typeof value === 'object') {
    if (typeof value.toDate === 'function') {
      const parsed = value.toDate();
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    if (typeof value.seconds === 'number') {
      const parsed = new Date(value.seconds * 1000);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const isTournamentEvent = (event: TennisEvent) => event.type.toLowerCase().includes('tournament');

export const Profile: React.FC = () => {
  const { user, profile, loading: authLoading, profileError, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [joinedEvents, setJoinedEvents] = useState<(TennisEvent & { participantId: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoRetrying, setAutoRetrying] = useState(false);
  
  // Edit States
  const [isEditingInfo, setIsEditingInfo] = useState(false);
  const [isEditingSkills, setIsEditingSkills] = useState(false);
  const [isEditingAvailability, setIsEditingAvailability] = useState(false);
  
  const [editData, setEditData] = useState<ProfileEditData>({});
  const [updateLoading, setUpdateLoading] = useState(false);
  const [message, setMessage] = useState({ text: '', type: 'success' as 'success' | 'error' });
  const [pendingRemovalEvent, setPendingRemovalEvent] = useState<(TennisEvent & { participantId: string }) | null>(null);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [emailChangeData, setEmailChangeData] = useState({ newEmail: '', password: '' });
  const [emailChangeLoading, setEmailChangeLoading] = useState(false);
  const [emailVerificationPending, setEmailVerificationPending] = useState(false);
  const selectedSkillIndex = Math.max(
    0,
    SKILL_LEVELS.indexOf((editData.skillLevel ?? profile?.stats.skill_level ?? 2) as typeof SKILL_LEVELS[number])
  );

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/login');
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) {
      const q = query(collection(db, 'event_participants'), where('user_id', '==', user.uid));
      
      const unsubscribe = onSnapshot(q, async (snapshot) => {
        const participantData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as EventParticipant));
        
        if (participantData.length === 0) {
          setJoinedEvents([]);
          setLoading(false);
          return;
        }

        try {
          const eventsQuery = collection(db, 'events');
          const eventsSnapshot = await getDocs(eventsQuery);
          const allEvents = eventsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as TennisEvent));
          
          const mockEvents = [
            { id: '1', title: 'High Park Masters', type: 'Masters', location: 'High Park Courts', date: '2026-04-15T14:00:00Z', image: 'https://images.unsplash.com/photo-1595435066242-48a0288c5917?auto=format&fit=crop&q=80&w=800' },
            { id: '2', title: 'Sorauren Social Mixer', type: 'Beginners', location: 'Sorauren Park', date: '2026-04-18T10:00:00Z', image: 'https://images.unsplash.com/photo-1622279457486-62dcc4a4bd13?auto=format&fit=crop&q=80&w=800' },
            { id: '3', title: 'Riverdale Challengers Cup', type: 'Challengers', location: 'Riverdale Park East', date: '2026-04-22T18:30:00Z', image: 'https://images.unsplash.com/photo-1554068865-24cecd4e34b8?auto=format&fit=crop&q=80&w=800' },
            { id: '4', title: 'Trinity Bellwoods Open', type: 'Masters', location: 'Trinity Bellwoods', date: '2026-04-25T09:00:00Z', image: 'https://images.unsplash.com/photo-1599586120429-48281b6f0ece?auto=format&fit=crop&q=80&w=800' }
          ];

          const sourceEvents = allEvents.length > 0 ? allEvents : mockEvents;

          const joined = participantData.map(p => {
            const event = sourceEvents.find(e => e.id === p.event_id);
            return event ? { ...event, participantId: p.id } : null;
          }).filter(Boolean) as (TennisEvent & { participantId: string })[];

          setJoinedEvents(joined);
        } catch (error) {
          console.error("Error fetching joined events:", error);
        } finally {
          setLoading(false);
        }
      });

      return () => unsubscribe();
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;

    const pendingKey = `profile-bootstrap-pending:${user.uid}`;
    const retryKey = `profile-bootstrap-retry:${user.uid}`;

    if (profile) {
      sessionStorage.removeItem(pendingKey);
      sessionStorage.removeItem(retryKey);
      setAutoRetrying(false);
      return;
    }

    if (!authLoading && !profile && sessionStorage.getItem(pendingKey) === '1' && !sessionStorage.getItem(retryKey)) {
      setAutoRetrying(true);
      sessionStorage.setItem(retryKey, '1');
      const timer = window.setTimeout(() => {
        window.location.reload();
      }, 3000);

      return () => window.clearTimeout(timer);
    }
  }, [authLoading, profile, user]);

  const handleUpdateProfile = async (section: 'info' | 'skills' | 'availability') => {
    if (!user) return;
    setUpdateLoading(true);
    try {
      if (section === 'info') {
        const normalizedPhone = (editData.phone || '').replace(/\D/g, '');
        if (normalizedPhone.length !== 10) {
          throw new Error('Phone number must be exactly 10 digits.');
        }

        const userRef = doc(db, 'users', user.uid);
        await updateDoc(userRef, {
          name: editData.name,
          phone: `(${normalizedPhone.slice(0, 3)})-${normalizedPhone.slice(3, 6)}-${normalizedPhone.slice(6, 10)}`,
        });
      } else if (section === 'skills') {
        const statsRef = doc(db, 'stats', user.uid);
        await updateDoc(statsRef, {
          skill_level: editData.skillLevel,
          tournament_preference: editData.tournamentType,
        });
      } else if (section === 'availability') {
        const prefsRef = doc(db, 'preferences', user.uid);
        await updateDoc(prefsRef, {
          availability_day: editData.availabilityDay,
          availability_time: editData.availabilityTime,
          preferred_courts: editData.preferredCourts,
          custom_courts: [],
          favourite_players: editData.favouritePlayers,
        });
      }

      await refreshProfile();
      
      if (section === 'info') setIsEditingInfo(false);
      if (section === 'skills') setIsEditingSkills(false);
      if (section === 'availability') setIsEditingAvailability(false);
      
      setMessage({ text: 'Profile updated successfully!', type: 'success' });
    } catch (error: any) {
      setMessage({ text: error.message || 'Failed to update profile', type: 'error' });
    } finally {
      setUpdateLoading(false);
      setTimeout(() => setMessage({ text: '', type: 'success' }), 3000);
    }
  };

  const handleStartEmailChange = async () => {
    if (!user) return;

    if (!emailChangeData.newEmail.trim()) {
      setMessage({ text: 'Please enter your new email address.', type: 'error' });
      return;
    }

    if (!emailChangeData.password) {
      setMessage({ text: 'Please enter your password to continue.', type: 'error' });
      return;
    }

    setEmailChangeLoading(true);
    try {
      const credential = EmailAuthProvider.credential(user.email || '', emailChangeData.password);
      await reauthenticateWithCredential(user, credential);
      await verifyBeforeUpdateEmail(user, emailChangeData.newEmail.trim());
      setEmailVerificationPending(true);
      setMessage({ text: 'Verification email sent to your new address. Please confirm it, then click refresh below.', type: 'success' });
    } catch (error: any) {
      setMessage({ text: error.message || 'Failed to start email change.', type: 'error' });
    } finally {
      setEmailChangeLoading(false);
    }
    setTimeout(() => setMessage({ text: '', type: 'success' }), 5000);
  };

  const handleRefreshEmailChange = async () => {
    if (!user) return;

    setEmailChangeLoading(true);
    try {
      await reload(user);
      await refreshProfile();
      setShowEmailForm(false);
      setEmailVerificationPending(false);
      setEmailChangeData({ newEmail: '', password: '' });
      setMessage({ text: 'Email updated successfully.', type: 'success' });
    } catch (error: any) {
      setMessage({ text: error.message || 'Email is not verified yet. Please complete verification and try again.', type: 'error' });
    } finally {
      setEmailChangeLoading(false);
    }
    setTimeout(() => setMessage({ text: '', type: 'success' }), 5000);
  };

  const handleRemoveEvent = async (event: TennisEvent & { participantId: string }) => {
    const eventStartDate = parseEventDate(event.startDate || event.start_date || event.date);

    if (isTournamentEvent(event) && eventStartDate) {
      const oneWeekBeforeStart = new Date(eventStartDate);
      oneWeekBeforeStart.setDate(oneWeekBeforeStart.getDate() - 7);

      if (new Date() >= oneWeekBeforeStart) {
        setMessage({
          text: 'Tournament withdrawal is unavailable within 7 days of the start date.',
          type: 'error',
        });
        setTimeout(() => setMessage({ text: '', type: 'success' }), 4000);
        return;
      }
    }

    setPendingRemovalEvent(event);
  };

  const handleConfirmRemoveEvent = async () => {
    if (!pendingRemovalEvent) return;

    try {
      await deleteDoc(doc(db, 'event_participants', pendingRemovalEvent.participantId));
      setPendingRemovalEvent(null);
      setMessage({ text: 'You have been removed from the event.', type: 'success' });
    } catch (error) {
      console.error("Error removing event:", error);
      setMessage({ text: 'Could not remove you from the event right now.', type: 'error' });
    }
    setTimeout(() => setMessage({ text: '', type: 'success' }), 4000);
  };

  const formatPhoneInput = (value: string) => {
    const numbers = value.replace(/\D/g, '');
    if (numbers.length <= 3) return numbers;
    if (numbers.length <= 6) return `(${numbers.slice(0, 3)})-${numbers.slice(3)}`;
    return `(${numbers.slice(0, 3)})-${numbers.slice(3, 6)}-${numbers.slice(6, 10)}`;
  };

  const incompleteFields = profile ? [
    !profile.user.name.trim() ? 'name' : null,
    !profile.user.phone.trim() ? 'phone number' : null,
    profile.preferences.availability_day.length === 0 ? 'availability day' : null,
    profile.preferences.availability_time.length === 0 ? 'availability time' : null,
    profile.preferences.preferred_courts.length === 0 && profile.preferences.custom_courts.length === 0 ? 'preferred courts' : null,
    profile.preferences.favourite_players.length === 0 ? 'favourite players' : null,
  ].filter(Boolean) as string[] : [];

  if (authLoading || autoRetrying) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-clay border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-white font-semibold">Profile loading, please wait...</p>
          {autoRetrying && <p className="text-gray-400 text-sm mt-2">Refreshing the page in a few seconds.</p>}
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="bg-red-500/10 border border-red-500/20 rounded-[2rem] p-8">
          <h1 className="text-3xl font-display font-black text-white mb-4">Profile unavailable</h1>
          <p className="text-gray-300 mb-3">
            Your account is signed in, but the app could not load the three Firestore profile documents it expects.
          </p>
          <p className="text-red-400 text-sm mb-6">
            {profileError || 'Check Firestore rules, the selected database, and whether the users/stats/preferences documents were created.'}
          </p>
          <div className="flex gap-3">
            <Button onClick={() => window.location.reload()}>Retry</Button>
            <Button variant="danger" onClick={() => auth.signOut()}>Logout</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-32 pt-10">
      {/* Toast Message */}
      <AnimatePresence>
        {message.text && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={`fixed top-24 right-8 z-50 p-4 rounded-2xl shadow-2xl flex items-center space-x-3 border ${
              message.type === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-500' : 'bg-red-500/10 border-red-500/20 text-red-500'
            }`}
          >
            {message.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
            <span className="font-bold text-sm">{message.text}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {incompleteFields.length > 0 && (
        <div className="mb-8 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-300">
          <p className="font-bold mb-1">Profile incomplete</p>
          <p className="text-sm">
            Please add details for: {incompleteFields.join(', ')}.
          </p>
        </div>
      )}

      {/* Header */}
      <div className="flex justify-between items-center mb-10">
        <h1 className="text-4xl font-display font-black text-white tracking-tight">My Profile</h1>
        <Button variant="danger" size="sm" onClick={() => auth.signOut()}>
          <LogOut className="w-4 h-4 mr-2" />
          Logout
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* 1. INFO BOX (Full Width) */}
        <div className="lg:col-span-2">
          <div className={`relative overflow-hidden rounded-[2.5rem] border transition-all duration-500 ${
            isEditingInfo ? 'bg-gray-800/50 border-white/10' : 'bg-tennis-surface/30 border-white/5 shadow-xl'
          }`}>
            <div className="p-8 md:p-10">
              <div className="flex justify-between items-start mb-8">
                <h2 className="text-2xl font-bold text-white flex items-center">
                  <User className="w-6 h-6 mr-3 text-clay" />
                  Info
                </h2>
                {!isEditingInfo ? (
                  <Button variant="ghost" size="sm" onClick={() => {
                    setEditData({ name: profile.user.name, phone: profile.user.phone });
                    setIsEditingInfo(true);
                  }}>
                    <Edit2 className="w-4 h-4 mr-2" />
                    Edit
                  </Button>
                ) : (
                  <div className="flex space-x-2">
                    <Button variant="ghost" size="sm" onClick={() => setIsEditingInfo(false)}>
                      <X className="w-4 h-4 mr-2" />
                      Cancel
                    </Button>
                    <Button size="sm" onClick={() => handleUpdateProfile('info')} isLoading={updateLoading}>
                      <Save className="w-4 h-4 mr-2" />
                      Save
                    </Button>
                  </div>
                )}
              </div>

              <div className="flex flex-col md:flex-row items-center md:items-start gap-10">
                <div className="relative group">
                  <div className="w-32 h-32 md:w-40 md:h-40 rounded-[2.5rem] border-4 border-tennis-dark bg-tennis-surface overflow-hidden shadow-2xl">
                    <img 
                      src={profile.user.avatar || `https://ui-avatars.com/api/?name=${profile.user.name}&background=FF6B35&color=fff`} 
                      alt={profile.user.name} 
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                </div>

                <div className="flex-grow grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
                  {isEditingInfo ? (
                    <>
                      <Input 
                        label="Full Name" 
                        value={editData.name} 
                        onChange={(e) => setEditData({...editData, name: e.target.value})}
                      />
                      <Input 
                        label="Phone Number" 
                        value={editData.phone} 
                        onChange={(e) => setEditData({...editData, phone: formatPhoneInput(e.target.value)})}
                      />
                      <div className="space-y-2">
                        <label className="block text-sm font-medium text-gray-400">Email Address</label>
                        <div className="flex items-center space-x-3 p-3 bg-white/5 border border-white/5 rounded-2xl text-gray-500">
                          <Mail className="w-4 h-4" />
                          <span>{profile.user.email}</span>
                        </div>
                        {!showEmailForm ? (
                          <Button variant="clay" size="sm" className="w-full mt-2" onClick={() => setShowEmailForm(true)}>
                            Change email
                          </Button>
                        ) : (
                          <div className="space-y-3 mt-3">
                            <Input
                              label="New Email"
                              type="email"
                              value={emailChangeData.newEmail}
                              onChange={(e) => setEmailChangeData({ ...emailChangeData, newEmail: e.target.value })}
                            />
                            <Input
                              label="Password"
                              type="password"
                              value={emailChangeData.password}
                              onChange={(e) => setEmailChangeData({ ...emailChangeData, password: e.target.value })}
                            />
                            <div className="flex flex-col gap-2">
                              <Button variant="clay" size="sm" className="w-full" onClick={handleStartEmailChange} isLoading={emailChangeLoading}>
                                Reauthenticate and Send Verification
                              </Button>
                              {emailVerificationPending && (
                                <Button variant="outline" size="sm" className="w-full" onClick={handleRefreshEmailChange} isLoading={emailChangeLoading}>
                                  I&apos;ve Verified My New Email
                                </Button>
                              )}
                              <Button variant="ghost" size="sm" className="w-full" onClick={() => {
                                setShowEmailForm(false);
                                setEmailVerificationPending(false);
                                setEmailChangeData({ newEmail: '', password: '' });
                              }}>
                                Cancel email change
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="space-y-1">
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Name</p>
                        <p className="text-xl font-bold text-clay">{profile.user.name}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Email</p>
                        <p className="text-xl font-bold text-clay">{profile.user.email}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Phone</p>
                        <p className="text-xl font-bold text-clay">{profile.user.phone}</p>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 2. SKILLS BOX (Middle Left) */}
        <div className={`rounded-[2.5rem] border transition-all duration-500 ${
          isEditingSkills ? 'bg-gray-800/50 border-white/10' : 'bg-tennis-surface/30 border-white/5 shadow-xl'
        }`}>
          <div className="p-8">
            <div className="flex justify-between items-start mb-8">
              <h2 className="text-2xl font-bold text-white flex items-center">
                <Trophy className="w-6 h-6 mr-3 text-clay" />
                Skills
              </h2>
              {!isEditingSkills ? (
                <Button variant="ghost" size="sm" onClick={() => {
                  setEditData({ skillLevel: profile.stats.skill_level, tournamentType: profile.stats.tournament_preference });
                  setIsEditingSkills(true);
                }}>
                  <Edit2 className="w-4 h-4 mr-2" />
                  Edit
                </Button>
              ) : (
                <div className="flex space-x-2">
                  <Button variant="ghost" size="sm" onClick={() => setIsEditingSkills(false)}>
                    <X className="w-4 h-4" />
                  </Button>
                  <Button size="sm" onClick={() => handleUpdateProfile('skills')} isLoading={updateLoading}>
                    <Save className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </div>

            {isEditingSkills ? (
              <div className="space-y-6">
                <div className="space-y-4">
                  <label className="block text-sm font-bold text-gray-400 uppercase tracking-wider">NTRP Level: {editData.skillLevel}</label>
                  <input 
                    type="range"
                    min="0"
                    max={SKILL_LEVELS.length - 1}
                    step="1"
                    value={selectedSkillIndex}
                    onChange={(e) => setEditData({...editData, skillLevel: SKILL_LEVELS[Number(e.target.value)]})}
                    className="w-full h-2 bg-tennis-dark rounded-full appearance-none cursor-pointer accent-clay"
                  />
                  <div className="flex items-start justify-between gap-2 text-center">
                    {SKILL_LEVELS.map((level) => (
                      <span
                        key={level}
                        className={`text-[10px] font-black tracking-widest ${editData.skillLevel === level ? 'text-clay' : 'text-gray-500'}`}
                      >
                        {level.toFixed(1)}
                      </span>
                    ))}
                  </div>
                  <p className="text-sm text-gray-400 italic">"{SKILL_DESCRIPTIONS[editData.skillLevel as number]}"</p>
                </div>
                <div className="space-y-4">
                  <label className="block text-sm font-bold text-gray-400 uppercase tracking-wider">Tournament Choice</label>
                  <div className="grid grid-cols-1 gap-2">
                    {['Beginners', 'Challengers', 'Masters'].map(type => (
                      <button
                        key={type}
                        onClick={() => setEditData({...editData, tournamentType: type as any})}
                        className={`p-3 rounded-xl text-sm font-bold border transition-all ${
                          editData.tournamentType === type ? 'bg-clay/10 border-clay text-clay' : 'bg-white/5 border-white/5 text-gray-400'
                        }`}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="p-6 rounded-3xl bg-clay/10 border border-clay/20">
                  <p className="text-clay font-black text-3xl mb-1">NTRP {profile.stats.skill_level}</p>
                  <p className="text-gray-400 text-sm italic">"{SKILL_DESCRIPTIONS[profile.stats.skill_level]}"</p>
                </div>
                <div className="p-6 rounded-3xl bg-white/5 border border-white/5">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Tournament Choice</p>
                  <p className="text-xl font-bold text-clay">{profile.stats.tournament_preference}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 3. MATCH STATS BOX (Middle Right) */}
        <div className="bg-tennis-surface/30 border border-white/5 rounded-[2.5rem] shadow-xl p-8">
          <h2 className="text-2xl font-bold text-white flex items-center mb-8">
            <Star className="w-6 h-6 mr-3 text-clay" />
            Match Stats
          </h2>
          <div className="grid grid-cols-1 gap-4">
            <div className="bg-white/5 p-6 rounded-3xl border border-white/5 flex justify-between items-center">
              <span className="text-gray-400 font-medium">Matches Played</span>
              <span className="text-2xl font-black text-white">{profile.stats.matches_played}</span>
            </div>
            <div className="bg-white/5 p-6 rounded-3xl border border-white/5 flex justify-between items-center">
              <span className="text-gray-400 font-medium">Matches Won</span>
              <span className="text-2xl font-black text-green-500">{profile.stats.matches_won}</span>
            </div>
            <div className="bg-clay/10 p-6 rounded-3xl border border-clay/20 flex justify-between items-center">
              <span className="text-clay font-bold">Points Won %</span>
              <span className="text-2xl font-black text-clay">{profile.stats.points_won_percentage}%</span>
            </div>
          </div>
        </div>

        {/* 4. AVAILABILITY BOX (Lower Left) */}
        <div className={`rounded-[2.5rem] border transition-all duration-500 ${
          isEditingAvailability ? 'bg-gray-800/50 border-white/10' : 'bg-tennis-surface/30 border-white/5 shadow-xl'
        }`}>
          <div className="p-8">
            <div className="flex justify-between items-start mb-8">
              <h2 className="text-2xl font-bold text-white flex items-center">
                <Calendar className="w-6 h-6 mr-3 text-clay" />
                Availability and Choices
              </h2>
              {!isEditingAvailability ? (
                <Button variant="ghost" size="sm" onClick={() => {
                  setEditData({ 
                    availabilityDay: profile.preferences.availability_day, 
                    availabilityTime: profile.preferences.availability_time,
                    preferredCourts: profile.preferences.preferred_courts,
                    favouritePlayers: profile.preferences.favourite_players,
                    customCourtInput: '',
                    customFavouritePlayerInput: '',
                  });
                  setIsEditingAvailability(true);
                }}>
                  <Edit2 className="w-4 h-4 mr-2" />
                  Edit
                </Button>
              ) : (
                <div className="flex space-x-2">
                  <Button variant="ghost" size="sm" onClick={() => setIsEditingAvailability(false)}>
                    <X className="w-4 h-4" />
                  </Button>
                  <Button size="sm" onClick={() => handleUpdateProfile('availability')} isLoading={updateLoading}>
                    <Save className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </div>

            {isEditingAvailability ? (
              <div className="space-y-6">
                <div className="space-y-3">
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest">Days</label>
                  <div className="flex flex-wrap gap-2">
                    {['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map(day => (
                      <button
                        key={day}
                        onClick={() => {
                          const current = editData.availabilityDay || [];
                          setEditData({...editData, availabilityDay: current.includes(day) ? current.filter(d => d !== day) : [...current, day]});
                        }}
                        className={`w-10 h-10 flex items-center justify-center rounded-lg text-[10px] font-black border transition-all ${
                          (editData.availabilityDay || []).includes(day) ? 'bg-clay border-clay text-white' : 'bg-white/5 border-white/5 text-gray-400'
                        }`}
                      >
                        {day}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-3">
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest">Time</label>
                  <div className="flex gap-2">
                    {['AM', 'PM'].map(time => (
                      <button
                        key={time}
                        onClick={() => {
                          const current = editData.availabilityTime || [];
                          setEditData({...editData, availabilityTime: current.includes(time) ? current.filter(t => t !== time) : [...current, time]});
                        }}
                        className={`flex-1 p-3 rounded-xl text-xs font-black border transition-all ${
                          (editData.availabilityTime || []).includes(time) ? 'bg-clay border-clay text-white' : 'bg-white/5 border-white/5 text-gray-400'
                        }`}
                      >
                        {time}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-3">
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest">Courts</label>
                  <div className="flex flex-wrap gap-2">
                    {PRELOADED_COURTS.map(court => (
                      <button
                        key={court}
                        onClick={() => {
                          const current = editData.preferredCourts || [];
                          setEditData({...editData, preferredCourts: current.includes(court) ? current.filter(c => c !== court) : [...current, court]});
                        }}
                        className={`px-3 py-1 rounded-lg text-[10px] font-bold border transition-all ${
                          (editData.preferredCourts || []).includes(court) ? 'bg-clay/20 border-clay text-clay' : 'bg-white/5 border-white/5 text-gray-500'
                        }`}
                      >
                        {court}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2 items-start">
                    <div className="flex-1">
                      <Input
                        placeholder="Add your own court..."
                        value={editData.customCourtInput || ''}
                        onChange={(e) => setEditData({ ...editData, customCourtInput: e.target.value })}
                      />
                    </div>
                    <Button
                      size="sm"
                      type="button"
                      onClick={() => {
                        const value = (editData.customCourtInput || '').trim();
                        if (!value) return;
                        const current = editData.preferredCourts || [];
                        if (current.includes(value)) return;
                        setEditData({
                          ...editData,
                          preferredCourts: [...current, value],
                          customCourtInput: '',
                        });
                      }}
                    >
                      Add
                    </Button>
                  </div>
                </div>
                <div className="space-y-3">
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest">Favourite Players</label>
                  <div className="flex flex-wrap gap-2">
                    {FAVOURITE_PLAYERS.map(player => (
                      <button
                        key={player}
                        onClick={() => {
                          const current = editData.favouritePlayers || [];
                          setEditData({
                            ...editData,
                            favouritePlayers: current.includes(player) ? current.filter(p => p !== player) : [...current, player]
                          });
                        }}
                        className={`px-3 py-1 rounded-lg text-[10px] font-bold border transition-all ${
                          (editData.favouritePlayers || []).includes(player) ? 'bg-clay/20 border-clay text-clay' : 'bg-white/5 border-white/5 text-gray-500'
                        }`}
                      >
                        {player}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2 items-start">
                    <div className="flex-1">
                      <Input
                        placeholder="Add your own player..."
                        value={editData.customFavouritePlayerInput || ''}
                        onChange={(e) => setEditData({ ...editData, customFavouritePlayerInput: e.target.value })}
                      />
                    </div>
                    <Button
                      size="sm"
                      type="button"
                      onClick={() => {
                        const value = (editData.customFavouritePlayerInput || '').trim();
                        if (!value) return;
                        const selected = editData.favouritePlayers || [];
                        if (selected.includes(value)) return;
                        setEditData({
                          ...editData,
                          favouritePlayers: [...selected, value],
                          customFavouritePlayerInput: '',
                        });
                      }}
                    >
                      Add
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="space-y-2">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Selected Days</p>
                  <div className="flex flex-wrap gap-2">
                    {profile.preferences.availability_day.map(day => (
                      <span key={day} className="px-3 py-1 bg-clay/10 border border-clay/20 rounded-lg text-xs font-bold text-clay">{day}</span>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Time</p>
                  <div className="flex flex-wrap gap-2">
                    {profile.preferences.availability_time.map(time => (
                      <span key={time} className="px-3 py-1 bg-clay/10 border border-clay/20 rounded-lg text-xs font-bold text-clay">{time}</span>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Courts</p>
                  <div className="flex flex-wrap gap-2">
                    {profile.preferences.preferred_courts
                      .filter(court => PRELOADED_COURTS.includes(court))
                      .map(court => (
                      <span key={court} className="px-3 py-1 bg-clay/10 border border-clay/20 rounded-lg text-xs font-bold text-clay">{court}</span>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Favourite Players</p>
                  <div className="flex flex-wrap gap-2">
                    {profile.preferences.favourite_players
                      .filter(player => FAVOURITE_PLAYERS.includes(player))
                      .map(player => (
                      <span key={player} className="px-3 py-1 bg-clay/10 border border-clay/20 rounded-lg text-xs font-bold text-clay">{player}</span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 5. EVENTS BOX (Lower Right) */}
        <div className="bg-tennis-surface/30 border border-white/5 rounded-[2.5rem] shadow-xl p-8 flex flex-col">
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-2xl font-bold text-white flex items-center">
              <Calendar className="w-6 h-6 mr-3 text-clay" />
              Events
            </h2>
            <Link to="/events">
              <Button size="sm" className="rounded-xl">
                <Plus className="w-4 h-4 mr-2" />
                Add Event
              </Button>
            </Link>
          </div>

          <div className="flex-grow overflow-y-auto max-h-[300px] space-y-4 pr-2 custom-scrollbar">
            {loading ? (
              <div className="space-y-4">
                {[1, 2].map(i => <div key={i} className="h-20 bg-white/5 rounded-2xl animate-pulse" />)}
              </div>
            ) : joinedEvents.length > 0 ? (
              joinedEvents.map((event) => (
                <div key={event.participantId} className="bg-white/5 border border-white/5 rounded-2xl p-4 flex items-center gap-4 hover:border-clay/30 transition-all group">
                  <img src={event.image} alt={event.title} className="w-12 h-12 rounded-xl object-cover" referrerPolicy="no-referrer" />
                  <div className="flex-grow">
                    <h4 className="text-white font-bold text-sm truncate">{event.title}</h4>
                    <p className="text-gray-500 text-[10px]">
                      {(() => {
                        const eventDate = parseEventDate(event.startDate || event.start_date || event.date);
                        return eventDate
                          ? eventDate.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })
                          : 'Date TBD';
                      })()}
                    </p>
                  </div>
                  <button onClick={() => handleRemoveEvent(event)} className="p-2 text-gray-600 hover:text-red-500 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))
            ) : (
              <div className="text-center py-10">
                <p className="text-gray-500 text-sm">No events joined yet</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {pendingRemovalEvent && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setPendingRemovalEvent(null)}
              className="absolute inset-0 bg-tennis-dark/80 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 16 }}
              className="relative w-full max-w-lg rounded-[2rem] border border-white/10 bg-tennis-surface p-8 shadow-2xl"
            >
              <h3 className="text-2xl font-bold text-white mb-4">Confirm Event Withdrawal</h3>
              <p className="text-gray-300 leading-relaxed mb-6">
                Deleting event here will remove you from the list participants. Please confirm withdrawal from the draw/meetup.
              </p>
              <div className="rounded-2xl border border-white/5 bg-white/5 p-4 mb-6">
                <p className="text-white font-semibold">{pendingRemovalEvent.title}</p>
                <p className="text-gray-400 text-sm mt-1">{pendingRemovalEvent.type}</p>
              </div>
              <div className="flex flex-col sm:flex-row justify-end gap-3">
                <Button variant="ghost" onClick={() => setPendingRemovalEvent(null)}>
                  Cancel
                </Button>
                <Button variant="danger" onClick={handleConfirmRemoveEvent}>
                  Confirm Removal
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
