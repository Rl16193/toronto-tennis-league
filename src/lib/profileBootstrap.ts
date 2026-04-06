import { User } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { UserData, UserPreferences, UserStats } from '../types';

const DEFAULT_STATS: UserStats = {
  skill_level: 2.5,
  tournament_preference: 'Challengers',
  matches_played: 0,
  matches_won: 0,
  points_won_percentage: 0,
};

const DEFAULT_PREFERENCES: UserPreferences = {
  availability_day: [],
  availability_time: [],
  preferred_courts: [],
  custom_courts: [],
  favourite_players: [],
  scheduling_preference: 'I will schedule matches on my own',
  event_creator: false,
};

export const ensureUserProfileDocuments = async (user: User) => {
  const userRef = doc(db, 'users', user.uid);
  const statsRef = doc(db, 'stats', user.uid);
  const preferencesRef = doc(db, 'preferences', user.uid);

  const [userSnap, statsSnap, preferencesSnap] = await Promise.all([
    getDoc(userRef),
    getDoc(statsRef),
    getDoc(preferencesRef),
  ]);

  const writes: Promise<void>[] = [];

  if (!userSnap.exists()) {
    const userData: UserData = {
      name: user.displayName?.trim() || '',
      email: user.email || '',
      phone: '',
      preferred_mode_of_contact: 'email',
      avatar: user.photoURL || '',
      created_at: new Date().toISOString(),
    };
    writes.push(setDoc(userRef, userData));
  }

  if (!statsSnap.exists()) {
    writes.push(setDoc(statsRef, DEFAULT_STATS));
  }

  if (!preferencesSnap.exists()) {
    writes.push(setDoc(preferencesRef, DEFAULT_PREFERENCES));
  }

  await Promise.all(writes);

  return {
    createdUser: !userSnap.exists(),
    createdStats: !statsSnap.exists(),
    createdPreferences: !preferencesSnap.exists(),
  };
};
