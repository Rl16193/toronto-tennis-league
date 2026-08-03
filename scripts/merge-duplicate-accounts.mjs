/**
 * One-time merge: combine known duplicate accounts (same person, two different signup emails)
 * into a single kept account. For each pair:
 *   - sums numeric stats/task_progress counters from the merged account into the kept account
 *   - unions preferences array fields (preferred_courts, favourite_players)
 *   - reassigns the merged uid to the kept uid across every collection that references a player
 *     by uid (event_participants, tournament_matches, score_submissions, ladder_challenges,
 *     rallies, task_claims, photo_reports, notifications, group_awards.recipient_ids)
 *   - copies court_visits/court_attendance docs to new ids under the kept uid (uid is embedded
 *     in the doc id there, so these can't be updated in place)
 *   - records the merged account's email as users/{keepUid}.secondary_email, so a third signup
 *     attempt with that address is caught by the signup email-gate check
 *   - (live run only) disables the merged account's Firebase Auth login — its Firestore docs
 *     (users/stats/preferences/task_progress) are left untouched as an archived record, never
 *     deleted, so the merge is reversible if something looks wrong
 *
 * event_participants is checked for a specific conflict case — both accounts having separately
 * joined the same event — and logged rather than auto-resolved; other collections are reassigned
 * without a full generic conflict scan (out of scope for this one-off cleanup).
 *
 * Usage:
 *   node scripts/merge-duplicate-accounts.mjs --key serviceAccount.json --dry-run
 *   node scripts/merge-duplicate-accounts.mjs --key serviceAccount.json
 */

import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dryRun = process.argv.includes('--dry-run');

const keyArgIndex = process.argv.indexOf('--key');
if (keyArgIndex === -1 || !process.argv[keyArgIndex + 1]) {
  console.error('Usage: node scripts/merge-duplicate-accounts.mjs --key path/to/serviceAccount.json [--dry-run]');
  process.exit(1);
}
const keyPath = path.resolve(process.argv[keyArgIndex + 1]);
if (!fs.existsSync(keyPath)) { console.error(`Key not found: ${keyPath}`); process.exit(1); }

admin.initializeApp({ credential: admin.credential.cert(JSON.parse(fs.readFileSync(keyPath, 'utf8'))) });
const auth = admin.auth();
const db = admin.firestore();

// [keepEmail, mergeEmail] — the merged account's data folds into the kept account.
// Karan Lally's duplicate (karan.lally@macegroup.com) was removed manually — no merge needed.
const PAIRS = [
  ['griffinpauli@yahoo.com', 'griffinpauli96@gmail.com'],
  ['spinosaurusvikram@gmail.com', 'vnijh1@gmail.com'],
];

const NUMERIC_STATS_FIELDS = ['matchesPlayed', 'wins', 'loses', 'leaguePoints26', 'tournamentsPlayed', 'pointswon', 'totalPointsPlayed'];
const NUMERIC_TASK_FIELDS = [
  'climbSpots', 'suggestions', 'courtsVisited', 'zoneComplete', 'boardPhotos',
  'queueUpdates', 'volunteerEvents', 'invites', 'meetups', 'bonusPoints',
];
const ARRAY_PREF_FIELDS = ['preferred_courts', 'favourite_players'];

// uid-reference fields to reassign, per collection.
const REF_FIELDS = [
  ['event_participants', 'user_id'],
  ['tournament_matches', 'player_1_user_id'],
  ['tournament_matches', 'player_2_user_id'],
  ['tournament_matches', 'winner_user_id'],
  ['score_submissions', 'claimed_winner_user_id'],
  ['score_submissions', 'submitted_by'],
  ['ladder_challenges', 'challenger_id'],
  ['ladder_challenges', 'opponent_id'],
  ['rallies', 'from_id'],
  ['rallies', 'to_id'],
  ['task_claims', 'user_id'],
  ['photo_reports', 'user_id'],
  ['notifications', 'recipient_id'],
];

function sumFields(base, extra, fields) {
  const out = { ...base };
  for (const f of fields) out[f] = (Number(base?.[f]) || 0) + (Number(extra?.[f]) || 0);
  return out;
}

function unionArrays(base, extra, fields) {
  const out = { ...base };
  for (const f of fields) {
    const a = Array.isArray(base?.[f]) ? base[f] : [];
    const b = Array.isArray(extra?.[f]) ? extra[f] : [];
    out[f] = [...new Set([...a, ...b])];
  }
  return out;
}

async function reassignField(collectionName, field, keepUid, mergeUid, log) {
  const snap = await db.collection(collectionName).where(field, '==', mergeUid).get();
  if (snap.empty) return 0;
  for (const doc of snap.docs) {
    if (!dryRun) await doc.ref.update({ [field]: keepUid });
  }
  log.push(`  ${collectionName}.${field}: ${snap.size} doc(s) reassigned (${mergeUid} → ${keepUid})`);
  return snap.size;
}

async function mergeCourtDocs(collectionName, keepUid, mergeUid, log) {
  const snap = await db.collection(collectionName).where('user_id', '==', mergeUid).get();
  for (const doc of snap.docs) {
    const newId = doc.id.replace(mergeUid, keepUid);
    log.push(`  ${collectionName}/${doc.id} → ${collectionName}/${newId}`);
    if (!dryRun) {
      const targetSnap = await db.doc(`${collectionName}/${newId}`).get();
      if (!targetSnap.exists) await db.doc(`${collectionName}/${newId}`).set({ ...doc.data(), user_id: keepUid });
      await doc.ref.delete();
    }
  }
  return snap.size;
}

async function mergePair(keepEmail, mergeEmail) {
  console.log(`\n=== keep ${keepEmail}  ←  merge ${mergeEmail} ===`);
  const log = [];

  let keepUser, mergeUser;
  try {
    [keepUser, mergeUser] = await Promise.all([auth.getUserByEmail(keepEmail), auth.getUserByEmail(mergeEmail)]);
  } catch (e) {
    console.error(`  ✗ could not resolve both accounts: ${e.message}`);
    return;
  }
  const keepUid = keepUser.uid;
  const mergeUid = mergeUser.uid;
  console.log(`  keep uid=${keepUid} (created ${keepUser.metadata.creationTime})`);
  console.log(`  merge uid=${mergeUid} (created ${mergeUser.metadata.creationTime})`);

  // stats — sum numeric counters
  const [keepStats, mergeStats] = await Promise.all([db.doc(`stats/${keepUid}`).get(), db.doc(`stats/${mergeUid}`).get()]);
  if (mergeStats.exists) {
    const before = keepStats.data() || {};
    const merged = sumFields(before, mergeStats.data() || {}, NUMERIC_STATS_FIELDS);
    log.push(`  stats/${keepUid}: ${NUMERIC_STATS_FIELDS.map((f) => `${f} ${before[f] || 0}+${mergeStats.data()[f] || 0}=${merged[f]}`).join(', ')}`);
    if (!dryRun) await db.doc(`stats/${keepUid}`).set(merged, { merge: true });
  } else {
    log.push(`  stats/${mergeUid}: none found, nothing to sum`);
  }

  // task_progress — sum numeric counters
  const [keepTP, mergeTP] = await Promise.all([db.doc(`task_progress/${keepUid}`).get(), db.doc(`task_progress/${mergeUid}`).get()]);
  if (mergeTP.exists) {
    const merged = sumFields(keepTP.data() || {}, mergeTP.data() || {}, NUMERIC_TASK_FIELDS);
    const summed = NUMERIC_TASK_FIELDS.filter((f) => mergeTP.data()[f]);
    log.push(`  task_progress/${keepUid}: summed [${summed.join(', ') || 'nothing'}]`);
    if (!dryRun) await db.doc(`task_progress/${keepUid}`).set(merged, { merge: true });
  }

  // preferences — union array fields, otherwise keep the kept account's values
  const [keepPrefs, mergePrefs] = await Promise.all([db.doc(`preferences/${keepUid}`).get(), db.doc(`preferences/${mergeUid}`).get()]);
  if (mergePrefs.exists) {
    const merged = unionArrays(keepPrefs.data() || {}, mergePrefs.data() || {}, ARRAY_PREF_FIELDS);
    log.push(`  preferences/${keepUid}: unioned [${ARRAY_PREF_FIELDS.join(', ')}]`);
    if (!dryRun) await db.doc(`preferences/${keepUid}`).set(merged, { merge: true });
  }

  // Reassign uid references across every collection that stores a player's uid
  for (const [col, field] of REF_FIELDS) {
    await reassignField(col, field, keepUid, mergeUid, log);
  }

  // Conflict check: both accounts may have separately joined the same event
  const epAfter = await db.collection('event_participants').where('user_id', '==', keepUid).get();
  const byEvent = new Map();
  for (const d of epAfter.docs) {
    const eid = d.data().event_id;
    if (!byEvent.has(eid)) byEvent.set(eid, []);
    byEvent.get(eid).push(d.id);
  }
  for (const [eid, docIds] of byEvent) {
    if (docIds.length > 1) log.push(`  ⚠ CONFLICT: both accounts joined event ${eid} separately (docs: ${docIds.join(', ')}) — resolve by hand`);
  }

  // group_awards.recipient_ids is an array field, not a single uid — swap + dedupe
  const gaSnap = await db.collection('group_awards').where('recipient_ids', 'array-contains', mergeUid).get();
  for (const doc of gaSnap.docs) {
    const ids = new Set(doc.data().recipient_ids || []);
    ids.delete(mergeUid);
    ids.add(keepUid);
    if (!dryRun) await doc.ref.update({ recipient_ids: [...ids] });
  }
  if (!gaSnap.empty) log.push(`  group_awards.recipient_ids: ${gaSnap.size} doc(s) reassigned`);

  // court_visits / court_attendance — uid is embedded in the doc id, so copy + delete instead of update
  for (const col of ['court_visits', 'court_attendance']) {
    const n = await mergeCourtDocs(col, keepUid, mergeUid, log);
    if (n === 0) log.push(`  ${col}: none found`);
  }

  // Record the merged email so a third signup attempt with it is caught (see signupValidation.ts)
  log.push(`  users/${keepUid}.secondary_email = ${mergeEmail}`);
  if (!dryRun) await db.doc(`users/${keepUid}`).set({ secondary_email: mergeEmail }, { merge: true });

  // Disable the merged account's login (live run only). Its Firestore docs are left in place,
  // untouched, as an archived record — nothing is deleted here.
  log.push(`  auth user ${mergeUid} → disabled=true (its users/stats/preferences/task_progress docs are left untouched)`);
  if (!dryRun) await auth.updateUser(mergeUid, { disabled: true });

  console.log(log.join('\n'));
}

async function main() {
  console.log(dryRun ? '🔍 DRY RUN — no writes\n' : '✏️  LIVE RUN\n');
  for (const [keepEmail, mergeEmail] of PAIRS) {
    await mergePair(keepEmail, mergeEmail);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
