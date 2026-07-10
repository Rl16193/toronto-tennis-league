import { DrawConfig, RRConfig, RRStandingRow, TournamentMatch, TournamentPlayer } from './types';
import { BYE, PLAYER_LOADING, fallbackTemplate, skillBand } from './utils';

// ── Zone-tier group formation ─────────────────────────────────────────────────

export type ZoneTierGroup = {
  label: string;
  players: TournamentPlayer[];
};

/**
 * Split a bucket of `n` players into balanced groups of 3–5.
 * g = ceil(n/5) groups, sizes differ by at most 1, larger groups first.
 *   5→[5] · 6→[3,3] · 7→[4,3] · 8→[4,4] · 9→[5,4] · 10→[5,5] · 11→[4,4,3] · 12→[4,4,4].
 * (n<3 returns a single group of n — a size-2 pair is playable, size-1 is a placeholder.)
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
 * Groups players by skill band first, then preferred-court zone, honoring the size algorithm.
 *
 * - ≤5 total players → one group (zone/band ignored — a small field plays together).
 * - Otherwise bucket by (band, zone) and size each bucket with `splitEvenly`.
 * - A lone player in a distinct zone becomes their own placeholder group ONLY when the draw
 *   already has more than 3 zone-clustered groups; in smaller draws the band's players are
 *   pooled (ordered by zone so clusters stay together) and split, folding singletons in.
 *
 * Labels carry the band and, when the whole group shares one zone, that zone. Unassigned or
 * mixed zones produce no zone suffix. The letter is positional here and recomputed at render.
 */
export function buildZoneTierGroups(
  players: TournamentPlayer[],
  zoneMap: Record<string, string>,
  skillMap: Record<string, number>,
): ZoneTierGroup[] {
  if (players.length === 0) return [];

  const zoneOf = (p: TournamentPlayer) => (zoneMap[p.user_id] || '').trim();
  const skillOf = (p: TournamentPlayer) => skillMap[p.user_id] ?? p.skillLevel ?? 0;
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
  labelCustom?: boolean;
  groupPlayers: TournamentPlayer[];
  pairings: [number, number][];
  advancementCount: number;
  started: boolean;
}): Array<{ docId: string; fields: Record<string, unknown> }> {
  const { eventId, drawKey, draw, groupIndex, groupLabel, labelCustom, groupPlayers, pairings, advancementCount, started } = params;

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
        ...(labelCustom ? { rr_label_custom: true } : {}),
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

// Smallest knockout bracket size (power of two, min 2, cap 32) that seats `x` players.
const nextPow2 = (x: number) => { let s = 2; while (s < x) s *= 2; return Math.min(s, 32); };

/**
 * Select the players who advance to the knockout stage, ordered for seeding.
 *
 * - 1 group → top 2 (a single-group knockout is a final between the top two).
 * - ≥2 groups → EVERY group winner advances, then the best second-place players (by points →
 *   gamesWon across all groups) fill up to the next bracket size (min 4, else next power of
 *   two ≥ number of groups). e.g. 5 groups → 5 winners + 3 best runners-up → 8-player draw.
 *   The caller (`buildRRKnockoutDocs`) sizes the bracket to the next power of two; a full
 *   field needs no byes.
 */
export function selectAdvancingPlayers(
  allGroups: TournamentPlayer[][],
  standingsByGroup: RRStandingRow[][],
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

  const winners: Array<{ row: RRStandingRow; gi: number }> = [];
  const runnersUp: Array<{ row: RRStandingRow; gi: number }> = [];
  for (let g = 0; g < n; g++) {
    const rows = standingsByGroup[g] ?? [];
    if (rows[0]) winners.push({ row: rows[0], gi: g });
    if (rows[1]) runnersUp.push({ row: rows[1], gi: g });
  }

  const byStrength = (a: { row: RRStandingRow }, b: { row: RRStandingRow }) =>
    b.row.points - a.row.points || b.row.gamesWon - a.row.gamesWon;
  winners.sort(byStrength);
  runnersUp.sort(byStrength);

  const bracket = Math.max(4, nextPow2(n));
  const need = Math.max(0, bracket - winners.length);
  return [...winners, ...runnersUp.slice(0, need)]
    .map((c) => lookup(c.gi, c.row))
    .filter((p): p is TournamentPlayer => !!p);
}

/**
 * The #1 finisher of each group, ordered strongest-first (points → gamesWon) so the top seed
 * lands in slot 1. Used to auto-seed the knockout; the creator fills the remaining slots.
 */
export function selectGroupWinners(
  allGroups: TournamentPlayer[][],
  standingsByGroup: RRStandingRow[][],
): TournamentPlayer[] {
  const strength = new Map<string, RRStandingRow>();
  standingsByGroup.flat().forEach((r) => strength.set(r.userId, r));
  const winners: TournamentPlayer[] = [];
  for (let g = 0; g < allGroups.length; g++) {
    const top = standingsByGroup[g]?.[0];
    if (!top) continue;
    const p = allGroups[g]?.find((x) => x.user_id === top.userId);
    if (p) winners.push(p);
  }
  return winners.sort((a, b) => {
    const ra = strength.get(a.user_id);
    const rb = strength.get(b.user_id);
    return (rb?.points ?? 0) - (ra?.points ?? 0) || (rb?.gamesWon ?? 0) - (ra?.gamesWon ?? 0);
  });
}

/**
 * Build Firestore write objects for the RR knockout stage (SF + F or just F).
 * Reuses the existing fallbackTemplate infrastructure.
 *
 * `drawsize` forces a specific bracket size (R4/R8/R16); otherwise it's the next power of two.
 * `manualFill` leaves unseeded numeric slots as PLAYER_LOADING (for the creator to place) instead
 * of BYE, and skips first-round bye auto-advancement.
 */
export function buildRRKnockoutDocs(params: {
  eventId: string;
  drawKey: string;
  draw: DrawConfig;
  advancingPlayers: TournamentPlayer[];
  started: boolean;
  drawsize?: number;
  manualFill?: boolean;
}): Array<{ docId: string; fields: Record<string, unknown> }> {
  const { eventId, drawKey, draw, advancingPlayers, started, manualFill } = params;
  const n = advancingPlayers.length;
  // Round the bracket up to the next power of two (min 2, cap 32) unless an explicit size is given.
  const drawsize = params.drawsize ?? nextPow2(Math.max(2, n));
  const template = fallbackTemplate(drawsize);

  const slotMap = new Map<number, TournamentPlayer>();
  advancingPlayers.forEach((p, i) => slotMap.set(i + 1, p));

  // Pre-compute first-round BYE advancements: when a first-round match has one seeded
  // player and an empty numeric partner, the real player advances straight into the next
  // round. Bake those seatings into the next-round docs so byes resolve at generation.
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
  return { advancementCount: (adv as 1 | 2) };
}
