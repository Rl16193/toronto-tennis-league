import { Timestamp, doc, setDoc, updateDoc, getDocs, query, where, collection, writeBatch } from 'firebase/firestore';
import { EmailAuthProvider, reauthenticateWithCredential, verifyBeforeUpdateEmail, type User } from 'firebase/auth';
import { db } from '../../../lib/firebase';
import type { ContactMethod } from '../../../types';

// Sync the display name onto stats and every event_participants doc (user_name is owner-writable).
const syncName = async (userId: string, name: string) => {
  await updateDoc(doc(db, 'stats', userId), { name, updated_at: Timestamp.now() });
  const snap = await getDocs(query(collection(db, 'event_participants'), where('uid', '==', userId)));
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

// Contact details live in `contacts/{uid}`, not `users` — see the ContactData doc comment.
// setDoc(merge) rather than updateDoc so a legacy account with no contacts doc yet can still
// save (updateDoc fails outright on a missing document).
export const updatePhone = async (userId: string, phone: string) => {
  const digits = phone.replace(/\D/g, '');
  if (digits.length !== 10) throw new Error('Phone number must be exactly 10 digits.');
  await setDoc(doc(db, 'contacts', userId), {
    phone: `(${digits.slice(0, 3)})-${digits.slice(3, 6)}-${digits.slice(6, 10)}`,
    updated_at: Timestamp.now(),
  }, { merge: true });
};

/** A stored phone as E.164: a 10-digit number is North American (+1XXXXXXXXXX). */
export const phoneAsWhatsapp = (phone: string) => {
  const digits = (phone || '').replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  return digits ? `+${digits}` : '';
};

/**
 * "Same as phone" copies the phone into whatsapp_contact on save — there is no separate flag.
 * Consent is implied by giving a reachable messaging number; clearing it withdraws it.
 */
export const updateWhatsappContact = async (userId: string, whatsappContact: string, sameAsPhone: boolean, phone: string) => {
  const number = sameAsPhone ? phoneAsWhatsapp(phone) : whatsappContact;
  if (number && !/^\+[1-9]\d{6,14}$/.test(number)) {
    throw new Error(sameAsPhone ? 'Save a valid phone number first.' : 'Enter a valid WhatsApp number.');
  }
  await setDoc(doc(db, 'contacts', userId), {
    whatsapp_contact: number,
    contactable: !!number,
    updated_at: Timestamp.now(),
  }, { merge: true });
};

/**
 * Which channels the member wants to be reached on. An EMPTY array is a meaningful value — it means
 * "no preference", and every channel they've filled in is offered. It is not the same as "email".
 * `setDoc(..., { merge: true })` rather than `updateDoc` so a member whose contacts doc was never
 * backfilled can still set this.
 */
export const updateContactMethods = async (userId: string, methods: ContactMethod[]) => {
  await setDoc(doc(db, 'contacts', userId), {
    preferred_mode_of_contact: methods,
    updated_at: Timestamp.now(),
  }, { merge: true });
};

export const updateBio = async (userId: string, bio: string) => {
  await updateDoc(doc(db, 'users', userId), { bio: bio.trim().slice(0, 300) });
};

export const updateAvatar = async (userId: string, avatar: string) => {
  await updateDoc(doc(db, 'users', userId), { avatar });
};

// Skill also syncs onto the member's active singles registrations (owners may update `skill`).
export const updateSkills = async (userId: string, skillLevel: number) => {
  if (Number.isNaN(skillLevel)) throw new Error('Please select a valid skill level.');
  await updateDoc(doc(db, 'stats', userId), { skill_level: skillLevel, updated_at: Timestamp.now() });

  const snap = await getDocs(query(collection(db, 'event_participants'), where('uid', '==', userId)));
  const toSync = snap.docs.filter((d) => d.data().category === 'singles_tournament' && d.data().status === 'active');
  if (toSync.length > 0) {
    const batch = writeBatch(db);
    toSync.forEach((d) => batch.update(d.ref, { skill: skillLevel }));
    await batch.commit();
  }
};

// League (gender + optional Retired Pro/Juniors age category) lives on stats.league as one
// string, e.g. "Men's Retired Pro" — the same field the Leagues page and League Ladder split on
// (see leagueDivision/leagueAgeCategory in utils/skillLevels.ts). It is always visible to others.
export const updateLeagueAndAgeCategory = async (
  userId: string,
  league: "Men's" | "Women's" | '',
  ageCategory: 'Retired Pro' | 'Juniors' | '',
) => {
  // Only write the league when one is chosen — never clobber an existing value with ''.
  if (league) {
    const leagueValue = ageCategory ? `${league} ${ageCategory}` : league;
    await updateDoc(doc(db, 'stats', userId), { league: leagueValue, updated_at: Timestamp.now() });
  }
};

// The up-to-three badges a player chose to display.
export const updateDisplayBadges = async (userId: string, badgeIds: string[]) => {
  await updateDoc(doc(db, 'users', userId), { display_badges: badgeIds.slice(0, 3) });
};

/** `courts` are roster courts; `custom` are typed courts not on the roster (CourtsEditor). */
export const updatePreferredCourts = async (userId: string, courts: string[], zone: string, custom: string[]) => {
  await updateDoc(doc(db, 'preferences', userId), { preferred_courts: courts, custom_courts: custom, preferred_zone: zone });
};

// Picked by hand on the profile card; the next court edit recomputes it. `onZoneChanged`
// (functions/zoneMoves.js) keeps every match with a real opponent, gives up old-zone seats without
// one, and tells the organizer.
export const updatePreferredZone = async (userId: string, zone: string) => {
  await updateDoc(doc(db, 'preferences', userId), { preferred_zone: zone });
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

export const changeEmail = async (user: User, newEmail: string, password: string) => {
  const credential = EmailAuthProvider.credential(user.email || '', password);
  await reauthenticateWithCredential(user, credential);
  await verifyBeforeUpdateEmail(user, newEmail.trim());
};

