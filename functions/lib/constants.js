/**
 * Shared constants for the Cloud Functions. Lives in lib/ for the same reason notify.js does:
 * index.js/notifications.js/taskPoints.js are re-exported wholesale via
 * `Object.assign(exports, require('./x'))`, and the Firebase CLI expects every export it finds
 * there to be a Cloud Function — a plain constant mixed in would break the Firebase deployment bundle.
 */

// Scheduling/formatting timezone for every scheduled function and day-key calculation.
const TZ = 'America/Toronto';

// Deployment region for every trigger.
const REGION = 'us-central1';
const SUPER_ADMIN_UID = '7PvfzNtDmsOq5GLMieId7QRT7wH3';

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

module.exports = { TZ, REGION, SUPER_ADMIN_UID, EMAIL_FROM, EMAIL_REPLY_TO, SITE, INSTAGRAM, WHATSAPP, FAQ };
