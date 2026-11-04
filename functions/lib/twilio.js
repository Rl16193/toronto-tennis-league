/**
 * WhatsApp / SMS match alerts through Twilio (CLAUDE.md, "WhatsApp / SMS alerts"), queued in Cloud
 * Tasks and re-checked before sending (sendQueuedMessage). WhatsApp first, as an approved Content
 * template; SMS with the same text when the send is refused or Twilio reports it failed (status
 * callback → twilioWebhook). Contact Method switches are not consulted.
 * Helpers only (see notify.js for why).
 */
const { logger } = require('firebase-functions');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const { getFunctions } = require('firebase-admin/functions');
const twilio = require('twilio');
const { REGION, TZ, isGuest, torontoParts } = require('./constants');
const { emailDeliveryDecision } = require('./emailDelivery');

const db = () => admin.firestore();

const accountSid = defineSecret('TWILIO_ACCOUNT_SID');
const apiKeySid = defineSecret('TWILIO_API_KEY_SID');
const apiKeySecret = defineSecret('TWILIO_API_KEY_SECRET');
const authToken = defineSecret('TWILIO_AUTH_TOKEN');
const twilioSecrets = [accountSid, apiKeySid, apiKeySecret];

const FROM = '+12892361080';
// Configure exactly this URL in Twilio (number and WhatsApp sender); signatures are checked against it.
const WEBHOOK_URL = `https://${REGION}-toronto-tennis-league.cloudfunctions.net/twilioWebhook`;

// Each kind: its WhatsApp template and the same words for SMS. Keep TEXT identical to the template.
const KINDS = {
  nextOpponent: {
    contentSid: 'HX2f45d5cdb24ceeaac8032a816f1ebb4e',
    text: (v) => `Hi ${v[1]},\n\nYour next opponent in the ${v[2]} at ${v[3]} is ${v[4]}: ${v[5]}\n\nReview it here: https://www.racquetsandstrings.ca/profile\n\nKindly try to schedule your match before round deadline on ${v[6]}. All the best!`,
  },
  reminder: {
    contentSid: 'HXf6d9a8495bfa72fc7108c57ef5eddd56',
    text: (v) => `Hi ${v[1]},\n\nYour ${v[2]} match with ${v[3]}: ${v[4]} in the ${v[5]} is yet to be played.\n\nReply U if you're unavailable to play or H if you're having difficulty fixing a time and court.\n\nThank You!`,
  },
};

// Server copy of ROUND_LABEL / stageOf (src/features/matches/tournamentResults.ts, usePlayerDash.ts).
const ROUND_LABEL = { R64: 'Round of 64', R32: 'Round of 32', R16: 'Round of 16', QF: 'Quarterfinal', SF: 'Semifinal', F: 'Final' };
const stageOf = (m) => (m.round === 'RR' ? (m.group_label || 'Group stage') : (ROUND_LABEL[m.round] || m.round || 'match'));

/** Server copy of toE164Phone (ContactOpponentButton.tsx): North American numbers only. */
function e164(phone) {
  const raw = String(phone || '').trim();
  const digits = raw.replace(/\D/g, '');
  if (raw.startsWith('+') && digits.length >= 7) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

/** '+14165550123' → '(416)-555-0123', the shape Signup stores in contacts.phone. */
const displayPhone = (num) => {
  const d = String(num || '').replace(/\D/g, '').slice(-10);
  return d.length === 10 ? `(${d.slice(0, 3)})-${d.slice(3, 6)}-${d.slice(6)}` : '';
};

// Match alerts ignore Contact Method (preferred_mode_of_contact): a number on the profile is enough.
const numbersOf = (c) => ({
  wa: e164(c.whatsapp_contact) || e164(c.phone),
  sms: e164(c.phone) || e164(c.whatsapp_contact),
});

const deliverable = () => emailDeliveryDecision({
  projectId: process.env.GCLOUD_PROJECT || JSON.parse(process.env.FIREBASE_CONFIG || '{}').projectId || '',
  emulator: process.env.FUNCTIONS_EMULATOR === 'true',
}).deliver;

const client = () => twilio(apiKeySid.value(), apiKeySecret.value(), { accountSid: accountSid.value() });

const formatDeadline = (ymd) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd || '')) return 'TBD';
  return new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-CA', { day: 'numeric', month: 'short', year: 'numeric', timeZone: TZ });
};

/** The template variables for `uid` on match `m` (event `ev`); WhatsApp refuses blank ones. */
async function variablesFor(kind, uid, m, ev) {
  const oppUid = m.player_1_uid === uid ? m.player_2_uid : m.player_1_uid;
  const oppName = (m.player_1_uid === uid ? m.player_2_name : m.player_1_name) || 'your opponent';
  const [user, opp] = await Promise.all([
    db().doc(`users/${uid}`).get(),
    oppUid && !isGuest(oppUid) ? db().doc(`contacts/${oppUid}`).get() : null,
  ]);
  const first = String(user.data()?.name || '').trim().split(/\s+/)[0] || 'there';
  const o = opp && opp.exists ? opp.data() : {};
  const oppNumber = o.whatsapp_contact || o.phone || 'see the draw';
  const title = ev.title || 'tournament';
  return kind === 'nextOpponent'
    ? { 1: first, 2: stageOf(m), 3: title, 4: oppName, 5: oppNumber, 6: formatDeadline((ev.round_deadlines || {})[m.round]) }
    : { 1: first, 2: stageOf(m), 3: oppName, 4: oppNumber, 5: title };
}

async function sendSms(to, body) {
  await client().messages.create({ from: FROM, to, body });
  return 'sms';
}

/**
 * Sends `kind` to one player about match `m`. Returns 'whatsapp' | 'sms' | null (skipped).
 * Never throws: a failed alert must not fail the trigger or callable that sent it.
 */
async function sendMatchMessage(kind, uid, matchId, m, ev) {
  if (!uid || isGuest(uid)) return null;
  try {
    const cSnap = await db().doc(`contacts/${uid}`).get();
    const c = cSnap.exists ? cSnap.data() : {};
    const { wa, sms } = numbersOf(c);
    if (!wa) return null;
    if (!deliverable()) { logger.info('twilio send skipped (not production)', { kind, uid }); return null; }
    const vars = await variablesFor(kind, uid, m, ev);
    const k = KINDS[kind];
    if (wa) {
      try {
        const qs = new URLSearchParams({ fallback: sms ? 'sms' : 'none', kind, match: matchId, uid });
        await client().messages.create({
          from: `whatsapp:${FROM}`,
          to: `whatsapp:${wa}`,
          contentSid: k.contentSid,
          contentVariables: JSON.stringify(vars),
          statusCallback: `${WEBHOOK_URL}?${qs}`,
        });
        return 'whatsapp';
      } catch (e) {
        logger.warn('whatsapp send refused, trying sms', { kind, uid, code: e.code, message: e.message });
        if (!sms) return null;
      }
    }
    return await sendSms(sms, k.text(vars));
  } catch (e) {
    logger.error('twilio send failed', { kind, uid, code: e.code, message: e.message });
    return null;
  }
}

/** The next 8:00am in Toronto, as a Date (today's if it's before 8, else tomorrow's). */
function next8am(now = new Date()) {
  const wall = (t) => {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(t).map((x) => [x.type, Number(x.value)]));
    return p;
  };
  const p = wall(now);
  const target = Date.UTC(p.year, p.month - 1, p.day + (p.hour >= 8 ? 1 : 0), 8);
  // Toronto's UTC offset at that moment (EST/EDT), from how 8:00 "as UTC" reads in Toronto.
  const q = wall(new Date(target));
  const offset = Date.UTC(q.year, q.month - 1, q.day, q.hour, q.minute) - target;
  return new Date(target - offset);
}

/**
 * Queues `kind` for one player of match `m` (sendQueuedMessage sends it): a next-opponent message
 * decided between 8:00am and 4:00pm Toronto goes now; everything else waits for the next 8:00am.
 * Returns true when queued, false when the player has no reachable number. One task per
 * player, match, kind and morning, so a repeat before 8:00 is dropped.
 */
async function queueMatchMessage(kind, uid, matchId, m) {
  if (!uid || isGuest(uid)) return false;
  const cSnap = await db().doc(`contacts/${uid}`).get();
  const c = cSnap.exists ? cSnap.data() : {};
  if (!numbersOf(c).wa) return false;
  if (!deliverable()) { logger.info('twilio queue skipped (not production)', { kind, uid }); return false; }
  const hour = torontoParts(new Date()).hour;
  const at = kind === 'nextOpponent' && hour >= 8 && hour < 16 ? new Date() : next8am();
  const opponent = m.player_1_uid === uid ? m.player_2_uid : m.player_1_uid;
  const id = `${kind}-${matchId}-${uid}-${at.toISOString().slice(0, 10)}`.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 500);
  try {
    await getFunctions().taskQueue(`locations/${REGION}/functions/sendQueuedMessage`)
      .enqueue({ kind, uid, matchId, opponent }, { scheduleTime: at, id });
  } catch (e) {
    if (e.code !== 'functions/task-already-exists') throw e;
  }
  return true;
}

/** Status callback: a WhatsApp alert failed after it was accepted, so send its SMS version once. */
async function smsFallback({ kind, match: matchId, uid }) {
  if (!KINDS[kind] || !matchId || !uid) return;
  try {
    const mSnap = await db().doc(`matches/${matchId}`).get();
    if (!mSnap.exists) return;
    const m = mSnap.data();
    const [cSnap, eSnap] = await Promise.all([db().doc(`contacts/${uid}`).get(), db().doc(`events/${m.event_id}`).get()]);
    const c = cSnap.exists ? cSnap.data() : {};
    const to = numbersOf(c).sms;
    if (!to) return;
    const vars = await variablesFor(kind, uid, m, eSnap.exists ? eSnap.data() : {});
    await sendSms(to, KINDS[kind].text(vars));
  } catch (e) {
    logger.error('sms fallback failed', { kind, uid, code: e.code, message: e.message });
  }
}

/** True when the request carries a valid Twilio signature for WEBHOOK_URL plus its query string. */
function signedByTwilio(req) {
  const url = req.originalUrl || req.url || '';
  const qs = url.includes('?') ? url.slice(url.indexOf('?')) : '';
  return twilio.validateRequest(authToken.value(), req.get('X-Twilio-Signature') || '', WEBHOOK_URL + qs, req.body || {});
}

/** The member a WhatsApp/SMS number belongs to, or null. `from` is E.164 or 'whatsapp:+…'. */
async function memberByNumber(from) {
  const num = String(from || '').replace(/^whatsapp:/, '');
  const byWa = await db().collection('contacts').where('whatsapp_contact', '==', num).limit(1).get();
  if (!byWa.empty) return byWa.docs[0].id;
  const forms = [displayPhone(num), num, num.replace(/\D/g, '').slice(-10)].filter(Boolean);
  const byPhone = await db().collection('contacts').where('phone', 'in', forms).limit(1).get();
  return byPhone.empty ? null : byPhone.docs[0].id;
}

module.exports = {
  twilioSecrets, authToken, sendMatchMessage, queueMatchMessage, next8am, smsFallback, signedByTwilio, memberByNumber, stageOf,
};
