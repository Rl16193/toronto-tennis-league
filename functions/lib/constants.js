/**
 * Shared constants for the Cloud Functions. Lives in lib/ for the same reason notify.js does:
 * index.js/notifications.js/taskPoints.js are re-exported wholesale via
 * `Object.assign(exports, require('./x'))`, and the Firebase CLI expects every export it finds
 * there to be a Cloud Function — a plain constant mixed in would break `firebase deploy`.
 */

// Scheduling/formatting timezone for every scheduled function and day-key calculation.
const TZ = 'America/Toronto';

// Deployment region for every trigger.
const REGION = 'us-central1';

// Outgoing address for every email. `notifications@` is a real Hostinger mailbox, not a black
// hole — the old `noreply@` was unroutable, which reads badly to spam filters and to people.
const EMAIL_FROM = 'Racquets & Strings <notifications@racquetsandstrings.ca>';

// Replies land in the monitored events mailbox. Previously a gmail.com address, which paired a
// branded From with a free consumer Reply-To — a pattern filters associate with spoofing.
const EMAIL_REPLY_TO = 'events@racquetsandstrings.ca';

module.exports = { TZ, REGION, EMAIL_FROM, EMAIL_REPLY_TO };
