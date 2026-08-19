/**
 * Automated image moderation (Google Cloud Vision SafeSearch).
 */
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onObjectFinalized } = require('firebase-functions/v2/storage');
const { onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { defineSecret } = require('firebase-functions/params');
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');
const vision = require('@google-cloud/vision');
const { Resend } = require('resend');
const path = require('path');
// The welcome email shares its shell with the rally/challenge/digest templates.
const { LINK, buildWelcomeEmail } = require('./lib/emailTemplates');
const { htmlToText } = require('./lib/htmlToText');
const { EMAIL_FROM, EMAIL_REPLY_TO } = require('./lib/constants');
const { safeId } = require('./lib/logging');

admin.initializeApp();

// Lazy-load Vision client to prevent initialization timeouts
let visionClient;
const resendApiKey = defineSecret('RESEND_API_KEY');

// Bell-icon notification triggers + scheduled reminders
Object.assign(exports, require('./notifications'));

// Server-side points/tiers/badges
Object.assign(exports, require('./taskPoints'));

// Group / community bonuses
Object.assign(exports, require('./groupAwards'));

// Weekly ranking snapshot + public site_stats counters (was a manual script)
Object.assign(exports, require('./rankSnapshot'));

// Redeemable points: redeem / mark used / flag / cancellation review
Object.assign(exports, require('./rewards'));

// Per-court player counts for the public /courts page (replaces three full-collection reads
// that ran in the browser on every visit)
Object.assign(exports, require('./courtCounts'));

// Signup email gate — runs before anyone is signed in, so it can't query the (now sign-in gated)
// contacts collection from the browser.
Object.assign(exports, require('./accountLookup'));

// Server-authoritative tournament results, statistics, points, and advancement.
Object.assign(exports, require('./tournamentResults'));

// Opponent connections — gates who may read whose contacts/{uid} doc.
Object.assign(exports, require('./connections'));

// Admin dashboard metrics (Sun + Wed) — Firestore doc, Google Sheets tabs, BigQuery history.
Object.assign(exports, require('./adminMetrics'));

// Friendly (rally) match points — paid when a second party confirms the reported score.
Object.assign(exports, require('./friendlyPoints'));

// Profile zone changes — takes the member out of a live draw belonging to the zone they left.
Object.assign(exports, require('./zoneMoves'));

// Likelihood levels we treat as unsafe.
const UNSAFE = new Set(['LIKELY', 'VERY_LIKELY']);

exports.moderateUploadedImage = onObjectFinalized(
  { region: 'us-east1', memory: '256MiB' },
  async (event) => {
    const filePath = event.data.name || '';
    const isSuggestion = filePath.startsWith('court_suggestions/');
    const isReport = filePath.startsWith('court_reports/');
    const isAvatar = filePath.startsWith('avatars/');
    const isListing = filePath.startsWith('listings/');
    if (!isSuggestion && !isReport && !isAvatar && !isListing) return;

    if (!visionClient) {
      visionClient = new vision.ImageAnnotatorClient();
    }

    const bucketName = event.data.bucket;
    let unsafe;
    try {
      const [result] = await visionClient.safeSearchDetection(`gs://${bucketName}/${filePath}`);
      const s = result.safeSearchAnnotation || {};
      unsafe = UNSAFE.has(s.adult) || UNSAFE.has(s.violence) || UNSAFE.has(s.racy);
      logger.info('SafeSearch result', {
        file: safeId(filePath), adult: s.adult, violence: s.violence, racy: s.racy, unsafe,
      });
    } catch (err) {
      logger.error('SafeSearch failed', err);
      return;
    }

    if (isSuggestion) {
      // Legacy "Suggest an Improvement" docs were folded into the consolidated `courts`
      // collection (type 'condition'); match them by their single image_path field.
      const snap = await admin.firestore()
        .collection('courts')
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

    if (isReport) {
      // A report can carry multiple photos (photo_paths array). The note is the substantive
      // content now (photos are optional evidence) — an unsafe photo just gets pulled from the
      // report, it no longer rejects the whole thing (points already awarded on the note stand).
      const snap = await admin.firestore()
        .collection('courts')
        .where('photo_paths', 'array-contains', filePath)
        .limit(1)
        .get();
      if (unsafe) {
        await admin.storage().bucket(bucketName).file(filePath).delete().catch((e) => logger.error('delete failed', e));
        if (!snap.empty) {
          await snap.docs[0].ref.update({
            photo_paths: admin.firestore.FieldValue.arrayRemove(filePath),
            photo_moderation_note: 'A photo on this report was removed by our automatic image check.',
          });
        }
      }
      return;
    }

    if (isListing) {
      // Marketplace photos are optional decoration on a listing whose text carries the offer,
      // so an unsafe image is pulled from the listing rather than deleting the whole post.
      if (unsafe) {
        await admin.storage().bucket(bucketName).file(filePath).delete().catch((e) => logger.error('delete failed', e));
        const snap = await admin.firestore()
          .collection('listings')
          .where('photo_paths', 'array-contains', filePath)
          .limit(1)
          .get();
        if (!snap.empty) {
          await snap.docs[0].ref.update({
            photo_paths: admin.firestore.FieldValue.arrayRemove(filePath),
            photo_moderation_note: 'A photo on this listing was removed by our automatic image check.',
          });
        }
        const uid = filePath.split('/')[1];
        if (uid) {
          await admin.firestore().collection('notifications').add({
            uid: uid,
            type: 'photo_removed',
            title: 'A listing photo was removed',
            body: 'It didn’t pass our automatic image check. Please upload a different photo.',
            link: '/marketplace',
            read: false,
            created_at: new Date().toISOString(),
          }).catch((e) => logger.error('notify failed', e));
        }
      }
      return;
    }

    if (unsafe) {
      const uid = filePath.split('/')[1];
      await admin.storage().bucket(bucketName).file(filePath).delete().catch((e) => logger.error('delete failed', e));
      if (uid) {
        await admin.firestore().doc(`users/${uid}`).update({ avatar: '' }).catch((e) => logger.error('avatar clear failed', e));
        await admin.firestore().collection('notifications').add({
          uid: uid,
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

exports.sendWelcomeEmail = onDocumentUpdated(
  { document: 'users/{uid}', region: 'us-central1', secrets: [resendApiKey] },
  async (event) => {
    const before = event.data.before.data() || {};
    const after = event.data.after.data() || {};

    if (before.welcomeEmailSent === true || after.welcomeEmailSent !== true) return;

    // Still triggered by the users doc (that's where welcomeEmailSent flips), but the address is
    // read from contacts/{uid} — email moved off `users` when contact details were split out.
    const contactsSnap = await admin.firestore().doc(`contacts/${event.params.uid}`).get();
    const email = contactsSnap.exists ? contactsSnap.data().email : '';
    if (!email) return;
    const firstName = (after.name || '').split(' ')[0] || 'there';

    try {
      const resend = new Resend(resendApiKey.value());
      const welcomeHtml = buildWelcomeEmail(firstName);
      await resend.emails.send({
        from: EMAIL_FROM,
        to: email,
        replyTo: EMAIL_REPLY_TO,
        subject: 'Welcome to Racquets & Strings 🎾',
        html: welcomeHtml,
        text: htmlToText(welcomeHtml),
        headers: { 'List-Unsubscribe': `<${LINK.profile}>` },
      });
      logger.info('Welcome email sent', { recipient: safeId(email.trim().toLowerCase()) });
    } catch (err) {
      logger.error('Failed to send welcome email:', err);
    }
  },
);


// ─── Google Sheets Weekly Sync (Saturdays, midnight America/Toronto) ──────
const SPREADSHEET_ID = '1RpEowUk-fN08Y-zpZwIWL5XVbDESc7L_ZYRoUcbHkvI';

// Export-only mirror of the real collections. Field names are the actual Firestore fields (the
// header row upper-cases them). Adjust the `fields` lists to add/remove columns.
const COLLECTION_MAP = [
  // `email`/`phone` moved to the `contacts` collection; this tab now exports the public profile
  // only. Re-adding contact columns would mean joining contacts/{uid} here and re-exporting PII
  // to a spreadsheet whose sharing lives outside this repo — a deliberate omission.
  { collection: 'users', sheetTab: 'Players', fields: ['name', 'avatar'] },
  {
    collection: 'matches', sheetTab: 'Matches',
    fields: [
      'player_1_name', 'player_2_name',
      'set_1_player_1', 'set_1_player_2', 'set_2_player_1', 'set_2_player_2', 'set_3_player_1', 'set_3_player_2',
      'status', 'round',
    ],
    where: ['category', 'in', ['singles', 'doubles']],
  },
  {
    collection: 'matches', sheetTab: 'Challenges',
    fields: ['player_1_name', 'player_2_name', 'winner_name', 'set_1_player_1', 'set_1_player_2', 'set_2_player_1', 'set_2_player_2', 'set_3_player_1', 'set_3_player_2', 'status', 'division'],
    where: ['category', '==', 'challenge'],
  },
];

exports.syncFirestoreAndSheets = onSchedule(
  { schedule: '0 0 * * 6', timeZone: 'America/Toronto', region: 'us-central1' },
  async (_event) => {
  const { google } = require('googleapis');

  const auth = new google.auth.GoogleAuth({
    keyFile: path.join(__dirname, 'service-account-key-gs.json'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const sheets = google.sheets({ version: 'v4', auth });

  // Ensure every configured tab exists first. A missing tab makes values.update fail with
  // "Unable to parse range: <Tab>!A1" — the HTTP 500 the Cloud Scheduler job was hitting — and
  // because it throws on the first collection, nothing else syncs either. Creating any absent
  // tabs up front makes the sync self-healing if a tab is renamed or deleted.
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const existingTabs = new Set((meta.data.sheets || []).map((s) => s.properties.title));
  const missingTabs = [...new Set(COLLECTION_MAP.map((c) => c.sheetTab))].filter((t) => !existingTabs.has(t));
  if (missingTabs.length > 0) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      resource: { requests: missingTabs.map((title) => ({ addSheet: { properties: { title } } })) },
    });
    logger.info(`Created missing sheet tab(s): ${missingTabs.join(', ')}.`);
  }

  for (const config of COLLECTION_MAP) {
    const { collection, sheetTab, fields, where: wh } = config;
    // Isolate each collection so one bad tab/collection can't fail the whole scheduled job.
    try {

    // 1. FIRESTORE -> GOOGLE SHEETS
    let collRef = admin.firestore().collection(collection);
    if (wh) {
      collRef = collRef.where(...wh);
    }
    const snapshot = await collRef.get();
    const rows = [['Document ID', ...fields.map((f) => f.toUpperCase())]];

    snapshot.forEach((doc) => {
      const data = doc.data();
      const rowData = [doc.id];

      fields.forEach((field) => {
        let value = data[field] || '';
        // Render image-URL fields (avatar/photo/image) as an inline image in the sheet.
        if (/(image|avatar|photo)/i.test(field) && value) {
          value = `=IMAGE("${value}")`;
        }
        rowData.push(value);
      });

      rows.push(rowData);
    });

    // Export-only: clear the tab first so rows for deleted docs don't linger, then write fresh.
    await sheets.spreadsheets.values.clear({ spreadsheetId: SPREADSHEET_ID, range: `${sheetTab}!A:Z` });
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheetTab}!A1`,
      valueInputOption: 'USER_ENTERED',
      resource: { values: rows },
    });

    logger.info(`Exported ${snapshot.size} doc(s) from "${collection}" to sheet tab "${sheetTab}".`);

    } catch (err) {
      // Log and move on — a single collection's failure shouldn't 500 the whole job.
      logger.error(`Sync failed for collection "${collection}" / tab "${sheetTab}":`, err);
    }
  }
});
