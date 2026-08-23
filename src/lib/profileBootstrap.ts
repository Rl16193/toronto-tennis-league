import { User } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { ContactData, UserData, UserPreferences, UserStats } from '../types';

export const emptyContacts = (): ContactData => ({
  email: '',
  phone: '',
  // Empty = no preference = every channel they fill in is offered. Do NOT seed this with 'email':
  // that would silently hide a new member's phone and WhatsApp the moment they add them.
  preferred_mode_of_contact: [],
  whatsapp_contact: '',
  whatsapp_same_as_phone: false,
  contactable: false,
});

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
  availability_tags: [],
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
  const contactsRef = doc(db, 'contacts', user.uid);
  const [userSnap, statsSnap, preferencesSnap, contactsSnap] = await Promise.all([
    getDoc(userRef),
    getDoc(statsRef),
    getDoc(preferencesRef),
    getDoc(contactsRef),
  ]);

  const writes: Promise<void>[] = [];

  if (!userSnap.exists()) {
    const userData: UserData = {
      name: user.displayName?.trim() || '',
      avatar: user.photoURL || '',
      created_at: new Date().toISOString(),
    };
    writes.push(setDoc(userRef, { ...userData, uid: user.uid }));
  }

  if (!statsSnap.exists()) {
    writes.push(setDoc(statsRef, { ...createDefaultStats(user), uid: user.uid }));
  }

  if (!preferencesSnap.exists()) {
    writes.push(setDoc(preferencesRef, { ...createDefaultPreferences(), uid: user.uid }));
  }

  // Created for every account, including legacy ones signing in for the first time after the
  // contacts split — the backfill handles the rest. Seeded with the auth email so notification
  // emails keep working before the member touches their profile.
  if (!contactsSnap.exists()) {
    writes.push(
      setDoc(contactsRef, {
        ...emptyContacts(),
        email: user.email || '',
        updated_at: new Date().toISOString(),
      }),
    );
  }

  await Promise.all(writes);

  return {
    createdUser: !userSnap.exists(),
    createdStats: !statsSnap.exists(),
    createdPreferences: !preferencesSnap.exists(),
    createdContacts: !contactsSnap.exists(),
  };
};
