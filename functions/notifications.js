/**
 * Notification triggers.
 *
 * Every notification is created here, server-side, so it reaches people who weren't the one
 * clicking (and so players can't write into each other's feeds — see firestore.rules).
 * Firestore triggers cover things that happen; scheduled jobs cover time-based reminders.
 *
 * Deployment is environment-gated. Follow docs/architecture/ENVIRONMENTS_AND_DEPLOYMENT.md;
 * do not use a bare Firebase deploy command from this checkout.
 */
const { onDocumentCreated, onDocumentUpdated, onDocumentDeleted } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');
const { notify, sendEmailOnce, resendApiKey } = require('./lib/notify');
const {
  buildRallyEmail,
  buildRallyAcceptedEmail,
  buildChallengeEmail,
  buildChallengeAcceptedEmail,
  buildIncompleteMatchesEmail,
} = require('./lib/emailTemplates');

const { TZ, REGION } = require('./lib/constants');
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
exports.onMatchCreated = onDocumentCreated({ document: 'matches/{matchId}', region: REGION }, async (event) => {
  const m = event.data?.data();
  if (!m || (m.category !== 'singles' && m.category !== 'doubles')) return;
  if (!isRealMatch(event.params.matchId, m)) return;
  const players = matchPlayers(m);
  if (players.length === 0) return;

  const isRR = !!m.rr_group || m.format === 'rr';
  await Promise.all(
    players.map((uid) => {
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
    }),
  );
});

// Schedule set/changed, score recorded, and advancement into an empty slot.
exports.onMatchUpdated = onDocumentUpdated({ document: 'matches/{matchId}', region: REGION }, async (event) => {
  const before = event.data?.before.data() || {};
  const after = event.data?.after.data() || {};
  if (after.category !== 'singles' && after.category !== 'doubles') return;
  if (!isRealMatch(event.params.matchId, after)) return;

  // Organizer set or changed the date — the highest-value notification in the app.
  const dateChanged = before.proposed_date !== after.proposed_date || before.proposed_slot !== after.proposed_slot;
  if (after.schedule_status === 'scheduled' && after.proposed_date && dateChanged) {
    const when = `${fmtDate(after.proposed_date)}${after.proposed_slot ? ` ${after.proposed_slot}` : ''}`;
    await Promise.all(
      matchPlayers(after).map((uid) =>
        notify(uid, {
          type: 'match_scheduled',
          title: before.schedule_status === 'scheduled' ? 'Your match time changed' : 'Your match has been scheduled',
          body: `${when}${opponentName(after, uid) ? ` vs ${opponentName(after, uid)}` : ''}`,
          link: matchLink(after),
        }),
      ),
    );
  }

  // Advancement: an empty player slot became filled — the next-round pairing is known.
  const slots = ['player_1_uid', 'player_2_uid'];
  const newlyFilled = slots.some((s) => !before[s] && after[s]);
  const bothSet = after.player_1_uid && after.player_2_uid;
  if (newlyFilled && bothSet && after.status !== 'complete') {
    await Promise.all(
      matchPlayers(after).map((uid) =>
        notify(uid, {
          type: 'match_advanced',
          title: 'Your next opponent is ready',
          body: opponentName(after, uid) ? `You play ${opponentName(after, uid)}` : '',
          link: matchLink(after),
        }),
      ),
    );
  }
});

// ─── Scores ─────────────────────────────────────────────────────────────────

// A player submitted a score: alert the organizer to confirm, and the opponent that a result
// was claimed against them.
exports.onScoreSubmitted = onDocumentCreated({ document: 'matches/{id}', region: REGION }, async (event) => {
  const s = event.data?.data();
  if (!s || s.category !== 'score_submission') return;
  if (!s.event_id) return;
  const eventDoc = await db().doc(`events/${s.event_id}`).get();
  const creatorId = eventDoc.exists ? eventDoc.data().creator_id : null;
  const link = `/tournament?event=${s.event_id}`;

  await notify(creatorId, {
    type: 'organizer_score_pending',
    title: 'A score needs your approval',
    body: `${s.player_1_name || ''} vs ${s.player_2_name || ''}`.trim(),
    link,
  });
});

// Submissions are deleted on both confirm and reject. A confirm also flips the match to
// complete (covered by onMatchUpdated), so only tell the submitter when it was NOT applied.
exports.onScoreSubmissionResolved = onDocumentDeleted({ document: 'matches/{id}', region: REGION }, async (event) => {
  const s = event.data?.data();
  if (!s || s.category !== 'score_submission') return;
  if (!s.submitted_by || !s.match_id) return;
  const matchDoc = await db().doc(`matches/${s.match_id}`).get();
  if (!matchDoc.exists) return;
  const m = matchDoc.data();
  // Applied => the match now has this winner recorded. Otherwise it was rejected.
  if (m.status === 'complete' && m.winner_uid === s.claimed_winner_uid) return;

  await notify(s.submitted_by, {
    type: 'score_rejected',
    title: 'Your score submission was rejected',
    body: 'The organizer didn’t accept the reported result. Please re-submit the correct score.',
    link: `/tournament?event=${s.event_id}`,
  });
});

// ─── Scheduling assistance ──────────────────────────────────────────────────

// Replaces the old client-side write: the player's request now notifies the organizer here.
exports.onScheduleRequested = onDocumentUpdated({ document: 'matches/{matchId}', region: REGION }, async (event) => {
  const before = event.data?.before.data() || {};
  const after = event.data?.after.data() || {};
  if (after.category !== 'singles' && after.category !== 'doubles') return;
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
});

// Notify-only, mirrors onScheduleRequested above — the organizer resolves the actual zone move
// manually outside the app; this just tells them a player asked.
exports.onZoneChangeRequested = onDocumentUpdated(
  { document: 'event_participants/{participantId}', region: REGION },
  async (event) => {
    const before = event.data?.before.data() || {};
    const after = event.data?.after.data() || {};
    const wasReq = before.req_zone_change === true;
    const isReq = after.req_zone_change === true;
    if (wasReq || !isReq) return;
    if (!after.event_id) return;

    const eventDoc = await db().doc(`events/${after.event_id}`).get();
    if (!eventDoc.exists) return;
    await notify(eventDoc.data().creator_id, {
      type: 'organizer_zone_change_request',
      title: 'A player asked about a zone change',
      body: after.user_name || 'A player',
      link: `/tournament?event=${after.event_id}`,
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
    // A conversion proposal (source set) is a distinct ask from a from-scratch challenge —
    // the opponent already played the match and is being asked to confirm it counts.
    if (c.source) {
      await notify(c.player_2_uid, {
        type: 'challenge_conversion_proposed',
        title: `${c.player_1_name || 'A player'} converted your match to a challenge`,
        body: 'Review and confirm the result to register it as a challenge.',
        link: '/matches?mode=challenges',
      });
    } else {
      await notify(c.player_2_uid, {
        type: 'ladder_challenged',
        title: `${c.player_1_name || 'A player'} challenged you`,
        body: 'Arrange a time and report the result when you’ve played.',
        link: '/matches?mode=challenges',
      });
    }
    const eventDoc = await db().doc(`events/${c.event_id}`).get();
    const ladderName = eventDoc.exists ? eventDoc.data().title || 'League Ladder' : 'League Ladder';
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

    // Opponent accepted a from-scratch challenge (not a conversion — those go straight from
    // 'open' to 'reported' and already have their own "conversion proposed" notification).
    if (before.status === 'open' && after.status === 'accepted' && !after.source) {
      await notify(after.player_1_uid, {
        type: 'ladder_accepted',
        title: `${after.player_2_name || 'Your opponent'} accepted your challenge`,
        body: 'Arrange a time and report the result when you’ve played.',
        link,
      });
      const eventDoc = await db().doc(`events/${after.event_id}`).get();
      const ladderName = eventDoc.exists ? eventDoc.data().title || 'League Ladder' : 'League Ladder';
      await sendEmailOnce(
        after.player_1_uid,
        `challenge-accepted:${event.params.id}`,
        `${after.player_2_name || 'Your opponent'} accepted your challenge!`,
        buildChallengeAcceptedEmail(after.player_2_name || 'Your opponent', ladderName),
      );
      return;
    }

    if (after.status === 'reported') {
      // Tell whoever didn't report it.
      const reporter = after.reported_by;
      const other = reporter === after.player_1_uid ? after.player_2_uid : after.player_1_uid;
      await notify(other || both, {
        type: 'ladder_reported',
        title: 'A ladder result was reported',
        body:
          after.winner_name || after.claimed_winner_name
            ? `Reported winner: ${after.winner_name || after.claimed_winner_name}`
            : '',
        link,
      });
      const eventDoc = await db().doc(`events/${after.event_id}`).get();
      if (eventDoc.exists) {
        await notify(eventDoc.data().creator_id, {
          type: 'organizer_ladder_pending',
          title: 'A ladder result needs confirming',
          body: `${after.player_1_name || ''} vs ${after.player_2_name || ''}`.trim(),
          link,
        });
      }
      return;
    }

    // A conversion proposal (source set) that got declined while still 'open' — tell the
    // proposer specifically, since they're the one who won't otherwise hear back.
    if (before.status === 'open' && after.status === 'rejected' && after.source) {
      await notify(after.player_1_uid, {
        type: 'challenge_conversion_rejected',
        title: `${after.player_2_name || 'The other player'} declined your challenge conversion`,
        body: '',
        link,
      });
    }
  },
);

// Challenger cancelled an open challenge — the opponent's pending challenge disappeared.
exports.onLadderChallengeDeleted = onDocumentDeleted({ document: 'matches/{id}', region: REGION }, async (event) => {
  const c = event.data?.data();
  if (!c || c.category !== 'challenge' || c.status !== 'open' || !c.player_2_uid) return;
  await notify(c.player_2_uid, {
    type: 'ladder_cancelled',
    title: `${c.player_1_name || 'A player'} cancelled their challenge`,
    link: '/matches?mode=challenges',
  });
});

// ─── Rallies (friendlies) ───────────────────────────────────────────────────
// Same shape as the ladder-challenge triggers, minus points/organizer steps.

exports.onRallyCreated = onDocumentCreated(
  { document: 'matches/{id}', region: REGION, secrets: [resendApiKey] },
  async (event) => {
    const r = event.data?.data();
    if (!r || r.category !== 'rally') return;
    if (!r.player_2_uid) return;
    await notify(r.player_2_uid, {
      type: 'rally_requested',
      title: `${r.player_1_name || 'A player'} wants to rally`,
      body: 'Accept to set up a friendly match.',
      link: '/matches?mode=friendlies',
    });
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
    if (after.status === 'accepted') {
      await notify(after.player_1_uid, {
        type: 'rally_accepted',
        title: `${after.player_2_name || 'Your rally partner'} is in — rally on!`,
        body: 'Arrange a time and court together.',
        link: '/matches?mode=friendlies',
      });
      await sendEmailOnce(
        after.player_1_uid,
        `rally-accepted:${event.params.id}`,
        `${after.player_2_name || 'Your rally partner'} accepted your rally invite!`,
        buildRallyAcceptedEmail(after.player_2_name || 'Your rally partner'),
      );
    } else if (after.status === 'declined') {
      await notify(after.player_1_uid, {
        type: 'rally_declined',
        title: `${after.player_2_name || 'That player'} can’t rally right now`,
        link: '/matches?mode=friendlies',
      });
    } else if (after.status === 'reported') {
      // Points only land once the OTHER player confirms, so tell whoever that is.
      const other = after.reported_by === after.player_1_uid ? after.player_2_uid : after.player_1_uid;
      const reporterName = after.reported_by === after.player_1_uid ? after.player_1_name : after.player_2_name;
      if (other) {
        await notify(other, {
          type: 'rally_reported',
          title: `${reporterName || 'Your rally partner'} submitted your match score`,
          body: `${scoreLineOf(after) || 'Confirm the result'} — confirm it and you both get points.`,
          link: '/matches?mode=friendlies',
        });
      }
    } else if (after.status === 'confirmed') {
      const winner = after.winner_uid || after.claimed_winner_uid;
      await Promise.all(
        [after.player_1_uid, after.player_2_uid].filter(Boolean).map((uid) =>
          notify(uid, {
            type: 'rally_confirmed',
            title: 'Friendly match recorded',
            body: uid === winner ? 'You picked up 2 points.' : 'You picked up 1 point.',
            link: '/matches?mode=friendlies',
          }),
        ),
      );
    }
  },
);

exports.onRallyDeleted = onDocumentDeleted({ document: 'matches/{id}', region: REGION }, async (event) => {
  const r = event.data?.data();
  if (!r || r.category !== 'rally' || r.status !== 'open' || !r.player_2_uid) return;
  await notify(r.player_2_uid, {
    type: 'rally_cancelled',
    title: `${r.player_1_name || 'A player'} withdrew their rally request`,
    link: '/matches?mode=friendlies',
  });
});

// ─── Tasks ──────────────────────────────────────────────────────────────────

exports.onTaskProgressUpdated = onDocumentUpdated({ document: 'tasks/{uid}', region: REGION }, async (event) => {
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
  const revoked = Object.keys(after).find((k) => before[k] === true && after[k] === false && k !== 'setupComplete');
  if (revoked) {
    await notify(uid, {
      type: 'task_revoked',
      title: 'A task was removed from your Initiation',
      body: 'An organizer reviewed a claimed task. Complete it again to restore your progress.',
      link: '/tasks',
    });
  }
});

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
    // Pending tournament matches (singles/doubles only — rallies/challenges handled below).
    const matches = await db()
      .collection('matches')
      .where('category', 'in', ['singles', 'doubles'])
      .where('status', '==', 'pending')
      .get();
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
    await Promise.all(
      [...pendingByUser.entries()].map(([uid, count]) =>
        notify(uid, {
          type: 'reminder_pending_matches',
          title: `You have ${count} match${count > 1 ? 'es' : ''} to play`,
          body: 'Arrange a time with your opponent this week.',
          link: '/tournament',
        }),
      ),
    );

    // (Event titles used to be fetched here to itemise the digest by tournament. The template
    // now shows a single total, so that per-event read is gone.)

    // Accepted rallies/challenges — "still needs to be played." A rally already converted to a
    // Challenge (source: 'friendly') is excluded, since it's no longer an unresolved friendly.
    const [acceptedRallies, acceptedChallenges, friendlyChallenges] = await Promise.all([
      db().collection('matches').where('category', '==', 'rally').where('status', '==', 'accepted').get(),
      db().collection('matches').where('category', '==', 'challenge').where('status', '==', 'accepted').get(),
      db().collection('matches').where('category', '==', 'challenge').where('source', '==', 'friendly').get(),
    ]);
    const resolvedFriendlyPairs = new Set(
      friendlyChallenges.docs.map((d) => [d.data().player_1_uid, d.data().player_2_uid].sort().join('|')),
    );
    const friendlyCountByUser = new Map();
    acceptedRallies.docs.forEach((d) => {
      const r = d.data();
      if (!r.player_1_uid || !r.player_2_uid) return;
      if (resolvedFriendlyPairs.has([r.player_1_uid, r.player_2_uid].sort().join('|'))) return;
      [r.player_1_uid, r.player_2_uid].forEach((uid) =>
        friendlyCountByUser.set(uid, (friendlyCountByUser.get(uid) || 0) + 1),
      );
    });
    const challengeCountByUser = new Map();
    acceptedChallenges.docs.forEach((d) => {
      const c = d.data();
      if (!c.player_1_uid || !c.player_2_uid) return;
      [c.player_1_uid, c.player_2_uid].forEach((uid) =>
        challengeCountByUser.set(uid, (challengeCountByUser.get(uid) || 0) + 1),
      );
    });

    // One digest email per player who has anything pending across all three categories. Keyed
    // by today's date so a retry of this same run doesn't double-send (next week's date differs).
    const weekKey = new Date().toISOString().slice(0, 10);
    const allUids = new Set([
      ...pendingByUserEvent.keys(),
      ...friendlyCountByUser.keys(),
      ...challengeCountByUser.keys(),
    ]);
    await Promise.all(
      [...allUids].map((uid) => {
        // The digest reports a single total — the per-category breakdown it used to itemise was
        // dropped from the template, so only the count is summed here.
        let total = 0;
        const byEvent = pendingByUserEvent.get(uid);
        if (byEvent)
          byEvent.forEach((count) => {
            total += count;
          });
        total += friendlyCountByUser.get(uid) || 0;
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
      }),
    );

    // Weekly ladder allowance reset — anyone who used a challenge last week.
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const challenges = await db()
      .collection('matches')
      .where('category', '==', 'challenge')
      .where('created_at', '>=', weekAgo)
      .get();
    const challengers = [...new Set(challenges.docs.map((d) => d.data().player_1_uid).filter(Boolean))];
    await notify(challengers, {
      type: 'ladder_challenges_reset',
      title: 'Your ladder challenges have reset',
      body: 'You have 3 challenges available this week.',
      link: '/tournament',
    });
  },
);

// Nightly cleanup: drop notifications older than 30 days.
exports.pruneNotifications = onSchedule({ schedule: '0 3 * * *', timeZone: TZ, region: REGION }, async () => {
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
    const old = await db().collection('notifications').where('created_at', '<', cutoff).limit(PAGE).get();
    if (old.empty) break;
    const batch = db().batch();
    old.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    deleted += old.size;
    if (old.size < PAGE) break;
  }
  if (deleted === 0) return;
  logger.info(`Pruned ${deleted} notifications`);
});
