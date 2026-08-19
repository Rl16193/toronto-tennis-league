import { doc, writeBatch } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { buildSignupProfileDocuments, type SignupProfileInput } from './signupProfileDocuments';

/** Persist the four signup projections atomically so a partial network failure cannot split them. */
export const persistSignupProfile = async (input: SignupProfileInput) => {
  const payloads = buildSignupProfileDocuments(input, new Date().toISOString());
  const batch = writeBatch(db);
  batch.set(doc(db, 'users', input.uid), payloads.user, { merge: true });
  batch.set(doc(db, 'contacts', input.uid), payloads.contact, { merge: true });
  batch.set(doc(db, 'stats', input.uid), payloads.stats, { merge: true });
  batch.set(doc(db, 'preferences', input.uid), payloads.preferences, { merge: true });
  await batch.commit();
};
