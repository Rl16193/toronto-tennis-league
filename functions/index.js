/**
 * Automated image moderation (Google Cloud Vision SafeSearch).
 *
 * Triggered when an image lands under court_suggestions/** or avatars/**. If the image is
 * likely adult / violent / racy, the object is deleted and the related record is cleaned up:
 *   - court_suggestions/{uid}/… → the matching doc is marked image_status: 'rejected'
 *   - avatars/{uid}/…           → users/{uid}.avatar is cleared (reverts to the first-letter)
 * Clean images are marked 'ok' (suggestions) or left as-is (avatars).
 *
 * Requires: the Cloud Vision API enabled on the project (Blaze plan). Deploy with
 *   firebase deploy --only functions
 * (run `npm install` inside functions/ first).
 */
const { onObjectFinalized } = require('firebase-functions/v2/storage');
const { onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { defineSecret } = require('firebase-functions/params');
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');
const vision = require('@google-cloud/vision');
const { Resend } = require('resend');

admin.initializeApp();
const visionClient = new vision.ImageAnnotatorClient();
const resendApiKey = defineSecret('RESEND_API_KEY');

// Bell-icon notification triggers + scheduled reminders (see notifications.js).
Object.assign(exports, require('./notifications'));

// Server-side points/tiers/badges — awarded regardless of whether the player opens Tasks.
Object.assign(exports, require('./taskPoints'));

// Group / community bonuses — points that unlock from collective activity (see groupAwards.js).
Object.assign(exports, require('./groupAwards'));

// Likelihood levels we treat as unsafe.
const UNSAFE = new Set(['LIKELY', 'VERY_LIKELY']);

exports.moderateUploadedImage = onObjectFinalized(
  { region: 'us-east1', memory: '256MiB' },
  async (event) => {
    const filePath = event.data.name || '';
    const isSuggestion = filePath.startsWith('court_suggestions/');
    const isReport = filePath.startsWith('court_reports/');
    const isAvatar = filePath.startsWith('avatars/');
    if (!isSuggestion && !isReport && !isAvatar) return;

    const bucketName = event.data.bucket;
    let unsafe = false;
    try {
      const [result] = await visionClient.safeSearchDetection(`gs://${bucketName}/${filePath}`);
      const s = result.safeSearchAnnotation || {};
      unsafe = UNSAFE.has(s.adult) || UNSAFE.has(s.violence) || UNSAFE.has(s.racy);
      logger.info('SafeSearch result', { filePath, adult: s.adult, violence: s.violence, racy: s.racy, unsafe });
    } catch (err) {
      // Fail open: leave the image for manual review rather than blocking.
      logger.error('SafeSearch failed', err);
      return;
    }

    if (isSuggestion) {
      const snap = await admin.firestore()
        .collection('court_suggestions')
        .where('image_path', '==', filePath)
        .limit(1)
        .get();
      if (unsafe) {
        await admin.storage().bucket(bucketName).file(filePath).delete().catch((e) => logger.error('delete failed', e));
        if (!snap.empty) await snap.docs[0].ref.update({ image_status: 'rejected', image_path: admin.firestore.FieldValue.delete() });
      } else if (!snap.empty) {
        await snap.docs[0].ref.update({ image_status: 'ok' });
      }
      return;
    }

    // Court task photos (condition / waiting board / queue) — Tasks tab "Submit a Photo" flow.
    // On reject: delete the file and flip the report to rejected (queue photos may already be
    // 'approved' with points awarded — see taskPoints.js's note on this rare edge case).
    if (isReport) {
      const snap = await admin.firestore()
        .collection('court_reports')
        .where('photo_path', '==', filePath)
        .limit(1)
        .get();
      if (unsafe) {
        await admin.storage().bucket(bucketName).file(filePath).delete().catch((e) => logger.error('delete failed', e));
        if (!snap.empty) {
          await snap.docs[0].ref.update({
            status: 'rejected',
            reviewer_note: 'Removed by automatic image check.',
          });
        }
      }
      return;
    }

    // Avatar: on reject, delete the file and clear the user's avatar (reverts to first-letter).
    if (unsafe) {
      const uid = filePath.split('/')[1];
      await admin.storage().bucket(bucketName).file(filePath).delete().catch((e) => logger.error('delete failed', e));
      if (uid) {
        await admin.firestore().doc(`users/${uid}`).update({ avatar: '' }).catch((e) => logger.error('avatar clear failed', e));
        // Tell them — otherwise the photo just silently disappears.
        await admin.firestore().collection('notifications').add({
          recipient_id: uid,
          type: 'photo_removed',
          title: 'Your profile photo was removed',
          body: 'It didn’t pass our automatic image check. Please upload a different photo.',
          link: '/profile',
          read: false,
          created_at: new Date().toISOString(),
        }).catch((e) => logger.error('notify failed', e));
      }
    }
  },
);

// ─── Welcome email (Resend) ──────────────────────────────────────────────────
// Fires when users/{uid}.welcomeEmailSent flips false/absent → true (written once by the app
// after the user verifies their email). Sends a single welcome email. Never throws — a throw
// would make the trigger retry on every subsequent update.

exports.sendWelcomeEmail = onDocumentUpdated(
  { document: 'users/{uid}', region: 'us-central1', secrets: [resendApiKey] },
  async (event) => {
    const before = event.data.before.data() || {};
    const after = event.data.after.data() || {};

    // Only on the first transition to true.
    if (before.welcomeEmailSent === true || after.welcomeEmailSent !== true) return;

    const email = after.email;
    if (!email) return;
    const firstName = (after.name || '').split(' ')[0] || 'there';

    try {
      const resend = new Resend(resendApiKey.value());
      await resend.emails.send({
        from: 'Racquets & Strings <noreply@racquetsandstrings.ca>',
        to: email,
        subject: 'Welcome to Racquets & Strings 🎾',
        html: buildWelcomeEmail(firstName),
      });
      logger.info('Welcome email sent', { email });
    } catch (err) {
      logger.error('Failed to send welcome email:', err);
    }
  },
);

function buildWelcomeEmail(firstName) {
  // Design finalized in the Resend dashboard and exported here. `${firstName}` is the only
  // dynamic token; all links are hard-coded. Resend transactional send has no templateId, so
  // this HTML is the source of truth for the welcome email.
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd"><html dir="ltr" lang="en"><head><meta content="width=device-width" name="viewport"/><meta content="text/html; charset=UTF-8" http-equiv="Content-Type"/><meta name="x-apple-disable-message-reformatting"/><meta content="IE=edge" http-equiv="X-UA-Compatible"/><meta name="x-apple-disable-message-reformatting"/><meta content="telephone=no,address=no,email=no,date=no,url=no" name="format-detection"/><title>Get ready to play with these quick next steps.</title><style>@media (prefers-color-scheme: dark){li::marker{color:#c4c4c4}}</style><style>@media (prefers-color-scheme: dark){li::marker{color:#c4c4c4}}</style></head><body dir="ltr" lang="en" style="background-color:#f4f4f4;margin:0;padding:0"><!--$--><!--html--><!--head--><div style="display:none;overflow:hidden;line-height:1px;opacity:0;max-height:0;max-width:0" data-skip-in-text="true">Get ready to play with these quick next steps.<div> ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿ ‌‍‎‏﻿</div></div><!--body--><table border="0" width="100%" cellPadding="0" cellSpacing="0" role="presentation" align="center"><tbody><tr><td dir="ltr" lang="en" align="center" style="background-color:#f4f4f4;width:100%"><table align="center" width="100%" border="0" cellPadding="0" cellSpacing="0" role="presentation" style="max-width:600px;margin:0 auto;width:100%;color:#000000;background-color:transparent;border-radius:0px;border-color:#000000"><tbody><tr style="width:100%"><td style="padding-top:0px;padding-right:0px;padding-bottom:0px;padding-left:0px"><div style="margin:0;padding:0;display:none;overflow:hidden;line-height:1px;opacity:0;max-height:0;max-width:0"><p style="margin:0;padding:0">Get ready to play with these quick next steps.</p></div><table align="center" width="100%" border="0" cellPadding="0" cellSpacing="0" role="presentation" style="margin-top:0;margin-right:auto;margin-bottom:0;margin-left:auto;padding-top:0;padding-right:0;padding-bottom:0;padding-left:0"><tbody><tr style="margin:0;padding:0"><td data-id="__react-email-column" style="margin:0;padding:0;background-color:#f4f4f4"><table align="center" width="100%" border="0" cellPadding="0" cellSpacing="0" role="presentation" style="max-width:600px;margin:0 auto;width:100%;color:#000000;background-color:transparent;border-radius:0px;border-color:#000000"><tbody><tr style="width:100%"><td style="padding-top:0px;padding-right:0px;padding-bottom:0px;padding-left:0px"><table width="100%" border="0" cellPadding="0" cellSpacing="0" role="presentation" style="margin-top:0;margin-right:0;margin-bottom:0;margin-left:0;padding-top:32px;padding-right:16px;padding-bottom:32px;padding-left:16px;background-color:#f4f4f4"><tbody><tr style="margin:0;padding:0"><td align="center" data-id="__react-email-column" style="margin:0;padding:0"><table align="center" width="600" border="0" cellPadding="0" cellSpacing="0" role="presentation" style="margin-top:0;margin-right:auto;margin-bottom:0;margin-left:auto;padding-top:0;padding-right:0;padding-bottom:0;padding-left:0;max-width:600px;width:100%;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.10)"><tbody><tr style="margin:0;padding:0"><td align="center" data-id="__react-email-column" style="margin:0;padding:40px 40px 32px;background-color:#1B4332;text-align:center"><p style="margin:0 0 8px 0;padding:0;color:#84CC9A;font-size:11px;letter-spacing:4px;text-transform:uppercase;font-weight:bold;font-family:Arial,Helvetica,sans-serif;text-align:center">Toronto&#x27;s Tennis Community</p><h1 style="margin:0;padding:0;text-align:center;font-family:Arial,Helvetica,sans-serif;font-size:30px;font-weight:bold;letter-spacing:0.5px"><span style="color:#C0622A"><span style="text-transform:uppercase">Racquets &amp; Strings</span></span></h1></td></tr><tr style="margin:0;padding:0"><td data-id="__react-email-column" style="margin:0;padding:40px 40px 8px"><h2 style="margin:0 0 14px 0;padding:0;color:#1B4332;font-size:24px;font-weight:bold;font-family:Arial,Helvetica,sans-serif">You&#x27;re in, ${firstName}! <!-- -->🎾</h2><p style="margin:0;padding:0;color:#444444;font-size:15px;line-height:1.75;font-family:Arial,Helvetica,sans-serif">Your email is verified and you&#x27;re officially part of Toronto&#x27;s fastest-growing tennis community. Here&#x27;s everything you need to get started.</p></td></tr><tr style="margin:0;padding:0"><td data-id="__react-email-column" style="margin:0;padding:28px 40px 8px"><h3 style="margin:0 0 20px 0;padding:0;color:#1B4332;font-size:13px;text-transform:uppercase;letter-spacing:2px;font-weight:bold;font-family:Arial,Helvetica,sans-serif">Beginner Package</h3><table width="100%" border="0" cellPadding="0" cellSpacing="0" role="presentation" style="margin-top:0;margin-right:0;margin-bottom:18px;margin-left:0;padding-top:0;padding-right:0;padding-bottom:0;padding-left:0"><tbody><tr style="margin:0;padding:0"><td data-id="__react-email-column" style="margin:0;padding:0;width:36px;vertical-align:top;padding-top:1px"><div style="margin:0;padding:0;width:30px;height:30px;background-color:#C0622A;border-radius:50%;color:#ffffff;font-size:13px;font-weight:bold;text-align:center;line-height:30px;font-family:Arial,Helvetica,sans-serif"><p style="margin:0;padding:0">1</p></div></td><td data-id="__react-email-column" style="margin:0;padding:0;padding-left:14px;vertical-align:top"><p style="margin:0 0 4px 0;padding:0;color:#1B4332;font-size:15px;font-weight:bold;font-family:Arial,Helvetica,sans-serif">Complete your profile</p><p style="margin:0;padding:0;color:#555555;font-size:14px;line-height:1.6;font-family:Arial,Helvetica,sans-serif">Add your skill level, court preferences, and availability so we can match you with the right opponent.</p></td></tr></tbody></table><table width="100%" border="0" cellPadding="0" cellSpacing="0" role="presentation" style="margin-top:0;margin-right:0;margin-bottom:18px;margin-left:0;padding-top:0;padding-right:0;padding-bottom:0;padding-left:0"><tbody><tr style="margin:0;padding:0"><td data-id="__react-email-column" style="margin:0;padding:0;width:36px;vertical-align:top;padding-top:1px"><div style="margin:0;padding:0;width:30px;height:30px;background-color:#C0622A;border-radius:50%;color:#ffffff;font-size:13px;font-weight:bold;text-align:center;line-height:30px;font-family:Arial,Helvetica,sans-serif"><p style="margin:0;padding:0">2</p></div></td><td data-id="__react-email-column" style="margin:0;padding:0;padding-left:14px;vertical-align:top"><p style="margin:0 0 4px 0;padding:0;color:#1B4332;font-size:15px;font-weight:bold;font-family:Arial,Helvetica,sans-serif">Browse open events</p><p style="margin:0;padding:0;color:#555555;font-size:14px;line-height:1.6;font-family:Arial,Helvetica,sans-serif">The Summer Gauntlet is live right now. Free entry, all skill levels welcome. Sign up before July 25th.</p></td></tr></tbody></table><table width="100%" border="0" cellPadding="0" cellSpacing="0" role="presentation" style="margin-top:0;margin-right:0;margin-bottom:18px;margin-left:0;padding-top:0;padding-right:0;padding-bottom:0;padding-left:0"><tbody><tr style="margin:0;padding:0"><td data-id="__react-email-column" style="margin:0;padding:0;width:36px;vertical-align:top;padding-top:1px"><div style="margin:0;padding:0;width:30px;height:30px;background-color:#C0622A;border-radius:50%;color:#ffffff;font-size:13px;font-weight:bold;text-align:center;line-height:30px;font-family:Arial,Helvetica,sans-serif"><p style="margin:0;padding:0">3</p></div></td><td data-id="__react-email-column" style="margin:0;padding:0;padding-left:14px;vertical-align:top"><p style="margin:0 0 4px 0;padding:0;color:#1B4332;font-size:15px;font-weight:bold;font-family:Arial,Helvetica,sans-serif">Read the rules</p><p style="margin:0;padding:0;color:#555555;font-size:14px;line-height:1.6;font-family:Arial,Helvetica,sans-serif">Understand how scoring and advancement work before your first match.</p></td></tr></tbody></table><table width="100%" border="0" cellPadding="0" cellSpacing="0" role="presentation" style="margin-top:0;margin-right:0;margin-bottom:18px;margin-left:0;padding-top:0;padding-right:0;padding-bottom:0;padding-left:0"><tbody><tr style="margin:0;padding:0"><td data-id="__react-email-column" style="margin:0;padding:0;width:36px;vertical-align:top;padding-top:1px"><div style="margin:0;padding:0;width:30px;height:30px;background-color:#C0622A;border-radius:50%;color:#ffffff;font-size:13px;font-weight:bold;text-align:center;line-height:30px;font-family:Arial,Helvetica,sans-serif"><p style="margin:0;padding:0">4</p></div></td><td data-id="__react-email-column" style="margin:0;padding:0;padding-left:14px;vertical-align:top"><p style="margin:0 0 4px 0;padding:0;color:#1B4332;font-size:15px;font-weight:bold;font-family:Arial,Helvetica,sans-serif">Join the WhatsApp community</p><p style="margin:0;padding:0;color:#555555;font-size:14px;line-height:1.6;font-family:Arial,Helvetica,sans-serif">Stay updated on events, find hitting partners.</p></td></tr></tbody></table><table width="100%" border="0" cellPadding="0" cellSpacing="0" role="presentation" style="margin-top:0;margin-right:0;margin-bottom:4px;margin-left:0;padding-top:0;padding-right:0;padding-bottom:0;padding-left:0"><tbody><tr style="margin:0;padding:0"><td data-id="__react-email-column" style="margin:0;padding:0;width:36px;vertical-align:top;padding-top:1px"><div style="margin:0;padding:0;width:30px;height:30px;background-color:#cccccc;border-radius:50%;color:#ffffff;font-size:13px;font-weight:bold;text-align:center;line-height:30px;font-family:Arial,Helvetica,sans-serif"><p style="margin:0;padding:0">5</p></div></td><td data-id="__react-email-column" style="margin:0;padding:0;padding-left:14px;vertical-align:top"><table border="0" cellPadding="0" cellSpacing="0" role="presentation" style="margin-top:0;margin-right:0;margin-bottom:0;margin-left:0;padding-top:0;padding-right:0;padding-bottom:0;padding-left:0"><tbody><tr style="margin:0;padding:0"><td data-id="__react-email-column" style="margin:0;padding:0;vertical-align:middle"><p style="margin:0;padding:0;color:#999999;font-size:15px;font-weight:bold;font-family:Arial,Helvetica,sans-serif">Tell us about your local court</p></td><td data-id="__react-email-column" style="margin:0;padding:0;padding-left:8px;vertical-align:middle"><p style="margin:0;padding:0"><span style="color:#999999"><span style="text-transform:uppercase">Coming Soon</span></span></p></td></tr></tbody></table><p style="margin:4px 0 0 0;padding:0;color:#aaaaaa;font-size:14px;line-height:1.6;font-family:Arial,Helvetica,sans-serif">Suggest an improvement or complete a task to support our initiatives.</p></td></tr></tbody></table></td></tr><tr style="margin:0;padding:0"><td align="center" data-id="__react-email-column" style="margin:0;padding:32px 40px 36px;text-align:center;border-top:1px solid #eeeeee"><p style="margin:0 0 22px 0;padding:0;color:#444444;font-size:15px;font-family:Arial,Helvetica,sans-serif">Everything you need, right here:</p><table border="0" cellPadding="0" cellSpacing="0" role="presentation" style="margin-top:0;margin-right:auto;margin-bottom:10px;margin-left:auto;padding-top:0;padding-right:0;padding-bottom:0;padding-left:0"><tbody><tr style="margin:0;padding:0"><td data-id="__react-email-column" style="margin:0;padding:0 5px"><p style="margin:0;padding:0"><a href="https://www.racquetsandstrings.ca/events" rel="noopener noreferrer nofollow" style="color:#ffffff;text-decoration-line:none;text-decoration:none;display:inline-block;background-color:#C0622A;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;padding:14px 32px;border-radius:10px;letter-spacing:0.3px" target="_blank"> Browse Events</a></p></td></tr></tbody></table><table border="0" cellPadding="0" cellSpacing="0" role="presentation" style="margin-top:0;margin-right:auto;margin-bottom:0;margin-left:auto;padding-top:0;padding-right:0;padding-bottom:0;padding-left:0"><tbody><tr style="margin:0;padding:0"><td data-id="__react-email-column" style="margin:0;padding:0 5px"><p style="margin:0;padding:0"><a href="https://chat.whatsapp.com/Bh7OVww9e08GP4TuoFF5NX" rel="noopener noreferrer nofollow" style="color:#ffffff;text-decoration-line:none;text-decoration:none;display:inline-block;background-color:#25D366;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;padding:14px 22px;border-radius:10px;letter-spacing:0.3px" target="_blank"> Join WhatsApp</a></p></td><td data-id="__react-email-column" style="margin:0;padding:0 5px"><p style="margin:0;padding:0"><a href="https://docs.google.com/document/d/17lyP5f62iuXRIiwDtrcn4EZo6vnx0jbr87kxdkEIzYY/edit?tab=t.0" rel="noopener noreferrer nofollow" style="color:#ffffff;text-decoration-line:none;text-decoration:none;display:inline-block;background-color:#1B4332;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;padding:14px 22px;border-radius:10px;letter-spacing:0.3px" target="_blank"> View FAQ</a></p></td></tr></tbody></table></td></tr><tr style="margin:0;padding:0"><td data-id="__react-email-column" style="margin:0;padding:0 40px 36px"><table width="100%" border="0" cellPadding="0" cellSpacing="0" role="presentation" style="margin-top:0;margin-right:0;margin-bottom:0;margin-left:0;padding-top:0;padding-right:0;padding-bottom:0;padding-left:0;background-color:#f0f7f3;border-radius:12px;border-left:4px solid #C0622A;overflow:hidden"><tbody><tr style="margin:0;padding:0"><td data-id="__react-email-column" style="margin:0;padding:20px 24px"><p style="margin:0 0 8px 0;padding:0;color:#1B4332;font-size:13px;font-weight:bold;text-transform:uppercase;letter-spacing:1.5px;font-family:Arial,Helvetica,sans-serif">🏆<!-- --> Community Points (Coming Soon!!)</p><p style="margin:0;padding:0;color:#444444;font-size:14px;line-height:1.7;font-family:Arial,Helvetica,sans-serif">A rewards system. Another way to win prizes. Complete your profile, participate in events, and finish tasks to earn community points. Unlock awards!!</p></td></tr></tbody></table></td></tr><tr style="margin:0;padding:0"><td align="center" data-id="__react-email-column" style="margin:0;padding:24px 40px;background-color:#f9f9f9;text-align:center;border-top:1px solid #eeeeee"><p style="margin:0 0 6px 0;padding:0;color:#999999;font-size:12px;line-height:1.6;font-family:Arial,Helvetica,sans-serif;text-align:center">Racquets &amp; Strings · Toronto, ON</p><p style="margin:0 0 10px 0;padding:0;text-align:center"><a href="https://www.racquetsandstrings.ca" rel="noopener noreferrer nofollow" style="color:#C0622A;text-decoration-line:none;text-decoration:none;font-size:12px;font-family:Arial,Helvetica,sans-serif" target="_blank">www.racquetsandstrings.ca</a></p><p style="margin:0;padding:0;color:#bbbbbb;font-size:11px;line-height:1.6;font-family:Arial,Helvetica,sans-serif;text-align:center">You&#x27;re receiving this because you signed up with Racquets &amp; Strings.</p></td></tr></tbody></table></td></tr></tbody></table></td></tr></tbody></table></td></tr></tbody></table></td></tr></tbody></table></td></tr></tbody></table><!--/$--></body></html>`;
}
