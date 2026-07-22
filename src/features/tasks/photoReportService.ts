import { addDoc, collection } from 'firebase/firestore';
import { ref, uploadBytesResumable } from 'firebase/storage';
import exifr from 'exifr';
import { db, storage } from '../../lib/firebase';
import { courtKey } from '../../utils/courtKey';

// The "Submit a photo" flow — one form, three purposes. Condition and waiting-board photos land
// in the organizer review queue (court_reports, status 'pending'); queue photos are auto-approved
// (nobody needs to review "how busy is it right now").

export type ReportType = 'condition' | 'waitingBoard' | 'queue';
export type RacquetBucket = '1-4' | '5-9' | '10+';

export const RACQUET_BUCKETS: { id: RacquetBucket; label: string; wait: string; note?: string }[] = [
  { id: '1-4', label: '1–4 racquets', wait: '10–30 min' },
  {
    id: '5-9', label: '5–9 racquets', wait: '40–70 min',
    note: "Sometimes people place racquets on both boards. If that's the case the wait time might be about half the estimate.",
  },
  {
    id: '10+', label: '10 or more racquets', wait: '70–110 min',
    note: "Sometimes people place racquets on both boards. If that's the case the wait time might be about half the estimate.",
  },
];

export const waitEstimateFor = (bucket: RacquetBucket): string =>
  RACQUET_BUCKETS.find((b) => b.id === bucket)?.wait ?? '';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

// Image provenance stored on every submission. EXIF fields are best-effort — screenshots, PNGs,
// and photos routed through messaging apps often carry no EXIF, and it's user-editable, so these
// are a signal (e.g. "photo looks old"), NEVER proof. `file_last_modified` is whatever the OS
// reports for the file. `created_at` (submit time) remains the authoritative timestamp.
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

export async function extractPhotoMetadata(file: File): Promise<PhotoMetadata> {
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
  uid: string;
  userName: string;
  type: ReportType;
  courtName: string;
  file: File;
  note?: string;
  racquetBucket?: RacquetBucket;
  onProgress?: (pct: number) => void;
}): Promise<void> {
  const { uid, userName, type, courtName, file, note, racquetBucket, onProgress } = args;
  if (!file.type.startsWith('image/')) throw new Error('Please choose an image.');
  if (file.size > MAX_IMAGE_BYTES) throw new Error('Image must be under 5 MB.');

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const photoPath = `court_reports/${uid}/${Date.now()}_${safeName}`;

  // Read image provenance (EXIF + file timestamps) before upload, to store alongside the report.
  const meta = await extractPhotoMetadata(file);

  await new Promise<void>((resolve, reject) => {
    const task = uploadBytesResumable(ref(storage, photoPath), file, { contentType: file.type });
    task.on(
      'state_changed',
      (snap) => onProgress?.(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
      reject,
      resolve,
    );
  });

  const waitEstimate = type === 'queue' && racquetBucket ? waitEstimateFor(racquetBucket) : undefined;

  await addDoc(collection(db, 'court_reports'), {
    type,
    court_key: courtKey(courtName),
    court_name: courtName,
    user_id: uid,
    user_name: userName,
    photo_path: photoPath,
    ...(note?.trim() ? { note: note.trim() } : {}),
    ...(racquetBucket ? { racquet_bucket: racquetBucket } : {}),
    ...(waitEstimate ? { wait_estimate: waitEstimate } : {}),
    ...meta,
    // Condition/waiting-board need a human look; a queue photo is only useful right now, so it
    // posts as already-approved (points land immediately via the server trigger).
    status: type === 'queue' ? 'approved' : 'pending',
    created_at: new Date().toISOString(),
  });
}
