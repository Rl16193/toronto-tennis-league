/**
 * Automated image moderation (Google Cloud Vision SafeSearch).
 */
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onObjectFinalized } = require('firebase-functions/v2/storage');
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');
const { FieldValue, Timestamp } = require('firebase-admin/firestore');
const vision = require('@google-cloud/vision');
const path = require('path');
// The welcome email shares its shell with the rally/challenge templates, and goes out
// through the same sender as every other email (lib/notify.js), like Racquets-And-Strings.
const { buildWelcomeEmail } = require('./lib/emailTemplates');
const { notify, sendEmail, resendApiKey } = require('./lib/notify');
const { SPREADSHEET_ID, REGION, TZ } = require('./lib/constants');

admin.initializeApp();

// Lazy-load Vision client to prevent initialization timeouts
let visionClient;

// Bell-icon notification triggers + scheduled reminders
Object.assign(exports, require('./notifications'));

// Server-side points/tiers/badges
Object.assign(exports, require('./taskPoints'));

// Group / community bonuses
Object.assign(exports, require('./groupAwards'));

// Weekly ranking snapshot + public site_stats counters
Object.assign(exports, require('./rankSnapshot'));

// Redeemable points: redeem / mark used / flag / cancellation review
Object.assign(exports, require('./rewards'));

// Service bookings: book at the regular price, then each step of the job
Object.assign(exports, require('./bookings'));

// Per-court player counts for the public /courts page (replaces three full-collection reads
// that ran in the browser on every visit)
Object.assign(exports, require('./courtCounts'));

// Signup email gate — runs before anyone is signed in, so it can't query the (now sign-in gated)
// contacts collection from the browser.
Object.assign(exports, require('./accountLookup'));

// Opponent connections — gates who may read whose contacts/{uid} doc.
Object.assign(exports, require('./connections'));

// Admin dashboard metrics (Sun + Wed) — Firestore doc, Google Sheets tabs, BigQuery history.
Object.assign(exports, require('./adminMetrics'));

// Scoring: the one scoreMatch call (record, settle, reset, cancel, group bonus) for every match
// type. All points go through lib/scoring.js's single writer; a played final marks its event over.
Object.assign(exports, require('./scoring'));

// Registration: entry recount, member-partner registration, doubles partner pool.
Object.assign(exports, require('./participantWorkflow'));

// Zone changes — gives up opponent-less old-zone seats and alerts the organizers of live tournaments.
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
    let unsafe = false;
    try {
      const [result] = await visionClient.safeSearchDetection(`gs://${bucketName}/${filePath}`);
      const s = result.safeSearchAnnotation || {};
      unsafe = UNSAFE.has(s.adult) || UNSAFE.has(s.violence) || UNSAFE.has(s.racy);
      logger.info('SafeSearch result', { filePath, adult: s.adult, violence: s.violence, racy: s.racy, unsafe });
    } catch (err) {
      logger.error('SafeSearch failed', err);
      return;
    }

    if (isReport || isSuggestion) {
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
            photo_paths: FieldValue.arrayRemove(filePath),
            updated_at: Timestamp.now(),
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
            photo_paths: FieldValue.arrayRemove(filePath),
            updated_at: Timestamp.now(),
          });
        }
        await notify(filePath.split('/')[1], {
          type: 'photo_removed',
          title: 'A listing photo was removed',
          body: 'It didn’t pass our automatic image check. Please upload a different photo.',
          link: '/marketplace',
        });
      }
      return;
    }

    if (unsafe) {
      const uid = filePath.split('/')[1];
      await admin.storage().bucket(bucketName).file(filePath).delete().catch((e) => logger.error('delete failed', e));
      if (uid) {
        await admin.firestore().doc(`users/${uid}`).update({ avatar: '' }).catch((e) => logger.error('avatar clear failed', e));
        await notify(uid, {
          type: 'photo_removed',
          title: 'Your profile photo was removed',
          body: 'It didn’t pass our automatic image check. Please upload a different photo.',
          link: '/profile',
        });
      }
    }
  },
);

// Sent once, when the member's public profile is first created (the welcomeEmailSent/isVerified flags
// retired with v3). sendEmail reads the address from contacts/{uid} and honours the email opt-out.
exports.sendWelcomeEmail = onDocumentCreated(
  { document: 'users/{uid}', region: REGION, secrets: [resendApiKey] },
  async (event) => {
    const after = event.data.data() || {};
    const firstName = (after.name || '').split(' ')[0] || 'there';
    await sendEmail(event.params.uid, 'Welcome to Racquets & Strings 🎾', buildWelcomeEmail(firstName));
  },
);


// ─── Google Sheets Weekly Sync (Saturdays, midnight America/Toronto) ──────

// Export-only mirror: one tab per collection, every field, rewritten each run (edits in these tabs
// are wiped; work in other tabs). `contacts` and the archives are not exported. The mailing list and
// volunteer sign-ups go out with their emails, so the sheet's sharing must stay organizer-only.
const SHEET_COLLECTIONS = [
  'users', 'stats', 'preferences', 'providers', 'events', 'event_participants', 'matches', 'submissions',
  'awards', 'league_seasons', 'courts', 'services', 'bookings', 'listings', 'task_claims', 'notifications',
  'connections', 'public_contacts', 'mailing_list', 'volunteer_signups', 'site_stats', 'admin_stats',
].map((name) => ({ tab: name, read: (db) => db.collection(name).get() }))
  .concat([
    { tab: 'rr_drafts', read: (db) => db.collectionGroup('rr_drafts').get() },
    { tab: 'ranking_history', read: (db) => db.collectionGroup('entries').get(), under: 'ranking_history' },
  ]);
const SHEET_LEAD = ['uid', 'name', 'user_name', 'title', 'category', 'sub_category', 'status'];
const CELL_MAX = 49000; // Sheets caps a cell at 50,000 characters

// A Firestore value as one readable cell: dates in Toronto time, lists joined, maps as JSON.
const sheetCell = (v) => {
  const plain = (x) => (x && typeof x.toDate === 'function' ? x.toDate().toLocaleString('sv-SE', { timeZone: TZ }).slice(0, 16)
    : Array.isArray(x) ? x.map(plain) : x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).map(([k, y]) => [k, plain(y)])) : x);
  const p = plain(v);
  const out = p === null || p === undefined ? '' : Array.isArray(p) && p.every((x) => typeof x !== 'object' || x === null) ? p.join(', ')
    : typeof p === 'object' ? JSON.stringify(p) : p;
  return typeof out === 'string' && out.length > CELL_MAX ? `${out.slice(0, CELL_MAX)}… (truncated)` : out;
};

exports.syncFirestoreAndSheets = onSchedule(
  { schedule: '0 0 * * 6', timeZone: TZ, region: REGION, timeoutSeconds: 540, memory: '512MiB' },
  async () => {
    const { google } = require('googleapis');
    const auth = new google.auth.GoogleAuth({
      keyFile: path.join(__dirname, 'service-account-key-gs.json'),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const sheets = google.sheets({ version: 'v4', auth });
    const db = admin.firestore();

    // Missing tabs are created up front: writing to an absent tab fails the whole call.
    const tabs = async () => new Map(((await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID })).data.sheets || [])
      .map((s) => [s.properties.title, s.properties]));
    let existing = await tabs();
    const missing = SHEET_COLLECTIONS.map((c) => c.tab).filter((t) => !existing.has(t));
    if (missing.length) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        resource: { requests: missing.map((title) => ({ addSheet: { properties: { title } } })) },
      });
      existing = await tabs();
    }

    for (const { tab, read, under } of SHEET_COLLECTIONS) {
      // One failing collection must not stop the rest.
      try {
        const docs = (await read(db)).docs.filter((d) => !under || d.ref.path.startsWith(`${under}/`));
        const keys = new Set();
        docs.forEach((d) => Object.keys(d.data()).forEach((k) => keys.add(k)));
        const cols = [...SHEET_LEAD.filter((k) => keys.has(k)), ...[...keys].filter((k) => !SHEET_LEAD.includes(k)).sort()];
        const rows = [['id', ...cols], ...docs.map((d) => [d.ref.path.split('/').length > 2 ? d.ref.path : d.id, ...cols.map((k) => sheetCell(d.data()[k]))])];

        // Size the grid to fit (values.update won't grow it), clear, then write as plain values (RAW):
        // member-entered text starting with '=' must never run as a formula.
        const props = existing.get(tab);
        const grid = props.gridProperties || {};
        const rowCount = Math.max(rows.length, 2), columnCount = Math.max(rows[0].length, 1);
        if (grid.rowCount < rowCount || grid.columnCount < columnCount) {
          await sheets.spreadsheets.batchUpdate({
            spreadsheetId: SPREADSHEET_ID,
            resource: { requests: [{ updateSheetProperties: {
              properties: { sheetId: props.sheetId, gridProperties: { rowCount: Math.max(grid.rowCount || 0, rowCount), columnCount: Math.max(grid.columnCount || 0, columnCount), frozenRowCount: 1 } },
              fields: 'gridProperties(rowCount,columnCount,frozenRowCount)',
            } }] },
          });
        }
        await sheets.spreadsheets.values.clear({ spreadsheetId: SPREADSHEET_ID, range: `'${tab}'` });
        await sheets.spreadsheets.values.update({
          spreadsheetId: SPREADSHEET_ID, range: `'${tab}'!A1`, valueInputOption: 'RAW', resource: { values: rows },
        });
        logger.info(`Exported ${docs.length} doc(s) to sheet tab "${tab}".`);
      } catch (err) {
        logger.error(`Sheet sync failed for "${tab}":`, err);
      }
    }
  },
);