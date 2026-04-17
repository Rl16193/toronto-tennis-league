import { User } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { UserData, UserPreferences, UserStats } from '../types';

const createDefaultStats = (user: User): UserStats => {
  const displayName = user.displayName?.trim() || '';

  return {
    user_id: user.uid,
    name: displayName,
    skill_level: 2,
    tournament_preference: 'Challengers',
    matches_played: 0,
    matches_won: 0,
    points_won_percentage: 0,
  };
};

const createDefaultPreferences = (user: User): UserPreferences => {
  const displayName = user.displayName?.trim() || '';

  return {
    user_id: user.uid,
    name: displayName,
    availability_day: [],
    availability_time: [],
    preferred_courts: [],
    favourite_players: [],
    scheduling_preference: 'I will schedule matches on my own',
    event_creator: false,
  };
};

export const ensureUserProfileDocuments = async (user: User) => {
  const userRef = doc(db, 'users', user.uid);
  const statsRef = doc(db, 'stats', user.uid);
  const preferencesRef = doc(db, 'preferences', user.uid);
  const fallbackName = user.displayName?.trim() || '';

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
    writes.push(setDoc(statsRef, createDefaultStats(user)));
  } else {
    const statsData = statsSnap.data() as Partial<UserStats>;
    if (!statsData.user_id || typeof statsData.name !== 'string') {
      writes.push(setDoc(statsRef, {
        user_id: user.uid,
        name: statsData.name ?? fallbackName,
      }, { merge: true }));
    }
  }

  if (!preferencesSnap.exists()) {
    writes.push(setDoc(preferencesRef, createDefaultPreferences(user)));
  } else {
    const preferencesData = preferencesSnap.data() as Partial<UserPreferences>;
    if (!preferencesData.user_id || typeof preferencesData.name !== 'string') {
      writes.push(setDoc(preferencesRef, {
        user_id: user.uid,
        name: preferencesData.name ?? fallbackName,
      }, { merge: true }));
    }
  }

  await Promise.all(writes);

  return {
    createdUser: !userSnap.exists(),
    createdStats: !statsSnap.exists(),
    createdPreferences: !preferencesSnap.exists(),
  };
};