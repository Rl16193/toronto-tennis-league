import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from './firebase';

export const emailExistsInProfiles = async (emailToCheck: string) => {
  const normalizedEmail = emailToCheck.trim();
  if (!normalizedEmail) return false;

  const snapshot = await getDocs(query(collection(db, 'users'), where('email', '==', normalizedEmail)));
  return !snapshot.empty;
};

// Matches an email against `secondary_email` — set only by the account-merge admin script when
// a signup turns out to be a known duplicate under a different address (see types.ts).
export const secondaryEmailExistsInProfiles = async (emailToCheck: string) => {
  const normalizedEmail = emailToCheck.trim();
  if (!normalizedEmail) return false;

  const snapshot = await getDocs(query(collection(db, 'users'), where('secondary_email', '==', normalizedEmail)));
  return !snapshot.empty;
};
