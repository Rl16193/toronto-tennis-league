import { User } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { UserData, UserPreferences, UserStats } from '../types';

const createDefaultStats = (user: User): UserStats => ({
  name: user.displayName?.trim() || '',
  skill_level: 2,
  tournament_preference: 'Challengers',
  matchesPlayed: 0,
  wins: 0,
  loses: 0,
  leaguePoints26: 0,
  tournamentsPlayed: 0,
  league: '',
  pointswon: 0,
  totalPointsPlayed: 0,
});

const createDefaultPreferences = (): UserPreferences => ({
  availability_day: [],
  availability_time: [],
  preferred_courts: [],
  favourite_players: [],
  scheduling_preference: 'I will schedule matches on my own',
  event_creator: false,
  preferred_zone: '',
});

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
    writes.push(setDoc(statsRef, createDefaultStats(user)));
  }

  if (!preferencesSnap.exists()) {
    writes.push(setDoc(preferencesRef, createDefaultPreferences()));
  }

  await Promise.all(writes);

  return {
    createdUser: !userSnap.exists(),
    createdStats: !statsSnap.exists(),
    createdPreferences: !preferencesSnap.exists(),
  };
};
