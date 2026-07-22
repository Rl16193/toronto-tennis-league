/**
 * Shared notification writer. Lives outside index.js/notifications.js/taskPoints.js on purpose:
 * those files are re-exported wholesale via `Object.assign(exports, require('./x'))`, and the
 * Firebase CLI expects every export it finds to be a Cloud Function — a plain helper function
 * mixed in there would break `firebase deploy`.
 */
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');

const db = () => admin.firestore();

// Writes one notification per recipient. Skips blank/duplicate recipients so a trigger can
// safely pass multiple people (e.g. both match players) in one call.
async function notify(recipients, payload) {
  const ids = [...new Set((Array.isArray(recipients) ? recipients : [recipients]).filter(Boolean))];
  if (ids.length === 0) return;
  const batch = db().batch();
  const created_at = new Date().toISOString();
  ids.forEach((recipient_id) => {
    batch.set(db().collection('notifications').doc(), {
      recipient_id,
      read: false,
      created_at,
      ...payload,
    });
  });
  await batch.commit().catch((e) => logger.error('notify failed', e));
}

// All uids with organizer rights (super admin is handled separately client-side; this covers
// every account with preferences.event_creator === true).
async function organizerUids() {
  const snap = await db().collection('preferences').where('event_creator', '==', true).get();
  return snap.docs.map((d) => d.id);
}

module.exports = { notify, organizerUids };
