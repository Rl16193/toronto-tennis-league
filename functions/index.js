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
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');
const vision = require('@google-cloud/vision');

admin.initializeApp();
const visionClient = new vision.ImageAnnotatorClient();

// Likelihood levels we treat as unsafe.
const UNSAFE = new Set(['LIKELY', 'VERY_LIKELY']);

exports.moderateUploadedImage = onObjectFinalized(
  { region: 'us-central1', memory: '256MiB' },
  async (event) => {
    const filePath = event.data.name || '';
    const isSuggestion = filePath.startsWith('court_suggestions/');
    const isAvatar = filePath.startsWith('avatars/');
    if (!isSuggestion && !isAvatar) return;

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

    // Avatar: on reject, delete the file and clear the user's avatar (reverts to first-letter).
    if (unsafe) {
      const uid = filePath.split('/')[1];
      await admin.storage().bucket(bucketName).file(filePath).delete().catch((e) => logger.error('delete failed', e));
      if (uid) await admin.firestore().doc(`users/${uid}`).update({ avatar: '' }).catch((e) => logger.error('avatar clear failed', e));
    }
  },
);
