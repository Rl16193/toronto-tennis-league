/**
 * Shared notification writer. Lives outside index.js/notifications.js/taskPoints.js on purpose:
 * those files are re-exported wholesale via `Object.assign(exports, require('./x'))`, and the
 * Firebase CLI expects every export it finds to be a Cloud Function — a plain helper function
 * mixed in there would break `firebase deploy`.
 */
const { logger } = require('firebase-functions');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const { Resend } = require('resend');

const db = () => admin.firestore();
const resendApiKey = defineSecret('RESEND_API_KEY');

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

// Best-effort email alongside a notify() call — looks up the recipient's address on `users` and
// their opt-out on `preferences.email_notifications` (missing/undefined = opted in, only an
// explicit `false` skips it), then sends via Resend. Any failure (no email on file, opted out,
// Resend error) is logged/skipped, never thrown, so a broken email never blocks the in-app
// notification it accompanies.
async function sendEmail(uid, subject, html) {
  try {
    const [userDoc, prefsDoc] = await Promise.all([
      db().doc(`users/${uid}`).get(),
      db().doc(`preferences/${uid}`).get(),
    ]);
    const email = userDoc.data()?.email;
    if (!email) return;
    if (prefsDoc.data()?.email_notifications === false) return;
    const resend = new Resend(resendApiKey.value());
    await resend.emails.send({
      from: 'Racquets & Strings <noreply@racquetsandstrings.ca>',
      to: email,
      replyTo: 'events.racquetsandstrings@gmail.com',
      subject,
      html,
    });
  } catch (e) {
    logger.error('sendEmail failed', e);
  }
}

// Idempotent wrapper around sendEmail — Firestore triggers are at-least-once delivery, so the
// same event can fire twice on retry. `dedupeKey` must uniquely identify the event (e.g.
// "challenge-accepted:{challengeId}", or "incomplete-matches:{uid}:{weekKey}" for the scheduled
// digest, which has no source document). The email_log doc's atomic `.create()` (fails if the
// doc already exists) is the guard — no transaction needed, one Firestore write settles it.
async function sendEmailOnce(uid, dedupeKey, subject, html) {
  try {
    await db().collection('email_log').doc(dedupeKey).create({ uid, sent_at: new Date().toISOString() });
  } catch (e) {
    return; // already sent (or already attempted) for this exact event — skip silently
  }
  await sendEmail(uid, subject, html);
}

module.exports = { notify, organizerUids, sendEmail, sendEmailOnce, resendApiKey };
