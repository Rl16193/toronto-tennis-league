import { doc, updateDoc, getDocs, query, where, collection, writeBatch } from 'firebase/firestore';
import { EmailAuthProvider, reauthenticateWithCredential, verifyBeforeUpdateEmail, type User } from 'firebase/auth';
import { db } from '../../../lib/firebase';
import { gridToLegacy, type AvailabilityGrid } from '../../../utils/availability';

// Sync the display name onto stats/preferences and every event_participants doc.
const syncName = async (userId: string, name: string) => {
  await updateDoc(doc(db, 'stats', userId), { name });
  const snap = await getDocs(query(collection(db, 'event_participants'), where('user_id', '==', userId)));
  if (!snap.empty) {
    const batch = writeBatch(db);
    snap.docs.forEach((d) => batch.update(d.ref, { user_name: name }));
    await batch.commit();
  }
};

export const updateName = async (userId: string, name: string) => {
  const trimmed = name.trim();
  if (trimmed.length < 3 || trimmed.length > 80) throw new Error('Name must be 3–80 characters.');
  if (/\d/.test(trimmed)) throw new Error('Name cannot contain numbers.');
  await updateDoc(doc(db, 'users', userId), { name: trimmed });
  await syncName(userId, trimmed);
};

export const updatePhone = async (userId: string, phone: string) => {
  const digits = phone.replace(/\D/g, '');
  if (digits.length !== 10) throw new Error('Phone number must be exactly 10 digits.');
  await updateDoc(doc(db, 'users', userId), {
    phone: `(${digits.slice(0, 3)})-${digits.slice(3, 6)}-${digits.slice(6, 10)}`,
  });
};

export const updateWhatsappContact = async (userId: string, whatsappContact: string, sameAsPhone: boolean) => {
  if (!sameAsPhone && whatsappContact && !/^\+[1-9]\d{6,14}$/.test(whatsappContact)) {
    throw new Error('Enter a valid WhatsApp number.');
  }
  await updateDoc(doc(db, 'users', userId), {
    whatsapp_contact: sameAsPhone ? '' : whatsappContact,
    whatsapp_same_as_phone: sameAsPhone,
  });
};

export const updateBio = async (userId: string, bio: string) => {
  await updateDoc(doc(db, 'users', userId), { bio: bio.trim().slice(0, 300) });
};

export const updateAvatar = async (userId: string, avatar: string) => {
  await updateDoc(doc(db, 'users', userId), { avatar });
};

export const updateSkills = async (userId: string, skillLevel: number, tournamentPreference: string) => {
  if (Number.isNaN(skillLevel)) throw new Error('Please select a valid skill level.');
  await updateDoc(doc(db, 'stats', userId), { skill_level: skillLevel, tournament_preference: tournamentPreference });

  const snap = await getDocs(query(collection(db, 'event_participants'), where('user_id', '==', userId)));
  const toSync = snap.docs.filter((d) => (d.data().tournament_choice || '') !== 'Doubles');
  if (toSync.length > 0) {
    const batch = writeBatch(db);
    toSync.forEach((d) => batch.update(d.ref, { skill: skillLevel }));
    await batch.commit();
  }
};

// League (gender + optional Retired Pro/Juniors age category) lives on stats.league as one
// string, e.g. "Men's Retired Pro" — the same field the Leagues page and League Ladder split on
// (see leagueDivision/leagueAgeCategory in utils/skillLevels.ts). The "visible to others" flag
// lives on the users doc.
export const updateLeagueAndAgeCategory = async (
  userId: string,
  league: "Men's" | "Women's" | '',
  ageCategory: 'Retired Pro' | 'Juniors' | '',
  visible: boolean,
) => {
  await updateDoc(doc(db, 'users', userId), { profile_details_visible: visible });
  // Only write the league when one is chosen — never clobber an existing value with ''.
  if (league) {
    const leagueValue = ageCategory ? `${league} ${ageCategory}` : league;
    await updateDoc(doc(db, 'stats', userId), { league: leagueValue });
  }
};

// The up-to-three badges a player chose to display.
export const updateDisplayBadges = async (userId: string, badgeIds: string[]) => {
  await updateDoc(doc(db, 'users', userId), { display_badges: badgeIds.slice(0, 3) });
};

export const updatePreferredCourts = async (userId: string, courts: string[], zone: string) => {
  await updateDoc(doc(db, 'preferences', userId), { preferred_courts: courts, preferred_zone: zone });
};

export const updateFavouritePlayers = async (userId: string, players: string[]) => {
  await updateDoc(doc(db, 'preferences', userId), { favourite_players: players });
};

export const updateEmailNotifications = async (userId: string, enabled: boolean) => {
  await updateDoc(doc(db, 'preferences', userId), { email_notifications: enabled });
};

export const updateAvailabilityTags = async (userId: string, tags: string[]) => {
  await updateDoc(doc(db, 'preferences', userId), { availability_tags: tags });
};

export const updateAvailabilityGrid = async (userId: string, grid: AvailabilityGrid) => {
  // Write the grid plus the derived legacy fields so older readers keep working mid-migration.
  await updateDoc(doc(db, 'preferences', userId), { availability: grid, ...gridToLegacy(grid) });
};

export const changeEmail = async (user: User, newEmail: string, password: string) => {
  const credential = EmailAuthProvider.credential(user.email || '', password);
  await reauthenticateWithCredential(user, credential);
  await verifyBeforeUpdateEmail(user, newEmail.trim());
};

export const updateEventParticipantDates = async (participantId: string, dateselected: string[]) => {
  await updateDoc(doc(db, 'event_participants', participantId), { dateselected });
};
