import { doc, updateDoc, getDocs, query, where, collection, deleteDoc, writeBatch } from 'firebase/firestore';
import { EmailAuthProvider, reauthenticateWithCredential, verifyBeforeUpdateEmail, linkWithPopup } from 'firebase/auth';
import { db, googleProvider } from '../../../services/firebase';

export const updateUserInfo = async (userId: string, name: string, phone: string) => {
  const normalizedPhone = phone.replace(/\D/g, '');
  if (normalizedPhone.length !== 10) {
    throw new Error('Phone number must be exactly 10 digits.');
  }

  const userRef = doc(db, 'users', userId);
  await updateDoc(userRef, {
    name: name.trim(),
    phone: `(${normalizedPhone.slice(0, 3)})-${normalizedPhone.slice(3, 6)}-${normalizedPhone.slice(6, 10)}`,
  });

  await Promise.all([
    updateDoc(doc(db, 'stats', userId), {
      name: name.trim(),
      user_id: userId,
    }),
    updateDoc(doc(db, 'preferences', userId), {
      name: name.trim(),
      user_id: userId,
    }),
  ]);

  const participantSnapshot = await getDocs(
    query(collection(db, 'event_participants'), where('user_id', '==', userId))
  );

  if (!participantSnapshot.empty) {
    const batch = writeBatch(db);
    participantSnapshot.docs.forEach((participantDoc) => {
      batch.update(participantDoc.ref, { user_name: name.trim() });
    });
    await batch.commit();
  }
};

export const updateSkills = async (userId: string, skillLevel: number, tournamentPreference: string) => {
  if (Number.isNaN(skillLevel)) {
    throw new Error('Please select a valid skill level.');
  }

  const statsRef = doc(db, 'stats', userId);
  await updateDoc(statsRef, {
    skill_level: skillLevel,
    tournament_preference: tournamentPreference,
  });

  const participantSnapshot = await getDocs(
    query(collection(db, 'event_participants'), where('user_id', '==', userId))
  );

  const participantsToSync = participantSnapshot.docs.filter((participantDoc) => {
    const participant = participantDoc.data();
    return (participant.tournament_choice || '') !== 'Doubles';
  });

  if (participantsToSync.length > 0) {
    const batch = writeBatch(db);
    participantsToSync.forEach((participantDoc) => {
      batch.update(participantDoc.ref, { skill: skillLevel });
    });
    await batch.commit();
  }
};

export const updateAvailability = async (userId: string, availabilityDay: string[], availabilityTime: string[], preferredCourts: string[], favouritePlayers: string[]) => {
  const prefsRef = doc(db, 'preferences', userId);
  await updateDoc(prefsRef, {
    availability_day: availabilityDay,
    availability_time: availabilityTime,
    preferred_courts: preferredCourts,
    favourite_players: favouritePlayers,
  });
};

export const changeEmail = async (user: any, newEmail: string, password: string) => {
  const credential = EmailAuthProvider.credential(user.email || '', password);
  await reauthenticateWithCredential(user, credential);
  await verifyBeforeUpdateEmail(user, newEmail.trim());
};

export const linkGoogleAccount = async (user: any) => {
  await linkWithPopup(user, googleProvider);
};

export const removeEventParticipant = async (participantId: string) => {
  await deleteDoc(doc(db, 'event_participants', participantId));
};

export const updateEventParticipantDates = async (participantId: string, dateselected: string[]) => {
  const participantRef = doc(db, 'event_participants', participantId);
  await updateDoc(participantRef, { dateselected });
};