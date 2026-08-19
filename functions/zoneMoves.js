/**
 * Zone moves — NOTIFY ONLY. This function never touches a match doc.
 *
 * A member picks their zone by hand on the profile card (`preferences.preferred_zone`, written by
 * `updatePreferredZone` in src/features/profile/services/profileService.ts). Zone decides which
 * draw they belong to, but a change must never unseat them:
 *
 *   1. Already playing, and the zone they moved TO has matches generated — they keep every match
 *      they're in, surface in the organizer's Unplaced Players list for the new zone (that list is
 *      zone-aware, see `unplacedParticipants` in useTournament.ts), and the organizer is told here.
 *      Nobody is auto-seated.
 *   2. The zone they moved to has NO matches yet — silent. Nothing to place them into and nothing
 *      to tell anyone; `preferred_zone` alone routes them in when that draw is generated, while
 *      they carry on in the draw they're already playing.
 *   3. Not in a tournament, or in one with no draw generated — silent, for the same reason.
 *
 * So this trigger's only job is the notification in case 1. Removing the player was the wrong
 * model and is deliberately absent: a player is never pulled out of matches that already exist.
 *
 * Deployment is environment-gated. Follow docs/architecture/ENVIRONMENTS_AND_DEPLOYMENT.md;
 * do not use a bare Firebase deploy command from this checkout.
 */
const { onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');
const { notify } = require('./lib/notify');
const { REGION } = require('./lib/constants');
const { safeId } = require('./lib/logging');

const db = () => admin.firestore();

// MIRRORS src/pages/tournament/utils.ts — functions/ is a separate package and can't import from
// src/, so these have to be changed together. `effectiveZone` is the important one: a match with
// no `zone` predates zones and belongs to the DEFAULT zone, not to a fourth category.
const DEFAULT_ZONE = 'Downtown - Midtown';
const zoneBucketId = (zone) => String(zone || '').replace(/[^a-z0-9]+/gi, '_').toLowerCase();
const effectiveZone = (zone) => zone || zoneBucketId(DEFAULT_ZONE);
const skillBand = (s) => (s < 3 ? 'Beginners' : s < 4 ? 'Challengers' : 'Masters');

// Follow a zone through the event's merges to the one it actually plays in. Chains resolve; a
// cycle bails out rather than spinning.
const resolveMergedZone = (bucketId, merges = {}) => {
  let id = bucketId;
  for (let i = 0; i < 10 && merges[id] && merges[id] !== id; i += 1) id = merges[id];
  return id;
};

exports.onZoneChanged = onDocumentUpdated(
  { document: 'preferences/{uid}', region: REGION },
  async (event) => {
    const before = event.data?.before.data() || {};
    const after = event.data?.after.data() || {};
    const uid = event.params.uid;
    if (!after.preferred_zone || before.preferred_zone === after.preferred_zone) return;

    const partSnap = await db().collection('event_participants').where('uid', '==', uid).get();
    const rows = partSnap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      // `zone_override` means an organizer placed them by hand; that decision stands and needs no
      // prompting from a preference change.
      .filter((p) => p.event_id && !p.removal && !p.zone_override);
    if (rows.length === 0) return;

    for (const row of rows) {
      try {
        const eventDoc = await db().doc(`events/${row.event_id}`).get();
        if (!eventDoc.exists) continue;
        const ev = eventDoc.data();
        const merges = ev.zone_draw_config?.merges ?? {};
        const wanted = resolveMergedZone(zoneBucketId(after.preferred_zone), merges);
        const band = row.skill_group === 'Retired Pro' ? 'Retired Pro' : skillBand(Number(row.skill || 0));

        const matchSnap = await db().collection('matches').where('event_id', '==', row.event_id).get();
        const drawMatches = matchSnap.docs
          .map((d) => d.data())
          .filter((m) => ['singles', 'doubles'].includes(m.category));

        // Case 3 — nothing generated for them to be sitting in.
        const seated = drawMatches.filter((m) => m.player_1_uid === uid || m.player_2_uid === uid);
        if (seated.length === 0) continue;

        // Already in the zone they asked for (following any merge).
        if (seated.every((m) => resolveMergedZone(effectiveZone(m.zone), merges) === wanted)) continue;

        // Case 2 vs 1 — is there a generated draw in the zone they moved to that they'd belong to?
        const targetDrawExists = drawMatches.some((m) =>
          resolveMergedZone(effectiveZone(m.zone), merges) === wanted
          && m.tournament_choice === row.tournament_choice
          && (m.division === row.division || m.division === 'All')
          && (m.skill_group === band || m.skill_group === 'All'));
        if (!targetDrawExists) continue; // case 2 — silent

        await notify(ev.creator_id, {
          type: 'organizer_zone_change_request',
          title: 'A player changed their zone',
          body: `${row.user_name || 'A player'} moved to ${after.preferred_zone}. They stay in their current matches; place them in the new zone's draw when you're ready.`,
          link: `/tournament?event=${row.event_id}`,
        });
        logger.info('Zone move notification sent', {
          member: safeId(uid), zone: after.preferred_zone, event: row.event_id,
        });
      } catch (err) {
        // One event's failure must not stop the others.
        logger.error('Zone move notice failed', { member: safeId(uid), event: row.event_id, err });
      }
    }
  },
);
