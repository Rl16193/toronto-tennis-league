import { Timestamp } from 'firebase/firestore';
import { DrawConfig, RRStandingRow, TournamentMatch, TournamentPlayer } from './types';
import { BYE, PLAYER_LOADING, fallbackTemplate, matchNumber, matchUids } from './utils';
import { skillBand } from '../../utils/skillLevels';

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
const nextPow2 = (x: number) => { let s = 2; while (s < x) s *= 2; return Math.min(s, 32); };

/**
 * Each group's #1, strongest-first (points → gamesWon) so the top seed lands in slot 1.
 * Auto-seeds the knockout; the creator fills the rest.
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
    const p = allGroups[g]?.find((x) => x.uid === top.userId);
    if (p) winners.push(p);
  }
  return winners.sort((a, b) => {
    const ra = strength.get(a.uid);
    const rb = strength.get(b.uid);
    return (rb?.points ?? 0) - (ra?.points ?? 0) || (rb?.gamesWon ?? 0) - (ra?.gamesWon ?? 0);
  });
}

/**
 * Firestore write objects for the RR knockout (SF + F, or just F), reusing fallbackTemplate.
 * `drawsize` forces R4/R8/R16; otherwise the next power of two.
 * `manualFill` leaves unseeded numeric slots as PLAYER_LOADING instead of BYE and skips
 * first-round bye auto-advancement.
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
