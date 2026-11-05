/**
 * Account callables: the signup-time email lookup, and deleteAccount (at the bottom).
 *
 * The signup email gate has to answer "is this address already registered?" BEFORE anyone is
 * signed in. It used to do that with an unauthenticated query against `users` — which is exactly
 * why phone numbers and emails sitting in that world-readable collection were a problem. Those
 * fields now live in `contacts`, which requires a sign-in, so the check moves here: the Admin SDK
 * bypasses rules, and the callable returns only two booleans, never any member data.
 *
 * Deliberately minimal surface. It confirms whether an address is taken (which a signup form
 * reveals anyway by failing) and nothing else — no names, no uids, no other fields.
 *
 * Deploy with: firebase deploy --only functions
 */
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');
const { Timestamp } = require('firebase-admin/firestore');
const { REGION, SUPER_ADMIN_UID } = require('./lib/constants');
const { recordScore } = require('./lib/scoring');
const { rolesOf, eventOrganizerUids } = require('./lib/roles');
const { notify } = require('./lib/notify');
const { requireAuth } = require('./lib/callable');

const db = () => admin.firestore();

exports.checkSignupEmail = onCall({ region: REGION }, async (request) => {
  const raw = request.data && request.data.email;
  if (typeof raw !== 'string') {
    throw new HttpsError('invalid-argument', 'An email address is required.');
  }
  const email = raw.trim();
  if (!email || email.length > 320) {
    throw new HttpsError('invalid-argument', 'An email address is required.');
  }

  const [primary, secondary] = await Promise.all([
    db().collection('contacts').where('email', '==', email).limit(1).get(),
    db().collection('contacts').where('secondary_email', '==', email).limit(1).get(),
  ]);

  return { exists: !primary.empty, secondary: !secondary.empty };
});

// ─── Delete account ─────────────────────────────────────────────────────────
// What is deleted vs anonymised, and why uids stay: CLAUDE.md "Account deletion and consent".
const FORMER = 'Former member';
const PLAYER_LOADING = 'Player Loading'; // src/pages/tournament/utils.ts
const BYE = 'BYE';
const RECENT_SIGN_IN_S = 5 * 60;
const STORAGE_FOLDERS = ['avatars', 'court_reports', 'court_suggestions', 'listings', 'events'];

// Batched writes that commit every 400 ops (Firestore's limit is 500).
function writer() {
  let batch = db().batch();
  let n = 0;
  const flush = async () => { if (n) await batch.commit(); batch = db().batch(); n = 0; };
  const add = async (fn) => { fn(batch); n += 1; if (n >= 400) await flush(); };
  return {
    update: (ref, data) => add((b) => b.update(ref, data)),
    delete: (ref) => add((b) => b.delete(ref)),
    flush,
  };
}

const where = (col, field, op, value) => db().collection(col).where(field, op, value).get().then((s) => s.docs);
const namePatch = (m, uid) => ({
  ...(m.player_1_uid === uid ? { player_1_name: FORMER } : {}),
  ...(m.player_2_uid === uid ? { player_2_name: FORMER } : {}),
});

exports.deleteAccount = onCall({ region: REGION, timeoutSeconds: 300 }, async (request) => {
  const uid = requireAuth(request);
  const authTime = Number(request.auth.token.auth_time || 0);
  if (Date.now() / 1000 - authTime > RECENT_SIGN_IN_S) {
    throw new HttpsError('failed-precondition', 'Please sign in again, then delete your account.');
  }
  if (uid === SUPER_ADMIN_UID || (await rolesOf(uid)).length) {
    throw new HttpsError('failed-precondition', 'Your account runs events or services. Ask the organizers to remove that role first.');
  }
  const [asMember, asProvider] = await Promise.all([where('bookings', 'uid', '==', uid), where('bookings', 'provider_id', '==', uid)]);
  if ([...asMember, ...asProvider].some((d) => ['lead', 'in_progress'].includes(d.data().status))) {
    throw new HttpsError('failed-precondition', 'You have a booking in progress. Cancel it or finish it first.');
  }

  const contactsSnap = await db().doc(`contacts/${uid}`).get();
  const email = contactsSnap.exists ? String(contactsSnap.data().email || '').trim() : '';

  // 1. Tournament: walkovers for real opponents, then blank what's left (as handleRemovePlayer).
  const [m1, m2] = await Promise.all([where('matches', 'player_1_uid', '==', uid), where('matches', 'player_2_uid', '==', uid)]);
  const matches = [...m1, ...m2];
  const unplayed = new Set(matches
    .filter((d) => d.data().category === 'tournament' && !['complete', 'cancelled'].includes(d.data().status))
    .map((d) => d.id));
  const byEvent = new Map(); // eventId → { walkovers, needsYou }
  const tally = (eventId) => {
    if (!byEvent.has(eventId)) byEvent.set(eventId, { walkovers: 0, needsYou: 0 });
    return byEvent.get(eventId);
  };
  const isReal = (id, name) => !!id && name !== PLAYER_LOADING && name !== BYE;
  const walkedOver = new Set();
  for (const d of matches.filter((x) => unplayed.has(x.id))) {
    const m = d.data();
    const other = m.player_1_uid === uid ? 'player_2' : 'player_1';
    if (!isReal(m[`${other}_uid`], m[`${other}_name`])) continue;
    try {
      await recordScore(db(), {
        callerUid: SUPER_ADMIN_UID, matchId: d.id,
        input: { winnerUid: m[`${other}_uid`], scores: [[0, 0], [0, 0], [0, 0]], walkover: true, court: '' },
      });
      walkedOver.add(d.id);
      tally(m.event_id).walkovers += 1;
    } catch (err) {
      logger.warn('deleteAccount walkover refused', { matchId: d.id, err: err.message });
      tally(m.event_id).needsYou += 1;
    }
  }

  const w = writer();
  const regs = await where('event_participants', 'uid', '==', uid);
  const partnersOf = new Set(regs.map((d) => d.data().partner_uid).filter(Boolean));
  for (const d of matches) {
    const m = d.data();
    if (m.category === 'tournament') {
      if (!unplayed.has(d.id) || walkedOver.has(d.id)) { await w.update(d.ref, namePatch(m, uid)); continue; }
      const patch = { updated_at: Timestamp.now() };
      ['player_1', 'player_2'].forEach((s) => {
        if (m[`${s}_uid`] === uid) { patch[`${s}_uid`] = ''; patch[`${s}_name`] = PLAYER_LOADING; }
      });
      patch.participant_uids = (m.participant_uids || []).filter((u) => u !== uid && !partnersOf.has(u));
      await w.update(d.ref, patch);
      continue;
    }
    // 2. Challenges and rallies not yet played are deleted; played ones keep their record.
    if (m.status === 'open' || (m.status === 'accepted' && !m.winner_uid)) await w.delete(d.ref);
    else await w.update(d.ref, namePatch(m, uid));
  }

  // 3. Registrations are withdrawn, never deleted; every row naming them is anonymised.
  const now = Timestamp.now();
  for (const d of regs) {
    const patch = { user_name: FORMER };
    if (d.data().status === 'active') Object.assign(patch, { status: 'withdrawn', withdrawn_reason: 'other', withdrawn_at: now, withdrawn_by: uid });
    await w.update(d.ref, patch);
  }
  for (const d of await where('event_participants', 'partner_uid', '==', uid)) await w.update(d.ref, { partner_name: FORMER });

  // 4. Every other stored copy of their name, and where they stood.
  for (const d of await where('submissions', 'uid', '==', uid)) await w.update(d.ref, { user_name: FORMER });
  for (const d of await where('submissions', 'winner_uid', '==', uid)) await w.update(d.ref, { winner_name: FORMER });
  const reportPhotos = []; // uid-less paths (court_reports/members/…): the prefix delete can't find them
  for (const d of await where('courts', 'uid', '==', uid)) {
    if (d.data().category !== 'visit') reportPhotos.push(...(d.data().photo_paths || []));
    await w.update(d.ref, d.data().category === 'visit'
      ? { user_name: FORMER, lat: 0, lng: 0 }
      : { user_name: FORMER, photo_paths: [], photos_meta: [] });
  }
  for (const col of ['bookings', 'task_claims']) {
    for (const d of await where(col, 'uid', '==', uid)) await w.update(d.ref, { user_name: FORMER });
  }
  for (const d of await where('league_seasons', 'uid', '==', uid)) await w.update(d.ref, { name: FORMER });
  const statsRef = db().doc(`stats/${uid}`);
  if ((await statsRef.get()).exists) await w.update(statsRef, { name: FORMER });

  // 5. Personal docs and files.
  for (const col of ['users', 'contacts', 'preferences', 'public_contacts', 'mailing_list']) await w.delete(db().doc(`${col}/${uid}`));
  for (const d of await where('connections', 'uids', 'array-contains', uid)) await w.delete(d.ref);
  for (const d of await where('notifications', 'uid', '==', uid)) await w.delete(d.ref);
  for (const d of await where('listings', 'uid', '==', uid)) await w.delete(d.ref);
  for (const d of await where('volunteer_signups', 'uid', '==', uid)) await w.delete(d.ref);
  if (email) {
    for (const d of await where('mailing_list', 'email', '==', email)) await w.delete(d.ref);
    for (const d of await where('volunteer_signups', 'email', '==', email)) await w.delete(d.ref);
  }
  await w.flush();
  await db().recursiveDelete(db().doc(`ranking_history/${uid}`));
  const bucket = admin.storage().bucket();
  await Promise.all(STORAGE_FOLDERS.map((f) => bucket.deleteFiles({ prefix: `${f}/${uid}/` })
    .catch((err) => logger.warn('deleteAccount storage', { folder: f, err: err.message }))));
  await Promise.all(reportPhotos.map((p) => bucket.file(p).delete({ ignoreNotFound: true })
    .catch((err) => logger.warn('deleteAccount storage', { path: p, err: err.message }))));

  // 6. Each affected event's organizers hear what changed. No name: the member is gone.
  for (const [eventId, t] of byEvent) {
    const ev = await db().doc(`events/${eventId}`).get();
    if (!ev.exists) continue;
    await notify(eventOrganizerUids(ev.data()), {
      type: 'organizer_account_deleted',
      title: 'A player deleted their account',
      body: [
        t.walkovers ? `${t.walkovers} walkover${t.walkovers === 1 ? '' : 's'} recorded for their opponents.` : '',
        t.needsYou ? `${t.needsYou} match${t.needsYou === 1 ? '' : 'es'} could not be walked over and need a decision.` : '',
      ].filter(Boolean).join(' '),
      link: `/tournament?event=${eventId}`,
    });
  }

  // 7. The sign-in goes last, so a failure above can be retried by the same member.
  await admin.auth().deleteUser(uid);
  logger.info('account deleted', { uid });
  return { deleted: true };
});
