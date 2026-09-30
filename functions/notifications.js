/**
 * Notification triggers.
 *
 * Every notification is created here, server-side, so it reaches people who weren't the one
 * clicking (and so players can't write into each other's feeds — see firestore.rules).
 * Firestore triggers cover things that happen; scheduled jobs cover time-based reminders.
 *
 * Deploy with: firebase deploy --only functions
 */
const { onDocumentCreated, onDocumentUpdated, onDocumentWritten } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');
const { notify, organizerUids, sendEmailOnce, resendApiKey } = require('./lib/notify');
const { eventOrganizerUids } = require('./lib/roles');
const {
  buildRallyEmail, buildRallyAcceptedEmail, buildChallengeEmail, buildChallengeAcceptedEmail, buildIncompleteMatchesEmail,
} = require('./lib/emailTemplates');

const { TZ, REGION, SITE } = require('./lib/constants');
const db = () => admin.firestore();

// "6-4, 6-3" from the absolute per-set fields every result now carries. Falls back to the legacy
// `score_line` string for rows written before challenges/rallies used the tournament shape.
const scoreLineOf = (m) => {
  const line = [1, 2, 3]
    .map((n) => [m[`set_${n}_player_1`] ?? 0, m[`set_${n}_player_2`] ?? 0])
    .filter(([a, b]) => a > 0 || b > 0)
    .map(([a, b]) => `${a}-${b}`)
    .join(', ');
  return line || m.score_line || '';
};

const matchPlayers = (m) => [m.player_1_uid, m.player_2_uid].filter(Boolean);
const otherPlayer = (m, uid) => (m.player_1_uid === uid ? m.player_2_uid : m.player_1_uid);
const opponentName = (m, uid) => (m.player_1_uid === uid ? m.player_2_name : m.player_1_name);
const matchLink = (m) => `/tournament?event=${m.event_id}`;
// Preview/placeholder docs never represent a real fixture.
const isRealMatch = (id, m) => !id.startsWith('preview_') && !id.startsWith('ll_preview_') && !!m.event_id;

const fmtDate = (iso) => {
  if (!iso) return '';
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
};

// ─── Matches ────────────────────────────────────────────────────────────────

// A new match doc = the draw is out (or a group was formed). Tell both named players.
exports.onMatchCreated = onDocumentCreated(
  { document: 'matches/{matchId}', region: REGION },
  async (event) => {
    const m = event.data?.data();
    if (!m || (m.category !== 'singles' && m.category !== 'doubles')) return;
    if (!isRealMatch(event.params.matchId, m)) return;
    const players = matchPlayers(m);
    if (players.length === 0) return;

    const isRR = !!m.rr_group || m.format === 'rr';
    await Promise.all(players.map((uid) => {
      const opp = opponentName(m, uid);
      // A slot with no opponent yet is a bye through to the next round.
      if (!otherPlayer(m, uid)) {
        return notify(uid, {
          type: 'match_bye',
          title: 'You have a bye',
          body: 'You advance to the next round automatically.',
          link: matchLink(m),
        });
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

// Schedule set/changed, score recorded, and advancement into an empty slot.
exports.onMatchUpdated = onDocumentUpdated(
  { document: 'matches/{matchId}', region: REGION },
  async (event) => {
    const before = event.data?.before.data() || {};
    const after = event.data?.after.data() || {};
    if ((after.category !== 'singles' && after.category !== 'doubles')) return;
    if (!isRealMatch(event.params.matchId, after)) return;

    // Organizer set or changed the date — the highest-value notification in the app.
    const dateChanged = before.proposed_date !== after.proposed_date || before.proposed_slot !== after.proposed_slot;
    if (after.schedule_status === 'scheduled' && after.proposed_date && dateChanged) {
      const when = `${fmtDate(after.proposed_date)}${after.proposed_slot ? ` ${after.proposed_slot}` : ''}`;
      await Promise.all(matchPlayers(after).map((uid) => notify(uid, {
        type: 'match_scheduled',
        title: before.schedule_status === 'scheduled' ? 'Your match time changed' : 'Your match has been scheduled',
        body: `${when}${opponentName(after, uid) ? ` vs ${opponentName(after, uid)}` : ''}`,
        link: matchLink(after),
      })));
    }

    // Advancement: an empty player slot became filled — the next-round pairing is known.
    const slots = ['player_1_uid', 'player_2_uid'];
    const newlyFilled = slots.some((s) => !before[s] && after[s]);
    const bothSet = after.player_1_uid && after.player_2_uid;
    if (newlyFilled && bothSet && after.status !== 'complete') {
      await Promise.all(matchPlayers(after).map((uid) => notify(uid, {
        type: 'match_advanced',
        title: 'Your next opponent is ready',
        body: opponentName(after, uid) ? `You play ${opponentName(after, uid)}` : '',
        link: matchLink(after),
      })));
    }
  },
);

// ─── Scheduling assistance ──────────────────────────────────────────────────

// One player asked the OTHER to sort out a time. The organizer is not in the middle of this: the
// two arrange it between themselves, which is why the notification carries the asker's uid — the
// feed renders their contact buttons on the row, the app's substitute for in-app messaging.
exports.onScheduleRequested = onDocumentUpdated(
  { document: 'matches/{matchId}', region: REGION },
  async (event) => {
    const before = event.data?.before.data() || {};
    const after = event.data?.after.data() || {};
    if ((after.category !== 'singles' && after.category !== 'doubles')) return;
    if (before.schedule_requested === true || after.schedule_requested !== true) return;
    if (!isRealMatch(event.params.matchId, after)) return;

    // Written by the client alongside the flag. Without it there is no way to tell which of the
    // two players asked, so there is nobody to notify and nobody to offer contact details for.
    const askerUid = after.schedule_requested_by;
    if (!askerUid) return;
    const isP1 = askerUid === after.player_1_uid;
    const otherUid = isP1 ? after.player_2_uid : after.player_1_uid;
    const askerName = isP1 ? after.player_1_name : after.player_2_name;
    if (!otherUid) return;

    await notify(otherUid, {
      type: 'opponent_schedule_request',
      title: `${askerName || 'Your opponent'} wants to arrange your match`,
      body: 'Pick a time between you.',
      link: matchLink(after),
      // Read by the notifications feed to render this person's contact buttons on the row.
      counterpart_uid: askerUid,
      counterpart_name: askerName || 'Your opponent',
    });
  },
);

// ─── League Ladder ──────────────────────────────────────────────────────────

exports.onLadderChallengeCreated = onDocumentCreated(
  { document: 'matches/{id}', region: REGION, secrets: [resendApiKey] },
  async (event) => {
    const c = event.data?.data();
    if (!c || c.category !== 'challenge') return;
    if (!c.player_2_uid) return;

    // An organizer recording a match two members already played creates the doc COMPLETE. Telling
    // the pair they have been "challenged" would invite them to a match they finished, so that
    // case gets its own notice below instead.
    if (c.status === 'confirmed') {
      const winnerName = c.winner_name || c.claimed_winner_name;
      await notify([c.player_1_uid, c.player_2_uid].filter(Boolean), {
        type: 'ladder_reported',
        title: 'Your organizer recorded a challenge for you',
        body: winnerName ? `Winner: ${winnerName}${scoreLineOf(c) ? ` · ${scoreLineOf(c)}` : ''}` : '',
        link: '/matches?mode=challenges',
      });
      return;
    }
    if (c.status !== 'open') return;

    // No in-app notification: an open challenge (or a proposed conversion) appears as the request
    // itself under Needs you on the Player Dash (/profile). The email still goes out.
    const eventDoc = await db().doc(`events/${c.event_id}`).get();
    const ladderName = eventDoc.exists ? (eventDoc.data().title || 'League Ladder') : 'League Ladder';
    await sendEmailOnce(
      c.player_2_uid,
      `challenge-received:${event.params.id}`,
      'You have received a challenge!',
      buildChallengeEmail(c.player_1_name || 'A player', ladderName),
    );
  },
);

exports.onLadderChallengeUpdated = onDocumentUpdated(
  { document: 'matches/{id}', region: REGION, secrets: [resendApiKey] },
  async (event) => {
    const before = event.data?.before.data() || {};
    const after = event.data?.after.data() || {};
    if (after.category !== 'challenge') return;
    if (before.status === after.status) return;
    const link = '/matches?mode=challenges';
    const both = [after.player_1_uid, after.player_2_uid];

    // Opponent accepted a from-scratch challenge. A conversion is excluded: accepting one records
    // the match outright (scoreMatch), and the "result recorded" branch below covers it.
    if (before.status === 'open' && after.status === 'accepted' && !after.source) {
      // No in-app notification: the accepted challenge moves into Matches to play on both players'
      // Player Dash. The email still goes out.
      const eventDoc = await db().doc(`events/${after.event_id}`).get();
      const ladderName = eventDoc.exists ? (eventDoc.data().title || 'League Ladder') : 'League Ladder';
      await sendEmailOnce(
        after.player_1_uid,
        `challenge-accepted:${event.params.id}`,
        `${after.player_2_name || 'Your opponent'} accepted your challenge!`,
        buildChallengeAcceptedEmail(after.player_2_name || 'Your opponent', ladderName),
      );
      return;
    }

    // A declined challenge sends no in-app notification: it leaves the challenger's "waiting for a
    // reply" list on the Player Dash.
    if (before.status === 'open' && after.status === 'declined') return;

    // The result landed. It counts already — there is no confirmation step — so this tells the
    // player who did NOT record it. Telling the person who just typed it in is noise. An
    // organizer recording the match for a pair is the exception: neither of them typed it.
    if (after.status === 'confirmed') {
      const recorder = after.recorded_by_organizer ? null : after.reported_by;
      const audience = recorder
        ? [recorder === after.player_1_uid ? after.player_2_uid : after.player_1_uid]
        : both;
      const winnerName = after.winner_name || after.claimed_winner_name;
      await notify(audience.filter(Boolean), {
        type: 'ladder_reported',
        title: 'A challenge result was recorded',
        body: winnerName ? `Winner: ${winnerName}${scoreLineOf(after) ? ` · ${scoreLineOf(after)}` : ''}` : '',
        link,
      });
      return;
    }

    // Legacy `rejected` rows (a second word for `declined`) likewise send nothing now.
  },
);

// A player recorded a different winner from the one on record, on any match type. The first
// result stands until an organizer approves or rejects the disputing score.
exports.onResultDisputed = onDocumentUpdated(
  { document: 'matches/{id}', region: REGION },
  async (event) => {
    const before = event.data?.before.data() || {};
    const after = event.data?.after.data() || {};
    if (before.score_disputed === true || after.score_disputed !== true) return;
    const eventDoc = after.event_id ? await db().doc(`events/${after.event_id}`).get() : null;
    const managers = eventDoc && eventDoc.exists ? eventOrganizerUids(eventDoc.data()) : [];
    // Every kind of dispute is settled in one place now — the Organizer Dash. The per-category
    // panels on Matches and the Tournament page are gone, so those links would land nowhere.
    const link = '/profile?dash=organizer';
    await notify(managers.length ? managers : await organizerUids(), {
      type: 'organizer_score_disputed',
      title: 'Two players disagree about a result',
      body: `${after.player_1_name || ''} vs ${after.player_2_name || ''}`.trim(),
      link,
    });
  },
);


// ─── Rallies ───────────────────────────────────────────────────
// Same shape as the ladder-challenge triggers, minus points/organizer steps.

exports.onRallyCreated = onDocumentCreated(
  { document: 'matches/{id}', region: REGION, secrets: [resendApiKey] },
  async (event) => {
    const r = event.data?.data();
    if (!r || r.category !== 'rally') return;
    if (!r.player_2_uid) return;

    // An organizer recording a rally the pair already played creates it COMPLETE — no invitation.
    if (r.status === 'confirmed') {
      const winner = r.winner_uid || r.claimed_winner_uid;
      await Promise.all([r.player_1_uid, r.player_2_uid].filter(Boolean).map((uid) => notify(uid, {
        type: 'rally_confirmed',
        title: 'Your organizer recorded a rally for you',
        body: `${scoreLineOf(r) ? `${scoreLineOf(r)}. ` : ''}${uid === winner ? 'You picked up 2 points.' : 'You picked up 1 point.'}`,
        link: '/matches?mode=rallies',
      })));
      return;
    }
    if (r.status !== 'open') return;

    // No in-app notification: an open rally appears as the request itself under Needs you on the
    // Player Dash (/profile). The email still goes out.
    await sendEmailOnce(
      r.player_2_uid,
      `rally-invite:${event.params.id}`,
      `${r.player_1_name || 'A player'} wants to rally with you 🤝`,
      buildRallyEmail(r.player_1_name || 'A player'),
    );
  },
);

exports.onRallyUpdated = onDocumentUpdated(
  { document: 'matches/{id}', region: REGION, secrets: [resendApiKey] },
  async (event) => {
    const before = event.data?.before.data() || {};
    const after = event.data?.after.data() || {};
    if (after.category !== 'rally') return;
    if (before.status === after.status || !after.player_1_uid) return;
    // Accepted and declined rallies send no in-app notification: the Player Dash shows the rally
    // moving into Matches to play, or leaving the sender's "waiting for a reply" list.
    if (after.status === 'accepted') {
      await sendEmailOnce(
        after.player_1_uid,
        `rally-accepted:${event.params.id}`,
        `${after.player_2_name || 'Your rally partner'} accepted your rally invite!`,
        buildRallyAcceptedEmail(after.player_2_name || 'Your rally partner'),
      );
    } else if (after.status === 'confirmed') {
      // The score counts as soon as one player records it, so this tells the OTHER player. The
      // person who just typed it in already knows. An organizer recording the match for a pair is
      // the exception — neither of them typed it, so both hear.
      const winner = after.winner_uid || after.claimed_winner_uid;
      const recorder = after.recorded_by_organizer ? null : after.reported_by;
      const audience = recorder
        ? [recorder === after.player_1_uid ? after.player_2_uid : after.player_1_uid]
        : [after.player_1_uid, after.player_2_uid];
      await Promise.all(audience.filter(Boolean).map((uid) => notify(uid, {
        type: 'rally_confirmed',
        title: 'Rally recorded',
        body: `${scoreLineOf(after) ? `${scoreLineOf(after)}. ` : ''}${uid === winner ? 'You picked up 2 points.' : 'You picked up 1 point.'}`,
        link: '/matches?mode=rallies',
      })));
    }
  },
);


// ─── Tasks ──────────────────────────────────────────────────────────────────

exports.onTaskProgressUpdated = onDocumentUpdated(
  { document: 'tasks/{uid}', region: REGION },
  async (event) => {
    const before = event.data?.before.data() || {};
    const after = event.data?.after.data() || {};
    const uid = event.params.uid;

    if (!before.setupComplete && after.setupComplete) {
      await notify(uid, {
        type: 'initiation_complete',
        title: 'Community Member Initiation complete: 25 points',
        body: 'Your points are on the Community leaderboard.',
        link: '/leagues',
      });
      return;
    }

    // A task the organizer took back.
    const revoked = Object.keys(after).find(
      (k) => before[k] === true && after[k] === false && k !== 'setupComplete',
    );
    if (revoked) {
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
    if (!p?.event_id) return;
    const eventDoc = await db().doc(`events/${p.event_id}`).get();
    if (!eventDoc.exists) return;
    const e = eventDoc.data();
    const link = `/events`;

    await notify(p.uid, {
      type: 'task_completed',
      title: `You're in: ${e.title || 'event'}`,
      body: 'We’ll let you know when the draw is out.',
      link,
    });
    await notify(eventOrganizerUids(e), {
      type: 'organizer_event_roster',
      title: `${p.user_name || 'A player'} joined ${e.title || 'your event'}`,
      link,
    });
  },
);

// ─── Newsletter ─────────────────────────────────────────────────────────────

// A member's own row (doc id = uid) confirms by notification; visitor rows have no uid to tell.
exports.onNewsletterSubscribed = onDocumentCreated(
  { document: 'mailing_list/{id}', region: REGION },
  async (event) => {
    const s = event.data?.data();
    if (!s?.uid || s.uid !== event.params.id) return;
    await notify(s.uid, {
      type: 'newsletter_subscribed',
      title: 'You’ve been added to the list',
      body: 'Check your email for the latest issue.',
      link: '/',
    });
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
      type: 'custom_court',
      title: 'Court not in the list',
      body: `${name} entered ${custom.map((c) => `"${c}"`).join(', ')}.`,
      link: '/profile?dash=organizer',
    });
  },
);

// ─── Scheduled reminders ────────────────────────────────────────────────────

// Tuesday 9am: your outstanding matches + ladder challenges reset.
exports.weeklyReminders = onSchedule(
  { schedule: '0 9 * * 2', timeZone: TZ, region: REGION, secrets: [resendApiKey] },
  async () => {
    // Pending tournament matches (singles/doubles only — rallies/challenges handled below).
    const matches = await db().collection('matches')
      .where('category', 'in', ['singles', 'doubles'])
      .where('status', '==', 'pending').get();
    const pendingByUser = new Map();
    const pendingByUserEvent = new Map(); // uid -> Map<event_id, count>
    matches.docs.forEach((d) => {
      const m = d.data();
      if (!isRealMatch(d.id, m)) return;
      matchPlayers(m).forEach((uid) => {
        pendingByUser.set(uid, (pendingByUser.get(uid) || 0) + 1);
        if (!pendingByUserEvent.has(uid)) pendingByUserEvent.set(uid, new Map());
        const byEvent = pendingByUserEvent.get(uid);
        byEvent.set(m.event_id, (byEvent.get(m.event_id) || 0) + 1);
      });
    });
    await Promise.all([...pendingByUser.entries()].map(([uid, count]) => notify(uid, {
      type: 'reminder_pending_matches',
      title: `You have ${count} match${count > 1 ? 'es' : ''} to play`,
      body: 'Arrange a time with your opponent this week.',
      link: '/tournament',
    })));

    // (Event titles used to be fetched here to itemise the digest by tournament. The template
    // now shows a single total, so that per-event read is gone.)

    // Accepted challenges — "still needs to be played." Rallies are deliberately NOT counted:
    // a rally carries no points, no standings and no organizer step, so chasing one is noise.
    // Only tournament fixtures and ladder challenges belong in this digest. (The rally query and
    // its source: 'rally' de-duplication went with it — nothing else read either.)
    const acceptedChallenges = await db().collection('matches')
      .where('category', '==', 'challenge').where('status', '==', 'accepted').get();
    const challengeCountByUser = new Map();
    acceptedChallenges.docs.forEach((d) => {
      const c = d.data();
      if (!c.player_1_uid || !c.player_2_uid) return;
      [c.player_1_uid, c.player_2_uid].forEach((uid) => challengeCountByUser.set(uid, (challengeCountByUser.get(uid) || 0) + 1));
    });

    // One digest email per player who has anything pending across both categories. Keyed by
    // today's date so a retry of this same run doesn't double-send (next week's date differs).
    const weekKey = new Date().toISOString().slice(0, 10);
    const allUids = new Set([...pendingByUserEvent.keys(), ...challengeCountByUser.keys()]);
    await Promise.all([...allUids].map((uid) => {
      // The digest reports a single total — the per-category breakdown it used to itemise was
      // dropped from the template, so only the count is summed here.
      let total = 0;
      const byEvent = pendingByUserEvent.get(uid);
      if (byEvent) byEvent.forEach((count) => { total += count; });
      total += challengeCountByUser.get(uid) || 0;
      if (total === 0) return Promise.resolve();
      return sendEmailOnce(
        uid,
        `incomplete-matches:${uid}:${weekKey}`,
        `You have ${total} incomplete match${total === 1 ? '' : 'es'}`,
        // Built from the recipient's user doc so the greeting can use their first name —
        // sendEmail already reads it, so this costs no extra Firestore read.
        (u) => buildIncompleteMatchesEmail(total, (u.name || '').trim().split(/\s+/)[0]),
      );
    }));

    // Weekly ladder allowance reset — anyone who used a challenge last week.
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const challenges = await db().collection('matches').where('category', '==', 'challenge').where('created_at', '>=', weekAgo).get();
    const challengers = [...new Set(challenges.docs.map((d) => d.data().player_1_uid).filter(Boolean))];
    await notify(challengers, {
      type: 'ladder_challenges_reset',
      title: 'Your ladder challenges have reset',
      body: 'You have 3 challenges available this week.',
      link: '/matches?mode=challenges',
    });
  },
);

// Nightly cleanup: drop notifications older than 30 days.
exports.pruneNotifications = onSchedule(
  { schedule: '0 3 * * *', timeZone: TZ, region: REGION },
  async () => {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // Loops until the backlog is clear instead of deleting a single batch of 500 per night.
    // weeklyReminders alone can create more than 500 in one run, so the old single-shot version
    // could never catch up once creation outpaced it — the collection grew without bound and the
    // 30-day retention was silently violated. The page cap stops a runaway from burning the
    // whole function timeout.
    const PAGE = 400;
    const MAX_PAGES = 25;
    let deleted = 0;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const old = await db().collection('notifications')
        .where('created_at', '<', cutoff).limit(PAGE).get();
      if (old.empty) break;
      const batch = db().batch();
      old.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      deleted += old.size;
      if (old.size < PAGE) break;
    }
    if (deleted === 0) return;
    logger.info(`Pruned ${deleted} notifications`);
  },
);
