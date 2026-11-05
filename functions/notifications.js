/**
 * Notification triggers.
 *
 * Every notification is created here, server-side, so it reaches people who weren't the one
 * clicking (and so players can't write into each other's feeds — see firestore.rules).
 * Firestore triggers cover things that happen; scheduled jobs cover time-based reminders.
 * A match carries only its lifecycle; the result (winner, sets, who entered it) is the applied
 * `submissions` entry, read here when an alert needs it.
 *
 * Deploy with: firebase deploy --only functions
 */
const { onDocumentCreated, onDocumentUpdated, onDocumentWritten } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const { onTaskDispatched } = require('firebase-functions/v2/tasks');
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');
const { notify, organizerUids, sendEmailOnce, resendApiKey } = require('./lib/notify');
const { eventOrganizerUids, isOrganizer } = require('./lib/roles');
const { requireAuth, requireDocId } = require('./lib/callable');
const {
  twilioSecrets, authToken, sendMatchMessage, queueMatchMessage, smsFallback, signedByTwilio, memberByNumber, stageOf,
} = require('./lib/twilio');
const { initiationDone } = require('./lib/points');
const { RESULT_KINDS, closeStaleRequests } = require('./lib/scoring');
const {
  buildRallyEmail, buildRallyAcceptedEmail, buildChallengeEmail, buildChallengeAcceptedEmail,
} = require('./lib/emailTemplates');

const { TZ, REGION, SITE, isGuest } = require('./lib/constants');
const db = () => admin.firestore();
const { Timestamp } = require('firebase-admin/firestore');

// "6-4, 6-3" from an entry's absolute per-set fields.
const scoreLineOf = (s) => [1, 2, 3]
  .map((n) => [s[`set_${n}_player_1`] ?? 0, s[`set_${n}_player_2`] ?? 0])
  .filter(([a, b]) => a > 0 || b > 0)
  .map(([a, b]) => `${a}-${b}`)
  .join(', ');

const matchPlayers = (m) => [m.player_1_uid, m.player_2_uid].filter(Boolean);
const otherPlayer = (m, uid) => (m.player_1_uid === uid ? m.player_2_uid : m.player_1_uid);
const opponentName = (m, uid) => (m.player_1_uid === uid ? m.player_2_name : m.player_1_name);
const matchLink = (m) => `/tournament?event=${m.event_id}`;
const isRealMatch = (id, m) => !id.startsWith('preview_') && !!m.event_id;

/** The applied result entry of a match, or null. */
async function appliedEntry(matchId) {
  const snap = await db().collection('submissions').where('match_id', '==', matchId).where('status', '==', 'applied').get();
  const d = snap.docs.find((x) => RESULT_KINDS.includes(x.data().sub_category));
  return d ? d.data() : null;
}

// ─── Matches ────────────────────────────────────────────────────────────────

// A new tournament match doc = the draw is out (or a group was formed). Tell both named players.
exports.onMatchCreated = onDocumentCreated(
  { document: 'matches/{matchId}', region: REGION },
  async (event) => {
    const m = event.data?.data();
    if (!m || m.category !== 'tournament' || !isRealMatch(event.params.matchId, m)) return;
    const players = matchPlayers(m);
    if (players.length === 0) return;
    const isRR = m.format === 'rr';
    await Promise.all(players.map((uid) => {
      const opp = opponentName(m, uid);
      // A slot with no opponent yet is a bye through to the next round.
      if (!otherPlayer(m, uid)) {
        return notify(uid, { type: 'match_bye', title: 'You have a bye', body: 'You advance to the next round automatically.', link: matchLink(m) });
      }
      return notify(uid, {
        type: isRR ? 'group_assigned' : 'draw_published',
        title: isRR ? 'You’ve been placed in a group' : 'The draw is out',
        body: opp ? `Your match: vs ${opp}` : 'Your fixtures are ready.',
        link: matchLink(m),
      });
    }));
  },
);

// Advancement into an empty slot: the next-round pairing is known. In-app now; WhatsApp/SMS at 8:00am.
exports.onMatchUpdated = onDocumentUpdated(
  { document: 'matches/{matchId}', region: REGION },
  async (event) => {
    const before = event.data?.before.data() || {};
    const after = event.data?.after.data() || {};
    if (after.category !== 'tournament' || !isRealMatch(event.params.matchId, after)) return;
    const newlyFilled = ['player_1_uid', 'player_2_uid'].some((s) => !before[s] && after[s]);
    if (newlyFilled && after.player_1_uid && after.player_2_uid && after.status !== 'complete') {
      await Promise.all(matchPlayers(after).map((uid) => notify(uid, {
        type: 'match_advanced',
        title: 'Your next opponent is ready',
        body: opponentName(after, uid) ? `You play ${opponentName(after, uid)}` : '',
        link: matchLink(after),
      })));
      await Promise.all(matchPlayers(after).map((uid) =>
        queueMatchMessage('nextOpponent', uid, event.params.matchId, after).catch((e) => logger.error('queue failed', e))));
    }
  },
);

// Organizer's paper plane on an unplayed match: the WhatsApp/SMS reminder to both players, at 8:00am.
exports.remindMatch = onCall({ region: REGION }, async (request) => {
  const uid = requireAuth(request);
  const matchId = requireDocId(request.data && request.data.matchId, 'Missing match.');
  const mSnap = await db().doc(`matches/${matchId}`).get();
  if (!mSnap.exists) throw new HttpsError('not-found', 'Match not found.');
  const m = mSnap.data();
  const eSnap = await db().doc(`events/${m.event_id}`).get();
  const ev = eSnap.exists ? eSnap.data() : null;
  if (!ev || !(await isOrganizer(uid, ev))) throw new HttpsError('permission-denied', 'Only this event’s organizers can send reminders.');
  if (m.category !== 'tournament' || m.status !== 'accepted' || !m.player_1_uid || !m.player_2_uid) {
    throw new HttpsError('failed-precondition', 'Only an unplayed match with two players can be reminded.');
  }
  const queued = await Promise.all(matchPlayers(m).map((p) => queueMatchMessage('reminder', p, matchId, m)));
  return { sent: queued.filter(Boolean).length };
});

// 8:00am: sends one queued message, unless the match has been played or the pairing changed since.
exports.sendQueuedMessage = onTaskDispatched(
  { region: REGION, secrets: twilioSecrets, retryConfig: { maxAttempts: 3, minBackoffSeconds: 60 }, rateLimits: { maxConcurrentDispatches: 5 } },
  async (req) => {
    const { kind, uid, matchId, opponent } = req.data || {};
    const mSnap = await db().doc(`matches/${matchId}`).get();
    if (!mSnap.exists) return;
    const m = mSnap.data();
    const pair = [m.player_1_uid, m.player_2_uid];
    if (m.category !== 'tournament' || m.status !== 'accepted' || !pair.includes(uid) || !pair.includes(opponent)) return;
    const eSnap = await db().doc(`events/${m.event_id}`).get();
    if (!eSnap.exists || eSnap.data().status === 'cancelled') return;
    await sendMatchMessage(kind, uid, matchId, m, eSnap.data());
  },
);

const REPLIES = { U: 'is unavailable to play', H: 'is having difficulty fixing a time and court' };

// Twilio webhook (number + WhatsApp sender): delivery status callbacks and member replies.
// Replies go to the organizers of the member's unplayed tournament matches; nothing is sent back.
exports.twilioWebhook = onRequest({ region: REGION, secrets: [...twilioSecrets, authToken] }, async (req, res) => {
  if (req.method !== 'POST' || !signedByTwilio(req)) { res.status(403).send('Forbidden'); return; }
  const b = req.body || {};
  try {
    if (req.query.fallback) {
      if (req.query.fallback === 'sms' && ['failed', 'undelivered'].includes(b.MessageStatus)) {
        logger.warn('whatsapp alert failed, sending sms', { errorCode: b.ErrorCode, kind: req.query.kind });
        await smsFallback(req.query);
      }
    } else if (b.From && (!b.MessageStatus || b.MessageStatus === 'received')) {
      // Inbound only: a status callback without our ?fallback (e.g. a sender-level URL) is ignored.
      const text = String(b.Body || '').trim() || (Number(b.NumMedia) > 0 ? '(sent an attachment)' : '(empty message)');
      const what = REPLIES[text.toUpperCase()] || `replied: "${text.slice(0, 300)}"`;
      const from = String(b.From).replace(/^whatsapp:/, '');
      const uid = await memberByNumber(from);
      const name = uid ? ((await db().doc(`users/${uid}`).get()).data()?.name || 'A member') : '';
      const matches = uid
        ? (await db().collection('matches').where('participant_uids', 'array-contains', uid).get()).docs.map((d) => d.data())
          .filter((m) => m.category === 'tournament' && m.status === 'accepted' && m.player_1_uid && m.player_2_uid)
        : [];
      if (!matches.length) {
        await notify(await organizerUids(), {
          type: 'organizer_player_reply',
          title: uid ? `${name} replied to a match message` : 'Reply from an unknown number',
          body: `${uid ? name : from} ${what}`,
          link: uid ? `/players/${uid}` : '/profile?dash=organizer',
          counterpart_uid: uid || '', counterpart_name: name,
        });
      } else {
        const byEvent = new Map();
        matches.forEach((m) => byEvent.set(m.event_id, [...(byEvent.get(m.event_id) || []), m]));
        await Promise.all([...byEvent].map(async ([eventId, ms]) => {
          const eSnap = await db().doc(`events/${eventId}`).get();
          const managers = eSnap.exists ? eventOrganizerUids(eSnap.data()) : [];
          const list = ms.map((m) => `${stageOf(m)}: ${m.player_1_name} vs ${m.player_2_name}`).join('; ');
          await notify(managers.length ? managers : await organizerUids(), {
            type: 'organizer_player_reply',
            title: `${name} ${what}`.slice(0, 120),
            body: `${eSnap.exists ? eSnap.data().title : 'Tournament'}: ${list}`,
            link: `/tournament?event=${eventId}`,
            counterpart_uid: uid, counterpart_name: name,
          });
        }));
      }
    }
  } catch (e) {
    logger.error('twilioWebhook failed', e);
  }
  res.type('text/xml').send('<Response></Response>');
});

// ─── League Ladder ──────────────────────────────────────────────────────────

/** Who hears that a challenge/rally result was recorded: the player who didn't enter it (both when an organizer did). */
const resultAudience = (m, entry) => {
  const recorder = entry && matchPlayers(m).includes(entry.uid) ? entry.uid : null;
  return recorder ? [otherPlayer(m, recorder)] : matchPlayers(m);
};

exports.onLadderChallengeCreated = onDocumentCreated(
  { document: 'matches/{id}', region: REGION, secrets: [resendApiKey] },
  async (event) => {
    const c = event.data?.data();
    if (!c || c.category !== 'challenge' || !c.player_2_uid) return;
    // An organizer recording a match two members already played creates it complete: tell the pair.
    if (c.status === 'complete') {
      const entry = await appliedEntry(event.params.id);
      await notify(matchPlayers(c), {
        type: 'ladder_reported',
        title: 'Your organizer recorded a challenge for you',
        body: entry && entry.winner_name ? `Winner: ${entry.winner_name}${scoreLineOf(entry) ? ` · ${scoreLineOf(entry)}` : ''}` : '',
        link: '/matches?mode=challenges',
      });
      return;
    }
    if (c.status !== 'open') return;
    // No in-app notification: an open challenge appears under Needs you on the Player Dash. The email still goes.
    const eventDoc = await db().doc(`events/${c.event_id}`).get();
    const ladderName = eventDoc.exists ? (eventDoc.data().title || 'League Ladder') : 'League Ladder';
    await sendEmailOnce(c.player_2_uid, `challenge-received:${event.params.id}`, 'You have received a challenge!',
      buildChallengeEmail(c.player_1_name || 'A player', ladderName));
  },
);

exports.onLadderChallengeUpdated = onDocumentUpdated(
  { document: 'matches/{id}', region: REGION, secrets: [resendApiKey] },
  async (event) => {
    const before = event.data?.before.data() || {};
    const after = event.data?.after.data() || {};
    if (after.category !== 'challenge' || before.status === after.status) return;
    if (before.status === 'open' && after.status === 'accepted') {
      const eventDoc = await db().doc(`events/${after.event_id}`).get();
      const ladderName = eventDoc.exists ? (eventDoc.data().title || 'League Ladder') : 'League Ladder';
      await sendEmailOnce(after.player_1_uid, `challenge-accepted:${event.params.id}`,
        `${after.player_2_name || 'Your opponent'} accepted your challenge!`,
        buildChallengeAcceptedEmail(after.player_2_name || 'Your opponent', ladderName));
      return;
    }
    // The result landed. It counts already — no confirmation step.
    if (after.status === 'complete') {
      const entry = await appliedEntry(event.params.id);
      await notify(resultAudience(after, entry).filter(Boolean), {
        type: 'ladder_reported',
        title: 'A challenge result was recorded',
        body: entry && entry.winner_name ? `Winner: ${entry.winner_name}${scoreLineOf(entry) ? ` · ${scoreLineOf(entry)}` : ''}` : '',
        link: '/matches?mode=challenges',
      });
    }
  },
);

// A player entered a different winner from the one on record, on any match type (a disputed entry).
// The recorded result stands until an organizer approves or rejects it on the Organizer Dash.
exports.onResultDisputed = onDocumentCreated(
  { document: 'submissions/{id}', region: REGION },
  async (event) => {
    const s = event.data?.data();
    if (!s || s.status !== 'disputed') return;
    const [matchSnap, eventDoc] = await Promise.all([
      db().doc(`matches/${s.match_id}`).get(),
      s.event_id ? db().doc(`events/${s.event_id}`).get() : Promise.resolve(null),
    ]);
    const m = matchSnap.exists ? matchSnap.data() : {};
    const managers = eventDoc && eventDoc.exists ? eventOrganizerUids(eventDoc.data()) : [];
    await notify(managers.length ? managers : await organizerUids(), {
      type: 'organizer_score_disputed',
      title: 'Two players disagree about a result',
      body: `${m.player_1_name || ''} vs ${m.player_2_name || ''}`.trim(),
      link: '/profile?dash=organizer',
    });
  },
);

// ─── Rallies ───────────────────────────────────────────────────
// Same shape as the ladder-challenge triggers, minus points/organizer steps.

const rallyBody = (entry, uid) => `${entry && scoreLineOf(entry) ? `${scoreLineOf(entry)}. ` : ''}${entry && uid === entry.winner_uid ? 'You picked up 2 points.' : 'You picked up 1 point.'}`;

exports.onRallyCreated = onDocumentCreated(
  { document: 'matches/{id}', region: REGION, secrets: [resendApiKey] },
  async (event) => {
    const r = event.data?.data();
    if (!r || r.category !== 'rally' || !r.player_2_uid) return;
    if (r.status === 'complete') {
      const entry = await appliedEntry(event.params.id);
      await Promise.all(matchPlayers(r).map((uid) => notify(uid, {
        type: 'rally_confirmed', title: 'Your organizer recorded a rally for you', body: rallyBody(entry, uid), link: '/matches?mode=rallies',
      })));
      return;
    }
    if (r.status !== 'open') return;
    await sendEmailOnce(r.player_2_uid, `rally-invite:${event.params.id}`, `${r.player_1_name || 'A player'} wants to rally with you 🤝`,
      buildRallyEmail(r.player_1_name || 'A player'));
  },
);

exports.onRallyUpdated = onDocumentUpdated(
  { document: 'matches/{id}', region: REGION, secrets: [resendApiKey] },
  async (event) => {
    const before = event.data?.before.data() || {};
    const after = event.data?.after.data() || {};
    if (after.category !== 'rally' || before.status === after.status || !after.player_1_uid) return;
    if (after.status === 'accepted') {
      await sendEmailOnce(after.player_1_uid, `rally-accepted:${event.params.id}`,
        `${after.player_2_name || 'Your rally partner'} accepted your rally invite!`,
        buildRallyAcceptedEmail(after.player_2_name || 'Your rally partner'));
    } else if (after.status === 'complete') {
      const entry = await appliedEntry(event.params.id);
      await Promise.all(resultAudience(after, entry).filter(Boolean).map((uid) => notify(uid, {
        type: 'rally_confirmed', title: 'Rally recorded', body: rallyBody(entry, uid), link: '/matches?mode=rallies',
      })));
    }
  },
);

// ─── Tasks ──────────────────────────────────────────────────────────────────

const SELF_REPORTED = ['profilePhoto', 'profileComplete', 'whatsappGroup', 'followSocial', 'tagPost'];

exports.onTaskProgressUpdated = onDocumentUpdated(
  { document: 'stats/{uid}', region: REGION },
  async (event) => {
    const before = event.data?.before.data() || {};
    const after = event.data?.after.data() || {};
    const uid = event.params.uid;
    if (!initiationDone(before) && initiationDone(after)) {
      await notify(uid, {
        type: 'initiation_complete',
        title: 'Community Member Initiation complete: 25 points',
        body: 'Your points are on the Community leaderboard.',
        link: '/leagues',
      });
      return;
    }
    // A self-reported task an organizer took back.
    if (SELF_REPORTED.some((k) => before[k] === true && after[k] === false)) {
      await notify(uid, {
        type: 'task_revoked',
        title: 'A task was removed from your Initiation',
        body: 'An organizer reviewed a claimed task. Complete it again to restore your progress.',
        link: '/tasks',
      });
    }
  },
);

// ─── Events ─────────────────────────────────────────────────────────────────

exports.onParticipantJoined = onDocumentCreated(
  { document: 'event_participants/{id}', region: REGION },
  async (event) => {
    const p = event.data?.data();
    if (!p?.event_id || isGuest(p.uid)) return;
    const eventDoc = await db().doc(`events/${p.event_id}`).get();
    if (!eventDoc.exists) return;
    const e = eventDoc.data();
    await notify(p.uid, { type: 'task_completed', title: `You're in: ${e.title || 'event'}`, body: 'We’ll let you know when the draw is out.', link: '/events' });
    await notify(eventOrganizerUids(e), { type: 'organizer_event_roster', title: `${p.user_name || 'A player'} joined ${e.title || 'your event'}`, link: '/events' });
  },
);

// ─── Newsletter ─────────────────────────────────────────────────────────────

// A member's own row (doc id = uid) confirms by notification. A visitor row (member: false) whose
// email is a member's contacts.email is marked member: true; it has nobody to tell.
exports.onNewsletterSubscribed = onDocumentCreated(
  { document: 'mailing_list/{id}', region: REGION },
  async (event) => {
    const s = event.data?.data();
    if (!s) return;
    if (s.member === false) {
      const email = String(s.email || '').trim();
      const forms = [...new Set([email, email.toLowerCase()].filter(Boolean))];
      if (forms.length && !(await db().collection('contacts').where('email', 'in', forms).limit(1).get()).empty) {
        await event.data.ref.update({ member: true });
      }
      return;
    }
    if (!s.uid || s.uid !== event.params.id) return;
    await notify(s.uid, { type: 'newsletter_subscribed', title: 'You’ve been added to the list', body: 'Check your email for the latest issue.', link: '/' });
  },
);

// ─── Courts ─────────────────────────────────────────────────────────────────

// Name + Dropdown of every court in the hosted courts CSV, lower-cased. Cached per instance.
let courtNames = null;
async function knownCourtNames() {
  if (courtNames) return courtNames;
  const text = await fetch(`${SITE}/${encodeURIComponent('Tennis Courts Facilities - 4326.csv')}`).then((r) => (r.ok ? r.text() : ''));
  const [header, ...lines] = text.split(/\r?\n/).filter(Boolean);
  if (!header) return null;
  // Quote-aware split: some club names ("Nyta …,The Don Mills …") carry commas.
  const cells = (line) => (line.match(/("([^"]|"")*"|[^,]*)(,|$)/g) || []).map((c) => c.replace(/,$/, '').replace(/^"|"$/g, ''));
  const cols = cells(header);
  const iName = cols.indexOf('Name'), iDropdown = cols.indexOf('Dropdown');
  courtNames = new Set(lines.flatMap((l) => { const c = cells(l); return [c[iName], c[iDropdown]]; })
    .map((n) => String(n || '').trim().toLowerCase()).filter(Boolean));
  return courtNames;
}

// A member saved a court that isn't in the courts list: tell the super admin and organizers, so
// a typo can be added to scripts/fix-court-names.mjs. Only newly added entries alert.
exports.onCustomCourtEntered = onDocumentWritten(
  { document: 'preferences/{uid}', region: REGION },
  async (event) => {
    const before = new Set(event.data?.before?.data()?.preferred_courts || []);
    const added = (event.data?.after?.data()?.preferred_courts || []).filter((c) => c && !before.has(c));
    if (added.length === 0) return;
    const known = await knownCourtNames().catch((e) => { logger.error('courts CSV fetch failed', e); return null; });
    if (!known) return;
    const custom = added.filter((c) => !known.has(String(c).trim().toLowerCase()));
    if (custom.length === 0) return;
    const uid = event.params.uid;
    const name = (await db().doc(`users/${uid}`).get()).get('name') || 'A member';
    await notify(await organizerUids(), {
      type: 'custom_court', title: 'Court not in the list', body: `${name} entered ${custom.map((c) => `"${c}"`).join(', ')}.`, link: '/profile?dash=organizer',
    });
  },
);

// ─── Scheduled reminders ────────────────────────────────────────────────────

// Tuesday 9am: your outstanding matches + ladder challenges reset.
exports.weeklyReminders = onSchedule(
  { schedule: '0 9 * * 2', timeZone: TZ, region: REGION },
  async () => {
    // Stale rallies and challenges are closed first, so they aren't counted below.
    const closed = await closeStaleRequests(db());
    logger.info(`weeklyReminders: closed ${closed.rallies} stale rallies (played), ${closed.challenges} stale challenges (declined)`);
    const cancelled = new Set((await db().collection('events').where('status', '==', 'cancelled').get()).docs.map((d) => d.id));

    // Unplayed tournament fixtures (created accepted) with both players in.
    const matches = await db().collection('matches').where('category', '==', 'tournament').where('status', '==', 'accepted').get();
    const pendingByUser = new Map();
    matches.docs.forEach((d) => {
      const m = d.data();
      if (!isRealMatch(d.id, m) || cancelled.has(m.event_id) || !m.player_1_uid || !m.player_2_uid) return;
      matchPlayers(m).forEach((uid) => pendingByUser.set(uid, (pendingByUser.get(uid) || 0) + 1));
    });
    await Promise.all([...pendingByUser.entries()].map(([uid, count]) => notify(uid, {
      type: 'reminder_pending_matches',
      title: `You have ${count} match${count > 1 ? 'es' : ''} to play`,
      body: 'Arrange a time with your opponent this week.',
      link: '/tournament',
    })));
    // No weekly "incomplete matches" email: removed at the owner's request (2026-10-23).
  },
);

// Nightly cleanup: drop notifications older than 30 days (pages until the backlog is clear), and
// clear the coordinates of check-ins older than 30 days. Score visits already carry lat 0; dist_m
// stays, so courtCounts can still tell a check-in from a score.
exports.pruneNotifications = onSchedule(
  { schedule: '0 3 * * *', timeZone: TZ, region: REGION },
  async () => {
    const cutoff = Timestamp.fromMillis(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const PAGE = 400;
    const MAX_PAGES = 25;
    let deleted = 0;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const old = await db().collection('notifications').where('created_at', '<', cutoff).limit(PAGE).get();
      if (old.empty) break;
      const batch = db().batch();
      old.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      deleted += old.size;
      if (old.size < PAGE) break;
    }
    if (deleted) logger.info(`Pruned ${deleted} notifications`);

    const located = await db().collection('courts').where('category', '==', 'visit').where('lat', '>', 0).get();
    const stale = located.docs.filter((d) => d.data().created_at?.toMillis?.() < cutoff.toMillis());
    for (let i = 0; i < stale.length; i += PAGE) {
      const batch = db().batch();
      stale.slice(i, i + PAGE).forEach((d) => batch.update(d.ref, { lat: 0, lng: 0 }));
      await batch.commit();
    }
    if (stale.length) logger.info(`Cleared the location of ${stale.length} check-ins`);
  },
);
