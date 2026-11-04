import { Timestamp } from 'firebase/firestore';
import { skillBand } from '../../utils/skillLevels';
import { EventParticipant, MemberInfo, UserStats } from '../../types';
import { ZONE_NAMES } from '../../utils/zones';
import { isGuest } from '../../utils/guest';
import {
  DrawConfig, RRStandingRow, SkillGroup, SkillMergePair, SKILL_GROUP_ORDER, TemplateMatch, TournamentMatch, TournamentPlayer,
  UNASSIGNED_ZONE_ID, ZoneBucket, ZoneDrawConfig,
} from './types';
import {
  BYE, PLAYER_LOADING, PLAYER_LOADING_SENTINEL, choiceOf, choiceOfMatch, formatPlayerName, getParticipantDisplayName, matchNumber, matchUids,
} from './utils';

// Every draw-generation rule: draw identity and zones, which draws exist, knockout placement and
// seeding, and round-robin groups. utils.ts keeps display, date and id helpers.

// ─── Draw identity and zones ───────────────────────────────────────────────────────────────────

/**
 * A draw or match with NO zone belongs to the default zone. Zones went live mid-event, so groups
 * generated before that carry no `zone` — they are Downtown-Midtown draws, not a fourth category.
 * Treating them separately put running groups outside the zone list and counted "N signed up"
 * twice. Everything that identifies or compares a draw goes through this.
 */
export const effectiveZone = (zone?: string | null): string => zone || zoneBucketId(DEFAULT_ZONE);

/** True for the default zone, including the zone-less pre-zone case. */
export const isDefaultZone = (zone?: string | null): boolean => effectiveZone(zone) === zoneBucketId(DEFAULT_ZONE);

// The default zone deliberately produces the SHORT, pre-zone key, so groups generated before
// zones existed keep their document ids and stay reachable. Do not "fix" this asymmetry by always
// appending the zone — that re-orphans every match already in the database.
export const getDrawKey = (tournamentChoice: string, division: string, skillGroup: SkillGroup, zone?: string) =>
  `${tournamentChoice}_${division}_${skillGroup}${zone && !isDefaultZone(zone) ? `_${zone}` : ''}`.replace(/[^a-z0-9]+/gi, '_').toLowerCase();

/** What makes a draw: singles/doubles, division, skill group and zone. */
export type DrawId = Pick<DrawConfig, 'tournamentChoice' | 'division' | 'skillGroup' | 'zone'>;

/** The draw a match belongs to. A match with no zone is a Downtown-Midtown match. */
export const drawOf = (m: Pick<TournamentMatch, 'sub_category' | 'division' | 'skill_group' | 'zone'>): DrawId => ({
  tournamentChoice: choiceOfMatch(m),
  division: m.division,
  skillGroup: m.skill_group as SkillGroup,
  zone: effectiveZone(m.zone),
});

export const drawKey = (d: DrawId) => getDrawKey(d.tournamentChoice, d.division, d.skillGroup, d.zone);

// Zone is part of the identity: without it, resetting one zone's draw reset every zone's.
export const sameDraw = (a: DrawId, b: DrawId) => drawKey(a) === drawKey(b);

// Cross-products a division's skill draws with each zone bucket, making zone a selectable draw
// dimension (e.g. "Men's Beginners — Downtown"). Singles only.
//
// DRAW HIERARCHY: gender → zone → skill → courts.
// Zone is applied BEFORE skill merges, because a merge belongs to one (division, zone).
// `courts` is planned, not implemented — nothing below should assume it exists.
export const buildZoneAwareDrawConfigs = (draws: DrawConfig[], zoneConfig: ZoneDrawConfig | undefined): DrawConfig[] => {
  if (!zoneConfig?.enabled || zoneConfig.buckets.length === 0) return draws;
  const merges = zoneConfig.merges ?? {};
  // A merged-away zone gets no draws of its own — its players are routed into the target's.
  const active = zoneConfig.buckets.filter((b) => !merges[b.id]);
  const buckets = zoneConfig.includeUnassigned && !merges[UNASSIGNED_ZONE_ID]
    ? [...active, { id: UNASSIGNED_ZONE_ID, label: 'Unassigned', zones: [] }]
    : active;
  return draws.flatMap((d) => {
    if (d.tournamentChoice !== 'Singles') return [d]; // doubles: zones don't apply
    return buckets.map((b) => ({ ...d, zone: b.id, label: `${d.label} — ${b.label}` }));
  });
};

// The zone a zone-less MATCH belongs to (pre-zone groups, see effectiveZone). Players no longer fall
// back to it: a player whose courts give no Toronto zone plays in the Unassigned draw.
export const DEFAULT_ZONE = 'Downtown - Midtown';

// One bucket per real zone. Zones are a fixed dimension of every tournament now, not something a
// creator opts into and hand-builds, so the bucket list is derived from ZONE_NAMES rather than
// stored per event. A creator's only lever is merging a quiet zone into a neighbour.
export const zoneBucketId = (zone: string) => zone.replace(/[^a-z0-9]+/gi, '_').toLowerCase();
export const DEFAULT_ZONE_BUCKETS: ZoneBucket[] = ZONE_NAMES.map((z) => ({
  id: zoneBucketId(z),
  label: z,
  zones: [z],
}));

/** Follow a zone through merges to the one it plays in. Chains resolve; a cycle bails out. */
export const resolveMergedZone = (bucketId: string, merges: Record<string, string> = {}): string => {
  let current = bucketId;
  const seen = new Set<string>([current]);
  while (merges[current]) {
    const next = merges[current];
    if (seen.has(next)) break;
    seen.add(next);
    current = next;
  }
  return current;
};

/**
 * The zone config actually in force. Zone draws default to ON — an event that never configured
 * zones still gets the standard seven; an explicit `false` from Manage Draw is honoured.
 *
 * Every bucket is kept, including merged-away sources: a player whose zone was merged still has
 * to match a bucket before `zoneBucketFor` can redirect them. Sources are dropped later, in
 * `buildZoneAwareDrawConfigs`, which is what makes them produce no draws.
 */
export const resolveZoneConfig = (cfg: Partial<ZoneDrawConfig> | undefined): ZoneDrawConfig => ({
  ...(cfg ?? { includeUnassigned: false }),
  enabled: cfg?.enabled ?? true,
  buckets: cfg?.buckets?.length ? cfg.buckets : DEFAULT_ZONE_BUCKETS,
  // Always on: it is where players with no Toronto zone (a non-Toronto court) are drawn.
  includeUnassigned: true,
  merges: cfg?.merges ?? {},
});

// Which zone bucket a participant's `preferred_zone` falls into, given the event's zone config.
// Never returns undefined once zones are on — a player whose zone matches no bucket (no courts, or
// only non-Toronto courts) goes to the Unassigned bucket. There is no Downtown default for players.
export const zoneBucketFor = (preferredZone: string | undefined, zoneConfig: ZoneDrawConfig | undefined): string | undefined => {
  if (!zoneConfig?.enabled) return undefined;
  const merges = zoneConfig.merges ?? {};
  const zone = (preferredZone || '').trim();
  // Match against ALL buckets, not the resolved (merge-filtered) list — a player whose own zone
  // was merged away still needs matching before being redirected to the target.
  const all = zoneConfig.buckets.length ? zoneConfig.buckets : DEFAULT_ZONE_BUCKETS;
  const bucket = zone ? all.find((b) => b.zones.includes(zone)) : undefined;
  // Unassigned follows a merge like any zone (Manage Draw → Zones can merge it into a real one).
  return resolveMergedZone(bucket ? bucket.id : UNASSIGNED_ZONE_ID, merges);
};

export const getDrawSize = (count: number, _tournamentChoice: 'Singles' | 'Doubles') => {
  if (count <= 8) return 8;
  if (count <= 16) return 16;
  return 32;
};

// Slots are draw LINES, paired 1v2, 3v4, … top to bottom. Who sits on which line is
// `placeSeededDraw`'s job, not the template's.
export const fallbackTemplate = (drawsize: number): TemplateMatch[] => {
  const lines = [2, 4, 8, 16, 32].includes(drawsize) ? drawsize : 8;
  const firstRound = Array.from({ length: lines / 2 }, (_, i) => [2 * i + 1, 2 * i + 2] as [number, number]);
  const rounds =
    drawsize === 2 ? ['F'] :
    drawsize === 4 ? ['SF', 'F'] :
    drawsize === 8 ? ['QF', 'SF', 'F'] :
    drawsize === 16 ? ['R16', 'QF', 'SF', 'F'] :
    ['R32', 'R16', 'QF', 'SF', 'F'];

  const matches: TemplateMatch[] = [];
  let matchNumber = 1;
  let previousRoundIds: string[] = [];

  firstRound.forEach(([p1, p2]) => {
    const matchId = `m${matchNumber++}`;
    previousRoundIds.push(matchId);
    matches.push({ match_id: matchId, round: rounds[0], player_1: p1, player_2: p2 });
  });

  for (let roundIndex = 1; roundIndex < rounds.length; roundIndex += 1) {
    const currentRoundIds: string[] = [];
    for (let i = 0; i < previousRoundIds.length; i += 2) {
      const matchId = `m${matchNumber++}`;
      currentRoundIds.push(matchId);
      matches.push({
        match_id: matchId,
        round: rounds[roundIndex],
        player_1: `winner ${previousRoundIds[i]}`,
        player_2: `winner ${previousRoundIds[i + 1]}`,
      });
      const src1 = matches.find((m) => m.match_id === previousRoundIds[i]);
      const src2 = matches.find((m) => m.match_id === previousRoundIds[i + 1]);
      if (src1) { src1.next_match_id = matchId; src1.next_slot = 'player_1'; }
      if (src2) { src2.next_match_id = matchId; src2.next_slot = 'player_2'; }
    }
    previousRoundIds = currentRoundIds;
  }

  return matches;
};

export const normalizeTemplateMatches = (matches: TemplateMatch[]): TemplateMatch[] => {
  const nextSlotCounts = new Map<string, number>();
  return matches.map((match) => {
    if (!match.next_match_id || match.next_slot) return match;
    const count = nextSlotCounts.get(match.next_match_id) || 0;
    nextSlotCounts.set(match.next_match_id, count + 1);
    return { ...match, next_slot: count === 0 ? ('player_1' as const) : ('player_2' as const) };
  });
};

export const getWinnerPlaceholder = (slot: number | string, matches: TemplateMatch[]) => {
  if (typeof slot !== 'string') return '';
  const sourceMatchId = slot.toLowerCase().match(/winner\s+(.+)/)?.[1]?.trim();
  if (!sourceMatchId) return '';
  const sourceMatch = matches.find((m) => m.match_id.toLowerCase() === sourceMatchId);
  if (!sourceMatch) return `Winner of ${sourceMatchId.toUpperCase()}`;
  const sameRound = matches.filter((m) => m.round === sourceMatch.round);
  const pos = sameRound.findIndex((m) => m.match_id === sourceMatch.match_id) + 1;
  return `Winner of ${sourceMatch.round}${pos}`;
};

/**
 * Doubles: collapses mutual partner pairs (each row's partner_uid names the other) into one entry,
 * with `partner_name` set to the partner's registered name. Guest rows go last, so the member of
 * a member + guest pair is always the captain; an unpaired entry is kept as-is.
 */
export const deduplicateDoublesTeams = (participants: EventParticipant[]): EventParticipant[] => {
  const processed = new Set<string>();
  const result: EventParticipant[] = [];
  const ordered = [...participants].sort((a, b) => Number(isGuest(a.uid)) - Number(isGuest(b.uid)));

  for (const p of ordered) {
    if (processed.has(p.id)) continue;

    const partner = p.partner_uid
      ? participants.find(
          (o) => !processed.has(o.id) && o.id !== p.id && o.uid === p.partner_uid && o.partner_uid === p.uid,
        )
      : undefined;

    // Use the partner's actual registered name so the bracket shows the real spelling
    result.push(
      partner
        ? { ...p, partner_name: formatPlayerName(partner.user_name) || p.partner_name }
        : p,
    );
    processed.add(p.id);
    if (partner) processed.add(partner.id);
  }

  return result;
};

/** Whether a registration goes into a draw: active, singles/doubles, division, zone, then skill band. */
export const belongsTo = (
  p: EventParticipant,
  draw: DrawConfig,
  ctx: { statsMap?: Record<string, UserStats>; zoneMap?: Record<string, string>; zoneConfig?: ZoneDrawConfig } = {},
): boolean => {
  // Withdrawn by the organizer (or cancelled) — the row stays for the record, out of every draw.
  if (p.status !== 'active') return false;
  if (choiceOf(p) !== draw.tournamentChoice) return false;
  if (draw.tournamentChoice === 'Doubles' && draw.division === 'All') return true;
  // Retired Pro is its own division ("Men's Retired Pro"), so this also keeps it out of the
  // Beginners/Challengers/Masters draws.
  if (p.division !== draw.division) return false;
  if (draw.tournamentChoice === 'Doubles') return true;
  // ANDed with everything else below — a draw with no `zone` (doubles) skips this check.
  if (draw.zone && zoneBucketFor(ctx.zoneMap?.[p.uid], ctx.zoneConfig) !== draw.zone) return false;
  const effectiveSkill = ctx.statsMap?.[p.uid]?.skill_level ?? Number(p.skill || 0);
  // A merged draw only includes the band(s) it was actually merged from — NOT every band.
  if (draw.skillGroup === 'All') {
    if (!draw.mergedFrom) return true; // no skill dimension (a Retired Pro division draw)
    const bands = draw.mergedFrom.split('+') as SkillGroup[];
    return bands.includes(skillBand(effectiveSkill));
  }
  return skillBand(effectiveSkill) === draw.skillGroup;
};

export const filterParticipantsForDraw = (
  participants: EventParticipant[],
  draw: DrawConfig,
  statsMap: Record<string, UserStats> = {},
  zoneMap: Record<string, string> = {},
  zoneConfig?: ZoneDrawConfig,
): EventParticipant[] => {
  const filtered = participants.filter((p) => belongsTo(p, draw, { statsMap, zoneMap, zoneConfig }));
  return draw.tournamentChoice === 'Doubles' ? deduplicateDoublesTeams(filtered) : filtered;
};

// ─── Seeding (see CLAUDE.md "Seeding") ──────────────────────────────────────────────────────────

/** Doubles: the partner whose ranking the team takes (the higher-ranked one). Singles: the player. */
export const leadUid = (uid: string, partnerUid: string | undefined, statsMap: Record<string, UserStats>) => {
  if (!partnerUid) return uid;
  const a = statsMap[uid];
  const b = statsMap[partnerUid];
  const points = (b?.leaguePoints ?? 0) - (a?.leaguePoints ?? 0);
  if (points !== 0) return points > 0 ? partnerUid : uid;
  return (b?.matchesPlayed ?? 0) > (a?.matchesPlayed ?? 0) ? partnerUid : uid;
};

const rankCompare = (
  statsMap: Record<string, UserStats>,
  a: { uid: string; partnerUid?: string; name: string },
  b: { uid: string; partnerUid?: string; name: string },
): number => {
  const sa = statsMap[leadUid(a.uid, a.partnerUid, statsMap)];
  const sb = statsMap[leadUid(b.uid, b.partnerUid, statsMap)];
  const points = (sb?.leaguePoints ?? 0) - (sa?.leaguePoints ?? 0);
  if (points !== 0) return points;
  const played = (sb?.matchesPlayed ?? 0) - (sa?.matchesPlayed ?? 0);
  if (played !== 0) return played;
  return a.name.localeCompare(b.name);
};

// League points, then matches played, then name: the Leaderboard's order. A doubles team ranks by
// its higher-ranked partner. No stats row scores 0. Every draw, merged ones included, uses this.
export const seedCompare = (statsMap: Record<string, UserStats>) =>
  (a: EventParticipant, b: EventParticipant): number => rankCompare(
    statsMap,
    { uid: a.uid ?? '', partnerUid: a.partner_uid || undefined, name: a.user_name || '' },
    { uid: b.uid ?? '', partnerUid: b.partner_uid || undefined, name: b.user_name || '' },
  );

export const playerSeedCompare = (statsMap: Record<string, UserStats>) =>
  (a: TournamentPlayer, b: TournamentPlayer): number => rankCompare(statsMap, a, b);

// Seed lines per draw size: `fixed` holds seeds 1 and 2; each `lots` group is shuffled and handed
// to the next seeds in order (32: seeds 3–4 on 9/24, seeds 5–8 on 8/16/17/25).
const SEED_LINES: Record<number, { fixed: number[]; lots: number[][] }> = {
  2: { fixed: [1, 2], lots: [] },
  4: { fixed: [1, 4], lots: [] },
  8: { fixed: [1, 8], lots: [] },
  16: { fixed: [1, 16], lots: [[5, 12]] },
  32: { fixed: [1, 32], lots: [[9, 24], [8, 16, 17, 25]] },
};

/** Deterministic random numbers from a string key, so every viewer draws the same lot. */
export const seededRng = (key: string) => {
  let h = 1779033703 ^ key.length;
  for (let i = 0; i < key.length; i += 1) {
    h = Math.imul(h ^ key.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const shuffled = <T,>(list: T[], rng: () => number): T[] => {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

/**
 * Places a ranked field (strongest first) on draw lines. Seeds go on their lines, byes sit
 * opposite the top seeds, and every first-round opponent is from the same zone where possible,
 * else the player with the nearest preferred court, else anyone. The rest is random but keyed on
 * `rngKey`, so the preview and the generated draw are the same arrangement.
 */
export const placeSeededDraw = (params: {
  players: TournamentPlayer[];
  drawsize: number;
  rngKey: string;
  zoneOf: (p: TournamentPlayer) => string;
  distanceKm: (a: TournamentPlayer, b: TournamentPlayer) => number | null;
}): { slotMap: Map<number, TournamentPlayer>; seeds: Record<string, number> } => {
  const { drawsize, zoneOf, distanceKm } = params;
  const rng = seededRng(params.rngKey);
  const spec = SEED_LINES[drawsize] ?? SEED_LINES[8];
  const entrants = params.players.slice(0, drawsize);
  const seedLines = [...spec.fixed, ...spec.lots.flatMap((group) => shuffled(group, rng))];
  const seeded = entrants.slice(0, Math.min(seedLines.length, entrants.length));
  let pool = shuffled(entrants.slice(seeded.length), rng);
  let byes = drawsize - entrants.length;

  const slotMap = new Map<number, TournamentPlayer>();
  const seeds: Record<string, number> = {};
  const taken = new Set<number>();
  const opposite = (line: number) => (line % 2 ? line + 1 : line - 1);

  // Same zone first, then the nearest court, then the first in the (shuffled) pool.
  const takeOpponentFor = (anchor: TournamentPlayer, from: TournamentPlayer[]): TournamentPlayer | undefined => {
    const zone = zoneOf(anchor);
    let pick = zone ? from.find((p) => zoneOf(p) === zone) : undefined;
    if (!pick) {
      let best = Infinity;
      for (const p of from) {
        const d = distanceKm(anchor, p);
        if (d !== null && d < best) { best = d; pick = p; }
      }
    }
    pick = pick ?? from[0];
    if (pick) from.splice(from.indexOf(pick), 1);
    return pick;
  };

  seeded.forEach((p, i) => {
    const line = seedLines[i];
    slotMap.set(line, p);
    seeds[p.uid] = i + 1;
    taken.add(line).add(opposite(line));
    if (byes > 0) { byes -= 1; return; }
    const opp = takeOpponentFor(p, pool);
    if (opp) slotMap.set(opposite(line), opp);
  });

  // Byes beyond the seeds go to unseeded players at random (the pool is already shuffled).
  const byePlayers = pool.slice(0, byes);
  pool = pool.slice(byes);

  // Pair within each zone first; whoever is left pairs by nearest court.
  const pairs: TournamentPlayer[][] = [];
  const leftovers: TournamentPlayer[] = [];
  const byZone = new Map<string, TournamentPlayer[]>();
  for (const p of pool) {
    const zone = zoneOf(p);
    if (!zone) { leftovers.push(p); continue; }
    byZone.set(zone, [...(byZone.get(zone) ?? []), p]);
  }
  for (const members of byZone.values()) {
    for (let i = 0; i + 1 < members.length; i += 2) pairs.push([members[i], members[i + 1]]);
    if (members.length % 2) leftovers.push(members[members.length - 1]);
  }
  while (leftovers.length) {
    const a = leftovers.shift()!;
    const b = takeOpponentFor(a, leftovers);
    pairs.push(b ? [a, b] : [a]);
  }

  const freePairs = shuffled(
    Array.from({ length: drawsize / 2 }, (_, i) => 2 * i + 1).filter((l) => !taken.has(l)),
    rng,
  );
  [...byePlayers.map((p) => [p]), ...pairs].forEach((pair, i) => {
    const line = freePairs[i];
    if (line === undefined) return;
    slotMap.set(line, pair[0]);
    if (pair[1]) slotMap.set(line + 1, pair[1]);
  });

  return { slotMap, seeds };
};

/**
 * RR: each group's top two by league rank are seeded (its top one in a group of 2–3), and every
 * seeded player in the draw is then numbered 1, 2, 3… by league rank, so seed 1 is the draw's best.
 */
export const groupSeeds = (groups: TournamentPlayer[][], statsMap: Record<string, UserStats>) => {
  const seeded = groups.flatMap((group) => {
    const ranked = group.filter((p) => p.uid && p.uid !== PLAYER_LOADING_SENTINEL).sort(playerSeedCompare(statsMap));
    return ranked.slice(0, ranked.length >= 4 ? 2 : ranked.length >= 2 ? 1 : 0);
  });
  return Object.fromEntries(seeded.sort(playerSeedCompare(statsMap)).map((p, i) => [p.uid, i + 1]));
};

export const mapParticipantsToPlayers = (participants: EventParticipant[], userMap: Record<string, MemberInfo>): TournamentPlayer[] =>
  participants.map((p) => {
    const userData = userMap[p.uid];
    const baseName = getParticipantDisplayName(p, userData) || 'Player';
    const partnerName = p.partner_name ? formatPlayerName(p.partner_name) : null;
    const name = partnerName ? `${baseName} / ${partnerName}` : baseName;
    return {
      uid: p.uid,
      name,
      participantId: p.id,
      partnerUid: p.partner_uid || undefined,
    };
  });

export const buildMatchFields = (
  tm: TemplateMatch,
  slotMap: Map<number, TournamentPlayer>,
  cfg: {
    eventId: string;
    tournamentChoice: 'Singles' | 'Doubles';
    division: string;
    skillGroup: SkillGroup;
    zone?: string;
    drawsize: number;
    allMatches: TemplateMatch[];
    started: boolean;
  },
) => {
  const p1 = typeof tm.player_1 === 'number' ? (slotMap.get(tm.player_1) ?? null) : null;
  const p2 = typeof tm.player_2 === 'number' ? (slotMap.get(tm.player_2) ?? null) : null;
  const now = Timestamp.now();
  // The full v3 match shape: every field present, typed empties where unused.
  return {
    category: 'tournament' as const,
    sub_category: (cfg.tournamentChoice === 'Doubles' ? 'doubles' : 'singles') as 'singles' | 'doubles',
    status: 'accepted' as const,
    player_1_uid: p1?.uid || '',
    player_1_name: p1?.name || (typeof tm.player_1 === 'number' ? PLAYER_LOADING : getWinnerPlaceholder(tm.player_1, cfg.allMatches)),
    player_2_uid: p2?.uid || '',
    player_2_name: p2?.name || (typeof tm.player_2 === 'number' ? PLAYER_LOADING : getWinnerPlaceholder(tm.player_2, cfg.allMatches)),
    participant_uids: matchUids(p1, p2),
    event_id: cfg.eventId,
    winner_uid: '',
    responded_at: null,
    created_at: now,
    updated_at: now,
    match_id: tm.match_id,
    round: tm.round,
    drawsize: cfg.drawsize,
    division: cfg.division,
    skill_group: cfg.skillGroup,
    zone: cfg.zone ?? '',
    format: 'knockout' as const,
    player_1_slot: typeof tm.player_1 === 'number' ? tm.player_1 : 0,
    player_2_slot: typeof tm.player_2 === 'number' ? tm.player_2 : 0,
    next_match_id: tm.next_match_id || '',
    next_slot: (tm.next_slot ?? '') as 'player_1' | 'player_2' | '',
    started: cfg.started,
    group_label: 'knockout',
  };
};

// The full ranked player list for a draw, strongest first (no size limit — callers slice as
// needed). `placeSeededDraw` turns this order into lines.
export const buildPlayerList = (
  drawParticipants: EventParticipant[],
  statsMap: Record<string, UserStats>,
  userMap: Record<string, MemberInfo>,
): TournamentPlayer[] =>
  mapParticipantsToPlayers([...drawParticipants].sort(seedCompare(statsMap)), userMap)
    .filter((p) => p.name);

// ─── Draw configs ──────────────────────────────────────────────────────────────────────────────

export const VISIBLE_DRAWS: DrawConfig[] = [
  { tab: 'mens', label: "Men's Beginners", tournamentChoice: 'Singles', division: "Men's", skillGroup: 'Beginners' },
  { tab: 'mens', label: "Men's Challengers", tournamentChoice: 'Singles', division: "Men's", skillGroup: 'Challengers' },
  { tab: 'mens', label: "Men's Masters", tournamentChoice: 'Singles', division: "Men's", skillGroup: 'Masters' },
  { tab: 'mens', label: "Men's Retired Pro", tournamentChoice: 'Singles', division: "Men's Retired Pro", skillGroup: 'All' },
  { tab: 'womens', label: "Women's Beginners", tournamentChoice: 'Singles', division: "Women's", skillGroup: 'Beginners' },
  { tab: 'womens', label: "Women's Challengers", tournamentChoice: 'Singles', division: "Women's", skillGroup: 'Challengers' },
  { tab: 'womens', label: "Women's Masters", tournamentChoice: 'Singles', division: "Women's", skillGroup: 'Masters' },
  { tab: 'womens', label: "Women's Retired Pro", tournamentChoice: 'Singles', division: "Women's Retired Pro", skillGroup: 'All' },
  { tab: 'doubles', label: "Men's Doubles", tournamentChoice: 'Doubles', division: "Men's", skillGroup: 'All' },
  { tab: 'doubles', label: "Women's Doubles", tournamentChoice: 'Doubles', division: "Women's", skillGroup: 'All' },
  { tab: 'doubles', label: 'Mixed Doubles', tournamentChoice: 'Doubles', division: 'Mixed Doubles', skillGroup: 'All' },
];

// The strongest band in a merge — Beginners+Challengers is a Challengers draw, anything including
// Masters is a Masters draw. SKILL_GROUP_ORDER runs weakest → strongest, so the highest index wins.
export const highestBandIn = (pair: SkillMergePair): SkillGroup =>
  (pair.split('+') as SkillGroup[])
    .reduce((best, b) => (SKILL_GROUP_ORDER.indexOf(b) > SKILL_GROUP_ORDER.indexOf(best) ? b : best));

// A merged singles skill draw for one adjacent pair (Beginners+Challengers, or
// Challengers+Masters). Replaces the old static MENS/WOMENS_MERGED_DRAW constants now that
// there's more than one possible pair per division.
//
// Named after the strongest band rather than every band glued together: a merged draw plays as
// that band, and "Men's Beginners + Challengers + Masters" was both a mouthful and misleading.
export const buildMergedSkillDraw = (tab: 'mens' | 'womens', division: "Men's" | "Women's", pair: SkillMergePair): DrawConfig => ({
  tab,
  label: `${division} ${highestBandIn(pair)}`,
  tournamentChoice: 'Singles',
  division,
  skillGroup: 'All',
  mergedFrom: pair,
});

export const CONSOLIDATED_DOUBLES_DRAW: DrawConfig = {
  tab: 'doubles',
  label: 'Doubles',
  tournamentChoice: 'Doubles',
  division: 'All',
  skillGroup: 'All',
};

// ── Zone-tier group formation ─────────────────────────────────────────────────

export type ZoneTierGroup = {
  label: string;
  players: TournamentPlayer[];
};

/**
 * Split `n` players into balanced groups of 3–5: g = ceil(n/5), sizes differ by at most 1,
 * larger first. 5→[5] · 6→[3,3] · 7→[4,3] · 8→[4,4] · 9→[5,4] · 10→[5,5] · 11→[4,4,3] · 12→[4,4,4].
 * n<3 returns one group of n.
 */
export function splitEvenly(n: number): number[] {
  if (n <= 0) return [];
  const g = Math.max(1, Math.ceil(n / 5));
  const base = Math.floor(n / g);
  const rem = n % g;
  return Array.from({ length: g }, (_, i) => (i < rem ? base + 1 : base));
}

// Band display order (strongest first) so groups read Masters → Challengers → Beginners.
const BAND_ORDER: Record<string, number> = { Masters: 0, Challengers: 1, Beginners: 2 };

// Zone suffix for a set of players: the single shared zone, or '' when unassigned/mixed.
export const sharedZone = (players: TournamentPlayer[], zoneOf: (p: TournamentPlayer) => string): string => {
  const zones = [...new Set(players.map(zoneOf).filter(Boolean))];
  return zones.length === 1 ? zones[0] : '';
};

// Band suffix for a set of players: the single shared band, or '' when mixed.
export const sharedBand = (players: TournamentPlayer[], bandOf: (p: TournamentPlayer) => string): string => {
  const bands = [...new Set(players.map(bandOf).filter(Boolean))];
  return bands.length === 1 ? bands[0] : '';
};

// Auto label: "Group X · Band · Zone", dropping any segment that isn't shared.
export const autoLabel = (index: number, band: string, zone: string): string =>
  ['Group ' + String.fromCharCode(65 + index), band, zone].filter(Boolean).join(' · ');

/**
 * Buckets by skill band, then preferred-court zone, sized by `splitEvenly`.
 * - ≤5 total players → one group, band/zone ignored.
 * - A lone player in a distinct zone gets their own placeholder group ONLY when the draw already
 *   has >3 zone-clustered groups; otherwise the band is pooled (ordered by zone) and split.
 * Labels carry the band, plus the zone when the whole group shares one. Letter is positional.
 */
export function buildZoneTierGroups(
  players: TournamentPlayer[],
  zoneMap: Record<string, string>,
  skillMap: Record<string, number>,
): ZoneTierGroup[] {
  if (players.length === 0) return [];

  const zoneOf = (p: TournamentPlayer) => (zoneMap[p.uid] || '').trim();
  const skillOf = (p: TournamentPlayer) => skillMap[p.uid] ?? p.skillLevel ?? 0;
  const bandOf = (p: TournamentPlayer) => skillBand(skillOf(p));
  const bySkillThenName = (a: TournamentPlayer, b: TournamentPlayer) =>
    skillOf(b) - skillOf(a) || a.name.localeCompare(b.name);

  // Small field → single group regardless of band/zone.
  if (players.length <= 5) {
    const gp = [...players].sort(bySkillThenName);
    return [{ label: autoLabel(0, sharedBand(gp, bandOf), sharedZone(gp, zoneOf)), players: gp }];
  }

  // Bucket by band, then zone within each band.
  const bands = [...new Set(players.map(bandOf))].sort((a, b) => (BAND_ORDER[a] ?? 9) - (BAND_ORDER[b] ?? 9));

  type Bucket = { band: string; zone: string; players: TournamentPlayer[] };
  const multiBuckets: Bucket[] = []; // zones with ≥2 players in a band
  const singletons: Bucket[] = [];   // zones with exactly 1 player in a band

  for (const band of bands) {
    const bandPlayers = players.filter((p) => bandOf(p) === band);
    const zones = [...new Set(bandPlayers.map(zoneOf))].sort((a, b) => a.localeCompare(b));
    for (const zone of zones) {
      const zonePlayers = bandPlayers.filter((p) => zoneOf(p) === zone).sort(bySkillThenName);
      (zonePlayers.length >= 2 ? multiBuckets : singletons).push({ band, zone, players: zonePlayers });
    }
  }

  const multiGroupCount = multiBuckets.reduce((sum, b) => sum + splitEvenly(b.players.length).length, 0);

  const grouped: { band: string; zone: string; players: TournamentPlayer[] }[] = [];

  // Chop a bucket's players into groups sized by splitEvenly.
  const chop = (band: string, zone: string, list: TournamentPlayer[]) => {
    let offset = 0;
    for (const size of splitEvenly(list.length)) {
      grouped.push({ band, zone, players: list.slice(offset, offset + size) });
      offset += size;
    }
  };

  if (multiGroupCount > 3) {
    // Established clusters: keep zone-pure groups, isolate each lone-zone player.
    for (const b of multiBuckets) chop(b.band, b.zone, b.players);
    for (const s of singletons) grouped.push({ band: s.band, zone: s.zone, players: s.players });
  } else {
    // Smaller draw: pool each band (multi + singletons) ordered by zone so clusters stay
    // together where sizes align, then split. Singletons fold in rather than stranding.
    for (const band of bands) {
      const bandPlayers = players
        .filter((p) => bandOf(p) === band)
        .sort((a, b) => zoneOf(a).localeCompare(zoneOf(b)) || bySkillThenName(a, b));
      if (bandPlayers.length > 0) chop(band, '', bandPlayers);
    }
  }

  // Fold lone-player groups into the smallest group that still has capacity (< 5 players),
  // same band preferred. If every other group is at 5 the solo group remains as-is.
  let folded = true;
  while (folded) {
    folded = false;
    const sIdx = grouped.findIndex((g) => g.players.length === 1);
    if (sIdx === -1 || grouped.length <= 1) break;
    const solo = grouped[sIdx];
    const target = grouped
      .filter((_, i) => i !== sIdx && grouped[i].players.length < 5)
      .sort((a, b) => {
        const sa = a.band === solo.band ? 0 : 1;
        const sb = b.band === solo.band ? 0 : 1;
        return sa - sb || a.players.length - b.players.length;
      })[0];
    if (!target) break;
    target.players.push(...solo.players);
    grouped.splice(sIdx, 1);
    folded = true;
  }

  return grouped.map((g, i) => ({
    label: autoLabel(i, sharedBand(g.players, bandOf), sharedZone(g.players, zoneOf)),
    players: g.players,
  }));
}

/** Circle-method round-robin: all unique [i, j] pairings (i < j). n=4 → 6 pairs; n=5 → 10. */
export function generateGroupPairings(n: number): [number, number][] {
  if (n < 2) return [];
  const pairs: [number, number][] = [];

  // Pad to even count; ghost player = -1 (a bye slot)
  const padded = n % 2 === 0 ? n : n + 1;
  const arr = Array.from({ length: padded }, (_, i) => (i < n ? i : -1));

  for (let r = 0; r < padded - 1; r++) {
    for (let i = 0; i < padded / 2; i++) {
      const p1 = arr[i];
      const p2 = arr[padded - 1 - i];
      if (p1 !== -1 && p2 !== -1) {
        pairs.push([Math.min(p1, p2), Math.max(p1, p2)]);
      }
    }
    // Rotate: keep arr[0] fixed, rotate arr[1..padded-1]
    const last = arr[padded - 1];
    for (let i = padded - 1; i > 1; i--) arr[i] = arr[i - 1];
    arr[1] = last;
  }

  return pairs;
}

/**
 * A group's number in its match doc ids (`rr_g{N}_m{pos}`). Positions restart at 1 in every group,
 * so this, not the match number, is what orders the groups and names a new group's docs.
 */
export const groupIndexOf = (m: Pick<TournamentMatch, 'match_id'>) =>
  Number(/^rr_g(\d+)_/.exec(m.match_id || '')?.[1] ?? 0);

/** The full v3 fields every tournament match doc carries; callers add the slot-specific ones. */
const drawFields = (eventId: string, draw: DrawConfig, started: boolean) => {
  const now = Timestamp.now();
  return {
    category: 'tournament' as const,
    sub_category: (draw.tournamentChoice === 'Doubles' ? 'doubles' : 'singles') as 'singles' | 'doubles',
    status: 'accepted' as const,
    event_id: eventId,
    winner_uid: '',
    responded_at: null,
    created_at: now,
    updated_at: now,
    division: draw.division,
    skill_group: draw.skillGroup,
    zone: draw.zone ?? '',
    started,
  };
};

/**
 * Build Firestore write objects for all matches in one group. `groupLabel` is the group's
 * identity (stored verbatim on every match), so it must be unique within the draw.
 */
export function buildRRGroupMatchFields(params: {
  eventId: string;
  drawKey: string;
  draw: DrawConfig;
  groupIndex: number;
  groupLabel: string;
  groupPlayers: TournamentPlayer[];
  pairings: [number, number][];
  started: boolean;
}, startPosition = 1): Array<{ docId: string; fields: Record<string, unknown> }> {
  const { eventId, drawKey, draw, groupIndex, groupLabel, groupPlayers, pairings, started } = params;

  return pairings.map(([i1, i2], idx) => {
    const p1 = groupPlayers[i1] ?? null;
    const p2 = groupPlayers[i2] ?? null;
    const pos = idx + startPosition;
    const docId = `${eventId}_${drawKey}_rr_g${groupIndex}_m${pos}`;
    return {
      docId,
      fields: {
        ...drawFields(eventId, draw, started),
        player_1_uid: p1?.uid ?? '',
        player_1_name: p1?.name ?? PLAYER_LOADING,
        player_2_uid: p2?.uid ?? '',
        player_2_name: p2?.name ?? PLAYER_LOADING,
        participant_uids: matchUids(p1, p2),
        match_id: `rr_g${groupIndex}_m${pos}`,
        round: 'RR',
        drawsize: groupPlayers.length,
        format: 'rr',
        player_1_slot: i1 + 1,
        player_2_slot: i2 + 1,
        next_match_id: '',
        next_slot: '',
        group_label: groupLabel,
      },
    };
  });
}

/**
 * Rebuild one group's matches after a roster change without touching an already-played match:
 * only not-yet-played pairings are deleted and regenerated. The caller always keeps a player who
 * has personally played in `newPlayers`, so their match is preserved.
 */
export function buildSafeGroupRewrite(params: {
  eventId: string;
  drawKey: string;
  draw: DrawConfig;
  groupIndex: number;
  groupLabel: string;
  oldMatches: TournamentMatch[];
  newPlayers: TournamentPlayer[];
  started: boolean;
}): { toDelete: string[]; toWrite: Array<{ docId: string; fields: Record<string, unknown> }> } {
  const { eventId, drawKey, draw, groupIndex, groupLabel, oldMatches, newPlayers, started } = params;
  const completedOld = oldMatches.filter((m) => m.status === 'complete');
  const pendingOld = oldMatches.filter((m) => m.status !== 'complete');
  const playedPairs = new Set(completedOld.map((m) => [m.player_1_uid, m.player_2_uid].sort().join('|')));
  const basePairings = newPlayers.length >= 2 ? generateGroupPairings(newPlayers.length) : newPlayers.length === 1 ? [[0, 1]] as [number, number][] : [];
  const pairings = basePairings.filter(([i1, i2]) => {
    const a = newPlayers[i1]?.uid, b = newPlayers[i2]?.uid;
    return !(a && b && playedPairs.has([a, b].sort().join('|')));
  });
  const startPosition = 1 + Math.max(0, ...oldMatches.map((m) => matchNumber(m.match_id)));
  const toWrite = newPlayers.length > 0
    ? buildRRGroupMatchFields({ eventId, drawKey, draw, groupIndex, groupLabel, groupPlayers: newPlayers, pairings, started }, startPosition)
    : [];
  return { toDelete: pendingOld.map((m) => m.id), toWrite };
}

type GroupWrites = { toDelete: string[]; toWrite: Array<{ docId: string; fields: Record<string, unknown> }> };

/**
 * A generated group's edit as writes: the group rewritten, each group a moved-in player left
 * rewritten without them, and anyone taken out (`removedUids`) purged from every match in the
 * event; the caller withdraws their registrations in the same batch. A move is refused when the
 * player has already played in their current group.
 */
export function planGroupEdit(params: {
  eventId: string;
  drawKey: string;
  draw: DrawConfig;
  started: boolean;
  groupKey: string;
  /** Every generated group of the draw, in card order. */
  groups: { key: string; players: TournamentPlayer[]; matches: TournamentMatch[] }[];
  eventMatches: TournamentMatch[];
  newPlayers: TournamentPlayer[];
}): { error: string } | (GroupWrites & { removedUids: string[] }) {
  const { eventId, drawKey, draw, started, groupKey, groups, eventMatches, newPlayers } = params;
  const target = groups.find((g) => g.key === groupKey);
  if (!target) return { error: 'That group no longer exists.' };
  const real = newPlayers.filter((pl) => pl.uid !== PLAYER_LOADING_SENTINEL);
  const removedUids = target.players
    .filter((pl) => pl.uid && !real.some((np) => np.uid === pl.uid))
    .map((pl) => pl.uid);

  const seated = new Set(target.matches.flatMap((m) => [m.player_1_uid, m.player_2_uid]).filter(Boolean));
  const sources = new Map<string, TournamentPlayer[]>();
  for (const pl of newPlayers) {
    if (!pl.uid || seated.has(pl.uid)) continue;
    const src = groups.find((g) => g.key !== groupKey && g.players.some((sp) => sp.uid === pl.uid));
    if (!src) continue;
    if (src.matches.some((m) => m.status === 'complete' && (m.player_1_uid === pl.uid || m.player_2_uid === pl.uid))) {
      return { error: 'Cannot move: this player has already played a match in their current group.' };
    }
    sources.set(src.key, (sources.get(src.key) ?? src.players).filter((sp) => sp.uid !== pl.uid));
  }

  const rewrite = (g: typeof target, players: TournamentPlayer[]) => buildSafeGroupRewrite({
    eventId, drawKey, draw, started, groupIndex: Math.min(...g.matches.map(groupIndexOf)),
    groupLabel: g.key, oldMatches: g.matches, newPlayers: players,
  });
  const parts = [rewrite(target, real), ...[...sources].map(([key, players]) => rewrite(groups.find((g) => g.key === key)!, players))];
  const removed = new Set(removedUids);
  const purged = eventMatches.filter((m) => removed.has(m.player_1_uid) || removed.has(m.player_2_uid)).map((m) => m.id);
  return {
    toDelete: [...new Set([...parts.flatMap((r) => r.toDelete), ...purged])],
    toWrite: parts.flatMap((r) => r.toWrite),
    removedUids,
  };
}

type Seat = Pick<TournamentMatch, 'id' | 'status' | 'player_1_uid' | 'player_1_name' | 'player_2_uid' | 'player_2_name'>;

/**
 * Taking a player out of a draw: a walkover for the opponent in each unplayed match with a real
 * one, and every other unplayed slot of theirs blanked. Played and cancelled matches are untouched.
 */
export function planRemovePlayer<M extends Seat>(uid: string, drawMatches: M[]) {
  const walkovers: { matchId: string; winnerUid: string }[] = [];
  const blanks: { match: M; slot: 'player_1' | 'player_2' }[] = [];
  for (const m of drawMatches) {
    if (m.status === 'complete' || m.status === 'cancelled') continue;
    const slot = m.player_1_uid === uid ? 'player_1' : m.player_2_uid === uid ? 'player_2' : null;
    if (!slot) continue;
    const [oppUid, oppName] = slot === 'player_1' ? [m.player_2_uid, m.player_2_name] : [m.player_1_uid, m.player_1_name];
    if (oppUid && oppName !== PLAYER_LOADING && oppName !== BYE) walkovers.push({ matchId: m.id, winnerUid: oppUid });
    else blanks.push({ match: m, slot });
  }
  return { walkovers, blanks };
}

/**
 * Standings for one group. The POINTS are what each result entry stored when it was paid
 * (`points_winner` / `points_loser` on the applied submission, merged onto the match as `result`),
 * so the table can never show a different number from the one paid. This only adds wins, losses,
 * games and the order.
 *
 * Sort: points DESC → gamesWon DESC. No completion bonus: see the note at the foot of the function.
 */
export function computeGroupStandings(
  groupMatches: TournamentMatch[],
): RRStandingRow[] {
  const playerMap = new Map<string, string>(); // uid → name
  for (const m of groupMatches) {
    if (m.player_1_uid) playerMap.set(m.player_1_uid, m.player_1_name);
    if (m.player_2_uid) playerMap.set(m.player_2_uid, m.player_2_name);
  }

  const stats = new Map<string, { matchWins: number; matchLosses: number; gamesWon: number; gamesLost: number; points: number }>();
  for (const uid of playerMap.keys()) stats.set(uid, { matchWins: 0, matchLosses: 0, gamesWon: 0, gamesLost: 0, points: 0 });

  for (const m of groupMatches) {
    if (m.status !== 'complete') continue;

    const winnerUid = m.winner_uid;
    if (!winnerUid) continue;
    const loserUid = winnerUid === m.player_1_uid ? m.player_2_uid : m.player_1_uid;

    const r = m.result;
    const p1Games = (r?.set_1_player_1 ?? 0) + (r?.set_2_player_1 ?? 0) + (r?.set_3_player_1 ?? 0);
    const p2Games = (r?.set_1_player_2 ?? 0) + (r?.set_2_player_2 ?? 0) + (r?.set_3_player_2 ?? 0);
    const winnerGames = winnerUid === m.player_1_uid ? p1Games : p2Games;
    const loserGames  = winnerUid === m.player_1_uid ? p2Games : p1Games;

    // A walkover has no games, so it adds only the win, the loss and its points.
    const w = stats.get(winnerUid);
    const l = loserUid ? stats.get(loserUid) : undefined;
    const winnerPts = r?.points_winner ?? 0;
    const loserPts = r?.points_loser ?? 0;
    if (w) { w.matchWins++; w.gamesWon += winnerGames; w.gamesLost += loserGames; w.points += winnerPts; }
    if (l) { l.matchLosses++; l.gamesWon += loserGames; l.gamesLost += winnerGames; l.points += loserPts; }
  }

  const rows: RRStandingRow[] = [];
  for (const [userId, s] of stats) {
    rows.push({ name: playerMap.get(userId) ?? '', userId, ...s, rank: 0 });
  }
  rows.sort((a, b) => b.points - a.points || b.gamesWon - a.gamesWon);
  rows.forEach((r, i) => { r.rank = i + 1; });

  // No completion bonus here. It used to add +5 to everyone the moment a group's last match
  // completed, which stopped being true when the bonus became the organizer's Group Bonus switch:
  // the table then showed 5 points nobody had actually been given. The award is the organizer's
  // to make and is not shown in this table.
  return rows;
}

// Smallest knockout bracket size (power of two, min 2, cap 32) that seats `x` players.
export const nextPow2 = (x: number) => { let s = 2; while (s < x) s *= 2; return Math.min(s, 32); };

/** Each group's #1 by group standings. The caller ranks them for seeding (league rank). */
export function selectGroupWinners(
  allGroups: TournamentPlayer[][],
  standingsByGroup: RRStandingRow[][],
): TournamentPlayer[] {
  const winners: TournamentPlayer[] = [];
  for (let g = 0; g < allGroups.length; g++) {
    const top = standingsByGroup[g]?.[0];
    if (!top) continue;
    const p = allGroups[g]?.find((x) => x.uid === top.userId);
    if (p) winners.push(p);
  }
  return winners;
}

/**
 * Firestore write objects for the RR knockout (SF + F, or just F), reusing fallbackTemplate.
 * `slotMap` is the placed bracket (line → player, from `placeSeededDraw`).
 * `manualFill` leaves empty numeric slots as PLAYER_LOADING instead of BYE and skips
 * first-round bye auto-advancement.
 */
export function buildRRKnockoutDocs(params: {
  eventId: string;
  drawKey: string;
  draw: DrawConfig;
  slotMap: Map<number, TournamentPlayer>;
  started: boolean;
  drawsize: number;
  manualFill?: boolean;
}): Array<{ docId: string; fields: Record<string, unknown> }> {
  const { eventId, drawKey, draw, slotMap, started, drawsize, manualFill } = params;
  const template = fallbackTemplate(drawsize);

  // When a first-round match has one seeded player and an empty numeric partner, bake the
  // advancement into the next-round doc so byes resolve at generation.
  // Skipped in manual-fill mode — empty slots are for the creator to place, not byes.
  const advanceSeat = new Map<string, TournamentPlayer>();
  if (!manualFill) {
    template.forEach((tm) => {
      if (!tm.next_match_id) return;
      const p1 = typeof tm.player_1 === 'number' ? (slotMap.get(tm.player_1) ?? null) : null;
      const p2 = typeof tm.player_2 === 'number' ? (slotMap.get(tm.player_2) ?? null) : null;
      const real = (p1 && !p2 && typeof tm.player_2 === 'number') ? p1
        : (!p1 && p2 && typeof tm.player_1 === 'number') ? p2 : null;
      if (!real) return;
      let nextSlot = (tm.next_slot || '') as 'player_1' | 'player_2' | '';
      if (!nextSlot) {
        const sibs = template
          .filter((s) => s.next_match_id === tm.next_match_id)
          .sort((a, b) => template.indexOf(a) - template.indexOf(b));
        nextSlot = sibs.findIndex((s) => s.match_id === tm.match_id) <= 0 ? 'player_1' : 'player_2';
      }
      advanceSeat.set(`${tm.next_match_id}_${nextSlot}`, real);
    });
  }

  const placeholder = (slot: number | string): string => {
    // Numeric slot with no seeded player → BYE (or an editable placeholder in manual-fill mode).
    if (typeof slot === 'number') return manualFill ? PLAYER_LOADING : BYE;
    const srcId = slot.toLowerCase().match(/winner\s+(.+)/)?.[1]?.trim();
    if (!srcId) return PLAYER_LOADING;
    const src = template.find((m) => m.match_id === srcId);
    if (!src) return `Winner of ${srcId.toUpperCase()}`;
    const sameRound = template.filter((m) => m.round === src.round);
    const pos = sameRound.findIndex((m) => m.match_id === srcId) + 1;
    return `Winner of ${src.round}${pos}`;
  };

  return template.map((tm) => {
    let p1 = typeof tm.player_1 === 'number' ? (slotMap.get(tm.player_1) ?? null) : null;
    let p2 = typeof tm.player_2 === 'number' ? (slotMap.get(tm.player_2) ?? null) : null;
    // Apply baked bye advancement into this (next-round) match's slots.
    p1 = advanceSeat.get(`${tm.match_id}_player_1`) ?? p1;
    p2 = advanceSeat.get(`${tm.match_id}_player_2`) ?? p2;

    return {
      docId: `${eventId}_${drawKey}_rr_ko_${tm.match_id}`,
      fields: {
        ...drawFields(eventId, draw, started),
        player_1_uid: p1?.uid ?? '',
        player_1_name: p1?.name ?? placeholder(tm.player_1),
        player_2_uid: p2?.uid ?? '',
        player_2_name: p2?.name ?? placeholder(tm.player_2),
        participant_uids: matchUids(p1, p2),
        match_id: tm.match_id,
        round: tm.round,
        drawsize,
        // Stays 'rr': it marks the draw as round robin, and keeps the server's late-joiner
        // seating (format 'knockout' only) out of slots the organizer fills by hand.
        format: 'rr' as const,
        player_1_slot: typeof tm.player_1 === 'number' ? tm.player_1 : 0,
        player_2_slot: typeof tm.player_2 === 'number' ? tm.player_2 : 0,
        next_match_id: tm.next_match_id ?? '',
        next_slot: tm.next_slot ?? '',
        group_label: 'knockout',
      },
    };
  });
}
