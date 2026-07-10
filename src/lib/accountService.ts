import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from './firebase';

export const emailExistsInProfiles = async (emailToCheck: string) => {
  const normalizedEmail = emailToCheck.trim();
  if (!normalizedEmail) return false;

  const snapshot = await getDocs(query(collection(db, 'users'), where('email', '==', normalizedEmail)));
  return !snapshot.empty;
};
