/**
 * Zone moves. A member changes their zone on the profile card or from the tournament page (both
 * write `preferences.preferred_zone`). For every live singles tournament they're registered in:
 *   - an old-zone draw where none of their matches has a real opponent (and none is played) is
 *     given up: their slot becomes Player Loading. Any seat with a real opponent is kept;
 *   - the organizers get ONE alert saying what happened and whether to place them from Unplaced
 *     Players (the new zone already has a draw) or wait for that draw to be generated.
 * Nobody is ever auto-seated, and doubles has no zones. The alert goes only to tournaments whose
 * draw for the member already has generated matches; otherwise the new zone simply routes them in
 * when that draw is generated. An organizer's Change Zone writes the same preferences field.
 *
 * Deploy with: firebase deploy --only functions:onZoneChanged
 */
const { onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');
const { FieldValue, Timestamp } = require('firebase-admin/firestore');
const { notify } = require('./lib/notify');
const { REGION } = require('./lib/constants');
const { eventOrganizerUids } = require('./lib/roles');
const { effectiveZone, skillBand, resolveMergedZone, playerZone } = require('./lib/participantSeat');

const db = () => admin.firestore();

const OPEN_NAMES = ['Player Loading', 'BYE'];
const hasOpponent = (m, uid) => {
  const side = m.player_1_uid === uid ? 'player_2' : 'player_1';
  return !!m[`${side}_uid`] && !OPEN_NAMES.includes(m[`${side}_name`]);
};

// Per old-zone draw: if none of the player's matches there has a real opponent and none is played,
// blank their slot to Player Loading. Re-checked in a transaction so a fixture filled meanwhile is
// kept. Returns how many matches they left.
async function unseatWithoutOpponent(uid, seated, merges, wanted) {
  const byDraw = new Map();
  seated
    .filter((m) => resolveMergedZone(effectiveZone(m.zone), merges) !== wanted)
    .forEach((m) => {
      const key = `${m.sub_category}|${m.division}|${m.skill_group}|${effectiveZone(m.zone)}`;
      byDraw.set(key, [...(byDraw.get(key) || []), m]);
    });
  let unseated = 0;
  for (const ms of byDraw.values()) {
    if (ms.some((m) => m.status === 'complete' || hasOpponent(m, uid))) continue;
    unseated += await db().runTransaction(async (tx) => {
      const snaps = await Promise.all(ms.map((m) => tx.get(db().doc(`matches/${m.id}`))));
      const live = snaps.filter((s) => s.exists).map((s) => ({ ref: s.ref, ...s.data() }));
      if (live.some((m) => m.status === 'complete' || hasOpponent(m, uid))) return 0;
      let n = 0;
      live.forEach((m) => {
        const side = m.player_1_uid === uid ? 'player_1' : m.player_2_uid === uid ? 'player_2' : null;
        if (!side) return;
        tx.update(m.ref, { [`${side}_uid`]: '', [`${side}_name`]: 'Player Loading', participant_uids: FieldValue.arrayRemove(uid), updated_at: Timestamp.now() });
        n += 1;
      });
      return n;
    });
  }
  return unseated;
}

exports.onZoneChanged = onDocumentUpdated(
  { document: 'preferences/{uid}', region: REGION },
  async (event) => {
    const before = event.data?.before.data() || {};
    const after = event.data?.after.data() || {};
    const uid = event.params.uid;
    // An empty zone is a move too: courts with no Toronto zone put the member in Unassigned.
    if ((before.preferred_zone || '') === (after.preferred_zone || '')) return;
    const zoneName = after.preferred_zone || 'Unassigned';

    const partSnap = await db().collection('event_participants').where('uid', '==', uid).get();
    const rows = partSnap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((p) => p.event_id && p.status === 'active' && p.category === 'singles_tournament');
    if (rows.length === 0) return;

    for (const row of rows) {
      try {
        const eventDoc = await db().doc(`events/${row.event_id}`).get();
        if (!eventDoc.exists) continue;
        const ev = eventDoc.data();
        if (!/_tournament$/.test(ev.category || '') || ev.status === 'cancelled') continue;
        const merges = ev.zone_draw_config?.merges ?? {};
        const wanted = playerZone(after.preferred_zone, merges);
        const band = skillBand(Number(row.skill || 0));

        const matchSnap = await db().collection('matches').where('event_id', '==', row.event_id).get();
        const drawMatches = matchSnap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((m) => m.category === 'tournament' && m.sub_category === 'singles');

        // A tournament whose draws are all played is over; its organizers don't need to hear.
        if (drawMatches.length > 0 && drawMatches.every((m) => m.status === 'complete')) continue;

        const seated = drawMatches.filter((m) => m.player_1_uid === uid || m.player_2_uid === uid);
        // Already in the zone they asked for (following any merge).
        if (seated.length > 0 && seated.every((m) => resolveMergedZone(effectiveZone(m.zone), merges) === wanted)) continue;

        // Seats in another zone with no real opponent yet are given up, blanked to Player Loading
        // exactly as a removal does; a seat with a real opponent is kept. See CLAUDE.md, "Zones".
        const unseated = await unseatWithoutOpponent(uid, seated, merges, wanted);

        // Is there a generated draw in the zone they moved to that they'd belong to?
        const targetDrawExists = drawMatches.some((m) =>
          resolveMergedZone(effectiveZone(m.zone), merges) === wanted
          && (m.division === row.division || m.division === 'All')
          && (m.skill_group === band || m.skill_group === 'All'));
        // Organizers hear only when this member's draw already has generated matches.
        if (seated.length === 0 && !targetDrawExists) continue;
        const name = row.user_name || 'A player';
        await notify(eventOrganizerUids(ev), {
          type: 'organizer_zone_change',
          title: `${name} changed their zone`,
          body: [
            unseated > 0 ? `${name} moved to ${zoneName} and was taken out of ${unseated} old-zone match${unseated === 1 ? '' : 'es'} with no opponent yet.` : `${name} moved to ${zoneName}.`,
            seated.length > unseated
              ? 'They stay in the matches they already have an opponent for.'
              : '',
            targetDrawExists
              ? 'Place them in the new zone\'s draw from Unplaced Players.'
              : 'Nothing to do now: they join that zone\'s draw when it\'s generated.',
          ].filter(Boolean).join(' '),
          link: `/tournament?event=${row.event_id}`,
        });
        logger.info(`Zone move: ${uid} → ${zoneName} in ${row.event_id}; organizer notified`);
      } catch (err) {
        // One event's failure must not stop the others.
        logger.error(`Zone move notice failed for ${uid} in ${row.event_id}:`, err);
      }
    }
  },
);
