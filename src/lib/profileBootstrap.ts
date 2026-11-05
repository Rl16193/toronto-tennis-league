import { User } from 'firebase/auth';
import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { db } from './firebase';
import { ContactData, UserData, UserPreferences, UserStats } from '../types';

export const emptyContacts = (): ContactData => ({
  email: '',
  phone: '',
  // Empty = no preference = every channel they fill in is offered. Do NOT seed this with 'email':
  // that would silently hide a new member's phone and WhatsApp the moment they add them.
  preferred_mode_of_contact: [],
  whatsapp_contact: '',
  contactable: false,
  secondary_email: '',
  updated_at: null,
  // When they last agreed to the Terms and Privacy Policy; null = never (ConsentSheet asks).
  consent_at: null,
  lastActive: null,
});

// The full stats shape with every server-written counter at zero (firestore.rules requires it).
const createDefaultStats = (user: User): UserStats => ({
  uid: user.uid,
  name: user.displayName?.trim() || '',
  skill_level: 2,
  league: '',
  leaguePoints: 0,
  leaguePointsPrev: 0,
  matchesPlayed: 0,
  wins: 0,
  pointswon: 0,
  totalPointsPlayed: 0,
  tournamentsPlayed: 0,
  rankPosition: 0,
  rankTrend: 'flat',
  rankMove: 0,
  rankUpdatedAt: null,
  profilePhoto: false,
  profileComplete: false,
  whatsappGroup: false,
  followSocial: false,
  tagPost: false,
  eventsJoined: 0,
  challengesPlayed: 0,
  challengesWon: 0,
  courtsVisited: 0,
  zoneComplete: 0,
  suggestions: 0,
  boardPhotos: 0,
  queueUpdates: 0,
  currentStreak: 0,
  bestStreak: 0,
  monthsActive: 0,
  active_months: [],
  volunteerClaimed: 0,
  volunteerApproved: 0,
  latestVolunteerStatus: 'none',
  inviteClaimed: 0,
  inviteApproved: 0,
  latestInviteStatus: 'none',
  hostClaimed: 0,
  hostApproved: 0,
  latestHostStatus: 'none',
  rsPoints: 0,
  pointsSpent: 0,
  updated_at: Timestamp.now(),
});

const createDefaultPreferences = (uid: string): UserPreferences => ({
  uid,
  preferred_courts: [],
  custom_courts: [],
  preferred_zone: '',
  favourite_players: [],
  availability_tags: [],
  email_notifications: true,
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
  const now = Timestamp.now();

  if (!userSnap.exists()) {
    const userData: UserData = {
      uid: user.uid,
      name: user.displayName?.trim() || '',
      avatar: user.photoURL || '',
      bio: '',
      display_badges: [],
      created_at: now,
    };
    writes.push(setDoc(userRef, userData));
  }

  if (!statsSnap.exists()) writes.push(setDoc(statsRef, createDefaultStats(user)));
  if (!preferencesSnap.exists()) writes.push(setDoc(preferencesRef, createDefaultPreferences(user.uid)));

  // Seeded with the auth email so notification emails work before the member touches their profile.
  if (!contactsSnap.exists()) {
    writes.push(setDoc(contactsRef, { ...emptyContacts(), email: user.email || '', updated_at: now, lastActive: now }));
  }

  await Promise.all(writes);

  return {
    createdUser: !userSnap.exists(),
    createdStats: !statsSnap.exists(),
    createdPreferences: !preferencesSnap.exists(),
    createdContacts: !contactsSnap.exists(),
  };
};
