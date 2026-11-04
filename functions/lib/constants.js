/**
 * Shared constants for the Cloud Functions. Lives in lib/ for the same reason notify.js does:
 * index.js/notifications.js/taskPoints.js are re-exported wholesale via
 * `Object.assign(exports, require('./x'))`, and the Firebase CLI expects every export it finds
 * there to be a Cloud Function — a plain constant mixed in would break `firebase deploy`.
 */

// Scheduling/formatting timezone for every scheduled function and day-key calculation.
const TZ = 'America/Toronto';

/** A Firestore Timestamp, Date, ISO string or millis as a Date (null when absent or invalid). */
function toDate(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v.toDate === 'function') return v.toDate();
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Toronto-local parts of a time (now if absent): day 'YYYYMMDD', month 'YYYY-MM', hour 0..23. */
function torontoParts(when) {
  const d = toDate(when) || new Date();
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false,
  }).formatToParts(d).map((x) => [x.type, x.value]));
  return { day: `${p.year}${p.month}${p.day}`, month: `${p.year}-${p.month}`, hour: parseInt(p.hour, 10) % 24 };
}

/** A doubles partner who isn't on the app (`guest_…` uid): paid league points, nothing else. */
const isGuest = (uid) => String(uid || '').startsWith('guest_');

const DAY_MS = 24 * 60 * 60 * 1000;

// Deployment region for every trigger.
const REGION = 'us-central1';
const SUPER_ADMIN_UID = '7PvfzNtDmsOq5GLMieId7QRT7wH3';

// The Google Sheet both the weekly collection sync and the admin metrics write to.
const SPREADSHEET_ID = '1RpEowUk-fN08Y-zpZwIWL5XVbDESc7L_ZYRoUcbHkvI';

// Outgoing address for every email. `notifications@` is a real Hostinger mailbox, not a black
// hole — the old `noreply@` was unroutable, which reads badly to spam filters and to people.
const EMAIL_FROM = 'Racquets & Strings <notifications@racquetsandstrings.ca>';

// Replies land in the monitored events mailbox. Previously a gmail.com address, which paired a
// branded From with a free consumer Reply-To — a pattern filters associate with spoofing.
const EMAIL_REPLY_TO = 'events@racquetsandstrings.ca';

// Public site + social links. These MIRROR src/components/FooterElements.tsx — functions/ is a
// separate package and can't import from src/, so both copies have to be changed together. They
// previously lived inline in emailTemplates.js and had already drifted (a trailing slash on the
// Instagram URL) from the frontend's copy.
const SITE = 'https://www.racquetsandstrings.ca';
const INSTAGRAM = 'https://www.instagram.com/racqnstringstoronto';
const WHATSAPP = 'https://chat.whatsapp.com/Bh7OVww9e08GP4TuoFF5NX';
const FAQ = 'https://docs.google.com/document/d/17lyP5f62iuXRIiwDtrcn4EZo6vnx0jbr87kxdkEIzYY/edit?tab=t.0';

module.exports = { TZ, DAY_MS, toDate, isGuest, torontoParts, REGION, SUPER_ADMIN_UID, SPREADSHEET_ID, EMAIL_FROM, EMAIL_REPLY_TO, SITE, INSTAGRAM, WHATSAPP, FAQ };
