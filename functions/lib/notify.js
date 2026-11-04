/**
 * Shared notification writer. Lives outside index.js/notifications.js/taskPoints.js on purpose:
 * those files are re-exported wholesale via `Object.assign(exports, require('./x'))`, and the
 * Firebase CLI expects every export it finds to be a Cloud Function — a plain helper function
 * mixed in there would break `firebase deploy`.
 */
const { logger } = require('firebase-functions');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const { FieldValue } = require('firebase-admin/firestore');
const { Resend } = require('resend');
const { htmlToText } = require('./htmlToText');
const { LINK } = require('./emailTemplates');
const { EMAIL_FROM, EMAIL_REPLY_TO, SUPER_ADMIN_UID, isGuest } = require('./constants');
const { emailDeliveryDecision } = require('./emailDelivery');

const db = () => admin.firestore();
const resendApiKey = defineSecret('RESEND_API_KEY');

// The area a notification belongs to, from the specific alert (`type` at the call sites).
const categoryOf = (type) => /^ladder_|^challenge_/.test(type) ? 'challenge' : /^rally_/.test(type) ? 'rally'
  : ['match_advanced', 'draw_published', 'group_assigned', 'reminder_pending_matches', 'match_bye', 'match_scheduled', 'partner_registered'].includes(type) ? 'match'
    : /^partner_pool/.test(type) ? 'partner' : /^task_|^claim_|^initiation_/.test(type) ? 'task' : type === 'group_award_received' ? 'award'
      : /^booking_/.test(type) ? 'booking' : /^reward_/.test(type) ? 'reward' : /^organizer_/.test(type) ? 'organizer' : 'account';

// Writes one notification per recipient, every doc the same shape: category = area, sub_category =
// the specific alert, read_at null until read. Skips blank/duplicate recipients and guests.
async function notify(recipients, payload) {
  const ids = [...new Set((Array.isArray(recipients) ? recipients : [recipients]).filter((u) => u && !isGuest(u)))];
  if (ids.length === 0) return;
  const { type, ...rest } = payload;
  const batch = db().batch();
  const created_at = FieldValue.serverTimestamp();
  ids.forEach((recipient_id) => {
    batch.set(db().collection('notifications').doc(), {
      uid: recipient_id,
      category: categoryOf(type || ''),
      sub_category: type || '',
      title: rest.title || '',
      body: rest.body || '',
      link: rest.link || '',
      counterpart_uid: rest.counterpart_uid || '',
      counterpart_name: rest.counterpart_name || '',
      read_at: null,
      created_at,
    });
  });
  await batch.commit().catch((e) => logger.error('notify failed', e));
}

// Recipients for app-wide organizer work that belongs to no event (claims, bookings, rally
// disputes): the super admin plus every member with the organizer role. Event work goes to that
// event's organizers instead (eventOrganizerUids in roles.js).
async function organizerUids() {
  const snap = await db().collection('providers').where('roles', 'array-contains', 'organizer').get();
  return [...new Set([SUPER_ADMIN_UID, ...snap.docs.map((d) => d.id)])];
}

// Best-effort email alongside a notify() call — looks up the recipient's address on `contacts` and
// their opt-out on `preferences.email_notifications` (missing/undefined = opted in, only an
// explicit `false` skips it), then sends via Resend. Any failure (no email on file, opted out,
// Resend error) is logged/skipped, never thrown, so a broken email never blocks the in-app
// notification it accompanies.
async function sendEmail(uid, subject, html) {
  if (!uid || isGuest(uid)) return;
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
    const decision = emailDeliveryDecision({
      projectId: process.env.GCLOUD_PROJECT || JSON.parse(process.env.FIREBASE_CONFIG || '{}').projectId || '',
      emulator: process.env.FUNCTIONS_EMULATOR === 'true',
    });
    if (!decision.deliver) { logger.info('sendEmail skipped', { reason: decision.reason }); return; }
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

// Kept for its callers' signature. It does NOT deduplicate: the email_log guard was removed, so
// a trigger that fires twice sends twice. `dedupeKey` is ignored.
async function sendEmailOnce(uid, dedupeKey, subject, html) {
  await sendEmail(uid, subject, html);
}

module.exports = { notify, organizerUids, sendEmail, sendEmailOnce, resendApiKey };
