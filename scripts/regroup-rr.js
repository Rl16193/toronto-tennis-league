/**
 * RR Late-Joiner Regroup Script (EOD automation)
 *
 * For every active Round Robin tournament event, places players who registered after the
 * draw was generated. Placement rule (band + zone aware):
 *   1. Top up an existing group ONLY if it has ≤3 players and no played match — groups with
 *      4–5 players are full and locked. A joiner needs a matching skill band; a matching zone
 *      is preferred, then the most incomplete group.
 *   2. Otherwise the overflow forms new groups: bucketed by (band, zone) and sized with
 *      splitEvenly (balanced groups of 3–5), labelled "Group X · Band · Zone" (zone dropped
 *      when unassigned/mixed).
 * Existing placements are never reshuffled; groups that already have a completed match are
 * left untouched. The script is idempotent — a run with no new joiners writes nothing.
 *
 * Scope: Singles RR draws. Doubles RR draws are skipped (team placement is out of scope).
 *
 * Pure logic mirrors src/pages/tournament/rrGeneration.ts and utils.ts (duplicated here
 * because scripts are plain JS). Keep the two in sync if the grouping rules change.
 *
 * Usage:
 *   node scripts/regroup-rr.js --key serviceAccount.json
 *   node scripts/regroup-rr.js --key serviceAccount.json --dry-run
 */

import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

const dryRun = process.argv.includes('--dry-run');

// ── Service account ───────────────────────────────────────────────────────────
const keyArgIndex = process.argv.indexOf('--key');
if (keyArgIndex === -1 || !process.argv[keyArgIndex + 1]) {
  console.error('Usage: node scripts/regroup-rr.js --key path/to/serviceAccount.json [--dry-run]');
  process.exit(1);
}
const keyPath = path.resolve(process.argv[keyArgIndex + 1]);
if (!fs.existsSync(keyPath)) { console.error(`Key not found: ${keyPath}`); process.exit(1); }

admin.initializeApp({ credential: admin.credential.cert(JSON.parse(fs.readFileSync(keyPath, 'utf8'))) });
const db = admin.firestore();

const PLAYER_LOADING = 'Player Loading';

// ── Pure helpers (mirror rrGeneration.ts / utils.ts) ──────────────────────────

function getDrawKey(tournamentChoice, division, skillGroup) {
  return `${tournamentChoice}_${division}_${skillGroup}`.replace(/[^a-z0-9]+/gi, '_').toLowerCase();
}

// Circle-method round-robin: all unique [i, j] pairings (i < j). n=4 → 6, n=5 → 10.
function generateGroupPairings(n) {
  if (n < 2) return [];
  const pairs = [];
  const padded = n % 2 === 0 ? n : n + 1;
  const arr = Array.from({ length: padded }, (_, i) => (i < n ? i : -1));
  for (let r = 0; r < padded - 1; r++) {
    for (let i = 0; i < padded / 2; i++) {
      const p1 = arr[i];
      const p2 = arr[padded - 1 - i];
      if (p1 !== -1 && p2 !== -1) pairs.push([Math.min(p1, p2), Math.max(p1, p2)]);
    }
    const last = arr[padded - 1];
    for (let i = padded - 1; i > 1; i--) arr[i] = arr[i - 1];
    arr[1] = last;
  }
  return pairs;
}

// Skill band (mirrors utils.ts skillBand): Beginners 2–2.5, Challengers 3–3.5, Masters 4–5.
function skillBand(skill) {
  return skill < 3 ? 'Beginners' : skill < 4 ? 'Challengers' : 'Masters';
}

// Balanced group sizes (mirrors rrGeneration.splitEvenly): g = ceil(n/5), sizes differ by ≤1.
function splitEvenly(n) {
  if (n <= 0) return [];
  const g = Math.max(1, Math.ceil(n / 5));
  const base = Math.floor(n / g);
  const rem = n % g;
  return Array.from({ length: g }, (_, i) => (i < rem ? base + 1 : base));
}

// The single shared zone across a list of zone strings, or '' when unassigned/mixed.
function sharedZone(zones) {
  const distinct = [...new Set(zones.map((z) => (z || '').trim()).filter((z) => z && z !== 'Unassigned'))];
  return distinct.length === 1 ? distinct[0] : '';
}

// Auto label "Group X · Band · Zone" (drops any empty segment). Matches rrGeneration.ts.
function autoLabel(index, band, zone) {
  return ['Group ' + String.fromCharCode(65 + index), band, zone].filter(Boolean).join(' · ');
}

// Build Firestore match docs for one group (mirrors buildRRGroupMatchFields).
function buildRRGroupMatchDocs({ eventId, drawKey, choice, division, skillGroup, groupIndex, groupLabel, labelCustom, groupPlayers, advancementCount, started }) {
  // A size-1 group keeps a placeholder match (player vs Player Loading) so the lone player
  // stays visible/movable rather than being dropped.
  const pairings = groupPlayers.length === 1 ? [[0, 1]] : generateGroupPairings(groupPlayers.length);
  return pairings.map(([i1, i2], idx) => {
    const p1 = groupPlayers[i1] ?? null;
    const p2 = groupPlayers[i2] ?? null;
    const docId = `${eventId}_${drawKey}_rr_g${groupIndex}_m${idx + 1}`;
    return {
      docId,
      fields: {
        event_id: eventId,
        template_id: '',
        tournament_choice: choice,
        division,
        skill_group: skillGroup,
        drawsize: groupPlayers.length,
        match_id: `rr_g${groupIndex}_m${idx + 1}`,
        round: 'RR',
        position: idx + 1,
        player_1_slot: i1 + 1,
        player_2_slot: i2 + 1,
        player_1_name: p1?.name ?? PLAYER_LOADING,
        player_1_user_id: p1?.user_id ?? '',
        player_1_contact: p1?.contact ?? '',
        player_2_name: p2?.name ?? PLAYER_LOADING,
        player_2_user_id: p2?.user_id ?? '',
        player_2_contact: p2?.contact ?? '',
        next_match_id: '',
        next_slot: '',
        status: 'pending',
        bracket: null,
        started,
        format: 'rr',
        rr_group: groupIndex,
        rr_round: idx + 1,
        rr_advancement_count: advancementCount,
        ...(groupLabel ? { rr_group_label: groupLabel } : {}),
        ...(labelCustom ? { rr_label_custom: true } : {}),
        created_at: new Date().toISOString(),
      },
    };
  });
}

// ── Firestore helpers ─────────────────────────────────────────────────────────

async function getMany(collectionName, ids) {
  // Batch document reads via getAll; returns Map(id → data|null).
  const result = new Map();
  const unique = [...new Set(ids.filter(Boolean))];
  for (let i = 0; i < unique.length; i += 300) {
    const refs = unique.slice(i, i + 300).map((id) => db.collection(collectionName).doc(id));
    const snaps = await db.getAll(...refs);
    snaps.forEach((s) => result.set(s.id, s.exists ? s.data() : null));
  }
  return result;
}

function parseEventDate(v) {
  if (!v) return null;
  if (typeof v === 'object' && typeof v.toDate === 'function') return v.toDate();
  if (typeof v === 'object' && typeof v.seconds === 'number') return new Date(v.seconds * 1000);
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function commitOps(ops) {
  // Chunk writes/deletes into batches under the 500-op limit.
  for (let i = 0; i < ops.length; i += 450) {
    const batch = db.batch();
    for (const op of ops.slice(i, i + 450)) {
      if (op.type === 'delete') batch.delete(op.ref);
      else batch.set(op.ref, op.fields);
    }
    await batch.commit();
  }
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log(dryRun ? '🔍 DRY RUN — no writes will be made\n' : '✏️  LIVE RUN — writing to Firestore\n');
  const now = Date.now();

  const eventsSnap = await db.collection('events').get();
  const rrEvents = eventsSnap.docs.filter((d) => {
    const e = d.data();
    if (!String(e.type || '').toLowerCase().includes('tournament')) return false;
    if (e.tournament_format !== 'rr') return false;
    const end = parseEventDate(e.endDate || e.end_date || e.startDate || e.start_date || e.date);
    return !end || end.getTime() >= now - 24 * 60 * 60 * 1000; // include events ending today
  });

  console.log(`Found ${rrEvents.length} active RR event(s)\n`);
  let totalAddedExisting = 0;
  let totalNewGroups = 0;

  for (const evDoc of rrEvents) {
    const event = evDoc.data();
    const eventId = evDoc.id;
    const startedDate = parseEventDate(event.startDate || event.start_date || event.date);
    const started = !!startedDate && startedDate.getTime() <= now;

    const [partSnap, matchSnap] = await Promise.all([
      db.collection('event_participants').where('event_id', '==', eventId).get(),
      db.collection('tournament_matches').where('event_id', '==', eventId).get(),
    ]);

    const rrMatches = matchSnap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((m) => m.format === 'rr' && m.round === 'RR');
    if (rrMatches.length === 0) continue; // initial generation is a creator action

    const participants = partSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    // A user seated in ANY of this event's rr draws is already placed and must never be re-added.
    // A creator can move a player across skill draws (Challengers ↔ Masters) without changing their
    // skill; without this guard the player would look "unplaced" in their skill-routed draw and get
    // duplicated. Mirrors the client guard in useTournament.ts (rrUnplacedPlayers / auto-place).
    const placedEventWide = new Set(
      rrMatches.flatMap((m) => [m.player_1_user_id, m.player_2_user_id]).filter(Boolean),
    );

    // Skills + zones for everyone who could be involved in this event.
    const allUserIds = [
      ...participants.map((p) => p.user_id),
      ...rrMatches.flatMap((m) => [m.player_1_user_id, m.player_2_user_id]),
    ].filter((id) => id && !String(id).startsWith('__loading_'));
    const [statsMap, prefsMap, usersMap] = await Promise.all([
      getMany('stats', allUserIds),
      getMany('preferences', allUserIds),
      getMany('users', allUserIds),
    ]);
    const skillOf = (uid, fallback = 0) => Number(statsMap.get(uid)?.skill_level ?? fallback);
    const zoneOf = (uid) => prefsMap.get(uid)?.preferred_zone || 'Unassigned';
    const contactOf = (uid) => {
      const u = usersMap.get(uid);
      if (!u) return '';
      return (u.preferred_mode_of_contact === 'phone' ? u.phone : u.email) || '';
    };

    // Group RR matches by drawKey.
    const byDraw = new Map();
    for (const m of rrMatches) {
      const key = getDrawKey(m.tournament_choice, m.division, m.skill_group);
      if (!byDraw.has(key)) byDraw.set(key, []);
      byDraw.get(key).push(m);
    }

    const ops = [];
    let eventAddedExisting = 0;
    let eventNewGroups = 0;

    for (const [drawKey, drawMatches] of byDraw) {
      const choice = drawMatches[0].tournament_choice;
      const division = drawMatches[0].division;
      const skillGroup = drawMatches[0].skill_group;
      const advancementCount = drawMatches[0].rr_advancement_count ?? 1;
      if (choice === 'Doubles') { console.log(`  · ${eventId} ${drawKey}: doubles RR skipped`); continue; }

      // Reconstruct existing groups.
      const groupIndices = [...new Set(drawMatches.map((m) => m.rr_group ?? 0))].sort((a, b) => a - b);
      const groups = groupIndices.map((gi) => {
        const ms = drawMatches.filter((m) => (m.rr_group ?? 0) === gi);
        const seen = new Set();
        const players = [];
        for (const m of ms) {
          if (m.player_1_user_id && !seen.has(m.player_1_user_id)) { seen.add(m.player_1_user_id); players.push({ user_id: m.player_1_user_id, name: m.player_1_name, contact: m.player_1_contact }); }
          if (m.player_2_user_id && !seen.has(m.player_2_user_id)) { seen.add(m.player_2_user_id); players.push({ user_id: m.player_2_user_id, name: m.player_2_name, contact: m.player_2_contact }); }
        }
        const labelDoc = ms.find((m) => m.rr_group_label);
        const avgSkill = players.length ? players.reduce((s, p) => s + skillOf(p.user_id), 0) / players.length : 0;
        const zone = sharedZone(players.map((p) => zoneOf(p.user_id)));
        const band = skillBand(avgSkill);
        const hasPlayed = ms.some((m) => m.status === 'complete' || m.started);
        return {
          gi, players, zone, band, avgSkill, hasPlayed,
          custom: !!labelDoc?.rr_label_custom,
          storedLabel: labelDoc?.rr_group_label || '',
          matchDocs: ms, dirty: false,
        };
      });

      // Participants belonging to this draw.
      const placed = new Set(groups.flatMap((g) => g.players.map((p) => p.user_id)));
      const drawParticipants = participants.filter((p) => {
        if (p.tournament_choice !== choice) return false;
        if (division !== 'All' && p.division !== division) return false;
        if (String(p.user_id || '').startsWith('__loading_') || p.user_name === PLAYER_LOADING) return false;
        if (skillGroup !== 'All') {
          const sg = skillOf(p.user_id, Number(p.skill || 0)) >= 4 ? 'Masters' : 'Challengers';
          if (sg !== skillGroup) return false;
        }
        return true;
      });

      const unplaced = drawParticipants
        .filter((p) => !placed.has(p.user_id) && !placedEventWide.has(p.user_id))
        .map((p) => ({
          user_id: p.user_id,
          name: usersMap.get(p.user_id)?.name || p.user_name,
          contact: contactOf(p.user_id),
          skill: skillOf(p.user_id, Number(p.skill || 0)),
          zone: zoneOf(p.user_id),
        }))
        .sort((a, b) => b.skill - a.skill);

      if (unplaced.length === 0) continue;

      // 1. Fill incomplete groups first. Groups with 4–5 players (or any played group) are
      //    LOCKED; only groups with ≤3 players accept a joiner, and only when the band matches
      //    (a matching zone is preferred, then the most incomplete group).
      const overflow = [];
      for (const player of unplaced) {
        const band = skillBand(player.skill);
        const eligible = groups
          .filter((g) => !g.hasPlayed && g.players.length <= 3 && g.band === band)
          .sort((a, b) =>
            ((b.zone && b.zone === player.zone ? 1 : 0) - (a.zone && a.zone === player.zone ? 1 : 0)) ||
            (a.players.length - b.players.length) ||
            (Math.abs(a.avgSkill - player.skill) - Math.abs(b.avgSkill - player.skill)),
          )[0];
        if (eligible) {
          eligible.players.push({ user_id: player.user_id, name: player.name, contact: player.contact });
          eligible.avgSkill = eligible.players.reduce((s, p) => s + skillOf(p.user_id), 0) / eligible.players.length;
          eligible.zone = sharedZone(eligible.players.map((p) => zoneOf(p.user_id)));
          eligible.band = skillBand(eligible.avgSkill);
          eligible.dirty = true;
          eventAddedExisting++;
        } else {
          overflow.push(player);
        }
      }

      // 2. Form new groups for the overflow — bucket by (band, zone), size with splitEvenly.
      let nextIndex = (groupIndices.length ? Math.max(...groupIndices) : -1) + 1;
      const newGroups = [];
      for (const band of [...new Set(overflow.map((p) => skillBand(p.skill)))]) {
        const bandPlayers = overflow.filter((p) => skillBand(p.skill) === band);
        for (const zone of [...new Set(bandPlayers.map((p) => p.zone))]) {
          const zonePlayers = bandPlayers.filter((p) => p.zone === zone).sort((a, b) => b.skill - a.skill);
          let offset = 0;
          for (const size of splitEvenly(zonePlayers.length)) {
            newGroups.push({ gi: nextIndex, players: zonePlayers.slice(offset, offset + size) });
            offset += size;
            nextIndex++;
          }
        }
      }

      // Emit writes: rebuild dirty existing groups, write new groups.
      for (const g of groups.filter((x) => x.dirty)) {
        const label = g.custom ? g.storedLabel : autoLabel(g.gi, g.band, g.zone);
        g.matchDocs.forEach((m) => ops.push({ type: 'delete', ref: db.collection('tournament_matches').doc(m.id) }));
        buildRRGroupMatchDocs({ eventId, drawKey, choice, division, skillGroup, groupIndex: g.gi, groupLabel: label, labelCustom: g.custom, groupPlayers: g.players, advancementCount, started })
          .forEach(({ docId, fields }) => ops.push({ type: 'set', ref: db.collection('tournament_matches').doc(docId), fields }));
      }
      for (const g of newGroups) {
        const band = skillBand(g.players.reduce((s, p) => s + p.skill, 0) / g.players.length);
        const label = autoLabel(g.gi, band, sharedZone(g.players.map((p) => p.zone)));
        buildRRGroupMatchDocs({ eventId, drawKey, choice, division, skillGroup, groupIndex: g.gi, groupLabel: label, labelCustom: false, groupPlayers: g.players, advancementCount, started })
          .forEach(({ docId, fields }) => ops.push({ type: 'set', ref: db.collection('tournament_matches').doc(docId), fields }));
        eventNewGroups++;
      }
    }

    if (ops.length > 0) {
      console.log(`  ${event.title || eventId}: +${eventAddedExisting} into existing group(s), ${eventNewGroups} new group(s) [${ops.length} writes]`);
      if (!dryRun) await commitOps(ops);
    }
    totalAddedExisting += eventAddedExisting;
    totalNewGroups += eventNewGroups;
  }

  console.log('\n═══════════════════════════════════════════════════════');
  console.log(`SUMMARY: ${totalAddedExisting} late joiner(s) added to existing groups · ${totalNewGroups} new group(s) formed`);
  if (dryRun) console.log('(dry run — nothing written)');
}

main().catch((e) => { console.error(e); process.exit(1); });
