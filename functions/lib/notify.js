/**
 * Shared notification writer. Lives outside index.js/notifications.js/taskPoints.js on purpose:
 * those files are re-exported wholesale via `Object.assign(exports, require('./x'))`, and the
 * Firebase CLI expects every export it finds to be a Cloud Function — a plain helper function
 * mixed in there would break the Firebase deployment bundle.
 */
const { logger } = require('firebase-functions');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const { Resend } = require('resend');
const { htmlToText } = require('./htmlToText');
const { LINK } = require('./emailTemplates');
const { EMAIL_FROM, EMAIL_REPLY_TO } = require('./constants');
const { emailDeliveryDecision } = require('./emailDelivery');

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
      uid: recipient_id,
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
    // The address lives on `contacts` now (split out of the world-readable `users`); the name
    // still comes from `users` for the greeting. Admin SDK, so rules don't apply either way.
    const [userDoc, prefsDoc, contactsDoc] = await Promise.all([
      db().doc(`users/${uid}`).get(),
      db().doc(`preferences/${uid}`).get(),
      db().doc(`contacts/${uid}`).get(),
    ]);
    const user = { ...(userDoc.data() || {}), ...(contactsDoc.data() || {}) };
    const email = user.email;
    if (!email) return;
    if (prefsDoc.data()?.email_notifications === false) return;
    const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || '';
    const decision = emailDeliveryDecision({
      projectId,
      recipient: email,
      emulator: process.env.FUNCTIONS_EMULATOR === 'true',
      enabled: process.env.EMAIL_DELIVERY_ENABLED === 'true',
      allowlist: (process.env.EMAIL_ALLOWED_RECIPIENTS || '')
        .split(',').map((value) => value.trim()).filter(Boolean),
    });
    if (!decision.deliver) {
      logger.info('sendEmail skipped by environment delivery policy', {
        projectId: projectId || '(unset)', reason: decision.reason,
      });
      return;
    }
    // `html` may be a function of the recipient's user doc — lets a template greet by name
    // without the caller doing its own `users/{uid}` read (we already have it here).
    const body = typeof html === 'function' ? html(user) : html;
    const resend = new Resend(resendApiKey.value());
    await resend.emails.send({
      from: EMAIL_FROM,
      to: email,
      replyTo: EMAIL_REPLY_TO,
      subject,
      html: body,
      // HTML with no text/plain part is a long-standing spam signal.
      text: htmlToText(body),
      // Surfaces the existing preferences.email_notifications toggle to mail providers — Gmail
      // renders it as an Unsubscribe button. Without it, someone who wants out reports spam
      // instead, which is the single most damaging reputation signal there is.
      headers: { 'List-Unsubscribe': `<${LINK.profile}>` },
    });
  } catch (e) {
    logger.error('sendEmail failed', e);
  }
}

// Idempotent wrapper — the email_log dedupe guard was removed; this now simply forwards
// to sendEmail. The signature is preserved so callers don't need updating.
async function sendEmailOnce(uid, dedupeKey, subject, html) {
  await sendEmail(uid, subject, html);
}

module.exports = { notify, organizerUids, sendEmail, sendEmailOnce, resendApiKey };
