import { DrawConfig, RRConfig, RRStandingRow, TournamentMatch, TournamentPlayer } from './types';
import { PLAYER_LOADING, fallbackTemplate } from './utils';

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
 * Distribute players into groups, targeting groupSize per group.
 * Ensures no group has fewer than 3 players.
 */
export function distributePlayersIntoGroups(
  players: TournamentPlayer[],
  groupSize: 4 | 5,
): TournamentPlayer[][] {
  const n = players.length;
  if (n < 3) return n > 0 ? [players] : [];

  let numGroups = Math.max(1, Math.ceil(n / groupSize));

  // Reduce groups until every group has ≥ 3 players
  while (numGroups > 1) {
    const baseSize = Math.floor(n / numGroups);
    const minSize = baseSize; // last groups get baseSize, first groups get baseSize+1
    if (minSize >= 3) break;
    numGroups--;
  }

  const groups: TournamentPlayer[][] = [];
  const base = Math.floor(n / numGroups);
  const extras = n % numGroups;
  let start = 0;
  for (let g = 0; g < numGroups; g++) {
    const size = base + (g < extras ? 1 : 0);
    groups.push(players.slice(start, start + size));
    start += size;
  }
  return groups;
}

/**
 * Build Firestore write objects for all matches in one group.
 */
export function buildRRGroupMatchFields(params: {
  eventId: string;
  drawKey: string;
  draw: DrawConfig;
  groupIndex: number;
  groupPlayers: TournamentPlayer[];
  pairings: [number, number][];
  advancementCount: number;
  started: boolean;
}): Array<{ docId: string; fields: Record<string, unknown> }> {
  const { eventId, drawKey, draw, groupIndex, groupPlayers, pairings, advancementCount, started } = params;

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
        created_at: new Date().toISOString(),
      },
    };
  });
}

/**
 * Compute standings for one group from its completed matches.
 * Primary sort: matchWins DESC. Secondary: points DESC (2 per real win, 1 per walkover).
 */
export function computeGroupStandings(
  groupMatches: TournamentMatch[],
): RRStandingRow[] {
  const playerMap = new Map<string, string>(); // uid → name
  for (const m of groupMatches) {
    if (m.player_1_user_id) playerMap.set(m.player_1_user_id, m.player_1_name);
    if (m.player_2_user_id) playerMap.set(m.player_2_user_id, m.player_2_name);
  }

  const stats = new Map<string, { matchWins: number; matchLosses: number; points: number }>();
  for (const uid of playerMap.keys()) stats.set(uid, { matchWins: 0, matchLosses: 0, points: 0 });

  for (const m of groupMatches) {
    if (m.status !== 'complete' || !m.winner_user_id) continue;
    const winnerUid = m.winner_user_id;
    const loserUid =
      winnerUid === m.player_1_user_id ? m.player_2_user_id : m.player_1_user_id;

    const w = stats.get(winnerUid);
    if (w) { w.matchWins++; w.points += m.walkover ? 1 : 2; }
    const l = stats.get(loserUid);
    if (l) { l.matchLosses++; }
  }

  const rows: RRStandingRow[] = [];
  for (const [userId, s] of stats) {
    rows.push({ name: playerMap.get(userId) ?? '', userId, ...s, rank: 0 });
  }
  rows.sort((a, b) => b.matchWins - a.matchWins || b.points - a.points);
  rows.forEach((r, i) => { r.rank = i + 1; });
  return rows;
}

/**
 * Select the players who advance to the knockout stage.
 *
 * 1 group  → top 2
 * 2 groups → top advancementCount from each (seeded cross-group for SF)
 * 3 groups → top 2 from each (6) globally ranked → top 4
 * 4 groups → top 1 from each
 */
export function selectAdvancingPlayers(
  allGroups: TournamentPlayer[][],
  standingsByGroup: RRStandingRow[][],
  advancementCount: number,
): TournamentPlayer[] {
  const lookup = (groupIdx: number, row: RRStandingRow): TournamentPlayer | undefined =>
    allGroups[groupIdx]?.find((p) => p.user_id === row.userId);

  const n = allGroups.length;

  if (n === 1) {
    return standingsByGroup[0]
      .slice(0, 2)
      .map((r) => lookup(0, r))
      .filter((p): p is TournamentPlayer => !!p);
  }

  if (n === 2) {
    // Cross-seed: 1A vs 2B, 2A vs 1B → pass [1A, 2B, 2A, 1B] to fallbackTemplate(4)
    // fallbackTemplate(4) creates SF m1=seed1 vs seed4, m2=seed3 vs seed2 → [1A vs 1B, 2A vs 2B]
    // To avoid same-group SF, interleave: [1A, 1B, 2A, 2B]
    const g0 = standingsByGroup[0].slice(0, advancementCount);
    const g1 = standingsByGroup[1].slice(0, advancementCount);
    const players: TournamentPlayer[] = [];
    for (let rank = 0; rank < advancementCount; rank++) {
      if (g0[rank]) { const p = lookup(0, g0[rank]); if (p) players.push(p); }
      if (g1[rank]) { const p = lookup(1, g1[rank]); if (p) players.push(p); }
    }
    return players;
  }

  if (n === 3) {
    // Top 2 from each → global rank → top 4
    const candidates: (RRStandingRow & { gi: number })[] = [];
    for (let g = 0; g < 3; g++) {
      standingsByGroup[g].slice(0, 2).forEach((r) => candidates.push({ ...r, gi: g }));
    }
    candidates.sort((a, b) => b.matchWins - a.matchWins || b.points - a.points);
    return candidates
      .slice(0, 4)
      .map((r) => lookup(r.gi, r))
      .filter((p): p is TournamentPlayer => !!p);
  }

  // n === 4: top 1 from each group
  return standingsByGroup
    .flatMap((standings, g) => {
      const top = standings[0];
      const p = top ? lookup(g, top) : undefined;
      return p ? [p] : [];
    });
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
  const drawsize = n <= 2 ? 2 : 4;
  const template = fallbackTemplate(drawsize);

  const slotMap = new Map<number, TournamentPlayer>();
  advancingPlayers.forEach((p, i) => slotMap.set(i + 1, p));

  return template.map((tm, index) => {
    const p1 = typeof tm.player_1 === 'number' ? (slotMap.get(tm.player_1) ?? null) : null;
    const p2 = typeof tm.player_2 === 'number' ? (slotMap.get(tm.player_2) ?? null) : null;

    const placeholder = (slot: number | string): string => {
      if (typeof slot !== 'string') return PLAYER_LOADING;
      const srcId = slot.toLowerCase().match(/winner\s+(.+)/)?.[1]?.trim();
      if (!srcId) return PLAYER_LOADING;
      const src = template.find((m) => m.match_id === srcId);
      if (!src) return `Winner of ${srcId.toUpperCase()}`;
      const sameRound = template.filter((m) => m.round === src.round);
      const pos = sameRound.findIndex((m) => m.match_id === srcId) + 1;
      return `Winner of ${src.round}${pos}`;
    };

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
