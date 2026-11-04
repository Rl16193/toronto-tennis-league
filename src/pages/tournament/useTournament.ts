import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Timestamp, arrayUnion, collection, deleteField, doc, documentId, getDoc, getDocs, onSnapshot, query, setDoc, updateDoc, where, writeBatch,
} from 'firebase/firestore';
import { loadCourtList } from '../../features/tasks/courtList';
import { matchCourtName, type CsvCourt } from '../courtmap/courtMapUtils';
import { haversineKm } from '../../utils/zones';
import { chunk, db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { ContactData, EventParticipant, GroupChampion, MemberInfo, TennisEvent, UserData, UserStats } from '../../types';
import { DrawConfig, OpenDrawSlot, RRStandingRow, SkillGroup, SkillMergePair, TournamentFormat, TournamentMatch, TournamentPlayer } from './types';
import { useUnplacedParticipants } from './useUnplacedParticipants';
import {
  CONSOLIDATED_DOUBLES_DRAW, DEFAULT_ZONE, VISIBLE_DRAWS, autoLabel, buildMatchFields, buildMergedSkillDraw, buildPlayerList,
  buildRRGroupMatchFields, buildRRKnockoutDocs, planGroupEdit, planRemovePlayer, buildZoneAwareDrawConfigs, buildZoneTierGroups,
  computeGroupStandings, drawKey, drawOf, effectiveZone, fallbackTemplate, filterParticipantsForDraw, generateGroupPairings,
  getDrawKey, getDrawSize, groupIndexOf, groupSeeds, leadUid, nextPow2, normalizeTemplateMatches, placeSeededDraw,
  playerSeedCompare, resolveZoneConfig, sameDraw, selectGroupWinners, sharedBand, sharedZone, zoneBucketFor,
} from './drawGenerator';
import { BYE, PLAYER_LOADING, PLAYER_LOADING_SENTINEL, byMatchNumber, choiceOf, choiceOfMatch, deleteKey, formatPlayerName, groupBonusAwardId, isTournamentStarted } from './utils';
import { type RemovalReason, joinWrite, newRegistration, registrationId, withdrawal } from '../../features/events/registrations';
import { withdrawFromEvent } from '../../features/events/services/eventService';
import { skillBand } from '../../utils/skillLevels';
import { isCancelledEvent, isDoublesEvent, isEventManager, isTournamentEvent } from '../../utils/eventTypes';
import { guestUid, isGuest } from '../../utils/guest';
import { toMillis } from '../../utils/eventDates';
import { useEventResults } from '../../features/matches/results';
import {
  cancelDraw, recordScore, resetScore, setGroupBonus, setGroupChampion,
} from '../../features/matches/scoring';

// Stand-in for a contacts doc whose matching users doc is missing — a data anomaly rather than a
// normal state, but the merge below shouldn't drop the contact details over it.
const EMPTY_MEMBER: UserData = { name: '', created_at: null };

// Group labels are group identity (group_label), so a new or renamed one must not repeat another.
const uniqueLabel = (label: string, taken: Set<string>) => {
  let out = label;
  for (let n = 2; taken.has(out); n += 1) out = `${label} (${n})`;
  taken.add(out);
  return out;
};

// Hard ceiling on an RR group. Guards the manual paths — the only way anyone is seated now.
export const RR_GROUP_MAX = 5;
/**
 * Below this many players in a draw, RR_GROUP_MAX doesn't apply to an organizer's manual edits —
 * a small field is better as one group than as two thin ones. Auto-formation still splits.
 */
export const CAP_FREE_BELOW = 10;

export const useTournament = (eventIdOverride?: string, playerView = false) => {
  const { user, loading: authLoading } = useAuth();

  const [allTournamentEvents, setAllTournamentEvents] = useState<TennisEvent[]>([]);
  const [event, setEvent] = useState<TennisEvent | null>(null);
  const [participants, setParticipants] = useState<EventParticipant[]>([]);
  // Active registrations. Withdrawn rows stay as the record, so anything about a player's CURRENT
  // registration reads this, not participants.
  const activeParticipants = useMemo(() => participants.filter((p) => p.status === 'active'), [participants]);
  const [rawMatches, setMatches] = useState<TournamentMatch[]>([]);
  // A match doc carries only status + winner_uid; its score, walkover and points are the applied
  // submission, merged on here so every view reads `m.result`.
  const results = useEventResults(event?.id);
  const matches = useMemo(
    () => rawMatches.map((m) => ({ ...m, result: results.get(m.id) ?? null })),
    [rawMatches, results],
  );
  // Has each onSnapshot delivered once since `event` changed? Reset per event switch, so the UI
  // shows a loading state instead of flashing the previous event's data.
  const [participantsReady, setParticipantsReady] = useState(false);
  const [matchesReady, setMatchesReady] = useState(false);
  const eventDataReady = participantsReady && matchesReady;

  const [userMap, setUserMap] = useState<Record<string, MemberInfo>>({});
  const [statsMap, setStatsMap] = useState<Record<string, UserStats>>({});

  // The selected draw, as its drawKey. It carries over between tournaments; currentDraw resolves it.
  const [selectedDrawKey, setSelectedDrawKey] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Auto-dismiss message banner after 30 seconds
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 30_000);
    return () => clearTimeout(t);
  }, [message]);

  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [resettingDraw, setResettingDraw] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [previewSlotOverrides, setPreviewSlotOverrides] = useState<Record<string, Record<number, TournamentPlayer | null>>>({});
  // Which adjacent skill pair is merged, keyed per (division, zone) so Downtown Men's can merge
  // while North York Men's stays split. One nullable field, not two booleans — a non-adjacent
  // merge is then unrepresentable rather than something to validate.
  const [skillMerges, setSkillMerges] = useState<Record<string, SkillMergePair | null>>({});
  const skillMergeKey = (division: string, zone?: string) => `${division}|${zone ?? ''}`;
  const [consolidateDoubles, setConsolidateDoubles] = useState(false);
  const [previewDrawSize, setPreviewDrawSize] = useState<Record<string, number>>({});
  const [allUsers, setAllUsers] = useState<Record<string, MemberInfo>>({});
  const [courtsMap, setCourtsMap] = useState<Record<string, string[]>>({});
  const [courtlessIds, setCourtlessIds] = useState<string[]>([]);
  const [prefZoneMap, setZoneMap] = useState<Record<string, string>>({});
  const [availabilityMap, setAvailabilityMap] = useState<Record<string, string[]>>({});
  // Round Robin 3rd-level view: group stage vs knockout.
  const [rrView, setRRView] = useState<'groups' | 'knockout'>('groups');
  // Server-persisted RR draft for the current draw (edited groups + their labels) — lets the
  // creator arrange groups before generation without writing matches, surviving refresh.
  const [rrDraft, setRRDraft] = useState<{ groups: string[][]; labels: string[] } | null>(null);
  // Group Bonus switch state: award doc id → exists.
  const [bonusAwards, setBonusAwards] = useState<Record<string, boolean>>({});

  // Round Robin state
  const [showRRConfig, setShowRRConfig] = useState(false);
  const [generatingRR, setGeneratingRR] = useState(false);

  const activeEventIdRef = useRef<string | undefined>(undefined);

  /**
   * Every seating path is manual now, so this is the only thing bounding group size.
   *
   * The cap is lifted entirely for a SMALL draw — under `CAP_FREE_BELOW` players in this draw,
   * an organizer may put them all in one group, because splitting eight people into two groups of
   * four gives everyone three matches instead of seven. Auto-formation is unchanged and still
   * splits by `splitEvenly`; this only governs what an organizer may do by hand.
   *
   * It reads `currentDrawAllPlayers`, declared below — safe because this only ever runs from an
   * event handler, long after render.
   */
  const overGroupCap = (count: number) => {
    if (count <= RR_GROUP_MAX || currentDrawAllPlayers.length < CAP_FREE_BELOW) return false;
    setMessage({ type: 'error', text: `A group can hold at most ${RR_GROUP_MAX} players.` });
    return true;
  };

  // A manager who also plays may switch to Player View: every organizer control and draw gates on
  // isCreator, so turning it off shows exactly what a participant sees.
  const isManager = isEventManager(event, user?.uid);
  const isCreator = isManager && !(playerView && activeParticipants.some((p) => p.uid === user?.uid));
  const started = isTournamentStarted(event);

  // Zones are always on. `resolveZoneConfig` supplies the standard seven buckets for any event
  // that never configured them and carries this tournament's merges — so every read
  // below sees the same, already-filtered list.
  const zoneConfig = useMemo(() => resolveZoneConfig(event?.zone_draw_config), [event?.zone_draw_config]);
  const zoneLabelFor = useCallback(
    (zone?: string) => zoneConfig.buckets.find((b) => b.id === zone)?.label ?? 'Unassigned',
    [zoneConfig],
  );

  /**
   * The zone half of a skill-merge key, canonical across every reader and writer.
   *
   * `buildZoneAwareDrawConfigs` stamps each draw with a BUCKET id, so a merge must be keyed by
   * bucket too. Keying it off the raw `zone` meant a draw generated before zones existed (no
   * `zone` at all) produced `Women's|` while its draw asked for `Women's|downtown_midtown` — the
   * merge never applied, the draw stayed split into Challengers and Masters with no matches in
   * either, and the page silently fell back to showing PREVIEW groups over a live draw.
   */
  const mergeZoneKey = (zone?: string | null) => (zoneConfig.enabled ? effectiveZone(zone) : undefined);

  const effectiveDraws = useMemo<DrawConfig[]>(() => {
    // A tournament is singles OR doubles.
    const eventChoice = event ? (isDoublesEvent(event) ? 'Doubles' : 'Singles') : undefined;
    let draws = VISIBLE_DRAWS.filter((d) => {
      if (consolidateDoubles && d.tab === 'doubles') return false;
      if (eventChoice && d.tournamentChoice !== eventChoice) return false;
      return true;
    });
    if (consolidateDoubles) draws = [...draws, CONSOLIDATED_DOUBLES_DRAW];

    // Gender → zone → skill, so the zone split happens BEFORE merging.
    // Don't re-add pre-zone draws alongside the zoned ones: it put running groups outside the
    // zone list and matched every participant to two draws, doubling the "N signed up" count.
    // `effectiveZone` maps a missing zone onto the default instead.
    draws = buildZoneAwareDrawConfigs(draws, zoneConfig);

    // Apply each (division, zone) merge: drop the individual band draws it swallows, add one
    // merged draw in their place.
    const out: DrawConfig[] = [];
    const addedMerge = new Set<string>();
    for (const d of draws) {
      const key = skillMergeKey(d.division, d.zone);
      const pair = d.tournamentChoice === 'Singles' && (d.tab === 'mens' || d.tab === 'womens')
        ? skillMerges[key]
        : null;
      if (!pair || !(pair.split('+') as SkillGroup[]).includes(d.skillGroup)) { out.push(d); continue; }
      if (addedMerge.has(key)) continue; // merged draw for this zone already emitted
      addedMerge.add(key);
      const built = buildMergedSkillDraw(d.tab as 'mens' | 'womens', d.division as "Men's" | "Women's", pair);
      // A private tournament's all-band draw has no skill level: it is the "Men's Invitational".
      const merged = event?.private && pair === 'Beginners+Challengers+Masters'
        ? { ...built, label: `${d.division} Invitational` }
        : built;
      // " — " is load-bearing, not decoration: buildZoneAwareDrawConfigs uses it, and DrawTabs
      // recovers the zone name by splitting the label on it. With any other separator the tree
      // falls back to the raw bucket id ("downtown_midtown") and the leaf keeps the zone suffix.
      out.push(d.zone ? { ...merged, zone: d.zone, label: `${merged.label} — ${zoneLabelFor(d.zone)}` } : merged);
    }

    const tabOrder = { mens: 0, womens: 1, doubles: 2 };
    return out.sort((a, b) => tabOrder[a.tab] - tabOrder[b.tab]);
  }, [skillMerges, consolidateDoubles, event?.category, event?.private, zoneConfig, zoneLabelFor]);

  // ── Data loading ──────────────────────────────────────────────────────────

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const eventsSnap = await getDocs(collection(db, 'events'));
        const tournamentEvents = eventsSnap.docs
          .map((d) => ({ id: d.id, ...d.data() } as TennisEvent))
          // League Ladder events have no draw — ladder matches are a match type surfaced in
          // Matches/Challenges instead, so they don't belong on the Tournament page at all.
          .filter((e) => isTournamentEvent(e) && !isCancelledEvent(e))
          .sort((a, b) => toMillis(b.start_date) - toMillis(a.start_date));
        setAllTournamentEvents(tournamentEvents);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  useEffect(() => {
    if (allTournamentEvents.length === 0) return;
    const target = eventIdOverride
      ? (allTournamentEvents.find((e) => e.id === eventIdOverride) ?? allTournamentEvents[0])
      : allTournamentEvents[0];
    if (!target || target.id === activeEventIdRef.current) return;
    activeEventIdRef.current = target.id;
    setEvent(target);
    setParticipants([]);
    setMatches([]);
    setParticipantsReady(false);
    setMatchesReady(false);
    setEditMode(false);
    setPreviewSlotOverrides({});
    setPreviewDrawSize({});
    setShowRRConfig(false);
    setSkillMerges({});
    setConsolidateDoubles(false);
  }, [eventIdOverride, allTournamentEvents]);

  useEffect(() => {
    if (!event) return;
    return onSnapshot(
      query(collection(db, 'event_participants'), where('event_id', '==', event.id)),
      (snap) => {
        setParticipants(snap.docs.map((d) => ({ id: d.id, ...d.data() } as EventParticipant)));
        setParticipantsReady(true);
      },
    );
  }, [event]);

  useEffect(() => {
    if (!event) return;
    return onSnapshot(
      query(collection(db, 'matches'), where('event_id', '==', event.id), where('category', '==', 'tournament')),
      (snap) => {
        const loaded = snap.docs.map((d) => ({ id: d.id, ...d.data() } as TournamentMatch));
        setMatches(loaded);
        setMatchesReady(true);
      },
    );
  }, [event]);

  // Auto-enable merge toggles from existing draw data. The merged pair is the organizer's, saved on
  // the event at Generate (`events.skill_merges[drawKey]`). It is never guessed from players' bands:
  // one misplaced player flipped the guess and hid a real draw.
  useEffect(() => {
    // Merged matches are now inferred per (division, zone) — a merged draw exists in one zone
    // without implying anything about the same division in another.
    const merged = matches.filter((m) =>
      m.sub_category === 'singles' && m.skill_group === 'All' &&
      (m.division === "Men's" || m.division === "Women's"));
    if (merged.length > 0) {
      const next: Record<string, SkillMergePair> = {};
      for (const key of new Set(merged.map((m) => skillMergeKey(m.division, mergeZoneKey(m.zone))))) {
        const group = merged.filter((m) => skillMergeKey(m.division, mergeZoneKey(m.zone)) === key);
        const saved = event?.skill_merges?.[getDrawKey('Singles', group[0].division, 'All', group[0].zone || undefined)];
        if (saved) next[key] = saved;
      }
      setSkillMerges((prev) => ({ ...prev, ...next }));
    }
    if (matches.some((m) => m.sub_category === 'doubles' && m.division === 'All'))
      setConsolidateDoubles(true);
  }, [matches, event?.skill_merges]);


  // Doubles: registrant uid → partner uid, from the active registrations (the same map the server
  // uses to let a partner score and to credit them).
  const partnerByUid = useMemo(() => new Map(activeParticipants
    .filter((p) => p.category === 'doubles_tournament' && p.uid && p.partner_uid)
    .map((p) => [p.uid, p.partner_uid as string])), [activeParticipants]);

  // A match's participant_uids after a slot change: both slots plus their doubles partners.
  const slotPatch = (m: TournamentMatch, slot: 'player_1' | 'player_2', uid: string, name: string) => {
    const other = slot === 'player_1' ? m.player_2_uid : m.player_1_uid;
    const uids = [uid, other].filter(Boolean);
    return {
      [`${slot}_uid`]: uid,
      [`${slot}_name`]: name,
      participant_uids: [...new Set([...uids, ...uids.map((u) => partnerByUid.get(u) ?? '')].filter(Boolean))],
      updated_at: Timestamp.now(),
    };
  };

  // Match ids the current user may submit a score for: a slot player, or (doubles) the
  // registered partner of a slot player. Empty for the creator (they use Enter score).
  const submittableMatchIds = useMemo(() => {
    if (!user || isCreator) return new Set<string>();
    const teammateByUid = partnerByUid;
    const ids = new Set<string>();
    for (const m of matches) {
      const slotUids = [m.player_1_uid, m.player_2_uid].filter(Boolean);
      const authorized = slotUids.some((su) => su === user.uid || teammateByUid.get(su) === user.uid);
      if (authorized) ids.add(m.id);
    }
    return ids;
  }, [user, isCreator, partnerByUid, matches]);

  // Reload all registered users every time the creator enters edit mode. Names come from `users`,
  // contact details from `contacts` — merged into one MemberInfo map so consumers see one object.
  useEffect(() => {
    if (!editMode || !isCreator) return;
    Promise.all([
      getDocs(collection(db, 'users')),
      getDocs(collection(db, 'contacts')).catch(() => null),
    ]).then(([usersSnap, contactsSnap]) => {
      const map: Record<string, MemberInfo> = {};
      usersSnap.docs.forEach((d) => { map[d.id] = d.data() as UserData; });
      contactsSnap?.docs.forEach((d) => {
        map[d.id] = { ...(map[d.id] ?? EMPTY_MEMBER), ...(d.data() as ContactData) };
      });
      setAllUsers(map);
    });
  }, [editMode, isCreator]);

  // Fetch users + stats in one effect. Batched 10 ids at a time via documentId() 'in' — the same
  // pattern the preferences effect below uses. This previously issued ONE query per participant
  // per collection, so a 64-player event opened 128 round-trips instead of 14.
  useEffect(() => {
    if (!user) return;
    const allIds = [...new Set(participants.map((p) => p.uid).filter(Boolean))];
    // A guest has no users/contacts doc; one in a batch would deny the whole contacts query.
    const missingUsers = allIds.filter((id) => !userMap[id] && !isGuest(id));
    const missingStats = allIds.filter((id) => !statsMap[id]);
    if (missingUsers.length === 0 && missingStats.length === 0) return;

    const fetchByIds = <T,>(col: string, ids: string[]): Promise<Record<string, T>> => {
      return Promise.all(
        chunk(ids, 10).map((c) => getDocs(query(collection(db, col), where(documentId(), 'in', c)))),
      ).then((snaps) => {
        const out: Record<string, T> = {};
        snaps.forEach((snap) => snap.forEach((d) => { out[d.id] = d.data() as T; }));
        return out;
      });
    };

    Promise.all([
      missingUsers.length ? fetchByIds<UserData>('users', missingUsers) : Promise.resolve({}),
      missingStats.length ? fetchByIds<UserStats>('stats', missingStats) : Promise.resolve({}),
      // Contacts are a separate, sign-in-gated collection. Tolerate a failure (or a member with
      // no contacts doc yet) — the draw still renders, just without a Contact button.
      missingUsers.length
        ? fetchByIds<ContactData>('contacts', missingUsers).catch(() => ({} as Record<string, ContactData>))
        : Promise.resolve({} as Record<string, ContactData>),
    ]).then(([userEntries, statsEntries, contactEntries]) => {
      const merged: Record<string, MemberInfo> = { ...userEntries };
      Object.entries(contactEntries).forEach(([id, c]) => {
        merged[id] = { ...(merged[id] ?? EMPTY_MEMBER), ...c };
      });
      if (Object.keys(merged).length) setUserMap((prev) => ({ ...prev, ...merged }));
      if (Object.keys(statsEntries).length) setStatsMap((prev) => ({ ...prev, ...statsEntries }));
    });
  }, [participants, user, userMap, statsMap]);

  // Fetch preferred_courts for all participants (used for RR court-aware preview grouping)
  useEffect(() => {
    if (!user) return;
    const allIds = [...new Set(participants.map((p) => p.uid).filter(Boolean))];
    const missingIds = allIds.filter((id) => !(id in courtsMap));
    if (missingIds.length === 0) return;

    Promise.all(
      chunk(missingIds, 10).map((c) =>
        getDocs(query(collection(db, 'preferences'), where(documentId(), 'in', c))),
      ),
    ).then((snaps) => {
      // Seed every requested id (default empty) so participants without a preferences
      // doc are still recorded as "checked" and never re-queried on the next snapshot.
      const courtEntries: Record<string, string[]> = {};
      const zoneEntries: Record<string, string> = {};
      const availabilityEntries: Record<string, string[]> = {};
      for (const id of missingIds) { courtEntries[id] = []; zoneEntries[id] = ''; availabilityEntries[id] = []; }
      const withCourts = new Set<string>();
      snaps.forEach((snap) => snap.forEach((d) => {
        if (d.data().preferred_courts?.length || d.data().custom_courts?.length) withCourts.add(d.id);
        courtEntries[d.id] = (d.data().preferred_courts ?? []) as string[];
        zoneEntries[d.id] = (d.data().preferred_zone ?? '') as string;
        availabilityEntries[d.id] = (d.data().availability_tags ?? []) as string[];
      }));
      setCourtsMap((prev) => ({ ...prev, ...courtEntries }));
      setCourtlessIds((prev) => [...prev, ...missingIds.filter((id) => !withCourts.has(id))]);
      setZoneMap((prev) => ({ ...prev, ...zoneEntries }));
      setAvailabilityMap((prev) => ({ ...prev, ...availabilityEntries }));
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [participants, user]);

  // A player with no zone who already holds a seat keeps the zone of that seat, so dropping the
  // Downtown default never moves anyone out of a draw they are in. Only unseated players route to
  // Unassigned. Zone-less (pre-zone) matches still read as Downtown via effectiveZone.
  const zoneMap = useMemo(() => {
    const out = { ...prefZoneMap };
    for (const m of matches) {
      if (m.sub_category !== 'singles') continue;
      const label = zoneConfig.buckets.find((b) => b.id === effectiveZone(m.zone))?.zones[0];
      if (!label) continue;
      for (const uid of [m.player_1_uid, m.player_2_uid]) {
        if (uid && uid in out && !out[uid]) out[uid] = label;
      }
    }
    // No courts at all (an organizer added them): Downtown-Midtown. Courts outside Toronto: Unassigned.
    for (const uid of courtlessIds) if (uid in out && !out[uid]) out[uid] = DEFAULT_ZONE;
    return out;
  }, [prefZoneMap, matches, zoneConfig, courtlessIds]);

  // Each player's preferred courts on the map, for first-round pairing by nearest court.
  const [courtList, setCourtList] = useState<CsvCourt[]>([]);
  useEffect(() => { loadCourtList().then(setCourtList).catch(() => {}); }, []);
  const courtPoints = useMemo(() => {
    const byDropdown = new Map<string, CsvCourt>();
    const byName = new Map<string, CsvCourt>();
    for (const c of courtList) {
      byDropdown.set(c.dropdown.toLowerCase(), c);
      byName.set(c.name.toLowerCase(), c);
    }
    const out: Record<string, CsvCourt[]> = {};
    for (const [uid, names] of Object.entries(courtsMap)) {
      out[uid] = names.map((n) => matchCourtName(n, byDropdown, byName)).filter((c): c is CsvCourt => !!c);
    }
    return out;
  }, [courtList, courtsMap]);

  // Lines for a knockout draw. Keyed on event, draw and entrants, so the preview and Generate
  // place everyone identically. A doubles team pairs by its higher-ranked partner's zone and courts.
  const placeDraw = useCallback((draw: DrawConfig, players: TournamentPlayer[], drawsize: number) => {
    const lead = (p: TournamentPlayer) => leadUid(p.uid, p.partnerUid, statsMap);
    const drawKey = getDrawKey(draw.tournamentChoice, draw.division, draw.skillGroup, draw.zone);
    return placeSeededDraw({
      players,
      drawsize,
      rngKey: `${event?.id ?? ''}|${drawKey}|${players.slice(0, drawsize).map((p) => p.uid).sort().join(',')}`,
      zoneOf: (p) => (zoneMap[lead(p)] || '').trim(),
      distanceKm: (a, b) => {
        let best: number | null = null;
        for (const ca of courtPoints[lead(a)] ?? []) {
          for (const cb of courtPoints[lead(b)] ?? []) {
            const d = haversineKm(ca.lat, ca.lng, cb.lat, cb.lng);
            if (best === null || d < best) best = d;
          }
        }
        return best;
      },
    });
  }, [event?.id, statsMap, zoneMap, courtPoints]);

  // Per-draw maps on the event, keyed by drawKey: `seeds` (uid → seed) and `skill_merges` (which
  // bands a merged draw holds). The Firestore update for them, and the same change applied locally
  // once the write has committed. null clears a key.
  type DrawPatch = {
    seeds?: Record<string, Record<string, number> | null>;
    skill_merges?: Record<string, SkillMergePair | null>;
    champions?: Record<string, GroupChampion | null>;
  };
  const drawFields = (patch: DrawPatch) => Object.fromEntries(Object.entries(patch).flatMap(([field, keys]) =>
    Object.entries(keys ?? {}).map(([key, value]) => [`${field}.${key}`, value ?? deleteField()])));
  const applyDrawLocally = (eventId: string, patch: DrawPatch) => {
    const apply = (e: TennisEvent): TennisEvent => {
      if (e.id !== eventId) return e;
      const next: Record<string, unknown> = { ...e };
      for (const [field, keys] of Object.entries(patch)) {
        const map: Record<string, unknown> = { ...((e as unknown as Record<string, Record<string, unknown>>)[field] ?? {}) };
        for (const [key, value] of Object.entries(keys ?? {})) {
          if (value) map[key] = value; else delete map[key];
        }
        next[field] = map;
      }
      return next as unknown as TennisEvent;
    };
    setEvent((prev) => (prev ? apply(prev) : prev));
    setAllTournamentEvents((prev) => prev.map(apply));
  };
  // Cancel Matches: the draw and its RR knockout lose their seeds, and the draw its saved merge.
  // A failure only leaves stale entries that the next Generate overwrites, so it doesn't fail the cancel.
  const clearDrawRecord = async (drawKey: string) => {
    if (!event) return;
    const patch: DrawPatch = {
      seeds: { [drawKey]: null, [`${drawKey}__knockout`]: null },
      skill_merges: { [drawKey]: null },
      champions: { [drawKey]: null },
    };
    try {
      await updateDoc(doc(db, 'events', event.id), drawFields(patch));
      applyDrawLocally(event.id, patch);
    } catch (err) {
      console.error('Clearing the draw record failed:', err);
    }
  };

  // ── Derived data ──────────────────────────────────────────────────────────

  const userParticipant = useMemo(
    () => activeParticipants.find((p) => p.uid === user?.uid) ?? null,
    [activeParticipants, user],
  );

  const userDraw = useMemo<DrawConfig | undefined>(() => {
    if (!userParticipant) return undefined;

    // Resolve from the participant's ACTUAL placement, so a creator moving someone across skill
    // groups doesn't hide the draw they're really in.
    // Deliberately NO skill-derived fallback: pre-generation there's no placement, so this is
    // undefined and visibleDraws shows every draw. Don't "restore" a fallback here.
    const placement = matches.find(
      (m) => m.player_1_uid === userParticipant.uid || m.player_2_uid === userParticipant.uid,
    );
    if (placement) {
      // Match against every POSSIBLE merged draw, not just the currently-selected merge state —
      // a placement can predate a page reload (before merge auto-detection re-derives the pair).
      const allPossibleMerges: SkillMergePair[] = ['Beginners+Challengers', 'Challengers+Masters', 'Beginners+Challengers+Masters'];
      const baseDraws = [
        ...VISIBLE_DRAWS,
        ...allPossibleMerges.map((pair) => buildMergedSkillDraw('mens', "Men's", pair)),
        ...allPossibleMerges.map((pair) => buildMergedSkillDraw('womens', "Women's", pair)),
        CONSOLIDATED_DOUBLES_DRAW,
      ];
      const all = buildZoneAwareDrawConfigs(baseDraws, zoneConfig);
      const found = all.find(
        (d) => d.tournamentChoice === choiceOfMatch(placement) &&
          d.division === placement.division &&
          d.skillGroup === placement.skill_group &&
          // Effective, not raw: a placement generated before zones has no `zone`, and would
          // otherwise match no draw at all — leaving the participant with no draw to open.
          effectiveZone(d.zone) === effectiveZone(placement.zone),
      );
      if (found) return found;
    }

    return undefined;
  }, [userParticipant, matches, zoneConfig]);

  // Creators see every draw. A participant sees both skill draws in their own division, across
  // every zone (zone is travel practicality, not fairness); doubles see only their own division.
  // Non-creators can't edit — controls gate on isCreator.
  const visibleDraws = useMemo(() => {
    // Zones cross-product skill draws (4 zones × 3 skills = 12 tabs, mostly empty), so hide a
    // zone draw until someone is in it. One that already has matches always stays visible. Keyed
    // on the EFFECTIVE zone so a pre-zone match keeps the default zone's draw visible.
    const zonesWithMatches = new Set(matches.map((m) => drawKey(drawOf(m))));
    const populated = effectiveDraws.filter((d) => {
      // Doubles carries no zone dimension at all — it never gets a zone draw, so it always shows.
      if (d.tournamentChoice === 'Doubles') return true;
      if (zonesWithMatches.has(drawKey(d))) return true;
      return filterParticipantsForDraw(participants, d, statsMap, zoneMap, zoneConfig).length > 0;
    });
    if (isCreator || !userDraw) return populated;
    return populated.filter(
      (d) => d.tab === userDraw.tab && (userDraw.tab !== 'doubles' || d.division === userDraw.division),
    );
  }, [isCreator, userDraw, effectiveDraws, matches, participants, statsMap, zoneMap, zoneConfig]);

  /**
   * Land the viewer on their own draw — once per actual destination, NOT on every recomputation.
   *
   * `userDraw` is memoized on `matches`, so any write anywhere in the event (a score, a seating,
   * a group edit) handed this effect a new object and re-ran it. For an organizer who is also a
   * player, that meant every edit to another draw threw them back to their own mid-edit. Keying
   * on the destination's VALUE fixes that; the event id is in the key so switching tournaments
   * still re-lands them.
   */
  const appliedUserDrawRef = useRef<string | null>(null);
  useEffect(() => {
    if (!userDraw) return;
    // Pre-generation (no placement match yet), userDraw has no zone — fall back to the
    // participant's own zone bucket so they land in their own draw, not an arbitrary first one.
    // zoneMap is filled by an async preferences fetch that usually resolves AFTER userDraw first
    // computes — without it in the deps the fallback was evaluated against {} and never revisited,
    // parking the participant on the wrong zone draw for the session.
    const fallbackZone = zoneBucketFor(zoneMap[userParticipant?.uid ?? ''], zoneConfig);
    const zone = userDraw.zone ?? fallbackZone;
    const target = `${event?.id ?? ''}|${userDraw.tab}|${userDraw.division}|${userDraw.skillGroup}|${zone ?? ''}`;
    if (appliedUserDrawRef.current === target) return;
    appliedUserDrawRef.current = target;

    setSelectedDrawKey(drawKey({ ...userDraw, zone }));
  }, [userDraw, zoneMap, userParticipant, zoneConfig, event?.id]);

  // Signed-up count and capacity for EVERY visible draw, so the division tree can show a fill
  // rate ("14/16") per row without opening it. Same filter the current draw uses, just applied
  // across all of them — O(draws × participants), trivial at these sizes.
  const drawCounts = useMemo(() => {
    const out: Record<string, { count: number; size: number }> = {};
    visibleDraws.forEach((d) => {
      const count = filterParticipantsForDraw(
        participants, d, statsMap, zoneMap, zoneConfig,
      ).length;
      out[d.label] = {
        count,
        size: previewDrawSize[d.label] ?? getDrawSize(count, d.tournamentChoice),
      };
    });
    return out;
  }, [visibleDraws, participants, statsMap, zoneMap, zoneConfig, previewDrawSize]);

  // Draws worth a stop on the wheel: someone registered, or matches already generated.
  const liveDraws = useMemo(() => {
    const withMatches = new Set(matches.filter((m) => m.status !== 'cancelled').map((m) => drawKey(drawOf(m))));
    return visibleDraws.filter((d) => (drawCounts[d.label]?.count ?? 0) > 0 || withMatches.has(drawKey(d)));
  }, [visibleDraws, drawCounts, matches]);

  // The selected draw when it is live, else the first live draw (an empty draw such as Men's
  // Beginners in a zone nobody plays in is never shown); with nothing live yet, any draw.
  const currentDraw = useMemo<DrawConfig | undefined>(() => {
    const pool = liveDraws.length > 0 ? liveDraws : effectiveDraws;
    return pool.find((d) => drawKey(d) === selectedDrawKey) ?? pool[0];
  }, [liveDraws, effectiveDraws, selectedDrawKey]);

  // Draw key for currentDraw — recomputed only when currentDraw actually changes, instead of at
  // every one of its many call sites below.
  const currentDrawKey = useMemo(
    () => currentDraw ? drawKey(currentDraw) : '',
    [currentDraw],
  );

  // Every destructive path below iterates `currentMatches`, so it must hold this draw's matches only
  // (sameDraw compares zone; see CLAUDE.md "currentMatches MUST filter on zone").
  const currentMatches = useMemo(() => {
    if (!currentDraw) return [];
    return matches
      .filter((m) =>
        // A cancelled match is out of the draw: it keeps its document (and its results, if it had
        // any) but must not render, be scoreable, or be counted. Cancelling is how a draw is
        // reshaped without losing the record, so nothing downstream may see these.
        m.status !== 'cancelled' && sameDraw(drawOf(m), currentDraw),
      )
      .sort(byMatchNumber);
  }, [currentDraw, matches]);

  // Full sorted player list for the current draw — shared by displayMatches and editPlayers.
  const currentDrawAllPlayers = useMemo(() => {
    if (!currentDraw) return [];
    return buildPlayerList(
      filterParticipantsForDraw(participants, currentDraw, statsMap, zoneMap, zoneConfig),
      statsMap,
      userMap,
    );
  }, [currentDraw, participants, statsMap, userMap, zoneMap, zoneConfig]);

  // The knockout preview's placement; Generate recomputes the same one (placeDraw is keyed).
  const previewPlacement = useMemo(() => {
    if (!currentDraw || currentMatches.length > 0) return null;
    const drawsize = previewDrawSize[currentDraw.label] ?? getDrawSize(currentDrawAllPlayers.length, currentDraw.tournamentChoice);
    return { drawsize, ...placeDraw(currentDraw, currentDrawAllPlayers, drawsize) };
  }, [currentDraw, currentMatches.length, currentDrawAllPlayers, previewDrawSize, placeDraw]);

  const displayMatches = useMemo(() => {
    if (!currentDraw) return [];
    if (currentMatches.length > 0 || !previewPlacement) return currentMatches;

    const { drawsize } = previewPlacement;
    const templateMatches = normalizeTemplateMatches(fallbackTemplate(drawsize));
    const slotMap = new Map(previewPlacement.slotMap);

    const drawOverrides = previewSlotOverrides[currentDraw.label] ?? {};
    Object.entries(drawOverrides).forEach(([slotStr, player]) => {
      const slotNum = Number(slotStr);
      if (player === null) slotMap.delete(slotNum);
      else slotMap.set(slotNum, player);
    });

    const cfg = {
      eventId: event?.id || 'preview',
      tournamentChoice: currentDraw.tournamentChoice,
      division: currentDraw.division,
      skillGroup: currentDraw.skillGroup,
      drawsize,
      allMatches: templateMatches,
      started,
    };
    return templateMatches.map<TournamentMatch>((tm) => ({
      id: `preview_${currentDraw.label}_${tm.match_id}`,
      ...buildMatchFields(tm, slotMap, cfg),
    }));
  }, [currentDraw, previewPlacement, currentMatches, event?.id, previewSlotOverrides, started]);


  // Excludes RR group-stage docs (round === 'RR'); without it the Knockout tab could resolve to
  // the player's completed group-stage match instead of nothing.
  const visibleUserMatch = useMemo(() => {
    if (!user) return null;
    const pool = displayMatches.filter(
      (m) => m.round !== 'RR' && m.player_1_name !== BYE && m.player_2_name !== BYE,
    );
    return pool.find((m) =>
      [m.player_1_uid, m.player_2_uid].includes(user.uid),
    ) ?? null;
  }, [displayMatches, user]);


  // For the edit dropdown, include ALL participants for this division/choice regardless of skill group
  // so that players moved between skill brackets remain accessible.
  const editPlayers = useMemo(() => {
    if (!editMode || !currentDraw) return [];
    const divisionParticipants = activeParticipants.filter((p) => {
      if (choiceOf(p) !== currentDraw.tournamentChoice) return false;
      if (currentDraw.division !== 'All' && p.division !== currentDraw.division) return false;
      return true;
    });
    return buildPlayerList(divisionParticipants, statsMap, userMap);
  }, [editMode, currentDraw, activeParticipants, statsMap, userMap]);

  const currentDrawSize = displayMatches[0]?.drawsize ?? 16;

  const availableUsers = useMemo(() => {
    const joinedIds = new Set(activeParticipants.map((p) => p.uid));
    return Object.entries(allUsers)
      .filter(([id]) => !joinedIds.has(id))
      .map(([id, data]) => ({ id, name: data.name || data.email || id, email: data.email || '' }))
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [allUsers, activeParticipants]);

  const opponent = visibleUserMatch && user
    ? (() => {
        const isP1 = visibleUserMatch.player_1_uid === user.uid;
        const opponentUid = isP1 ? visibleUserMatch.player_2_uid : visibleUserMatch.player_1_uid;
        const opponentUser = userMap[opponentUid] ?? allUsers[opponentUid];
        const opponentStats = statsMap[opponentUid];
        const snapshotName = isP1 ? visibleUserMatch.player_2_name : visibleUserMatch.player_1_name;
        // Prefer the live user-doc name (fall back to the match snapshot) so a re-seated or
        // renamed opponent shows current info. Singles only — doubles names embed the partner.
        const isDoubles = visibleUserMatch.sub_category === 'doubles';
        return {
          name: !isDoubles && opponentUser?.name ? formatPlayerName(opponentUser.name) : snapshotName,
          userId: opponentUid,
          contact: '',
          email: opponentUser?.email ?? '',
          phone: opponentUser?.phone ?? '',
          whatsappContact: opponentUser?.whatsapp_contact ?? '',
          preferredContactMethods: opponentUser?.preferred_mode_of_contact,
          round: visibleUserMatch.round,
          skill: opponentStats?.skill_level ?? null,
          wins: opponentStats?.wins ?? 0,
          losses: (opponentStats?.matchesPlayed ?? 0) - (opponentStats?.wins ?? 0),
        };
      })()
    : null;

  // ── Round Robin derived data ──────────────────────────────────────────────

  const drawFormat = useMemo<TournamentFormat>(
    () => (event?.sub_category === 'rr' ? 'rr' : 'knockout'),
    [event],
  );

  const currentDrawFormat = useMemo<TournamentFormat>(
    () => (currentMatches.some((m) => m.format === 'rr') ? 'rr' : drawFormat),
    [currentMatches, drawFormat],
  );

  // Live-subscribe to the current draw's RR draft doc (edited pre-generation groups + labels).
  useEffect(() => {
    if (!event || currentDrawFormat !== 'rr' || !currentDraw) { setRRDraft(null); return; }
    const drawKey = currentDrawKey;
    const unsub = onSnapshot(
      doc(db, 'events', event.id, 'rr_drafts', drawKey),
      (snap) => {
        if (!snap.exists()) { setRRDraft(null); return; }
        const d = snap.data();
        setRRDraft({
          groups: Array.isArray(d.groups)
            ? d.groups.map((g: unknown) => typeof g === 'string' ? g.split(',').filter(Boolean) : Array.isArray(g) ? g : [])
            : [],
          labels: Array.isArray(d.labels) ? d.labels : [],
        });
      },
      () => setRRDraft(null),
    );
    return () => unsub();
    // Depend on currentDrawKey itself, not its parts: the key includes zone, so listing only
    // choice/division/skillGroup meant switching zones kept the previous zone's draft loaded.
  }, [event?.id, currentDrawFormat, currentDrawKey]);

  // Shared band/zone auto-label computation — used by both the pre-generation preview labels
  // (previewRRLabels) and the post-generation group labels (buildRRLabelsFrom).
  const autoLabelFor = useCallback((idx: number, players: TournamentPlayer[]): string => {
    const zoneOf = (p: TournamentPlayer) => (zoneMap[p.uid] || '').trim();
    const skillOf = (p: TournamentPlayer) => statsMap[p.uid]?.skill_level ?? p.skillLevel ?? 0;
    const bandOf = (p: TournamentPlayer) => skillBand(skillOf(p));
    return autoLabel(idx, sharedBand(players, bandOf), sharedZone(players, zoneOf));
  }, [zoneMap, statsMap]);

  // Preview groups shown before any RR matches are generated. When the creator has saved a draft
  // arrangement, that (server-persisted) grouping is used; otherwise the SAME skill-first grouping
  // as generation (buildZoneTierGroups). Withdrawn registrations are excluded either way
  // (currentDrawAllPlayers holds active registrations only).
  const previewRRGroups = useMemo<TournamentPlayer[][]>(() => {
    if (currentDrawFormat !== 'rr' || currentMatches.length > 0) return [];
    const available = currentDrawAllPlayers;
    if (rrDraft && rrDraft.groups.length > 0) {
      const byId = new Map(available.map((p) => [p.uid, p]));
      return rrDraft.groups.map((uids) =>
        uids.map((uid) => byId.get(uid)).filter((p): p is TournamentPlayer => !!p),
      );
    }
    const skillMap: Record<string, number> = {};
    for (const p of available) {
      skillMap[p.uid] = statsMap[p.uid]?.skill_level ?? p.skillLevel ?? 0;
    }
    return buildZoneTierGroups(available, zoneMap, skillMap).map((g) => g.players);
  }, [currentDrawFormat, currentMatches, currentDrawAllPlayers, statsMap, zoneMap, rrDraft]);

  // Labels for the preview/draft groups: a stored draft label verbatim, else auto band/zone.
  const previewRRLabels = useMemo<string[]>(() =>
    previewRRGroups.map((players, i) => rrDraft?.labels[i] || autoLabelFor(i, players)),
    [previewRRGroups, rrDraft, autoLabelFor]);

  // uid → seed for the names in the current draw (knockout lines, or per RR group). The preview's
  // until the draw is generated, then the numbers frozen on the event.
  const drawSeeds = useMemo<Record<string, number>>(() => {
    if (currentMatches.length > 0) return event?.seeds?.[currentDrawKey] ?? {};
    if (currentDrawFormat === 'rr') return groupSeeds(previewRRGroups, statsMap);
    return previewPlacement?.seeds ?? {};
  }, [currentMatches.length, event?.seeds, currentDrawKey, currentDrawFormat, previewRRGroups, statsMap, previewPlacement]);
  const rrKnockoutSeeds = useMemo<Record<string, number>>(
    () => event?.seeds?.[`${currentDrawKey}__knockout`] ?? {},
    [event?.seeds, currentDrawKey],
  );


  const rrGroupMatches = useMemo(
    () => currentMatches.filter((m) => m.format === 'rr' && m.round === 'RR'),
    [currentMatches],
  );

  const rrKnockoutMatches = useMemo(
    () => currentMatches.filter((m) => m.format === 'rr' && m.round !== 'RR'),
    [currentMatches],
  );

  // The current draw's groups, in card order. A group IS its group_label (every match of a group
  // carries it). Ordered by the group number in the doc ids (`rr_g{N}_…`): positions restart at 1
  // in every group, so the lowest position can't order them.
  const rrGroupKeys = useMemo<string[]>(() => {
    const order = new Map<string, number>();
    rrGroupMatches.forEach((m) => {
      const n = groupIndexOf(m);
      if (!order.has(m.group_label) || n < (order.get(m.group_label) ?? 0)) order.set(m.group_label, n);
    });
    return [...order.entries()].sort((a, b) => a[1] - b[1]).map(([label]) => label);
  }, [rrGroupMatches]);

  // Reconstruct group player lists from a set of RR group matches (current or sibling draw).
  // Names resolve live from userMap (fallback to the match-doc snapshot); singles names are
  // overridden, doubles keep the embedded "A / B" value.
  const buildRRGroupsFrom = useCallback((groupMatches: TournamentMatch[], keys: string[]): TournamentPlayer[][] => {
    const isDoubles = groupMatches[0]?.sub_category === 'doubles';
    const liveName = (uid: string, snapshot: string) => {
      const u = userMap[uid];
      return !isDoubles && u?.name ? formatPlayerName(u.name) : snapshot;
    };
    return keys.map((key) => {
      const groupMs = groupMatches.filter((m) => m.group_label === key);
      const seen = new Set<string>();
      const players: TournamentPlayer[] = [];
      for (const m of groupMs) {
        if (m.player_1_uid && !seen.has(m.player_1_uid)) {
          seen.add(m.player_1_uid);
          players.push({ uid: m.player_1_uid, name: liveName(m.player_1_uid, m.player_1_name), participantId: '', partnerUid: partnerByUid.get(m.player_1_uid) });
        }
        if (m.player_2_uid && !seen.has(m.player_2_uid)) {
          seen.add(m.player_2_uid);
          players.push({ uid: m.player_2_uid, name: liveName(m.player_2_uid, m.player_2_name), participantId: '', partnerUid: partnerByUid.get(m.player_2_uid) });
        }
      }
      return players;
    });
  }, [userMap, partnerByUid]);

  const rrGroups = useMemo<TournamentPlayer[][]>(
    () => (rrGroupMatches.length === 0 ? [] : buildRRGroupsFrom(rrGroupMatches, rrGroupKeys)),
    [rrGroupMatches, rrGroupKeys, buildRRGroupsFrom],
  );

  const rrStandingsByGroup = useMemo<RRStandingRow[][]>(
    () => rrGroupKeys.map((key) => computeGroupStandings(rrGroupMatches.filter((m) => m.group_label === key))),
    [rrGroupKeys, rrGroupMatches],
  );

  // Stored verbatim at generation; a rename overwrites it. Letters no longer re-letter on render.
  const rrGroupLabels = rrGroupKeys;

  // Group Bonus switch per group: on exactly while the group's `awards` doc exists (the server
  // writes and deletes it, functions/lib/scoring.js groupBonus).
  const rrGroupAwardIds = useMemo(
    () => rrGroupKeys.map((key) => {
      const first = rrGroupMatches.find((m) => m.group_label === key);
      return first ? groupBonusAwardId(first) : '';
    }),
    [rrGroupKeys, rrGroupMatches],
  );
  const awardIdsKey = rrGroupAwardIds.join('|');
  useEffect(() => {
    const ids = awardIdsKey ? awardIdsKey.split('|').filter(Boolean) : [];
    if (ids.length === 0) { setBonusAwards({}); return; }
    const unsubs = ids.map((id) => onSnapshot(
      doc(db, 'awards', id),
      (snap) => setBonusAwards((prev) => ({ ...prev, [id]: snap.exists() })),
      () => setBonusAwards((prev) => ({ ...prev, [id]: false })),
    ));
    return () => unsubs.forEach((u) => u());
  }, [awardIdsKey]);
  const rrGroupBonus = useMemo(() => rrGroupAwardIds.map((id) => !!bonusAwards[id]), [rrGroupAwardIds, bonusAwards]);

  // Registered for THIS DRAW and not yet in a group — the "Add Group" picker's pool. Deliberately
  // not the same list as `unplacedParticipants`, which spans every tournament for organizer
  // awareness; this one must stay draw-scoped or the picker would offer another event's players.
  // "Placed" comes from the authoritative match docs, not the reconstructed `rrGroups`.
  const rrUnplacedPlayers = useMemo<TournamentPlayer[]>(() => {
    if (rrGroupMatches.length === 0) return [];
    const placedAnywhere = new Set(
      matches
        .filter((m) => m.format === 'rr' && m.round === 'RR')
        .flatMap((m) => [m.player_1_uid, m.player_2_uid])
        .filter((id): id is string => !!id),
    );
    return currentDrawAllPlayers.filter((p) => !placedAnywhere.has(p.uid));
  }, [rrGroupMatches, matches, currentDrawAllPlayers]);

  // Everyone registered but seated in no match, across EVERY tournament this organizer runs.
  // The logic moved to useUnplacedParticipants so the Organizer Dash can show the same list
  // without mounting this hook; see CLAUDE.md, "Two unplaced lists, deliberately".
  const myTournamentEvents = useMemo(
    () => (user ? allTournamentEvents.filter((e) => e.organizer_ids?.includes(user.uid)) : []),
    [allTournamentEvents, user],
  );
  // A token, not the arrays: the original effect depended on `matches` and `participants`
  // themselves, so every snapshot re-ran the read. This reproduces exactly that trigger while
  // keeping the hook's dep array a fixed shape. Don't "simplify" it to a length or a count —
  // seating someone doesn't change either, and the list would stop refreshing.
  const unplacedRefresh = useMemo(() => ({}), [matches, participants]);
  const unplacedParticipants = useUnplacedParticipants({
    events: myTournamentEvents,
    enabled: isCreator && !!user,
    refreshKey: unplacedRefresh,
  });

  // Free slots in the CURRENT draw. BYE is deliberately NOT offered: its opponent has already
  // been advanced past it, so filling one silently desyncs the next round.
  const openDrawSlots = useMemo<OpenDrawSlot[]>(() => {
    if (!isCreator) return [];
    const free = (n?: string) => !n || n === PLAYER_LOADING;
    return currentMatches
      .filter((m) => m.status !== 'complete' && !m.id.startsWith('preview_'))
      .flatMap((m) => ([
        { slot: 'player_1' as const, name: m.player_1_name, vs: m.player_2_name },
        { slot: 'player_2' as const, name: m.player_2_name, vs: m.player_1_name },
      ])
        .filter((s) => free(s.name))
        .map((s) => ({
          matchId: m.id,
          slot: s.slot,
          label: `${m.round} · vs ${free(s.vs) ? 'open' : formatPlayerName(s.vs)}`,
        })));
  }, [isCreator, currentMatches]);

  // Seat one registered player into one open slot — what the join flow tries and is denied by
  // rules for everyone but the organizer (see useJoin.ts), which is why late joiners pile up.
  const handleSeatParticipant = async (uid: string, name: string, matchId: string, slot: 'player_1' | 'player_2') => {
    if (!isCreator) return;
    const target = matches.find((m) => m.id === matchId);
    const current = slot === 'player_1' ? target?.player_1_name : target?.player_2_name;
    if (!target || (current && current !== PLAYER_LOADING)) {
      setMessage({ type: 'error', text: 'That slot is no longer free.' });
      return;
    }
    // RR only: a knockout slot is one seat in a fixed bracket, so it has no group to overfill.
    if (target.format === 'rr' && target.round === 'RR') {
      const seated = new Set(
        matches
          .filter((m) => m.format === 'rr' && m.round === 'RR'
            && m.group_label === target.group_label
            && m.event_id === target.event_id
            && sameDraw(drawOf(m), drawOf(target)))
          .flatMap((m) => [m.player_1_uid, m.player_2_uid])
          .filter((id): id is string => !!id && id !== uid),
      );
      if (overGroupCap(seated.size + 1)) return;
    }
    try {
      await updateDoc(doc(db, 'matches', matchId), slotPatch(target, slot, uid, name));
      adoptDrawZone([uid], target.zone);
      setMessage({ type: 'success', text: `${formatPlayerName(name)} placed in the draw.` });
    } catch (err) {
      console.error('Seat player failed:', err);
      setMessage({ type: 'error', text: 'Could not place the player.' });
    }
  };

  // A full v3 event_participants row for this event, on its deterministic id.
  const registrationFor = (uid: string, name: string, division: string, skill: number, partner?: { uid: string; name: string }) => ({
    id: registrationId(event!.id, uid, event!.category, division),
    data: newRegistration(event!, uid, name, { division, skill, partner_uid: partner?.uid, partner_name: partner?.name }),
  });
  // Creates the row, or sets a withdrawn one active again (registrations are never deleted).
  const writeRegistration = async (reg: ReturnType<typeof registrationFor>) => {
    const w = joinWrite(participants.find((p) => p.id === reg.id), reg.data);
    if (w?.update) await updateDoc(doc(db, 'event_participants', reg.id), w.update);
    else if (w?.set) await setDoc(doc(db, 'event_participants', reg.id), w.set);
  };

  // ── Internal helpers ──────────────────────────────────────────────────────

  const generateDraw = async (draw: DrawConfig, lockedDrawsize?: number) => {
    if (!event) return;
    const drawParticipants = filterParticipantsForDraw(participants, draw, statsMap, zoneMap, zoneConfig);
    const players = buildPlayerList(drawParticipants, statsMap, userMap);
    const drawsize = lockedDrawsize ?? previewDrawSize[draw.label] ?? getDrawSize(players.length, draw.tournamentChoice);

    const templateMatches = normalizeTemplateMatches(fallbackTemplate(drawsize));
    const placement = placeDraw(draw, players, drawsize);
    const slotMap = new Map(placement.slotMap);

    const drawOverrides = previewSlotOverrides[draw.label] ?? {};
    Object.entries(drawOverrides).forEach(([slotStr, player]) => {
      const slotNum = Number(slotStr);
      if (player === null) slotMap.delete(slotNum);
      else slotMap.set(slotNum, player);
    });

    const batch = writeBatch(db);
    const drawKey = getDrawKey(draw.tournamentChoice, draw.division, draw.skillGroup, draw.zone);
    const cfg = {
      eventId: event.id,
      tournamentChoice: draw.tournamentChoice,
      division: draw.division,
      skillGroup: draw.skillGroup,
      zone: draw.zone,
      drawsize,
      allMatches: templateMatches,
      started,
    };
    templateMatches.forEach((tm) => {
      batch.set(
        doc(db, 'matches', `${event.id}_${drawKey}_${tm.match_id}`),
        buildMatchFields(tm, slotMap, cfg),
        { merge: true },
      );
    });
    // Seeds freeze here. A seed the organizer moved keeps their number; one taken out has none.
    const placed = new Set([...slotMap.values()].map((p) => p.uid));
    const seeds = Object.fromEntries(Object.entries(placement.seeds).filter(([uid]) => placed.has(uid)));
    // A merged draw saves which bands it holds, so the merge is never guessed from its players.
    const record: DrawPatch = { seeds: { [drawKey]: seeds }, skill_merges: { [drawKey]: draw.mergedFrom ?? null } };
    batch.update(doc(db, 'events', event.id), drawFields(record));
    await batch.commit();
    applyDrawLocally(event.id, record);

    // Auto-advance players who have a BYE opponent (empty slot in slotMap).
    // For each first-round match where one slot has a real player and the other is
    // an empty numbered slot, immediately stamp the real player into the next-round match.
    const byeAdvances: Array<{ nextMatchId: string; slot: string; player: TournamentPlayer }> = [];
    templateMatches.forEach((tm) => {
      if (!tm.next_match_id) return;
      const p1 = typeof tm.player_1 === 'number' ? (slotMap.get(tm.player_1) ?? null) : null;
      const p2 = typeof tm.player_2 === 'number' ? (slotMap.get(tm.player_2) ?? null) : null;
      const realPlayer = (p1 && !p2 && typeof tm.player_2 === 'number') ? p1
        : (!p1 && p2 && typeof tm.player_1 === 'number') ? p2 : null;
      if (!realPlayer) return;
      let nextSlot = (tm.next_slot || '') as 'player_1' | 'player_2' | '';
      if (!nextSlot) {
        const siblings = templateMatches
          .filter((s) => s.next_match_id === tm.next_match_id)
          .sort((a, b) => templateMatches.indexOf(a) - templateMatches.indexOf(b));
        nextSlot = siblings.findIndex((s) => s.match_id === tm.match_id) <= 0 ? 'player_1' : 'player_2';
      }
      byeAdvances.push({ nextMatchId: `${event.id}_${drawKey}_${tm.next_match_id}`, slot: nextSlot, player: realPlayer });
    });
    if (byeAdvances.length > 0) {
      const advBatch = writeBatch(db);
      byeAdvances.forEach(({ nextMatchId, slot, player }) => {
        advBatch.update(doc(db, 'matches', nextMatchId), {
          [`${slot}_name`]: player.name,
          [`${slot}_uid`]: player.uid,
          participant_uids: arrayUnion(...[player.uid, player.partnerUid].filter((u): u is string => !!u)),
          updated_at: Timestamp.now(),
        });
      });
      await advBatch.commit();
    }
  };

  // Results are recorded by the scoreMatch Cloud Function (functions/lib/scoring.js): match, stats,
  // advancement and the submission history in one server transaction. There is no client writer.

  // ── Action handlers ───────────────────────────────────────────────────────

  const handleSaveZoneDrawConfig = async (config: TennisEvent['zone_draw_config']) => {
    if (!isCreator || !event) return;
    const updated: TennisEvent = { ...event, zone_draw_config: config };
    setEvent(updated);
    setAllTournamentEvents((prev) => prev.map((e) => (e.id === event.id ? updated : e)));
    try {
      await updateDoc(doc(db, 'events', event.id), { zone_draw_config: config ?? {} });
    } catch (err) {
      console.error('Failed to save zone draw config:', err);
    }
  };

  const handleUpdateRoundDeadline = async (round: string, date: string) => {
    if (!isCreator || !event) return;
    const updated: TennisEvent = {
      ...event,
      round_deadlines: { ...(event.round_deadlines ?? {}), [round]: date },
    };
    // Optimistic local update
    setEvent(updated);
    setAllTournamentEvents((prev) => prev.map((e) => (e.id === event.id ? updated : e)));
    try {
      await updateDoc(doc(db, 'events', event.id), { [`round_deadlines.${round}`]: date });
    } catch (err) {
      console.error('Failed to save round deadline:', err);
    }
  };

  const handleSetPreviewDrawSize = (drawLabel: string, size: number) => {
    setPreviewDrawSize((prev) => ({ ...prev, [drawLabel]: size }));
  };

  const handleGenerateAll = async () => {
    if (!isCreator || !event || !currentDraw) return;
    setGenerating(true);
    setMessage(null);
    try {
      await generateDraw(currentDraw);
      setEditMode(false);
      setPreviewSlotOverrides((prev) => deleteKey(prev, currentDraw.label));
      setPreviewDrawSize((prev) => deleteKey(prev, currentDraw.label));
      setMessage({ type: 'success', text: `${currentDraw.label} finalized.` });
    } catch (err) {
      console.error('Draw generation failed:', err);
      setMessage({ type: 'error', text: 'Could not generate the draw. Check templates and permissions.' });
    } finally {
      setGenerating(false);
    }
  };

  const handleResetDraw = async () => {
    if (!isCreator || !currentDraw || currentMatches.length === 0) return;

    // Cancelling deletes every match in this draw and reverses the stats any completed match
    // awarded. Warn clearly when played matches exist; this cannot be undone.
    const completed = currentMatches.filter((m) => m.status === 'complete');
    const warn = completed.length > 0
      ? `Cancel all matches for ${currentDraw.label}?\n\nAll matches will be deleted and the stats from ${completed.length} completed match${completed.length > 1 ? 'es' : ''} will be reset. This cannot be undone.`
      : `Cancel all matches for ${currentDraw.label}? This will clear the draw and return to preview mode.`;
    if (!window.confirm(warn)) return;
    setResettingDraw(true);
    setMessage(null);
    try {
      // The server undoes every point these matches paid, then deletes them (lib/scoring.js).
      await cancelDraw(event!.id, currentMatches.map((m) => m.id));
      await clearDrawRecord(currentDrawKey);
      setEditMode(false);
      setPreviewSlotOverrides((prev) => deleteKey(prev, currentDraw.label));
      setPreviewDrawSize((prev) => deleteKey(prev, currentDraw.label));
      // Clear the merge for THIS zone only — cancelling Downtown's merged draw shouldn't unmerge
      // the same division in another zone.
      if (currentDraw.mergedFrom) {
        setSkillMerges((prev) => ({ ...prev, [skillMergeKey(currentDraw.division, currentDraw.zone)]: null }));
      }
      if (currentDraw.tournamentChoice === 'Doubles' && currentDraw.division === 'All') setConsolidateDoubles(false);
      setMessage({ type: 'success', text: `${currentDraw.label} cancelled. Draw returned to preview mode.` });
    } catch (err) {
      console.error('Draw reset failed:', err);
      setMessage({ type: 'error', text: 'Could not cancel the draw.' });
    } finally {
      setResettingDraw(false);
    }
  };

  const handleEditPlayer = async (matchId: string, slot: 'player_1' | 'player_2', player: TournamentPlayer | null) => {
    if (matchId.startsWith('preview_')) {
      const match = displayMatches.find((m) => m.id === matchId);
      if (!match || !currentDraw) return;
      const slotNum = slot === 'player_1' ? match.player_1_slot : match.player_2_slot;
      if (!slotNum) return;
      setPreviewSlotOverrides((prev) => ({
        ...prev,
        [currentDraw.label]: { ...(prev[currentDraw.label] ?? {}), [slotNum]: player },
      }));
      return;
    }
    try {
      // Invariant: any player in a persisted bracket slot MUST have an event_participants entry,
      // or they show in the draw but read as "inactive"/"no-show" in engagement reports.
      // Self-heal here regardless of how they became selectable. No-op when already a
      // participant, so the normal Add Player → Move Players flow is unaffected.
      if (player?.uid && event && currentDraw &&
          !activeParticipants.some((p) => p.uid === player.uid)) {
        let skillLevel = statsMap[player.uid]?.skill_level ?? 0;
        if (!statsMap[player.uid]) {
          const statsSnap = await getDocs(query(collection(db, 'stats'), where('__name__', '==', player.uid)));
          skillLevel = (statsSnap.docs[0]?.data() as UserStats | undefined)?.skill_level ?? 0;
        }
        const reg = registrationFor(player.uid, player.name, currentDraw.division !== 'All' ? currentDraw.division : "Men's", skillLevel);
        await writeRegistration(reg);
      }

      const target = matches.find((m) => m.id === matchId);
      if (!target) return;
      await updateDoc(doc(db, 'matches', matchId), slotPatch(target, slot, player?.uid || '', player?.name || BYE));
      if (player?.uid) adoptDrawZone([player.uid], target.zone);
    } catch (err) {
      console.error('Edit player failed:', err);
      setMessage({ type: 'error', text: 'Could not update player.' });
    }
  };


  /**
   * Organizer-only: send ONE completed match back to unplayed.
   *
   * Until now the only way to undo a score was Cancel Matches, which deletes the entire draw and
   * reverses every completed match in it. This undoes exactly the stats this one match awarded, on
   * the server, and pulls the advanced winner back out of the next round.
   *
   * It deliberately does NOT touch the RR group bonus: that is the organizer's own switch, and
   * silently flipping it here would take 5 points off players over an unrelated correction. Turn
   * it off from the group card if the group should no longer count as finished.
   */
  const handleResetMatchScore = async (match: TournamentMatch) => {
    if (!isCreator || match.status !== 'complete') return;
    if (!window.confirm(
      `Reset the score for ${formatPlayerName(match.player_1_name)} vs ${formatPlayerName(match.player_2_name)}?`
      + '\n\nThe recorded result and the points it awarded are removed, and the match goes back to unplayed.',
    )) return;
    try {
      // The server undoes exactly what the result paid and pulls the winner back (lib/scoring.js).
      await resetScore(match.id);
      setMessage({ type: 'success', text: 'Score reset — the match is unplayed again.' });
    } catch (err) {
      console.error('Reset match score failed:', err);
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Could not reset the score. Please try again.' });
    }
  };

  const handleAddPlayer = async (userId: string, partnerName?: string, divisionOverride?: string) => {
    if (!event || !isCreator || !currentDraw) return;
    if (userId === PLAYER_LOADING_SENTINEL) {
      const division = divisionOverride ?? (currentDraw.division !== 'All' ? currentDraw.division : "Men's");
      try {
        // `__loading_<time>` still fits the {eventId}_{uid} id rule.
        const reg = registrationFor(`__loading_${Date.now()}`, PLAYER_LOADING, division, 0);
        await setDoc(doc(db, 'event_participants', reg.id), reg.data);
        setMessage({ type: 'success', text: 'Player Loading placeholder added.' });
      } catch (err) {
        setMessage({ type: 'error', text: 'Could not add placeholder.' });
      }
      return;
    }
    const userData = allUsers[userId];
    if (!userData) return;
    try {
      let skillLevel = statsMap[userId]?.skill_level ?? 0;
      if (!statsMap[userId]) {
        const statsSnap = await getDocs(query(collection(db, 'stats'), where('__name__', '==', userId)));
        skillLevel = (statsSnap.docs[0]?.data() as UserStats | undefined)?.skill_level ?? 0;
      }
      const division = divisionOverride ?? (currentDraw.division !== 'All' ? currentDraw.division : "Men's");
      // A typed partner name is someone not on the app: a guest partner.
      const partner = partnerName ? { uid: guestUid(), name: partnerName } : undefined;
      const reg = registrationFor(userId, userData.name, division, skillLevel, partner);
      await writeRegistration(reg);
      setMessage({ type: 'success', text: `${userData.name} added. Use Move Players to assign their bracket.` });
    } catch (err) {
      console.error('Add player failed:', err);
      setMessage({ type: 'error', text: 'Could not add player.' });
    }
  };

  /**
   * Soft delete: the `event_participants` row survives with status 'withdrawn', and completed
   * matches and earned stats are left as they are. Their slot becomes Player Loading — shown in a
   * knockout so there's somewhere to drop a replacement, hidden in RR groups where it's noise.
   */
  const handleRemovePlayer = async (uid: string) => {
    if (!isCreator || !event || !uid || !user) return;
    try {
      // Walkovers first: the server refuses a result once a side is blank.
      const { walkovers, blanks } = planRemovePlayer(uid, currentMatches);
      for (const w of walkovers) {
        await recordScore({ matchId: w.matchId }, { winnerUid: w.winnerUid, scores: [[0, 0], [0, 0], [0, 0]], walkover: true, court: '' });
      }
      const batch = writeBatch(db);
      activeParticipants.filter((p) => p.uid === uid)
        .forEach((p) => batch.update(doc(db, 'event_participants', p.id), withdrawal(user?.uid ?? '')));
      blanks.forEach(({ match, slot }) => batch.update(doc(db, 'matches', match.id), slotPatch(match, slot, '', PLAYER_LOADING)));
      await batch.commit();
      setMessage({ type: 'success', text: walkovers.length
        ? `Player removed. ${walkovers.length} walkover${walkovers.length === 1 ? '' : 's'} recorded for their opponents.`
        : 'Player removed.' });
    } catch (err) {
      console.error('Remove player failed:', err);
      setMessage({ type: 'error', text: 'Could not remove the player.' });
    }
  };

  // The viewer withdraws themselves (concedes their unplayed matches; see withdrawFromEvent).
  const handleWithdrawSelf = async (reason: RemovalReason) => {
    if (!event || !user) return;
    try {
      const walkovers = await withdrawFromEvent(event.id, user.uid, reason);
      setMessage({ type: 'success', text: walkovers
        ? `You withdrew. ${walkovers} walkover${walkovers === 1 ? '' : 's'} recorded for your opponents.`
        : 'You withdrew from the event.' });
    } catch (err) {
      console.error('Withdraw failed:', err);
      setMessage({ type: 'error', text: 'Could not withdraw you. Try again.' });
    }
  };

  // ── Round Robin action handlers ───────────────────────────────────────────

  const rrDraftKey = () => currentDraw
    ? currentDrawKey : '';

  // Persist an edited pre-generation grouping to the draft doc (no matches written). Empty groups
  // are dropped so groups and labels stay aligned. Labels are stored verbatim.
  const saveRRDraft = async (groups: TournamentPlayer[][], labels: string[]) => {
    if (!event || !currentDraw) return;
    const rows = groups
      .map((g, i) => ({ uids: g.map((p) => p.uid), label: labels[i] ?? '' }))
      .filter((r) => r.uids.length > 0);
    await setDoc(doc(db, 'events', event.id, 'rr_drafts', rrDraftKey()), {
      event_id: event.id,
      draw_key: rrDraftKey(),
      groups: rows.map((r) => r.uids.join(',')),
      labels: rows.map((r) => r.label),
      updated_at: Timestamp.now(),
    });
  };

  const handleGenerateRR = async () => {
    if (!isCreator || !event || !currentDraw) return;
    setGeneratingRR(true);
    setMessage(null);
    try {
      const drawKey = currentDrawKey;
      // Generate from what the creator sees (the draft arrangement if they edited one, else the
      // computed preview), so the confirmed groups + names match the preview exactly.
      const groups = previewRRGroups;
      // The label becomes the group's identity, so two groups can't share one.
      const taken = new Set<string>();
      const labels = groups.map((_, gi) => uniqueLabel(previewRRLabels[gi] || `Group ${String.fromCharCode(65 + gi)}`, taken));
      const batch = writeBatch(db);
      // Clear any existing RR docs for this draw first so re-generating can't leave
      // orphaned groups/matches behind (deterministic doc IDs only overwrite a matching
      // group+match index; fewer/smaller groups would otherwise strand the old docs).
      currentMatches.filter((m) => m.format === 'rr').forEach((m) => batch.delete(doc(db, 'matches', m.id)));
      groups.forEach((players, gi) => {
        const pairings = players.length >= 2 ? generateGroupPairings(players.length) : [[0, 1]] as [number, number][];
        buildRRGroupMatchFields({
          eventId: event.id, drawKey, draw: currentDraw,
          groupIndex: gi, groupLabel: labels[gi],
          groupPlayers: players, pairings, started,
        }).forEach(({ docId, fields }) => {
          batch.set(doc(db, 'matches', docId), fields);
        });
      });
      const record: DrawPatch = {
        seeds: { [drawKey]: groupSeeds(groups, statsMap) },
        skill_merges: { [drawKey]: currentDraw.mergedFrom ?? null },
      };
      batch.update(doc(db, 'events', event.id), drawFields(record));
      await batch.commit();
      applyDrawLocally(event.id, record);
      setShowRRConfig(false);
      setEditMode(false);
      setMessage({ type: 'success', text: `Round Robin draw generated: ${groups.length} group${groups.length > 1 ? 's' : ''}.` });
    } catch (err) {
      console.error('RR generation failed:', err);
      setMessage({ type: 'error', text: 'Could not generate the Round Robin draw.' });
    } finally {
      setGeneratingRR(false);
    }
  };

  // `gi` is the group card's position: a draft group before generation, rrGroupKeys[gi] after.
  const handleSaveGroupEdit = async (gi: number, newPlayers: TournamentPlayer[]) => {
    if (!isCreator || !event || !currentDraw) return;
    if (overGroupCap(newPlayers.length)) return;
    const drawKey = currentDrawKey;

    // Draft state (no matches yet): apply the edit to the preview arrangement and persist it as a
    // draft — nothing is generated. Moved players are removed from their source groups.
    if (rrGroupMatches.length === 0) {
      try {
        const real = newPlayers.filter((p) => p.uid && p.uid !== PLAYER_LOADING_SENTINEL);
        const movedIn = new Set(real.map((p) => p.uid));
        const nextGroups = previewRRGroups.map((groupPlayers, i) =>
          i === gi ? real : groupPlayers.filter((p) => !movedIn.has(p.uid)),
        );
        await saveRRDraft(nextGroups, previewRRLabels);
        setMessage({ type: 'success', text: 'Group updated.' });
      } catch (err) {
        console.error('Group draft save failed:', err);
        setMessage({ type: 'error', text: 'Could not save group changes.' });
      }
      return;
    }

    const groupKey = rrGroupKeys[gi];
    if (groupKey === undefined) return;
    const plan = planGroupEdit({
      eventId: event.id, drawKey, draw: currentDraw, started, groupKey,
      groups: rrGroupKeys.map((key, i) => ({ key, players: rrGroups[i] ?? [], matches: rrGroupMatches.filter((m) => m.group_label === key) })),
      eventMatches: matches, newPlayers,
    });
    if ('error' in plan) {
      setMessage({ type: 'error', text: plan.error });
      return;
    }
    try {
      const batch = writeBatch(db);
      plan.toDelete.forEach((id) => batch.delete(doc(db, 'matches', id)));
      plan.toWrite.forEach(({ docId, fields }) => batch.set(doc(db, 'matches', docId), fields));
      // Withdrawn in the same batch as the match changes (CLAUDE.md "Removing a player").
      const removed = new Set(plan.removedUids);
      activeParticipants.forEach((p) => {
        if (removed.has(p.uid)) batch.update(doc(db, 'event_participants', p.id), withdrawal(user?.uid ?? ''));
      });
      await batch.commit();
      adoptDrawZone(newPlayers.map((p) => p.uid));
      setMessage({ type: 'success', text: 'Group updated.' });
    } catch (err) {
      console.error('Group edit failed:', err);
      setMessage({ type: 'error', text: 'Could not save group changes.' });
    }
  };

  // Create a new group in the current draw from a set of players (typically unplaced late
  // joiners). ≥2 → round-robin; exactly 1 → lone-player placeholder. Optional custom label.
  const handleCreateRRGroup = async (newPlayers: TournamentPlayer[], label?: string) => {
    if (!isCreator || !event || !currentDraw) return;
    if (overGroupCap(newPlayers.length)) return;
    const drawKey = currentDrawKey;
    const trimmed = (label ?? '').trim();
    const taken = new Set(rrGroupMatches.length === 0 ? previewRRLabels : rrGroupKeys);
    if (trimmed && taken.has(trimmed)) {
      setMessage({ type: 'error', text: 'Another group already has that name.' });
      return;
    }

    // Draft state: append a new group to the draft (no matches written).
    if (rrGroupMatches.length === 0) {
      try {
        const real = newPlayers.filter((p) => p.uid && p.uid !== PLAYER_LOADING_SENTINEL);
        if (real.length === 0) return;
        const movedIn = new Set(real.map((p) => p.uid));
        const base = previewRRGroups.map((g) => g.filter((p) => !movedIn.has(p.uid)));
        await saveRRDraft([...base, real], [...previewRRLabels, trimmed]);
        setMessage({ type: 'success', text: 'Group created.' });
      } catch (err) {
        console.error('RR draft group create failed:', err);
        setMessage({ type: 'error', text: 'Could not create the group.' });
      }
      return;
    }

    const nextIndex = Math.max(-1, ...rrGroupMatches.map(groupIndexOf)) + 1;
    // 0 or 1 player → placeholder match so the empty/solo group remains visible.
    const pairings: [number, number][] = newPlayers.length >= 2 ? generateGroupPairings(newPlayers.length) : [[0, 1]];
    try {
      const batch = writeBatch(db);
      buildRRGroupMatchFields({
        eventId: event.id, drawKey, draw: currentDraw,
        groupIndex: nextIndex,
        groupLabel: trimmed || uniqueLabel(`Group ${String.fromCharCode(65 + rrGroupKeys.length)}`, taken),
        groupPlayers: newPlayers,
        pairings,
        started,
      }).forEach(({ docId, fields }) => batch.set(doc(db, 'matches', docId), fields));
      await batch.commit();
      adoptDrawZone(newPlayers.map((p) => p.uid));
      setMessage({ type: 'success', text: 'Group created.' });
    } catch (err) {
      console.error('RR group create failed:', err);
      setMessage({ type: 'error', text: 'Could not create the group.' });
    }
  };

  // Rename a group: the new label overwrites group_label on every match of the group (it is the
  // group's identity, so it must stay unique in the draw). Empty is a no-op.
  const handleRenameGroup = async (gi: number, label: string) => {
    if (!isCreator || !event || !currentDraw) return;
    const trimmed = label.trim();
    if (!trimmed) return;
    const labels = rrGroupMatches.length === 0 ? previewRRLabels : rrGroupKeys;
    if (labels.some((l, i) => i !== gi && l === trimmed)) {
      setMessage({ type: 'error', text: 'Another group already has that name.' });
      return;
    }

    // Draft state: store the label on the draft (no matches yet).
    if (rrGroupMatches.length === 0) {
      try {
        await saveRRDraft(previewRRGroups, previewRRLabels.map((l, i) => (i === gi ? trimmed : l)));
        setMessage({ type: 'success', text: 'Group renamed.' });
      } catch (err) {
        console.error('RR draft rename failed:', err);
        setMessage({ type: 'error', text: 'Could not rename the group.' });
      }
      return;
    }

    const groupKey = rrGroupKeys[gi];
    const groupMatches = rrGroupMatches.filter((m) => m.group_label === groupKey);
    if (groupMatches.length === 0 || groupKey === trimmed) return;
    // The bonus award's id is built from the group name; renaming would orphan it.
    if (rrGroupBonus[gi]) {
      setMessage({ type: 'error', text: 'Turn the group bonus off before renaming this group.' });
      return;
    }
    try {
      const batch = writeBatch(db);
      groupMatches.forEach((m) => batch.update(doc(db, 'matches', m.id), { group_label: trimmed, updated_at: Timestamp.now() }));
      await batch.commit();
      setMessage({ type: 'success', text: 'Group renamed.' });
    } catch (err) {
      console.error('RR group rename failed:', err);
      setMessage({ type: 'error', text: 'Could not rename the group.' });
    }
  };

  // Organizer's Group Bonus switch: pays every player in one RR group, or takes it back. This is the ONLY way the bonus moves — scoring a group's last match awards nothing.
  // The group's `awards` doc IS the switch's state; the server pays and takes it back
  // (groupBonus in functions/lib/scoring.js).
  const handleSetGroupBonus = async (gi: number, award: boolean) => {
    if (!isCreator || !event || !currentDraw) return;
    const groupMatches = rrGroupMatches.filter((m) => m.group_label === rrGroupKeys[gi]);
    if (groupMatches.length === 0) return;
    // Already in the requested state — nothing to pay or refund.
    if (rrGroupBonus[gi] === award) return;
    const recipients = computeGroupStandings(groupMatches).filter((r) => r.userId);
    if (recipients.length === 0) return;
    const pending = groupMatches.filter((m) => m.status !== 'complete').length;
    if (!window.confirm(award
      ? `Award the group bonus to all ${recipients.length} players in this group?`
        + (pending > 0 ? `\n\n${pending} match${pending > 1 ? 'es are' : ' is'} still unplayed.` : '')
      : `Take the group bonus back from the players it was paid to?`,
    )) return;
    try {
      // Paid and taken back on the server, which stores who was paid (lib/scoring.js).
      await setGroupBonus(event.id, groupMatches.map((m) => m.id), award);
      setMessage({ type: 'success', text: award ? `Group bonus awarded to ${recipients.length} players.` : 'Group bonus taken back.' });
    } catch (err) {
      console.error('RR group bonus failed:', err);
      setMessage({ type: 'error', text: 'Could not update the group bonus.' });
    }
  };

  // A round robin of ONE group and no knockout has no final, so its winner is named instead: the
  // group table's leader. A title, no points (groupChampion in functions/lib/scoring.js).
  const rrSingleGroup = rrGroupKeys.length === 1 && rrKnockoutMatches.length === 0 && rrGroupMatches.length > 0;
  const rrChampion = rrSingleGroup && currentDrawKey ? event?.champions?.[currentDrawKey] ?? null : null;
  const handleSetGroupChampion = async (winnerUid: string | null) => {
    if (!isCreator || !event || !rrSingleGroup || !currentDrawKey) return;
    try {
      await setGroupChampion(event.id, rrGroupMatches.map((m) => m.id), winnerUid);
      // The server wrote it, with the partner's uid this page doesn't have; read it back.
      const fresh = await getDoc(doc(db, 'events', event.id));
      const named = (fresh.data() as TennisEvent | undefined)?.champions?.[currentDrawKey] ?? null;
      applyDrawLocally(event.id, { champions: { [currentDrawKey]: named } });
      setMessage({ type: 'success', text: winnerUid ? `${named?.name ?? 'The leader'} named as the winner.` : 'Winner taken back.' });
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Could not update the winner.' });
    }
  };

  /**
   * A doubles participant fills in the partner their registration is missing (an owner may write
   * only partner_uid, partner_name and skill). A member partner carries their uid; someone not on
   * the app gets a guest uid, and their `skill` is the combined estimate.
   */
  const [savingTeammate, setSavingTeammate] = useState(false);
  const handleAddTeammate = async (
    participantId: string,
    partnerName: string,
    partnerUid: string | null,
    combinedSkill: number | null,
  ) => {
    setSavingTeammate(true);
    try {
      await updateDoc(doc(db, 'event_participants', participantId), {
        partner_uid: partnerUid ?? guestUid(),
        partner_name: partnerName,
        ...(combinedSkill !== null ? { skill: combinedSkill } : {}),
      });
      setMessage({ type: 'success', text: 'Teammate saved.' });
    } catch (err) {
      console.error('Add teammate failed:', err);
      setMessage({ type: 'error', text: 'Could not save your teammate. Please try again.' });
    } finally {
      setSavingTeammate(false);
    }
  };

  /**
   * A zone change is the member's `preferences.preferred_zone` — the member's own, or an
   * organizer's Change Zone (rules let an organizer change only that field). No approval step.
   * The server (functions/zoneMoves.js onZoneChanged) gives up only old-zone draws where the member
   * has no real opponent, and alerts the organizers when a generated draw is affected.
   */
  const writePreferredZone = async (uid: string, zone: string) => {
    await updateDoc(doc(db, 'preferences', uid), { preferred_zone: zone });
    setZoneMap((prev) => ({ ...prev, [uid]: zone }));
  };

  // A player the organizer places who has no zone of their own takes the draw's zone. Anyone with
  // a zone keeps it: a merge never rewrites it, and only the member changes it (Change Zone).
  const adoptDrawZone = (uids: string[], zone = currentDraw?.zone) => {
    const label = zoneConfig.buckets.find((b) => b.id === zone)?.zones[0];
    if (!label) return; // doubles, the Unassigned draw, or zones off
    for (const uid of uids) {
      if (!(uid in prefZoneMap) || prefZoneMap[uid].trim() || isGuest(uid)) continue;
      writePreferredZone(uid, label).catch((err) => console.error('Zone write failed:', err));
    }
  };

  const handleChangeZone = async (newZone: string) => {
    if (!user || !newZone) return;
    try {
      await writePreferredZone(user.uid, newZone);
      setMessage({
        type: 'success',
        text: `You're in ${newZone} now. Your organizer has been told, and your existing matches are unchanged.`,
      });
    } catch (err) {
      console.error('Zone change failed:', err);
      setMessage({ type: 'error', text: 'Could not change your zone.' });
    }
  };

  /** Organizer: move any player in the draw to another zone (a bucket id → its zone name). */
  const handleMoveZoneByUid = async (uid: string, bucketId: string) => {
    if (!isCreator) return;
    const zone = zoneConfig.buckets.find((b) => b.id === bucketId)?.zones[0];
    if (!zone) {
      setMessage({ type: 'error', text: 'That zone could not be found.' });
      return;
    }
    try {
      await writePreferredZone(uid, zone);
      setMessage({ type: 'success', text: `Player moved to ${zone}. Matches with a real opponent are kept.` });
    } catch (err) {
      console.error('Zone move failed:', err);
      setMessage({ type: 'error', text: 'Could not move the player.' });
    }
  };

  /**
   * Merge one zone into another. The source stops producing draws; its players route to the target.
   * Recorded only on the event's zone config — a merge never changes a member's zone.
   */
  const handleMergeZone = async (sourceId: string, targetId: string) => {
    if (!isCreator || !event || sourceId === targetId) return;
    // Merging a zone that already has matches would strand them — its draws stop existing.
    if (matches.some((m) => m.zone === sourceId)) {
      setMessage({ type: 'error', text: 'That zone already has matches. Cancel its draws before merging it.' });
      return;
    }
    try {
      const nextMerges = { ...(zoneConfig.merges ?? {}), [sourceId]: targetId };
      await handleSaveZoneDrawConfig({ ...zoneConfig, merges: nextMerges });
      const affected = activeParticipants.filter((p) => zoneBucketFor(zoneMap[p.uid], zoneConfig) === sourceId);
      setMessage({ type: 'success', text: `Zone merged: ${affected.length} player${affected.length === 1 ? '' : 's'} moved.` });
    } catch (err) {
      console.error('Zone merge failed:', err);
      setMessage({ type: 'error', text: 'Could not merge the zone.' });
    }
  };

  /**
   * Manage Draw → Zone Draws. Off collapses the zone dimension: one draw per skill.
   * Merges and player zones stay recorded, so switching back on restores the setup.
   */
  const handleSetZoneDrawsEnabled = async (enabled: boolean) => {
    if (!isCreator || !event) return;
    if (!enabled && matches.some((m) => m.zone)) {
      setMessage({ type: 'error', text: 'Zone draws already have matches. Cancel those draws before switching zones off.' });
      return;
    }
    await handleSaveZoneDrawConfig({ ...zoneConfig, enabled });
  };

  /** Undo one merge — the source runs on its own again. */
  const handleUnmergeZone = async (sourceId: string) => {
    if (!isCreator || !event) return;
    try {
      const nextMerges = { ...(zoneConfig.merges ?? {}) };
      delete nextMerges[sourceId];
      await handleSaveZoneDrawConfig({ ...zoneConfig, merges: nextMerges });
      setMessage({ type: 'success', text: 'Zone unmerged.' });
    } catch (err) {
      console.error('Zone unmerge failed:', err);
      setMessage({ type: 'error', text: 'Could not unmerge the zone.' });
    }
  };

  const handleResetRR = async () => {
    if (!isCreator || !currentDraw || currentMatches.length === 0) return;
    // Cancelling deletes every group + knockout match in this draw and reverses the stats any
    // completed match awarded (per-match results and RR group-completion bonuses). Warn clearly
    // when played matches exist; this cannot be undone.
    const completed = currentMatches.filter((m) => m.status === 'complete');
    const warn = completed.length > 0
      ? `Cancel the Round Robin draw?\n\nAll ${currentMatches.length} matches will be deleted and the stats from ${completed.length} completed match${completed.length > 1 ? 'es' : ''} will be reset. This cannot be undone.`
      : 'Cancel the Round Robin draw? This will clear all group and knockout matches.';
    if (!window.confirm(warn)) return;
    setResettingDraw(true);
    try {
      // The server undoes every result and group bonus these matches paid, then deletes them.
      await cancelDraw(event!.id, currentMatches.map((m) => m.id));
      await clearDrawRecord(currentDrawKey);
      setEditMode(false);
      setMessage({ type: 'success', text: 'Round Robin draw cancelled. Matches deleted and stats reset.' });
    } catch (err) {
      console.error('RR reset failed:', err);
      setMessage({ type: 'error', text: 'Could not reset the draw.' });
    } finally {
      setResettingDraw(false);
    }
  };

  // Build/rebuild the RR knockout at a creator-chosen size (R4/R8/R16). Group winners are
  // auto-seeded; remaining slots are PLAYER_LOADING for manual placement. Re-selecting rebuilds —
  // refused once any knockout match has been played.
  const handleGenerateRRKnockout = async (size?: number) => {
    if (!isCreator || !event || !currentDraw || rrGroupMatches.length === 0) return;
    if (rrKnockoutMatches.some((m) => m.status === 'complete')) {
      setMessage({ type: 'error', text: 'Cannot rebuild: a knockout match has already been played.' });
      return;
    }
    setGeneratingRR(true);
    setMessage(null);
    try {
      const drawKey = currentDrawKey;
      // Group winners are seeded by league rank on the same seed lines as any knockout; the
      // organizer fills the empty lines by hand (no zone pairing here).
      const winners = selectGroupWinners(rrGroups, rrStandingsByGroup).sort(playerSeedCompare(statsMap));
      const drawsize = size ?? nextPow2(Math.max(2, winners.length));
      const placement = placeSeededDraw({
        players: winners,
        drawsize,
        rngKey: `${event.id}|${drawKey}__knockout|${winners.map((p) => p.uid).sort().join(',')}`,
        zoneOf: () => '',
        distanceKm: () => null,
      });
      const docs = buildRRKnockoutDocs({
        eventId: event.id, drawKey, draw: currentDraw, slotMap: placement.slotMap, started,
        drawsize, manualFill: true,
      });
      const batch = writeBatch(db);
      rrKnockoutMatches.forEach((m) => batch.delete(doc(db, 'matches', m.id)));
      docs.forEach(({ docId, fields }) => batch.set(doc(db, 'matches', docId), fields));
      const record: DrawPatch = { seeds: { [`${drawKey}__knockout`]: placement.seeds } };
      batch.update(doc(db, 'events', event.id), drawFields(record));
      await batch.commit();
      applyDrawLocally(event.id, record);
      setRRView('knockout');
    } catch (err) {
      console.error('RR knockout generation failed:', err);
      setMessage({ type: 'error', text: 'Could not generate knockout stage.' });
    } finally {
      setGeneratingRR(false);
    }
  };

  return {
    authLoading,
    loading,
    eventDataReady,
    user,
    allTournamentEvents,
    event,
    matches,
    participants,
    isCreator,
    started,
    userParticipant,
    zoneMap,
    statsMap,
    courtsMap,
    availabilityMap,
    userMap,
    currentDraw,
    currentMatches,
    displayMatches,
    visibleDraws,
    drawCounts,
    opponent,
    editPlayers,
    currentDrawAllPlayers,
    currentDrawSize,
    message,
    setMessage,
    generating,
    resettingDraw,
    editMode,
    setEditMode,
    // Merges are stored per (division, zone); these read and write the merge for the zone the
    // creator is currently looking at, so the header's controls stay a simple pair of toggles.
    mensSkillMerge: skillMerges[skillMergeKey("Men's", mergeZoneKey(currentDraw?.zone))] ?? null,
    setMensSkillMerge: (pair: SkillMergePair | null) =>
      setSkillMerges((prev) => ({ ...prev, [skillMergeKey("Men's", mergeZoneKey(currentDraw?.zone))]: pair })),
    womensSkillMerge: skillMerges[skillMergeKey("Women's", mergeZoneKey(currentDraw?.zone))] ?? null,
    setWomensSkillMerge: (pair: SkillMergePair | null) =>
      setSkillMerges((prev) => ({ ...prev, [skillMergeKey("Women's", mergeZoneKey(currentDraw?.zone))]: pair })),
    consolidateDoubles,
    setConsolidateDoubles,
    liveDraws,
    selectDraw: (d: DrawConfig) => setSelectedDrawKey(drawKey(d)),
    availableUsers,
    handleSaveZoneDrawConfig,
    handleUpdateRoundDeadline,
    handleSetPreviewDrawSize,
    handleAddPlayer,
    handleRemovePlayer,
    handleWithdrawSelf,
    handleGenerateAll,
    handleResetDraw,
    handleEditPlayer,
    submittableMatchIds,
    handleResetMatchScore,
    // Round Robin
    currentDrawFormat,
    drawFormat,
    showRRConfig,
    setShowRRConfig,
    generatingRR,
    rrGroups,
    previewRRGroups,
    previewRRLabels,
    drawSeeds,
    rrKnockoutSeeds,
    rrStandingsByGroup,
    rrGroupMatches,
    rrKnockoutMatches,
    rrGroupLabels,
    rrGroupBonus,
    rrSingleGroup,
    rrChampion,
    rrUnplacedPlayers,
    rrView,
    setRRView,
    handleGenerateRR,
    handleResetRR,
    handleGenerateRRKnockout,
    handleSaveGroupEdit,
    handleCreateRRGroup,
    handleRenameGroup,
    handleSetGroupBonus,
    handleSetGroupChampion,
    visibleUserMatch,
    unplacedParticipants,
    openDrawSlots,
    handleSeatParticipant,
    handleChangeZone,
    handleMoveZoneByUid,
    handleMergeZone,
    handleSetZoneDrawsEnabled,
    handleUnmergeZone,
    zoneConfig,
    handleAddTeammate,
    savingTeammate,
  };
};
