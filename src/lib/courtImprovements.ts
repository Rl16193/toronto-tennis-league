import { addDoc, collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { ref, uploadBytes } from 'firebase/storage';
import { db, storage } from './firebase';

/**
 * Court improvement suggestions from the homepage's floating button.
 *
 * Deliberately open to signed-out visitors: someone who walks past a broken net should be able to
 * say so without making an account. That is why this is its own collection rather than a `courts`
 * doc — `courts` is members-only and feeds points, check-ins and the activity counts, and a
 * stranger's note must not touch any of that. A member's row carries `uid`/`user_name` on top,
 * and `firestore.rules` enforces that the uid, when present, is the caller's own.
 *
 * Auto-id: one row per submission, and the same person may report several courts.
 */
export type CourtImprovement = {
  court: string;
  note: string;
  /** Optional — a visitor who wants an answer can leave one. */
  email?: string;
  /** Present only when a signed-in member submits. Must match their own auth uid. */
  uid?: string;
  userName?: string;
  /** Up to 3 images, uploaded to court_reports/anon/ — the path storage.rules opens to visitors. */
  files?: File[];
};

/** A report as the Organizer Dash lists it. `id` and `created_at` come from the stored doc. */
export type CourtImprovementRow = CourtImprovement & {
  id: string;
  user_name?: string;
  created_at: string;
};

/**
 * Live reports, newest first, for the Organizer Dash. Reading is organizer-only, so a denial is the
 * normal outcome for everyone else and must degrade to an empty list rather than throw — and it is
 * also what happens for ORGANIZERS until `firebase deploy --only firestore:rules` lands this
 * collection's rules.
 */
export const watchCourtImprovements = (
  enabled: boolean,
  onRows: (rows: CourtImprovementRow[]) => void,
) => {
  if (!enabled) { onRows([]); return () => {}; }
  return onSnapshot(
    query(collection(db, 'court_improvements'), orderBy('created_at', 'desc')),
    (snap) => onRows(snap.docs.map((d) => ({ id: d.id, ...d.data() } as CourtImprovementRow))),
    () => onRows([]),
  );
};

export const submitCourtImprovement = async ({ court, note, email, uid, userName, files = [] }: CourtImprovement) => {
  const photoPaths = await Promise.all(files.slice(0, 3).map(async (f, i) => {
    const path = `court_reports/anon/${Date.now()}_${i}_${f.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    await uploadBytes(ref(storage, path), f, { contentType: f.type });
    return path;
  }));
  await addDoc(collection(db, 'court_improvements'), {
    court: court.trim(),
    note: note.trim(),
    // Omitted rather than written empty, as in volunteer.ts: the rules whitelist the keys but a
    // blank string is not data.
    ...(email?.trim() ? { email: email.trim().toLowerCase() } : {}),
    ...(uid ? { uid } : {}),
    ...(uid && userName?.trim() ? { user_name: userName.trim() } : {}),
    ...(photoPaths.length ? { photo_paths: photoPaths } : {}),
    source: 'homepage',
    created_at: new Date().toISOString(),
  });
};
