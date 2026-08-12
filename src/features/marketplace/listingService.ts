import {
  addDoc, collection, deleteDoc, doc, onSnapshot, query, updateDoc, where,
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import { useEffect, useState } from 'react';
import { db, storage } from '../../lib/firebase';
// Member-posted equipment listings — the Rent and Buy/Sell tabs of the Marketplace.
// Distinct from `rewards` (Services), which is a curated catalog only an admin can edit.
export type ListingKind = 'rent' | 'sell';

export type ListingCondition = 'New' | 'Like new' | 'Good' | 'Fair';
export const CONDITIONS: ListingCondition[] = ['New', 'Like new', 'Good', 'Fair'];

/** Available until the poster marks it gone. Sold/rented listings drop to the bottom, greyed. */
export type ListingStatus = 'available' | 'sold' | 'rented';

export const STATUS_LABEL: Record<ListingStatus, string> = {
  available: 'Available',
  sold: 'Sold',
  rented: 'Rented out',
};

// Collection: listings
export interface Listing {
  id: string;
  kind: ListingKind;
  title: string;
  description: string;
  condition: ListingCondition;
  price: number;
  /** Where the buyer collects it. Free text — "Enter Location" in the form. */
  pickup: string;
  /** Rent only: how long the price covers, e.g. "2 weeks". The poster sets the terms. */
  duration?: string;
  /** Storage paths; resolved to download URLs for display. Up to MAX_LISTING_PHOTOS. */
  photo_paths: string[];
  status: ListingStatus;
  uid: string;
  user_name: string;
  created_at: string;
  updated_at?: string;
}

export const MAX_LISTING_PHOTOS = 3;
export const MAX_LISTING_IMAGE_BYTES = 5 * 1024 * 1024;

/** "$40 for 2 weeks" for rentals, plain "$40" for sales. */
export const formatListingPrice = (l: Pick<Listing, 'kind' | 'price' | 'duration'>): string => {
  const amount = `$${l.price % 1 === 0 ? l.price : l.price.toFixed(2)}`;
  return l.kind === 'rent' && l.duration?.trim() ? `${amount} for ${l.duration.trim()}` : amount;
};

export interface ListingDraft {
  kind: ListingKind;
  title: string;
  description: string;
  condition: Listing['condition'];
  price: string;
  pickup: string;
  duration: string;
  files: File[];
}

export const emptyDraft = (kind: ListingKind): ListingDraft => ({
  kind,
  title: '',
  description: '',
  condition: 'Good',
  price: '',
  pickup: '',
  duration: '',
  files: [],
});

/**
 * Creates a listing, uploading its photos first. Photos land under `listings/{uid}/` — the
 * SafeSearch function watches that prefix and deletes anything unsafe, same as court photos and
 * avatars. Returns an error message, or null on success.
 */
export async function createListing(
  uid: string, userName: string, draft: ListingDraft,
  onProgress?: (pct: number) => void,
): Promise<string | null> {
  if (!draft.title.trim()) return 'Please give your listing a title.';
  if (!draft.description.trim()) return 'Please add a description.';
  const price = Number(draft.price);
  if (!Number.isFinite(price) || price < 0) return 'Please enter a valid price.';
  if (!draft.pickup.trim()) return 'Please say where it can be picked up.';
  if (draft.kind === 'rent' && !draft.duration.trim()) return 'Please say how long the rental is for.';
  if (draft.files.length > MAX_LISTING_PHOTOS) return `Up to ${MAX_LISTING_PHOTOS} photos.`;
  if (draft.files.some((f) => !f.type.startsWith('image/'))) return 'Please choose image files only.';
  if (draft.files.some((f) => f.size > MAX_LISTING_IMAGE_BYTES)) return 'Each image must be under 5 MB.';

  const photoPaths = draft.files.map((file, i) => {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    return `listings/${uid}/${Date.now()}_${i}_${safeName}`;
  });

  try {
    for (let i = 0; i < draft.files.length; i++) {
      await new Promise<void>((resolve, reject) => {
        const task = uploadBytesResumable(ref(storage, photoPaths[i]), draft.files[i], {
          contentType: draft.files[i].type,
        });
        task.on(
          'state_changed',
          (snap) => onProgress?.(Math.round(((i + snap.bytesTransferred / snap.totalBytes) / draft.files.length) * 100)),
          reject,
          resolve,
        );
      });
    }
    onProgress?.(100);

    await addDoc(collection(db, 'listings'), {
      kind: draft.kind,
      title: draft.title.trim(),
      description: draft.description.trim(),
      condition: draft.condition,
      price,
      pickup: draft.pickup.trim(),
      ...(draft.kind === 'rent' ? { duration: draft.duration.trim() } : {}),
      photo_paths: photoPaths,
      status: 'available' as ListingStatus,
      uid: uid,
      user_name: userName,
      created_at: new Date().toISOString(),
    });
    return null;
  } catch {
    return 'Could not post your listing. Please try again.';
  }
}

/** Poster marks their own item gone (or back on sale). Organizers can also remove a listing. */
export const setListingStatus = (id: string, status: ListingStatus) =>
  updateDoc(doc(db, 'listings', id), { status, updated_at: new Date().toISOString() });

/**
 * Poster edits their own listing — same validation as creating. `keepPhotoPaths` are existing
 * Storage paths to retain; `draft.files` are new uploads. `kind`, `status`, `uid` and
 * `created_at` are never touched here.
 */
export async function updateListing(
  id: string, uid: string, draft: ListingDraft, keepPhotoPaths: string[],
  onProgress?: (pct: number) => void,
): Promise<string | null> {
  if (!draft.title.trim()) return 'Please give your listing a title.';
  if (!draft.description.trim()) return 'Please add a description.';
  const price = Number(draft.price);
  if (!Number.isFinite(price) || price < 0) return 'Please enter a valid price.';
  if (!draft.pickup.trim()) return 'Please say where it can be picked up.';
  if (draft.kind === 'rent' && !draft.duration.trim()) return 'Please say how long the rental is for.';
  if (keepPhotoPaths.length + draft.files.length > MAX_LISTING_PHOTOS) return `Up to ${MAX_LISTING_PHOTOS} photos.`;
  if (draft.files.some((f) => !f.type.startsWith('image/'))) return 'Please choose image files only.';
  if (draft.files.some((f) => f.size > MAX_LISTING_IMAGE_BYTES)) return 'Each image must be under 5 MB.';

  const newPhotoPaths = draft.files.map((file, i) => {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    return `listings/${uid}/${Date.now()}_${i}_${safeName}`;
  });

  try {
    for (let i = 0; i < draft.files.length; i++) {
      await new Promise<void>((resolve, reject) => {
        const task = uploadBytesResumable(ref(storage, newPhotoPaths[i]), draft.files[i], {
          contentType: draft.files[i].type,
        });
        task.on(
          'state_changed',
          (snap) => onProgress?.(Math.round(((i + snap.bytesTransferred / snap.totalBytes) / draft.files.length) * 100)),
          reject,
          resolve,
        );
      });
    }
    onProgress?.(100);

    await updateDoc(doc(db, 'listings', id), {
      title: draft.title.trim(),
      description: draft.description.trim(),
      condition: draft.condition,
      price,
      pickup: draft.pickup.trim(),
      ...(draft.kind === 'rent' ? { duration: draft.duration.trim() } : {}),
      photo_paths: [...keepPhotoPaths, ...newPhotoPaths],
      updated_at: new Date().toISOString(),
    });
    return null;
  } catch {
    return 'Could not save your changes. Please try again.';
  }
}

export const deleteListing = (id: string) => deleteDoc(doc(db, 'listings', id));

/**
 * Live listings for one tab, available first then newest. `enabled` defers the listener until the
 * board is wanted (Services is the default tab). Once on it stays on, so flipping between tabs
 * doesn't tear the listener down.
 */
export function useListings(kind: ListingKind, enabled = true) {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // `setLoading(false)` matters here: without it a disabled board reports `loading: true`
    // forever, so anything reading it (a count, a badge, an empty state) waits on a listener
    // that was never going to open.
    if (!enabled) { setLoading(false); return; }
    // Sorted client-side: pairing an orderBy with the `kind` filter would need a composite
    // index, and this project ships no firestore.indexes.json.
    return onSnapshot(
      query(collection(db, 'listings'), where('kind', '==', kind)),
      (snap) => {
        setListings(
          snap.docs
            .map((d) => ({ id: d.id, ...(d.data() as Omit<Listing, 'id'>) }))
            .sort((a, b) => {
              const gone = (l: Listing) => (l.status === 'available' ? 0 : 1);
              return gone(a) - gone(b) || (b.created_at || '').localeCompare(a.created_at || '');
            }),
        );
        setLoading(false);
      },
      () => setLoading(false),
    );
  }, [kind, enabled]);

  return { listings, loading };
}

/** Resolves a Storage path to a download URL, cached for the session. */
const urlCache = new Map<string, string>();
export function useImageUrl(path: string | undefined) {
  const [url, setUrl] = useState<string | undefined>(path ? urlCache.get(path) : undefined);
  useEffect(() => {
    if (!path || urlCache.has(path)) return;
    let alive = true;
    getDownloadURL(ref(storage, path))
      .then((u) => { urlCache.set(path, u); if (alive) setUrl(u); })
      // A missing file is expected: moderation deletes unsafe uploads out from under the doc.
      .catch(() => { /* card falls back to its placeholder */ });
    return () => { alive = false; };
  }, [path]);
  return url;
}
