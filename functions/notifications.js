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
const { notify } = require('./lib/notify');

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

    // Score recorded (organizer direct, or a confirmed submission).
    if (before.status !== 'complete' && after.status === 'complete') {
      await Promise.all(matchPlayers(after).map((uid) => {
        const won = after.winner_user_id === uid;
        return notify(uid, {
          type: 'score_confirmed',
          title: won ? 'You won your match' : 'Your match result is in',
          body: after.winner_name ? `Winner: ${after.winner_name}` : '',
          link: matchLink(after),
        });
      }));
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
    const [eventDoc, matchDoc] = await Promise.all([
      db().doc(`events/${s.event_id}`).get(),
      s.match_id ? db().doc(`tournament_matches/${s.match_id}`).get() : Promise.resolve(null),
    ]);
    const creatorId = eventDoc.exists ? eventDoc.data().creator_id : null;
    const link = `/tournament?event=${s.event_id}`;

    await notify(creatorId, {
      type: 'organizer_score_pending',
      title: 'A score needs your approval',
      body: `${s.player_1_name || ''} vs ${s.player_2_name || ''}`.trim(),
      link,
    });

    // The opponent of whoever submitted.
    if (matchDoc?.exists) {
      const m = matchDoc.data();
      const opponentUid = otherPlayer(m, s.submitted_by);
      await notify(opponentUid, {
        type: 'score_submitted',
        title: 'A score was submitted for your match',
        body: s.claimed_winner_name ? `Reported winner: ${s.claimed_winner_name}` : 'Awaiting organizer confirmation.',
        link,
      });
    }
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
  { document: 'ladder_challenges/{id}', region: REGION },
  async (event) => {
    const c = event.data?.data();
    if (!c?.opponent_id) return;
    await notify(c.opponent_id, {
      type: 'ladder_challenged',
      title: `${c.challenger_name || 'A player'} challenged you`,
      body: 'Arrange a time and report the result when you’ve played.',
      link: `/tournament?event=${c.event_id}`,
    });
  },
);

exports.onLadderChallengeUpdated = onDocumentUpdated(
  { document: 'ladder_challenges/{id}', region: REGION },
  async (event) => {
    const before = event.data?.before.data() || {};
    const after = event.data?.after.data() || {};
    if (before.status === after.status) return;
    const link = `/tournament?event=${after.event_id}`;
    const both = [after.challenger_id, after.opponent_id];

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

    if (after.status === 'confirmed') {
      await Promise.all(both.filter(Boolean).map((uid) => {
        const won = after.claimed_winner_id === uid;
        return notify(uid, {
          type: 'ladder_confirmed',
          title: won ? 'Ladder win confirmed — +3 points' : 'Ladder result confirmed — −3 points',
          body: after.claimed_winner_name ? `Winner: ${after.claimed_winner_name}` : '',
          link,
        });
      }));
      return;
    }

    if (after.status === 'rejected') {
      await notify(both, {
        type: 'ladder_rejected',
        title: 'Your ladder result was rejected',
        body: 'The organizer didn’t accept the reported result.',
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
      link: `/tournament?event=${c.event_id}`,
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
  { schedule: '0 9 * * 2', timeZone: TZ, region: REGION },
  async () => {
    // Pending matches, grouped per player.
    const matches = await db().collection('tournament_matches').where('status', '==', 'pending').get();
    const pendingByUser = new Map();
    matches.docs.forEach((d) => {
      const m = d.data();
      if (!isRealMatch(d.id, m)) return;
      matchPlayers(m).forEach((uid) => pendingByUser.set(uid, (pendingByUser.get(uid) || 0) + 1));
    });
    await Promise.all([...pendingByUser.entries()].map(([uid, count]) => notify(uid, {
      type: 'reminder_pending_matches',
      title: `You have ${count} match${count > 1 ? 'es' : ''} to play`,
      body: 'Arrange a time with your opponent this week.',
      link: '/tournament',
    })));

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
