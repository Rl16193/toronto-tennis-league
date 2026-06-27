import { DrawConfig, RRConfig, RRStandingRow, TournamentMatch, TournamentPlayer } from './types';
import { BYE, PLAYER_LOADING, fallbackTemplate } from './utils';

// ── Zone-tier group formation ─────────────────────────────────────────────────

export type ZoneTierGroup = {
  label: string;
  players: TournamentPlayer[];
};

/**
 * Groups players by skill first, then zone — honoring the creator's chosen group size.
 *
 * Skill is the dominant criterion: players are ordered by skill (descending) so each group
 * is a contiguous skill band. Zone is a *secondary* tiebreak so same-skill players who share
 * a zone cluster together; it never forces a split. Groups are filled to exactly `groupSize`
 * and the remainder lands in the last group ("fill to size, leftovers in last") — so 5
 * players at size 5 stay one group of 5, and 12 at size 5 become [5, 5, 2].
 *
 * A trailing group of size < 2 produces no matches (`generateGroupPairings(1) === []`) and
 * would silently drop the player, so it is merged back into the previous group. (Groups of
 * 2 are allowed.)
 *
 * Labels carry a zone suffix: one distinct zone → that zone's name; multiple → "Mixed Zones".
 * The letter is positional here but recomputed at render by `rrGroupLabels`.
 */
export function buildZoneTierGroups(
  players: TournamentPlayer[],
  zoneMap: Record<string, string>,
  skillMap: Record<string, number>,
  groupSize: 4 | 5,
): ZoneTierGroup[] {
  if (players.length === 0) return [];

  const zoneOf = (p: TournamentPlayer) => (zoneMap[p.user_id] || '').trim();
  const skillOf = (p: TournamentPlayer) => skillMap[p.user_id] ?? p.skillLevel ?? 0;

  // Skill is dominant; zone clusters same-skill players; name keeps the order stable.
  const sorted = [...players].sort((a, b) =>
    skillOf(b) - skillOf(a) ||
    zoneOf(a).localeCompare(zoneOf(b)) ||
    a.name.localeCompare(b.name),
  );

  // Fill groups to exactly groupSize; the final slice holds the remainder.
  const groups: TournamentPlayer[][] = [];
  for (let i = 0; i < sorted.length; i += groupSize) {
    groups.push(sorted.slice(i, i + groupSize));
  }

  // A trailing size-1 group can't produce a match → fold it into the previous group.
  if (groups.length > 1 && groups[groups.length - 1].length < 2) {
    const last = groups.pop()!;
    groups[groups.length - 1].push(...last);
  }

  return groups.map((gp, i) => {
    const zones = [...new Set(gp.map(zoneOf).filter(Boolean))];
    const zoneLabel = zones.length === 1 ? zones[0] : 'Mixed Zones';
    return { label: `Group ${String.fromCharCode(65 + i)} - ${zoneLabel}`, players: gp };
  });
}

/**
 * Circle-method round-robin scheduling.
 * Returns all unique [i, j] pairings (i < j) for n players.
 * n=4 → 6 pairs; n=5 → 10 pairs.
 */
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
 * Build Firestore write objects for all matches in one group.
 */
export function buildRRGroupMatchFields(params: {
  eventId: string;
  drawKey: string;
  draw: DrawConfig;
  groupIndex: number;
  groupLabel?: string;
  groupPlayers: TournamentPlayer[];
  pairings: [number, number][];
  advancementCount: number;
  started: boolean;
}): Array<{ docId: string; fields: Record<string, unknown> }> {
  const { eventId, drawKey, draw, groupIndex, groupLabel, groupPlayers, pairings, advancementCount, started } = params;

  return pairings.map(([i1, i2], idx) => {
    const p1 = groupPlayers[i1] ?? null;
    const p2 = groupPlayers[i2] ?? null;
    const docId = `${eventId}_${drawKey}_rr_g${groupIndex}_m${idx + 1}`;
    return {
      docId,
      fields: {
        event_id: eventId,
        template_id: '',
        tournament_choice: draw.tournamentChoice,
        division: draw.division,
        skill_group: draw.skillGroup,
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
        created_at: new Date().toISOString(),
      },
    };
  });
}

/**
 * Compute standings for one group from its completed matches.
 * Scoring: 1 pt per game won + 5 pts per match win.
 * Sort: points DESC → gamesWon DESC.
 */
export function computeGroupStandings(
  groupMatches: TournamentMatch[],
): RRStandingRow[] {
  const playerMap = new Map<string, string>(); // uid → name
  for (const m of groupMatches) {
    if (m.player_1_user_id) playerMap.set(m.player_1_user_id, m.player_1_name);
    if (m.player_2_user_id) playerMap.set(m.player_2_user_id, m.player_2_name);
  }

  const stats = new Map<string, { matchWins: number; matchLosses: number; gamesWon: number; gamesLost: number; points: number }>();
  for (const uid of playerMap.keys()) stats.set(uid, { matchWins: 0, matchLosses: 0, gamesWon: 0, gamesLost: 0, points: 0 });

  for (const m of groupMatches) {
    if (m.status !== 'complete' || !m.winner_user_id) continue;
    const winnerUid = m.winner_user_id;
    const loserUid = winnerUid === m.player_1_user_id ? m.player_2_user_id : m.player_1_user_id;

    const p1Games = (m.set_1_player_1 ?? 0) + (m.set_2_player_1 ?? 0) + (m.set_3_player_1 ?? 0);
    const p2Games = (m.set_1_player_2 ?? 0) + (m.set_2_player_2 ?? 0) + (m.set_3_player_2 ?? 0);
    const winnerGames = winnerUid === m.player_1_user_id ? p1Games : p2Games;
    const loserGames  = winnerUid === m.player_1_user_id ? p2Games : p1Games;

    const w = stats.get(winnerUid);
    if (w) { w.matchWins++; w.gamesWon += winnerGames; w.gamesLost += loserGames; }
    const l = stats.get(loserUid);
    if (l) { l.matchLosses++; l.gamesWon += loserGames; l.gamesLost += winnerGames; }
  }

  const rows: RRStandingRow[] = [];
  for (const [userId, s] of stats) {
    const points = s.gamesWon + s.matchWins * 5;
    rows.push({ name: playerMap.get(userId) ?? '', userId, ...s, points, rank: 0 });
  }
  rows.sort((a, b) => b.points - a.points || b.gamesWon - a.gamesWon);
  rows.forEach((r, i) => { r.rank = i + 1; });
  return rows;
}

/**
 * Select the players who advance to the knockout stage, ordered for seeding.
 *
 * - 1 group → top 2 (a single-group knockout is just a final between the top two).
 * - ≥2 groups → top `advancementCount` from each group. Ordered by rank-within-group
 *   first (all group winners, then all runners-up, …) then by points → gamesWon, so the
 *   strongest qualifiers seed highest. The caller (`buildRRKnockoutDocs`) sizes the bracket
 *   to the next power of two and gives top seeds first-round byes — no truncation, so
 *   "top 6", "top 10", etc. all flow into a 4/8/16/32 bracket.
 */
export function selectAdvancingPlayers(
  allGroups: TournamentPlayer[][],
  standingsByGroup: RRStandingRow[][],
  advancementCount: number,
): TournamentPlayer[] {
  const lookup = (groupIdx: number, row: RRStandingRow): TournamentPlayer | undefined =>
    allGroups[groupIdx]?.find((p) => p.user_id === row.userId);

  const n = allGroups.length;
  if (n === 0) return [];

  if (n === 1) {
    return standingsByGroup[0]
      .slice(0, 2)
      .map((r) => lookup(0, r))
      .filter((p): p is TournamentPlayer => !!p);
  }

  const candidates: Array<{ row: RRStandingRow; gi: number; rankInGroup: number }> = [];
  for (let g = 0; g < n; g++) {
    (standingsByGroup[g] ?? []).slice(0, advancementCount).forEach((row, rankInGroup) => {
      candidates.push({ row, gi: g, rankInGroup });
    });
  }
  candidates.sort((a, b) =>
    a.rankInGroup - b.rankInGroup ||
    b.row.points - a.row.points ||
    b.row.gamesWon - a.row.gamesWon,
  );
  return candidates
    .map((c) => lookup(c.gi, c.row))
    .filter((p): p is TournamentPlayer => !!p);
}

/**
 * Build Firestore write objects for the RR knockout stage (SF + F or just F).
 * Reuses the existing fallbackTemplate infrastructure.
 */
export function buildRRKnockoutDocs(params: {
  eventId: string;
  drawKey: string;
  draw: DrawConfig;
  advancingPlayers: TournamentPlayer[];
  started: boolean;
}): Array<{ docId: string; fields: Record<string, unknown> }> {
  const { eventId, drawKey, draw, advancingPlayers, started } = params;
  const n = advancingPlayers.length;
  // Round the bracket up to the next power of two (min 2, cap 32). Leftover top slots
  // become BYEs so the highest seeds get a first-round bye.
  const nextPow2 = (x: number) => { let s = 2; while (s < x) s *= 2; return Math.min(s, 32); };
  const drawsize = nextPow2(Math.max(2, n));
  const template = fallbackTemplate(drawsize);

  const slotMap = new Map<number, TournamentPlayer>();
  advancingPlayers.forEach((p, i) => slotMap.set(i + 1, p));

  // Pre-compute first-round BYE advancements: when a first-round match has one seeded
  // player and an empty numeric partner, the real player advances straight into the next
  // round. Bake those seatings into the next-round docs so byes resolve at generation.
  const advanceSeat = new Map<string, TournamentPlayer>();
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

  const placeholder = (slot: number | string): string => {
    if (typeof slot === 'number') return BYE; // numeric slot with no seeded player → BYE
    const srcId = slot.toLowerCase().match(/winner\s+(.+)/)?.[1]?.trim();
    if (!srcId) return PLAYER_LOADING;
    const src = template.find((m) => m.match_id === srcId);
    if (!src) return `Winner of ${srcId.toUpperCase()}`;
    const sameRound = template.filter((m) => m.round === src.round);
    const pos = sameRound.findIndex((m) => m.match_id === srcId) + 1;
    return `Winner of ${src.round}${pos}`;
  };

  return template.map((tm, index) => {
    let p1 = typeof tm.player_1 === 'number' ? (slotMap.get(tm.player_1) ?? null) : null;
    let p2 = typeof tm.player_2 === 'number' ? (slotMap.get(tm.player_2) ?? null) : null;
    // Apply baked bye advancement into this (next-round) match's slots.
    p1 = advanceSeat.get(`${tm.match_id}_player_1`) ?? p1;
    p2 = advanceSeat.get(`${tm.match_id}_player_2`) ?? p2;

    return {
      docId: `${eventId}_${drawKey}_rr_ko_${tm.match_id}`,
      fields: {
        event_id: eventId,
        template_id: '',
        tournament_choice: draw.tournamentChoice,
        division: draw.division,
        skill_group: draw.skillGroup,
        drawsize,
        match_id: tm.match_id,
        round: tm.round,
        position: index + 1,
        player_1_slot: tm.player_1,
        player_2_slot: tm.player_2,
        player_1_name: p1?.name ?? placeholder(tm.player_1),
        player_1_user_id: p1?.user_id ?? '',
        player_1_contact: p1?.contact ?? '',
        player_2_name: p2?.name ?? placeholder(tm.player_2),
        player_2_user_id: p2?.user_id ?? '',
        player_2_contact: p2?.contact ?? '',
        next_match_id: tm.next_match_id ?? '',
        next_slot: tm.next_slot ?? '',
        status: 'pending',
        bracket: null,
        started,
        format: 'rr' as const,
        created_at: new Date().toISOString(),
      },
    };
  });
}

/**
 * Derive the RRConfig from an existing set of RR matches.
 * Returns null if the matches aren't RR format.
 */
export function deriveRRConfig(rrMatches: TournamentMatch[]): RRConfig | null {
  const groupStage = rrMatches.filter((m) => m.round === 'RR');
  if (groupStage.length === 0) return null;
  const adv = groupStage[0]?.rr_advancement_count ?? 1;
  const groups = new Set(groupStage.map((m) => m.rr_group ?? 0));
  const group0Matches = groupStage.filter((m) => (m.rr_group ?? 0) === 0);
  const matchCount = group0Matches.length;
  const groupSize: 4 | 5 = matchCount <= 6 ? 4 : 5;
  return { groupSize, advancementCount: (adv as 1 | 2) };
}
