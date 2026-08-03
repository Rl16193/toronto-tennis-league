import { addDoc, collection } from 'firebase/firestore';
import { ref, uploadBytesResumable } from 'firebase/storage';
import exifr from 'exifr';
import { db, storage } from '../../lib/firebase';
import { courtKey } from '../../utils/courtKey';

// "Submit a Photo" — one unified report flow (formerly split across "Submit a Photo" and
// "Suggest an Improvement"). No organizer review: every report auto-approves immediately.
// Automated Vision SafeSearch moderation (functions/index.js) still runs on upload and can flip a
// report to 'rejected' after the fact if the image is unsafe.

export type ReportType = 'condition' | 'waitingBoard' | 'queue';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_PHOTOS = 3;

// Image provenance stored alongside each photo. EXIF fields are best-effort — screenshots, PNGs,
// and photos routed through messaging apps often carry no EXIF, and it's user-editable, so these
// are a signal (e.g. "photo looks old"), NEVER proof. `created_at` (submit time) remains the
// authoritative timestamp.
export type PhotoMetadata = {
  file_name: string;
  file_size: number;
  file_type: string;
  file_last_modified: string | null; // ISO — when the file was last saved on the device
  exif_taken_at: string | null;      // ISO — EXIF DateTimeOriginal (capture time), if present
  exif_camera: string | null;        // "Apple iPhone 14", etc., if present
  exif_gps_lat: number | null;
  exif_gps_lng: number | null;
  exif_present: boolean;             // did the image carry any readable EXIF at all
};

async function extractPhotoMetadata(file: File): Promise<PhotoMetadata> {
  const base: PhotoMetadata = {
    file_name: file.name,
    file_size: file.size,
    file_type: file.type,
    file_last_modified: Number.isFinite(file.lastModified) ? new Date(file.lastModified).toISOString() : null,
    exif_taken_at: null,
    exif_camera: null,
    exif_gps_lat: null,
    exif_gps_lng: null,
    exif_present: false,
  };
  try {
    const [tags, gps] = await Promise.all([
      exifr.parse(file, ['DateTimeOriginal', 'CreateDate', 'Make', 'Model']).catch(() => null),
      exifr.gps(file).catch(() => null),
    ]);
    if (tags) {
      base.exif_present = true;
      const taken = (tags.DateTimeOriginal || tags.CreateDate) as Date | undefined;
      if (taken instanceof Date && !Number.isNaN(taken.getTime())) base.exif_taken_at = taken.toISOString();
      const camera = [tags.Make, tags.Model].filter(Boolean).join(' ').trim();
      if (camera) base.exif_camera = camera;
    }
    if (gps && Number.isFinite(gps.latitude) && Number.isFinite(gps.longitude)) {
      base.exif_present = true;
      base.exif_gps_lat = gps.latitude;
      base.exif_gps_lng = gps.longitude;
    }
  } catch { /* no readable EXIF — keep the nulls */ }
  return base;
}

export async function submitPhotoReport(args: {
  uid: string | null; // null → anonymous (logged-out) report
  userName: string;
  type: ReportType;
  courtName: string;
  files: File[];
  note: string;
  racquetsInQueue?: number;
  waitingBoards?: number;
  onProgress?: (pct: number) => void;
}): Promise<void> {
  const { uid, userName, type, courtName, files, note, racquetsInQueue, waitingBoards, onProgress } = args;
  if (!note.trim()) throw new Error('Please add a note.');
  if (files.find((f) => !f.type.startsWith('image/'))) throw new Error('Please choose image files only.');
  if (files.find((f) => f.size > MAX_IMAGE_BYTES)) throw new Error('Each image must be under 5 MB.');

  const photoPaths = files.map((file, i) => {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    return `court_reports/${uid ?? 'anon'}/${Date.now()}_${i}_${safeName}`;
  });

  const photosMeta = await Promise.all(files.map(extractPhotoMetadata));

  for (let i = 0; i < files.length; i++) {
    await new Promise<void>((resolve, reject) => {
      const task = uploadBytesResumable(ref(storage, photoPaths[i]), files[i], { contentType: files[i].type });
      task.on(
        'state_changed',
        (snap) => onProgress?.(Math.round(((i + snap.bytesTransferred / snap.totalBytes) / files.length) * 100)),
        reject,
        resolve,
      );
    });
  }
  onProgress?.(100);

  await addDoc(collection(db, 'court_reports'), {
    type,
    court_key: courtKey(courtName),
    court_name: courtName,
    photo_paths: photoPaths,
    photos_meta: photosMeta,
    user_id: uid ?? null,
    user_name: userName,
    note: note.trim(),
    ...(type === 'queue' && racquetsInQueue != null ? { racquets_in_queue: racquetsInQueue } : {}),
    ...(type === 'waitingBoard' && waitingBoards != null ? { waiting_boards: waitingBoards } : {}),
    status: 'approved',
    created_at: new Date().toISOString(),
  });
}
