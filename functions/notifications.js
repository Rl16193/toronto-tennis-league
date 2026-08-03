/**
 * Notification triggers.
 *
 * Every notification is created here, server-side, so it reaches people who weren't the one
 * clicking (and so players can't write into each other's feeds — see firestore.rules).
 * Firestore triggers cover things that happen; scheduled jobs cover time-based reminders.
 *
 * Deploy with: firebase deploy --only functions
 */
const { onDocumentCreated, onDocumentUpdated, onDocumentDeleted } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');
const { notify, sendEmailOnce, resendApiKey } = require('./lib/notify');
const {
  buildRallyEmail, buildRallyAcceptedEmail, buildChallengeEmail, buildChallengeAcceptedEmail, buildIncompleteMatchesEmail,
} = require('./lib/emailTemplates');

const REGION = 'us-central1';
const TZ = 'America/Toronto';
const db = () => admin.firestore();

const matchPlayers = (m) => [m.player_1_user_id, m.player_2_user_id].filter(Boolean);
const otherPlayer = (m, uid) => (m.player_1_user_id === uid ? m.player_2_user_id : m.player_1_user_id);
const opponentName = (m, uid) => (m.player_1_user_id === uid ? m.player_2_name : m.player_1_name);
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
  { document: 'tournament_matches/{matchId}', region: REGION },
  async (event) => {
    const m = event.data?.data();
    if (!m || !isRealMatch(event.params.matchId, m)) return;
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
  { document: 'tournament_matches/{matchId}', region: REGION },
  async (event) => {
    const before = event.data?.before.data() || {};
    const after = event.data?.after.data() || {};
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
    const slots = ['player_1_user_id', 'player_2_user_id'];
    const newlyFilled = slots.some((s) => !before[s] && after[s]);
    const bothSet = after.player_1_user_id && after.player_2_user_id;
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

// ─── Scores ─────────────────────────────────────────────────────────────────

// A player submitted a score: alert the organizer to confirm, and the opponent that a result
// was claimed against them.
exports.onScoreSubmitted = onDocumentCreated(
  { document: 'score_submissions/{id}', region: REGION },
  async (event) => {
    const s = event.data?.data();
    if (!s?.event_id) return;
    const eventDoc = await db().doc(`events/${s.event_id}`).get();
    const creatorId = eventDoc.exists ? eventDoc.data().creator_id : null;
    const link = `/tournament?event=${s.event_id}`;

    await notify(creatorId, {
      type: 'organizer_score_pending',
      title: 'A score needs your approval',
      body: `${s.player_1_name || ''} vs ${s.player_2_name || ''}`.trim(),
      link,
    });
  },
);

// Submissions are deleted on both confirm and reject. A confirm also flips the match to
// complete (covered by onMatchUpdated), so only tell the submitter when it was NOT applied.
exports.onScoreSubmissionResolved = onDocumentDeleted(
  { document: 'score_submissions/{id}', region: REGION },
  async (event) => {
    const s = event.data?.data();
    if (!s?.submitted_by || !s.match_id) return;
    const matchDoc = await db().doc(`tournament_matches/${s.match_id}`).get();
    if (!matchDoc.exists) return;
    const m = matchDoc.data();
    // Applied => the match now has this winner recorded. Otherwise it was rejected.
    if (m.status === 'complete' && m.winner_user_id === s.claimed_winner_user_id) return;

    await notify(s.submitted_by, {
      type: 'score_rejected',
      title: 'Your score submission was rejected',
      body: 'The organizer didn’t accept the reported result. Please re-submit the correct score.',
      link: `/tournament?event=${s.event_id}`,
    });
  },
);

// ─── Scheduling assistance ──────────────────────────────────────────────────

// Replaces the old client-side write: the player's request now notifies the organizer here.
exports.onScheduleRequested = onDocumentUpdated(
  { document: 'tournament_matches/{matchId}', region: REGION },
  async (event) => {
    const before = event.data?.before.data() || {};
    const after = event.data?.after.data() || {};
    if (before.schedule_requested === true || after.schedule_requested !== true) return;
    if (!isRealMatch(event.params.matchId, after)) return;

    const eventDoc = await db().doc(`events/${after.event_id}`).get();
    if (!eventDoc.exists) return;
    await notify(eventDoc.data().creator_id, {
      type: 'organizer_schedule_request',
      title: 'A player asked you to schedule a match',
      body: `${after.player_1_name || ''} vs ${after.player_2_name || ''}`.trim(),
      link: `/tournament?event=${after.event_id}`,
    });
  },
);

// ─── League Ladder ──────────────────────────────────────────────────────────

exports.onLadderChallengeCreated = onDocumentCreated(
  { document: 'ladder_challenges/{id}', region: REGION, secrets: [resendApiKey] },
  async (event) => {
    const c = event.data?.data();
    if (!c?.opponent_id) return;
    // A conversion proposal (source set) is a distinct ask from a from-scratch challenge —
    // the opponent already played the match/rally and is being asked to confirm it counts.
    if (c.source) {
      await notify(c.opponent_id, {
        type: 'challenge_conversion_proposed',
        title: `${c.challenger_name || 'A player'} converted your ${c.source === 'friendly' ? 'rally' : 'match'} to a challenge`,
        body: 'Review and confirm the result to register it as a challenge.',
        link: '/matches?mode=challenges',
      });
    } else {
      await notify(c.opponent_id, {
        type: 'ladder_challenged',
        title: `${c.challenger_name || 'A player'} challenged you`,
        body: 'Arrange a time and report the result when you’ve played.',
        link: '/matches?mode=challenges',
      });
    }
    const eventDoc = await db().doc(`events/${c.event_id}`).get();
    const ladderName = eventDoc.exists ? (eventDoc.data().title || 'League Ladder') : 'League Ladder';
    await sendEmailOnce(
      c.opponent_id,
      `challenge-received:${event.params.id}`,
      'You have received a challenge!',
      buildChallengeEmail(c.challenger_name || 'A player', ladderName),
    );
  },
);

exports.onLadderChallengeUpdated = onDocumentUpdated(
  { document: 'ladder_challenges/{id}', region: REGION, secrets: [resendApiKey] },
  async (event) => {
    const before = event.data?.before.data() || {};
    const after = event.data?.after.data() || {};
    if (before.status === after.status) return;
    const link = '/matches?mode=challenges';
    const both = [after.challenger_id, after.opponent_id];

    // Opponent accepted a from-scratch challenge (not a conversion — those go straight from
    // 'open' to 'reported' and already have their own "conversion proposed" notification).
    if (before.status === 'open' && after.status === 'accepted' && !after.source) {
      await notify(after.challenger_id, {
        type: 'ladder_accepted',
        title: `${after.opponent_name || 'Your opponent'} accepted your challenge`,
        body: 'Arrange a time and report the result when you’ve played.',
        link,
      });
      const eventDoc = await db().doc(`events/${after.event_id}`).get();
      const ladderName = eventDoc.exists ? (eventDoc.data().title || 'League Ladder') : 'League Ladder';
      await sendEmailOnce(
        after.challenger_id,
        `challenge-accepted:${event.params.id}`,
        `${after.opponent_name || 'Your opponent'} accepted your challenge!`,
        buildChallengeAcceptedEmail(after.opponent_name || 'Your opponent', ladderName),
      );
      return;
    }

    if (after.status === 'reported') {
      // Tell whoever didn't report it.
      const reporter = after.reported_by;
      const other = reporter === after.challenger_id ? after.opponent_id : after.challenger_id;
      await notify(other || both, {
        type: 'ladder_reported',
        title: 'A ladder result was reported',
        body: after.claimed_winner_name ? `Reported winner: ${after.claimed_winner_name}` : '',
        link,
      });
      const eventDoc = await db().doc(`events/${after.event_id}`).get();
      if (eventDoc.exists) {
        await notify(eventDoc.data().creator_id, {
          type: 'organizer_ladder_pending',
          title: 'A ladder result needs confirming',
          body: `${after.challenger_name || ''} vs ${after.opponent_name || ''}`.trim(),
          link,
        });
      }
      return;
    }

    // A conversion proposal (source set) that got declined while still 'open' — tell the
    // proposer specifically, since they're the one who won't otherwise hear back.
    if (before.status === 'open' && after.status === 'rejected' && after.source) {
      await notify(after.challenger_id, {
        type: 'challenge_conversion_rejected',
        title: `${after.opponent_name || 'The other player'} declined your challenge conversion`,
        body: '',
        link,
      });
    }
  },
);

// Challenger cancelled an open challenge — the opponent's pending challenge disappeared.
exports.onLadderChallengeDeleted = onDocumentDeleted(
  { document: 'ladder_challenges/{id}', region: REGION },
  async (event) => {
    const c = event.data?.data();
    if (!c || c.status !== 'open' || !c.opponent_id) return;
    await notify(c.opponent_id, {
      type: 'ladder_cancelled',
      title: `${c.challenger_name || 'A player'} cancelled their challenge`,
      link: '/matches?mode=challenges',
    });
  },
);

// ─── Rallies (friendlies) ───────────────────────────────────────────────────
// Same shape as the ladder-challenge triggers, minus points/organizer steps.

exports.onRallyCreated = onDocumentCreated(
  { document: 'rallies/{id}', region: REGION, secrets: [resendApiKey] },
  async (event) => {
    const r = event.data?.data();
    if (!r?.to_id) return;
    await notify(r.to_id, {
      type: 'rally_requested',
      title: `${r.from_name || 'A player'} wants to rally`,
      body: 'Accept to set up a friendly match.',
      link: '/matches?mode=friendlies',
    });
    await sendEmailOnce(
      r.to_id,
      `rally-invite:${event.params.id}`,
      `${r.from_name || 'A player'} wants to rally with you 🤝`,
      buildRallyEmail(r.from_name || 'A player'),
    );
  },
);

exports.onRallyUpdated = onDocumentUpdated(
  { document: 'rallies/{id}', region: REGION, secrets: [resendApiKey] },
  async (event) => {
    const before = event.data?.before.data() || {};
    const after = event.data?.after.data() || {};
    if (before.status === after.status || !after.from_id) return;
    if (after.status === 'accepted') {
      await notify(after.from_id, {
        type: 'rally_accepted',
        title: `${after.to_name || 'Your rally partner'} is in — rally on!`,
        body: 'Arrange a time and court together.',
        link: '/matches?mode=friendlies',
      });
      await sendEmailOnce(
        after.from_id,
        `rally-accepted:${event.params.id}`,
        `${after.to_name || 'Your rally partner'} accepted your rally invite!`,
        buildRallyAcceptedEmail(after.to_name || 'Your rally partner'),
      );
    } else if (after.status === 'declined') {
      await notify(after.from_id, {
        type: 'rally_declined',
        title: `${after.to_name || 'That player'} can’t rally right now`,
        link: '/matches?mode=friendlies',
      });
    }
  },
);

exports.onRallyDeleted = onDocumentDeleted(
  { document: 'rallies/{id}', region: REGION },
  async (event) => {
    const r = event.data?.data();
    if (!r || r.status !== 'open' || !r.to_id) return;
    await notify(r.to_id, {
      type: 'rally_cancelled',
      title: `${r.from_name || 'A player'} withdrew their rally request`,
      link: '/matches?mode=friendlies',
    });
  },
);

// ─── Tasks ──────────────────────────────────────────────────────────────────

exports.onTaskProgressUpdated = onDocumentUpdated(
  { document: 'task_progress/{uid}', region: REGION },
  async (event) => {
    const before = event.data?.before.data() || {};
    const after = event.data?.after.data() || {};
    const uid = event.params.uid;

    if (!before.setupComplete && after.setupComplete) {
      await notify(uid, {
        type: 'initiation_complete',
        title: 'Community Member Initiation complete — 25 points',
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

    await notify(p.user_id, {
      type: 'task_completed',
      title: `You're in — ${e.title || 'event'}`,
      body: 'We’ll let you know when the draw is out.',
      link,
    });
    await notify(e.creator_id, {
      type: 'organizer_event_roster',
      title: `${p.user_name || 'A player'} joined ${e.title || 'your event'}`,
      link,
    });
  },
);

// ─── Scheduled reminders ────────────────────────────────────────────────────

// Tuesday 9am: your outstanding matches + ladder challenges reset.
exports.weeklyReminders = onSchedule(
  { schedule: '0 9 * * 2', timeZone: TZ, region: REGION, secrets: [resendApiKey] },
  async () => {
    // Pending matches, grouped per player AND per event (for the email breakdown — "2 Summer
    // Gauntlet Matches"); the in-app notification below still uses the flat per-player count.
    const matches = await db().collection('tournament_matches').where('status', '==', 'pending').get();
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

    // Event titles for the pending-match event ids above.
    const eventIds = new Set();
    pendingByUserEvent.forEach((byEvent) => byEvent.forEach((_, eventId) => eventIds.add(eventId)));
    const eventTitles = new Map();
    await Promise.all([...eventIds].map(async (id) => {
      const snap = await db().doc(`events/${id}`).get();
      eventTitles.set(id, snap.exists ? (snap.data().title || 'Tournament') : 'Tournament');
    }));

    // Accepted rallies/challenges — "still needs to be played." A rally already converted to a
    // Challenge (source: 'friendly') is excluded, since it's no longer an unresolved friendly.
    const [acceptedRallies, acceptedChallenges, friendlyChallenges] = await Promise.all([
      db().collection('rallies').where('status', '==', 'accepted').get(),
      db().collection('ladder_challenges').where('status', '==', 'accepted').get(),
      db().collection('ladder_challenges').where('source', '==', 'friendly').get(),
    ]);
    const resolvedFriendlyPairs = new Set(
      friendlyChallenges.docs.map((d) => [d.data().challenger_id, d.data().opponent_id].sort().join('|')),
    );
    const friendlyCountByUser = new Map();
    acceptedRallies.docs.forEach((d) => {
      const r = d.data();
      if (!r.from_id || !r.to_id) return;
      if (resolvedFriendlyPairs.has([r.from_id, r.to_id].sort().join('|'))) return;
      [r.from_id, r.to_id].forEach((uid) => friendlyCountByUser.set(uid, (friendlyCountByUser.get(uid) || 0) + 1));
    });
    const challengeCountByUser = new Map();
    acceptedChallenges.docs.forEach((d) => {
      const c = d.data();
      if (!c.challenger_id || !c.opponent_id) return;
      [c.challenger_id, c.opponent_id].forEach((uid) => challengeCountByUser.set(uid, (challengeCountByUser.get(uid) || 0) + 1));
    });

    // One digest email per player who has anything pending across all three categories. Keyed
    // by today's date so a retry of this same run doesn't double-send (next week's date differs).
    const weekKey = new Date().toISOString().slice(0, 10);
    const allUids = new Set([...pendingByUserEvent.keys(), ...friendlyCountByUser.keys(), ...challengeCountByUser.keys()]);
    await Promise.all([...allUids].map((uid) => {
      const lines = [];
      let total = 0;
      const byEvent = pendingByUserEvent.get(uid);
      if (byEvent) {
        byEvent.forEach((count, eventId) => {
          total += count;
          lines.push(`${count} ${eventTitles.get(eventId) || 'Tournament'} Match${count === 1 ? '' : 'es'}`);
        });
      }
      const friendlyCount = friendlyCountByUser.get(uid) || 0;
      if (friendlyCount > 0) { total += friendlyCount; lines.push(`${friendlyCount} ${friendlyCount === 1 ? 'friendly' : 'friendlies'}`); }
      const challengeCount = challengeCountByUser.get(uid) || 0;
      if (challengeCount > 0) { total += challengeCount; lines.push(`${challengeCount} challenge${challengeCount === 1 ? '' : 's'}`); }
      if (total === 0) return Promise.resolve();
      return sendEmailOnce(
        uid,
        `incomplete-matches:${uid}:${weekKey}`,
        `You have ${total} incomplete match${total === 1 ? '' : 'es'}`,
        buildIncompleteMatchesEmail(lines, total),
      );
    }));

    // Weekly ladder allowance reset — anyone who used a challenge last week.
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const challenges = await db().collection('ladder_challenges').where('created_at', '>=', weekAgo).get();
    const challengers = [...new Set(challenges.docs.map((d) => d.data().challenger_id).filter(Boolean))];
    await notify(challengers, {
      type: 'ladder_challenges_reset',
      title: 'Your ladder challenges have reset',
      body: 'You have 3 challenges available this week.',
      link: '/tournament',
    });
  },
);

// Nightly cleanup: drop notifications older than 30 days.
exports.pruneNotifications = onSchedule(
  { schedule: '0 3 * * *', timeZone: TZ, region: REGION },
  async () => {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const old = await db().collection('notifications').where('created_at', '<', cutoff).limit(500).get();
    if (old.empty) return;
    const batch = db().batch();
    old.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    logger.info(`Pruned ${old.size} notifications`);
  },
);
