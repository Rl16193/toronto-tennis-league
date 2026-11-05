import { Timestamp, addDoc, collection } from 'firebase/firestore';
import { ref, uploadBytesResumable } from 'firebase/storage';
import exifr from 'exifr';
import { db, storage } from '../../lib/firebase';
import { courtKey } from '../../utils/courtKey';

// "Submit a Report" — one report flow, members and signed-out visitors alike. No organizer review.
// A report is a `courts` row with category 'report' and the report type as its sub_category.
export type ReportType = 'condition' | 'waiting_board' | 'queue';

// A signed-out reporter's uid / user_name. The rules accept exactly this pair, and it pays nobody.
export const NOT_A_MEMBER_UID = 'not_a_member';
const ANONYMOUS_NAME = 'anonymous';

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
  file_last_modified: Timestamp | null; // when the file was last saved on the device
  exif_taken_at: Timestamp | null;      // EXIF DateTimeOriginal (capture time), if present
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
    file_last_modified: Number.isFinite(file.lastModified) ? Timestamp.fromMillis(file.lastModified) : null,
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
      if (taken instanceof Date && !Number.isNaN(taken.getTime())) base.exif_taken_at = Timestamp.fromDate(taken);
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
  uid: string | null; // null → signed-out report
  userName: string;
  type: ReportType;
  courtName: string;
  /** The court's zone ('' when unknown). */
  zone: string;
  files: File[];
  note: string;
  racquetsInQueue?: number;
  /** When the queue was seen, 24-hour "HH:MM" local time. Queue reports only. */
  queueTime?: string;
  waitingBoards?: number;
  onProgress?: (pct: number) => void;
}): Promise<void> {
  const { uid, userName, type, courtName, zone, files, note, racquetsInQueue, queueTime, waitingBoards, onProgress } = args;
  if (type === 'condition' && !note.trim()) throw new Error('Please add a note.');
  if (files.find((f) => !f.type.startsWith('image/'))) throw new Error('Please choose image files only.');
  if (files.find((f) => f.size > MAX_IMAGE_BYTES)) throw new Error('Each image must be under 5 MB.');

  // No uid in the path: photos are public. Shared folders, so a random segment keeps names unique.
  const photoPaths = files.map((file, i) => {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const rand = Math.random().toString(36).slice(2, 8);
    return `court_reports/${uid ? 'members' : 'anon'}/${Date.now()}_${i}_${rand}_${safeName}`;
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

  // Every field on every report; what doesn't apply to this type is a typed empty.
  const now = Timestamp.now();
  await addDoc(collection(db, 'courts'), {
    category: 'report',
    sub_category: type,
    uid: uid ?? NOT_A_MEMBER_UID,
    user_name: uid ? userName : ANONYMOUS_NAME,
    court_key: courtKey(courtName),
    court_name: courtName,
    zone,
    note: note.trim(),
    photo_paths: photoPaths,
    photos_meta: photosMeta,
    waiting_boards: type === 'waiting_board' ? waitingBoards ?? 0 : 0,
    racquets_in_queue: type === 'queue' ? racquetsInQueue ?? 0 : 0,
    queue_time: type === 'queue' ? queueTime ?? '' : '',
    created_at: now,
    updated_at: now,
    lat: 0,
    lng: 0,
    dist_m: 0,
  });
}
