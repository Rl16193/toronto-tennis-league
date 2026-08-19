import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  addDoc, arrayUnion, collection, doc, documentId, getDocs, increment, onSnapshot, query, setDoc, updateDoc, where, writeBatch,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { ContactData, EventParticipant, MemberInfo, TennisEvent, UserData, UserStats } from '../../types';
import { DrawConfig, DrawTab, OpenDrawSlot, RRConfig, RRStandingRow, ScheduleRequest, ScoreForm, ScoreSubmission, ScoreSubmissionDoc, SkillGroup, SkillMergePair, SKILL_GROUP_ORDER, TournamentFormat, TournamentMatch, TournamentPlayer, UnplacedEntry } from './types';
import {
  autoLabel, buildRRGroupMatchFields, buildRRKnockoutDocs, buildSafeGroupRewrite, buildZoneTierGroups,
  computeGroupStandings,
  deriveRRConfig, generateGroupPairings, selectGroupWinners, sharedBand, sharedZone,
} from './rrGeneration';
import {
  BYE, NO_SHOW_POINTS, PLAYER_LOADING, matchAward, skillBand,
  buildMatchFields, buildPlayerList, buildZoneAwareDrawConfigs, deleteKey, fallbackTemplate, filterParticipantsForDraw, resolveZoneConfig,
  formatPlayerName, getDrawKey, getDrawSize, getEventDate,
  isTournamentStarted, normalizeTemplateMatches, zoneBucketFor, effectiveZone,
} from './utils';
import { CONSOLIDATED_DOUBLES_DRAW, VISIBLE_DRAWS, buildMergedSkillDraw } from './drawConfigs';
import { PLAYER_LOADING_SENTINEL } from './AddPlayerPanel';
import {
  normalizeEvent,
  normalizeEventParticipant,
  normalizeTournamentMatch,
} from '../../lib/firestoreNormalization';

// Stand-in for a contacts doc whose matching users doc is missing — a data anomaly rather than a
// normal state, but the merge below shouldn't drop the contact details over it.
const EMPTY_MEMBER: UserData = { name: '', created_at: '' };

// Per-player RR group bonus. Paid only by handleAwardGroupBonus, reversed by reverseRRBonusesInto —
// one constant so the two can't drift.
const RR_GROUP_BONUS = 5;

// Hard ceiling on an RR group. Guards the manual paths — the only way anyone is seated now.
export const RR_GROUP_MAX = 5;

// Scoring rules live in `matchAward` (utils.ts), shared with computeGroupStandings.

export const useTournament = (eventIdOverride?: string) => {
  const { user, profile, loading: authLoading } = useAuth();

  const [allTournamentEvents, setAllTournamentEvents] = useState<TennisEvent[]>([]);
  const [event, setEvent] = useState<TennisEvent | null>(null);
  const [participants, setParticipants] = useState<EventParticipant[]>([]);
  const [matches, setMatches] = useState<TournamentMatch[]>([]);
  // Has each onSnapshot delivered once since `event` changed? Reset per event switch, so the UI
  // shows a loading state instead of flashing the previous event's data.
  const [participantsReady, setParticipantsReady] = useState(false);
  const [matchesReady, setMatchesReady] = useState(false);
  const eventDataReady = participantsReady && matchesReady;

  const [userMap, setUserMap] = useState<Record<string, MemberInfo>>({});
  const [statsMap, setStatsMap] = useState<Record<string, UserStats>>({});

  const [activeTab, setActiveTab] = useState<DrawTab>('mens');
  const [activeSkill, setActiveSkill] = useState<SkillGroup>('Challengers');
  const [activeDoubles, setActiveDoubles] = useState("Men's");
  const [activeZone, setActiveZone] = useState<string | undefined>(undefined);
  const [scoreForm, setScoreForm] = useState<ScoreForm | null>(null);
  const [pendingSubmissions, setPendingSubmissions] = useState<ScoreSubmissionDoc[]>([]);
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
  const [skillOverrides, setSkillOverrides] = useState<Record<string, SkillGroup>>({});
  const [allUsers, setAllUsers] = useState<Record<string, MemberInfo>>({});
  const [courtsMap, setCourtsMap] = useState<Record<string, string[]>>({});
  const [zoneMap, setZoneMap] = useState<Record<string, string>>({});
  const [availabilityMap, setAvailabilityMap] = useState<Record<string, string[]>>({});
  // Round Robin 3rd-level view: group stage vs knockout.
  const [rrView, setRRView] = useState<'groups' | 'knockout'>('groups');
  // Server-persisted RR draft for the current draw (edited groups + withdrawn players) — lets the
  // creator arrange groups before generation without writing matches, surviving refresh.
  const [rrDraft, setRRDraft] = useState<{ groups: string[][]; custom: boolean[]; customLabels: string[]; withdrawn: string[] } | null>(null);

  // Round Robin state
  const [showRRConfig, setShowRRConfig] = useState(false);
  const [generatingRR, setGeneratingRR] = useState(false);

  const activeEventIdRef = useRef<string | undefined>(undefined);
  // Players the creator intentionally replaced with PLAYER_LOADING — kept out of the unplaced pool
  // so removing someone doesn't immediately offer them straight back.
  const manuallyUnplacedIdsRef = useRef<Set<string>>(new Set());

  // Every seating path is manual now, so this is the only thing bounding group size.
  const overGroupCap = (count: number) => {
    if (count <= RR_GROUP_MAX) return false;
    setMessage({ type: 'error', text: `A group can hold at most ${RR_GROUP_MAX} players.` });
    return true;
  };

  const isCreator = !!user && !!event?.creator_id && event.creator_id === user.uid;
  const started = isTournamentStarted(event);

  const effectiveStatsMap = useMemo(() => {
    if (Object.keys(skillOverrides).length === 0) return statsMap;
    const copy = { ...statsMap };
    Object.entries(skillOverrides).forEach(([uid, group]) => {
      const overrideSkill = group === 'Masters' ? 4 : group === 'Beginners' ? 2 : 3;
      copy[uid] = { ...(copy[uid] ?? {}), skill_level: overrideSkill } as typeof copy[string];
    });
    return copy;
  }, [statsMap, skillOverrides]);

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
    const eventChoice = event?.tournament_choice;
    let draws = VISIBLE_DRAWS.filter((d) => {
      if (consolidateDoubles && d.tab === 'doubles') return false;
      if (eventChoice === 'Singles' && d.tournamentChoice !== 'Singles') return false;
      if (eventChoice === 'Doubles' && d.tournamentChoice !== 'Doubles') return false;
      if (event?.hide_seniors && d.skillGroup === 'Retired Pro') return false;
      if (event?.hide_beginners && (d.tab === 'mens' || d.tab === 'womens') && d.skillGroup === 'Beginners') return false;
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
      const merged = buildMergedSkillDraw(d.tab as 'mens' | 'womens', d.division as "Men's" | "Women's", pair);
      // " — " is load-bearing, not decoration: buildZoneAwareDrawConfigs uses it, and DrawTabs
      // recovers the zone name by splitting the label on it. With any other separator the tree
      // falls back to the raw bucket id ("downtown_midtown") and the leaf keeps the zone suffix.
      out.push(d.zone ? { ...merged, zone: d.zone, label: `${merged.label} — ${zoneLabelFor(d.zone)}` } : merged);
    }

    const tabOrder = { mens: 0, womens: 1, doubles: 2 };
    return out.sort((a, b) => tabOrder[a.tab] - tabOrder[b.tab]);
  }, [skillMerges, consolidateDoubles, event?.tournament_choice, event?.hide_seniors, event?.hide_beginners, zoneConfig, zoneLabelFor]);

  // ── Data loading ──────────────────────────────────────────────────────────

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const eventsSnap = await getDocs(collection(db, 'events'));
        const tournamentEvents = eventsSnap.docs
          .map((d) => normalizeEvent(d.id, d.data()))
          // League Ladder events have no draw — ladder matches are a match type surfaced in
          // Matches/Challenges instead, so they don't belong on the Tournament page at all.
          .filter((e) => e.type?.toLowerCase().includes('tournament'))
          .sort((a, b) => (getEventDate(b)?.getTime() || 0) - (getEventDate(a)?.getTime() || 0));
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
    setSkillOverrides({});
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
        setParticipants(snap.docs
          .map((d) => normalizeEventParticipant(d.id, d.data()))
          .filter((participant): participant is EventParticipant => participant !== null));
        setParticipantsReady(true);
      },
    );
  }, [event]);

  useEffect(() => {
    if (!event) return;
    return onSnapshot(
      query(collection(db, 'matches'), where('event_id', '==', event.id), where('category', 'in', ['singles', 'doubles'])),
      (snap) => {
        const loaded = snap.docs
          .map((d) => normalizeTournamentMatch(d.id, d.data()))
          .filter((match): match is TournamentMatch => match !== null);
        setMatches(loaded);
        setMatchesReady(true);
      },
    );
  }, [event]);

  // Auto-enable merge toggles from existing draw data. The merged PAIR isn't stored on the match
  // doc, so infer it from the players; falls back to Challengers+Masters.
  // Must stay its own effect keyed on [matches, statsMap] — inside the matches callback statsMap
  // is a stale {} closure, so every band lookup returns 0 and the inference silently falls back.
  useEffect(() => {
    // Merged matches are now inferred per (division, zone) — a merged draw exists in one zone
    // without implying anything about the same division in another.
    const merged = matches.filter((m) =>
      m.tournament_choice === 'Singles' && m.skill_group === 'All' &&
      (m.division === "Men's" || m.division === "Women's"));
    if (merged.length > 0) {
      const next: Record<string, SkillMergePair> = {};
      for (const key of new Set(merged.map((m) => skillMergeKey(m.division, mergeZoneKey(m.zone))))) {
        const group = merged.filter((m) => skillMergeKey(m.division, mergeZoneKey(m.zone)) === key);
        const bands = new Set(group
          .flatMap((m) => [m.player_1_uid, m.player_2_uid])
          .filter(Boolean)
          .map((uid) => skillBand(statsMap[uid]?.skill_level ?? 0)));
        next[key] = bands.has('Beginners') && bands.has('Masters') ? 'Beginners+Challengers+Masters'
          : bands.has('Beginners') && bands.has('Challengers') ? 'Beginners+Challengers'
          : 'Challengers+Masters';
      }
      setSkillMerges((prev) => ({ ...prev, ...next }));
    }
    if (matches.some((m) => m.tournament_choice === 'Doubles' && m.division === 'All'))
      setConsolidateDoubles(true);
  }, [matches, statsMap]);


  // Marks a submission actioned without destroying it. `user` is captured at call time so the
  // record says who resolved it.
  const resolvedStamp = (as: 'confirmed' | 'rejected' | 'superseded') => ({
    resolved: as,
    resolved_at: new Date().toISOString(),
    ...(user ? { resolved_by: user.uid } : {}),
  });

  // Player-submitted scores awaiting the creator's confirmation. Actioned submissions are kept
  // (stamped `resolved`) rather than deleted, so what each player submitted stays on record —
  // filtered out here so only the outstanding ones reach the queue.
  useEffect(() => {
    if (!event) { setPendingSubmissions([]); return; }
    return onSnapshot(
      query(collection(db, 'matches'), where('category', '==', 'score_submission'), where('event_id', '==', event.id)),
      (snap) => setPendingSubmissions(
        snap.docs.map((d) => ({ id: d.id, ...d.data() } as ScoreSubmissionDoc)).filter((s) => !s.resolved),
      ),
      () => setPendingSubmissions([]),
    );
  }, [event]);

  // Only submissions whose match still exists and is not yet scored are actionable.
  const actionablePendingSubmissions = useMemo(
    () => pendingSubmissions.filter((s) => {
      const m = matches.find((mm) => mm.id === s.match_id);
      return !!m && m.status !== 'complete';
    }),
    [pendingSubmissions, matches],
  );

  const pendingMatchIds = useMemo(
    () => new Set(actionablePendingSubmissions.map((s) => s.match_id)),
    [actionablePendingSubmissions],
  );

  // Clear stale submissions out of the queue (match already scored or gone) by stamping them
  // 'superseded'. Creator only — they're the only ones permitted to write other players' docs.
  // This is where the SECOND player's copy of an agreed score lands, so it must be retained,
  // not deleted: it's the only evidence of whether the two of them actually agreed.
  const cleaningStaleRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!isCreator || !matchesReady) return;
    const stale = pendingSubmissions.filter((s) => {
      const m = matches.find((mm) => mm.id === s.match_id);
      return !m || m.status === 'complete';
    });
    for (const s of stale) {
      if (cleaningStaleRef.current.has(s.id)) continue;
      cleaningStaleRef.current.add(s.id);
      updateDoc(doc(db, 'matches', s.id), resolvedStamp('superseded'))
        .catch(() => {})
        .finally(() => cleaningStaleRef.current.delete(s.id));
    }
  }, [isCreator, pendingSubmissions, matches, matchesReady]);

  // Match ids the current user may submit a score for: a slot player, or (doubles) the
  // mutually-registered teammate of a slot player. Empty for the creator (they use Enter score).
  const submittableMatchIds = useMemo(() => {
    if (!user || isCreator) return new Set<string>();
    const norm = (s?: string) => (s || '').trim().toLowerCase().replace(/\s+/g, ' ');
    const byName = new Map<string, EventParticipant>();
    participants.forEach((p) => byName.set(norm(p.user_name), p));
    // Map each registrant uid → their mutually-registered teammate uid (doubles).
    const teammateByUid = new Map<string, string>();
    for (const p of participants) {
      if (!p.doubles || !p.uid) continue;
      const partner = byName.get(norm(p.doubles));
      if (partner && partner.uid && norm(partner.doubles) === norm(p.user_name)) {
        teammateByUid.set(p.uid, partner.uid);
      }
    }
    const ids = new Set<string>();
    for (const m of matches) {
      const slotUids = [m.player_1_uid, m.player_2_uid].filter(Boolean);
      const authorized = slotUids.some((su) => su === user.uid || teammateByUid.get(su) === user.uid);
      if (authorized) ids.add(m.id);
    }
    return ids;
  }, [user, isCreator, participants, matches]);

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
    const missingUsers = allIds.filter((id) => !userMap[id]);
    const missingStats = allIds.filter((id) => !statsMap[id]);
    if (missingUsers.length === 0 && missingStats.length === 0) return;

    const fetchByIds = <T,>(col: string, ids: string[]): Promise<Record<string, T>> => {
      const chunks: string[][] = [];
      for (let i = 0; i < ids.length; i += 10) chunks.push(ids.slice(i, i + 10));
      return Promise.all(
        chunks.map((chunk) => getDocs(query(collection(db, col), where(documentId(), 'in', chunk)))),
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

    const chunks: string[][] = [];
    for (let i = 0; i < missingIds.length; i += 10) chunks.push(missingIds.slice(i, i + 10));

    Promise.all(
      chunks.map((chunk) =>
        getDocs(query(collection(db, 'preferences'), where(documentId(), 'in', chunk))),
      ),
    ).then((snaps) => {
      // Seed every requested id (default empty) so participants without a preferences
      // doc are still recorded as "checked" and never re-queried on the next snapshot.
      const courtEntries: Record<string, string[]> = {};
      const zoneEntries: Record<string, string> = {};
      const availabilityEntries: Record<string, string[]> = {};
      for (const id of missingIds) { courtEntries[id] = []; zoneEntries[id] = ''; availabilityEntries[id] = []; }
      snaps.forEach((snap) => snap.forEach((d) => {
        courtEntries[d.id] = (d.data().preferred_courts ?? []) as string[];
        zoneEntries[d.id] = (d.data().preferred_zone ?? '') as string;
        availabilityEntries[d.id] = (d.data().availability_tags ?? []) as string[];
      }));
      setCourtsMap((prev) => ({ ...prev, ...courtEntries }));
      setZoneMap((prev) => ({ ...prev, ...zoneEntries }));
      setAvailabilityMap((prev) => ({ ...prev, ...availabilityEntries }));
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [participants, user]);

  // ── Derived data ──────────────────────────────────────────────────────────

  const userParticipant = useMemo(
    () => participants.find((p) => p.uid === user?.uid) ?? null,
    [participants, user],
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
        (d) => d.tournamentChoice === placement.tournament_choice &&
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
    const zonesWithMatches = new Set(
      matches.map((m) => `${m.tournament_choice}|${m.division}|${m.skill_group}|${effectiveZone(m.zone)}`),
    );
    const populated = effectiveDraws.filter((d) => {
      // Doubles carries no zone dimension at all — it never gets a zone draw, so it always shows.
      if (d.tournamentChoice === 'Doubles') return true;
      if (zonesWithMatches.has(`${d.tournamentChoice}|${d.division}|${d.skillGroup}|${effectiveZone(d.zone)}`)) return true;
      return filterParticipantsForDraw(participants, d, effectiveStatsMap, zoneMap, zoneConfig).length > 0;
    });
    if (isCreator || !userDraw) return populated;
    return populated.filter(
      (d) => d.tab === userDraw.tab && (userDraw.tab !== 'doubles' || d.division === userDraw.division),
    );
  }, [isCreator, userDraw, effectiveDraws, matches, participants, effectiveStatsMap, zoneMap, zoneConfig]);

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

    setActiveTab(userDraw.tab);
    if (userDraw.tab === 'doubles') setActiveDoubles(userDraw.division);
    else setActiveSkill(userDraw.skillGroup as SkillGroup);
    setActiveZone(zone);
  }, [userDraw, zoneMap, userParticipant, zoneConfig, event?.id]);

  const currentDraw = useMemo<DrawConfig | undefined>(() => {
    if (activeTab === 'doubles')
      return effectiveDraws.find((d) => d.tab === 'doubles' && d.division === activeDoubles)
        ?? effectiveDraws.find((d) => d.tab === 'doubles');
    return effectiveDraws.find((d) => d.tab === activeTab && d.skillGroup === activeSkill && d.zone === activeZone)
      ?? effectiveDraws.find((d) => d.tab === activeTab && d.skillGroup === activeSkill)
      ?? effectiveDraws.find((d) => d.tab === activeTab);
  }, [activeDoubles, activeSkill, activeTab, activeZone, effectiveDraws]);

  // Draw key for currentDraw — recomputed only when currentDraw actually changes, instead of at
  // every one of its many call sites below.
  const currentDrawKey = useMemo(
    () => currentDraw ? getDrawKey(currentDraw.tournamentChoice, currentDraw.division, currentDraw.skillGroup, currentDraw.zone) : '',
    [currentDraw],
  );

  // `zone` is part of the draw's identity (getDrawKey includes it) and MUST be in this filter.
  // Without it two zone draws in the same division/skill are indistinguishable: every destructive
  // path below iterates `currentMatches`, so resetting one zone deleted the other's matches and
  // reversed their players' points. `?? null` keeps pre-zone events behaving as before.
  const currentMatches = useMemo(() => {
    if (!currentDraw) return [];
    return matches
      .filter((m) =>
        m.tournament_choice === currentDraw.tournamentChoice &&
        m.division === currentDraw.division &&
        m.skill_group === currentDraw.skillGroup &&
        // `effectiveZone` treats a missing zone as the default one, so groups generated before
        // zones existed bind to the Downtown-Midtown draw instead of a category of their own.
        effectiveZone(m.zone) === effectiveZone(currentDraw.zone),
      )
      .sort((a, b) => a.position - b.position);
  }, [currentDraw, matches]);

  // Full sorted player list for the current draw — shared by displayMatches and editPlayers.
  const currentDrawAllPlayers = useMemo(() => {
    if (!currentDraw) return [];
    return buildPlayerList(
      filterParticipantsForDraw(participants, currentDraw, effectiveStatsMap, zoneMap, zoneConfig),
      currentDraw,
      effectiveStatsMap,
      userMap,
    );
  }, [currentDraw, participants, effectiveStatsMap, userMap, zoneMap, zoneConfig]);

  // Signed-up count and capacity for EVERY visible draw, so the division tree can show a fill
  // rate ("14/16") per row without opening it. Same filter the current draw uses, just applied
  // across all of them — O(draws × participants), trivial at these sizes.
  const drawCounts = useMemo(() => {
    const out: Record<string, { count: number; size: number }> = {};
    visibleDraws.forEach((d) => {
      const count = filterParticipantsForDraw(
        participants, d, effectiveStatsMap, zoneMap, zoneConfig,
      ).length;
      out[d.label] = {
        count,
        size: previewDrawSize[d.label] ?? getDrawSize(count, d.tournamentChoice),
      };
    });
    return out;
  }, [visibleDraws, participants, effectiveStatsMap, zoneMap, zoneConfig, previewDrawSize]);

  const displayMatches = useMemo(() => {
    if (!currentDraw) return [];
    if (currentMatches.length > 0) return currentMatches;

    const drawsize = previewDrawSize[currentDraw.label] ?? getDrawSize(currentDrawAllPlayers.length, currentDraw.tournamentChoice);
    const templateMatches = normalizeTemplateMatches(fallbackTemplate(drawsize));
    const slotMap = new Map<number, TournamentPlayer>();
    currentDrawAllPlayers.slice(0, drawsize).forEach((p, i) => slotMap.set(i + 1, p));

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
    };
    return templateMatches.map<TournamentMatch>((tm, index) => ({
      id: `preview_${currentDraw.label}_${tm.match_id}`,
      bracket: null,
      started,
      ...buildMatchFields(tm, index, slotMap, cfg),
    }));
  }, [currentDraw, currentDrawAllPlayers, currentMatches, event?.id, previewDrawSize, previewSlotOverrides, started]);


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
    const divisionParticipants = participants.filter((p) => {
      if (p.tournament_choice !== currentDraw.tournamentChoice) return false;
      if (currentDraw.division !== 'All' && p.division !== currentDraw.division) return false;
      return true;
    });
    return buildPlayerList(
      divisionParticipants,
      { ...currentDraw, skillGroup: 'All' },
      effectiveStatsMap,
      userMap,
    );
  }, [editMode, currentDraw, participants, effectiveStatsMap, userMap]);

  const currentDrawSize = displayMatches[0]?.drawsize ?? 16;

  const availableUsers = useMemo(() => {
    const joinedIds = new Set(participants.map((p) => p.uid));
    return Object.entries(allUsers)
      .filter(([id]) => !joinedIds.has(id))
      .map(([id, data]) => ({ id, name: data.name || data.email || id, email: data.email || '' }))
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [allUsers, participants]);

  const opponent = visibleUserMatch && user
    ? (() => {
        const isP1 = visibleUserMatch.player_1_uid === user.uid;
        const opponentUid = isP1 ? visibleUserMatch.player_2_uid : visibleUserMatch.player_1_uid;
        const opponentUser = userMap[opponentUid] ?? allUsers[opponentUid];
        const opponentStats = statsMap[opponentUid];
        const snapshotName = isP1 ? visibleUserMatch.player_2_name : visibleUserMatch.player_1_name;
        // Prefer the live user-doc name (fall back to the match snapshot) so a re-seated or
        // renamed opponent shows current info. Singles only — doubles names embed the partner.
        const isDoubles = visibleUserMatch.tournament_choice === 'Doubles';
        return {
          name: !isDoubles && opponentUser?.name ? formatPlayerName(opponentUser.name) : snapshotName,
          userId: opponentUid,
          contact: '',
          email: opponentUser?.email ?? '',
          phone: opponentUser?.phone ?? '',
          whatsappContact: opponentUser?.whatsapp_contact ?? '',
          whatsappSameAsPhone: !!opponentUser?.whatsapp_same_as_phone,
          preferredContactMethods: opponentUser?.preferred_mode_of_contact,
          round: visibleUserMatch.round,
          skill: opponentStats?.skill_level ?? null,
          wins: opponentStats?.wins ?? 0,
          losses: opponentStats?.loses ?? 0,
        };
      })()
    : null;

  // ── Round Robin derived data ──────────────────────────────────────────────

  const drawFormat = useMemo<TournamentFormat>(
    () => event?.type === 'Tournament' && event?.tournament_format === 'rr' ? 'rr' : 'bracket',
    [event],
  );

  const currentDrawFormat = useMemo<TournamentFormat>(
    () => (currentMatches.some((m) => m.format === 'rr') ? 'rr' : drawFormat),
    [currentMatches, drawFormat],
  );

  // Live-subscribe to the current draw's RR draft doc (edited pre-generation groups + withdrawals).
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
          custom: Array.isArray(d.custom) ? d.custom : [],
          customLabels: Array.isArray(d.labels) ? d.labels : [],
          withdrawn: Array.isArray(d.withdrawn) ? d.withdrawn : [],
        });
      },
      () => setRRDraft(null),
    );
    return () => unsub();
    // Depend on currentDrawKey itself, not its parts: the key includes zone, so listing only
    // choice/division/skillGroup meant switching zones kept the previous zone's draft loaded.
  }, [event?.id, currentDrawFormat, currentDrawKey]);

  // Players the creator withdrew from this draw (persisted) — never auto-placed back.
  const rrWithdrawn = useMemo(() => new Set(rrDraft?.withdrawn ?? []), [rrDraft]);

  // Shared band/zone auto-label computation — used by both the pre-generation preview labels
  // (previewRRLabels) and the post-generation group labels (buildRRLabelsFrom).
  const autoLabelFor = useCallback((idx: number, players: TournamentPlayer[]): string => {
    const zoneOf = (p: TournamentPlayer) => (zoneMap[p.uid] || '').trim();
    const skillOf = (p: TournamentPlayer) => effectiveStatsMap[p.uid]?.skill_level ?? p.skillLevel ?? 0;
    const bandOf = (p: TournamentPlayer) => skillBand(skillOf(p));
    return autoLabel(idx, sharedBand(players, bandOf), sharedZone(players, zoneOf));
  }, [zoneMap, effectiveStatsMap]);

  // Preview groups shown before any RR matches are generated. When the creator has saved a draft
  // arrangement, that (server-persisted) grouping is used; otherwise the SAME skill-first grouping
  // as generation (buildZoneTierGroups). Withdrawn players are excluded either way.
  const previewRRGroups = useMemo<TournamentPlayer[][]>(() => {
    if (currentDrawFormat !== 'rr' || currentMatches.length > 0) return [];
    const available = currentDrawAllPlayers.filter((p) => !rrWithdrawn.has(p.uid));
    if (rrDraft && rrDraft.groups.length > 0) {
      const byId = new Map(available.map((p) => [p.uid, p]));
      return rrDraft.groups.map((uids) =>
        uids.map((uid) => byId.get(uid)).filter((p): p is TournamentPlayer => !!p),
      );
    }
    const skillMap: Record<string, number> = {};
    for (const p of available) {
      skillMap[p.uid] = effectiveStatsMap[p.uid]?.skill_level ?? p.skillLevel ?? 0;
    }
    return buildZoneTierGroups(available, zoneMap, skillMap).map((g) => g.players);
  }, [currentDrawFormat, currentMatches, currentDrawAllPlayers, effectiveStatsMap, zoneMap, rrDraft, rrWithdrawn]);

  // Labels for the preview/draft groups (custom rename shown verbatim, else auto band/zone).
  const previewRRLabels = useMemo<string[]>(() =>
    previewRRGroups.map((players, i) => {
      if (rrDraft?.custom[i]) return rrDraft.customLabels[i] || `Group ${String.fromCharCode(65 + i)}`;
      return autoLabelFor(i, players);
    }), [previewRRGroups, rrDraft, autoLabelFor]);


  const rrGroupMatches = useMemo(
    () => currentMatches.filter((m) => m.format === 'rr' && m.round === 'RR'),
    [currentMatches],
  );

  const rrKnockoutMatches = useMemo(
    () => currentMatches.filter((m) => m.format === 'rr' && m.round !== 'RR'),
    [currentMatches],
  );

  // Sorted unique rr_group values for the current draw. Used to translate a group card's
  // array position (gi) back to its real rr_group value when editing/saving a group.
  const rrGroupIndices = useMemo<number[]>(
    () => [...new Set(rrGroupMatches.map((m) => m.rr_group ?? 0))].sort((a, b) => a - b),
    [rrGroupMatches],
  );

  // Reconstruct group player lists from a set of RR group matches (current or sibling draw).
  // Names resolve live from userMap (fallback to the match-doc snapshot); singles names are
  // overridden, doubles keep the embedded "A / B" value.
  const buildRRGroupsFrom = useCallback((groupMatches: TournamentMatch[], indices: number[]): TournamentPlayer[][] => {
    const isDoubles = groupMatches[0]?.tournament_choice === 'Doubles';
    const liveName = (uid: string, snapshot: string) => {
      const u = userMap[uid];
      return !isDoubles && u?.name ? formatPlayerName(u.name) : snapshot;
    };
    return indices.map((gi) => {
      const groupMs = groupMatches.filter((m) => (m.rr_group ?? 0) === gi);
      const seen = new Set<string>();
      const players: TournamentPlayer[] = [];
      for (const m of groupMs) {
        if (m.player_1_uid && !seen.has(m.player_1_uid)) {
          seen.add(m.player_1_uid);
          players.push({ uid: m.player_1_uid, name: liveName(m.player_1_uid, m.player_1_name), participantId: '' });
        }
        if (m.player_2_uid && !seen.has(m.player_2_uid)) {
          seen.add(m.player_2_uid);
          players.push({ uid: m.player_2_uid, name: liveName(m.player_2_uid, m.player_2_name), participantId: '' });
        }
      }
      return players;
    });
  }, [userMap]);

  // Positional letter (always A, B, C… by display order) re-prefixed onto the stored
  // "band · zone" suffix, recomputed from the group's CURRENT players so it survives any edit.
  // A creator-renamed label (rr_label_custom) is shown verbatim.
  const buildRRLabelsFrom = useCallback((groupMatches: TournamentMatch[], indices: number[]): string[] =>
    indices.map((gi, idx) => {
      const first = groupMatches.find((m) => (m.rr_group ?? 0) === gi);
      const letter = String.fromCharCode(65 + idx);
      if (first?.rr_label_custom) return first.rr_group_label || `Group ${letter}`;
      const players = buildRRGroupsFrom(groupMatches, [gi])[0] ?? [];
      return autoLabelFor(idx, players);
    }), [buildRRGroupsFrom, autoLabelFor]);

  const rrGroups = useMemo<TournamentPlayer[][]>(
    () => (rrGroupMatches.length === 0 ? [] : buildRRGroupsFrom(rrGroupMatches, rrGroupIndices)),
    [rrGroupMatches, rrGroupIndices, buildRRGroupsFrom],
  );

  const rrStandingsByGroup = useMemo<RRStandingRow[][]>(
    () => rrGroups.map((players) => {
      const ids = new Set(players.map((p) => p.uid));
      return computeGroupStandings(rrGroupMatches.filter((m) => ids.has(m.player_1_uid) || ids.has(m.player_2_uid)));
    }),
    [rrGroups, rrGroupMatches],
  );

  const rrConfig = useMemo(() => deriveRRConfig(currentMatches), [currentMatches]);

  const rrGroupLabels = useMemo<string[]>(
    () => (rrGroupMatches.length === 0 ? [] : buildRRLabelsFrom(rrGroupMatches, rrGroupIndices)),
    [rrGroupMatches, rrGroupIndices, buildRRLabelsFrom],
  );

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

  // Sibling skill draws (Beginners/Challengers/Masters, same gender) — the other skill bands a
  // player could have been moved into that this draw needs to dedupe against. Undefined/empty for
  // doubles/merged/Retired Pro draws. Plural because Challengers now has TWO neighbors.
  const rrSiblingDraws = useMemo<DrawConfig[]>(() => {
    if (!currentDraw || currentDraw.tournamentChoice !== 'Singles') return [];
    if (!SKILL_GROUP_ORDER.includes(currentDraw.skillGroup)) return [];
    return effectiveDraws.filter((d) =>
      d.tab === currentDraw.tab && d.skillGroup !== currentDraw.skillGroup && SKILL_GROUP_ORDER.includes(d.skillGroup));
  }, [currentDraw, effectiveDraws]);

  const rrSiblingMatches = useMemo(
    () => (rrSiblingDraws.length === 0 ? [] : matches.filter((m) =>
      m.format === 'rr' && m.round === 'RR' &&
      m.tournament_choice === currentDraw?.tournamentChoice &&
      m.division === currentDraw?.division &&
      rrSiblingDraws.some((d) => d.skillGroup === m.skill_group))),
    [rrSiblingDraws, currentDraw, matches],
  );

  // Cross-draw dedup: remove a player found in both this draw's and the sibling draw's groups.
  //
  // DISABLED. It was the one path that could unseat a player with nobody acting — and if their
  // slot was refilled they lost their place with no record why. Removal is now always deliberate.
  // Kept because the duplicate it guarded is real: fix the cause, don't silently delete a player.
  const AUTO_DEDUPE_ENABLED = false;
  const deduplicatingRef = useRef(false);
  useEffect(() => {
    if (!AUTO_DEDUPE_ENABLED) return;
    if (!isCreator || !event || !currentDraw || rrSiblingDraws.length === 0) return;
    if (rrGroupMatches.length === 0 || rrSiblingMatches.length === 0) return;
    if (deduplicatingRef.current) return;

    const siblingIds = new Set(
      rrSiblingMatches
        .flatMap((m) => [m.player_1_uid, m.player_2_uid])
        .filter((id): id is string => !!id),
    );

    const groupsToFix: Array<{ gi: number; players: TournamentPlayer[] }> = [];
    for (let i = 0; i < rrGroupIndices.length; i++) {
      const gi = rrGroupIndices[i];
      const groupPlayers = rrGroups[i] ?? [];
      const cleaned = groupPlayers.filter((p) => !siblingIds.has(p.uid));
      if (cleaned.length < groupPlayers.length) groupsToFix.push({ gi, players: cleaned });
    }
    if (groupsToFix.length === 0) return;

    deduplicatingRef.current = true;
    const run = async () => {
      try {
        const drawKey = currentDrawKey;
        const advCount = rrConfig?.advancementCount ?? 1;
        const makePairings = (n: number): [number, number][] => n >= 2 ? generateGroupPairings(n) : [[0, 1]];
        const batch = writeBatch(db);
        for (const { gi, players } of groupsToFix) {
          const groupMs = rrGroupMatches.filter((m) => (m.rr_group ?? 0) === gi);
          if (groupMs.some((m) => m.status === 'complete')) continue;
          const groupLabel = groupMs[0]?.rr_group_label ?? `Group ${String.fromCharCode(65 + gi)}`;
          const labelCustom = groupMs[0]?.rr_label_custom ?? false;
          groupMs.forEach((m) => batch.delete(doc(db, 'matches', m.id)));
          if (players.length > 0) {
            buildRRGroupMatchFields({
              eventId: event.id, drawKey, draw: currentDraw,
              groupIndex: gi, groupLabel, labelCustom,
              groupPlayers: players, pairings: makePairings(players.length),
              advancementCount: advCount, started,
            }).forEach(({ docId, fields }) => batch.set(doc(db, 'matches', docId), fields));
          }
        }
        await batch.commit();
      } catch (err) {
        console.error('Cross-draw deduplication failed:', err);
      } finally {
        deduplicatingRef.current = false;
      }
    };
    run();
  }, [isCreator, event?.id, currentDraw?.label, rrGroupMatches, rrSiblingMatches, rrGroupIndices, rrGroups, rrSiblingDraws, rrConfig, started]);

  // Players in the current user's RR group (null if not in RR or not a participant)
  const userRRGroup = useMemo<TournamentPlayer[] | null>(() => {
    if (!user || rrGroups.length === 0) return null;
    return rrGroups.find((g) => g.some((p) => p.uid === user.uid)) ?? null;
  }, [user, rrGroups]);

  // The current user's RR pairing matches (for per-pairing scheduling + score submission).
  const userRRMatches = useMemo<TournamentMatch[]>(() => {
    if (!user) return [];
    return rrGroupMatches.filter((m) => m.player_1_uid === user.uid || m.player_2_uid === user.uid);
  }, [rrGroupMatches, user]);

  // Pending schedule requests across EVERY tournament this organizer runs, not just the one on
  // screen — which is why each row carries its tournament name. One single-field query (no
  // composite index needed); `matches` is readable by any signed-in user, so no rules change.
  const [scheduleRequests, setScheduleRequests] = useState<ScheduleRequest[]>([]);
  useEffect(() => {
    if (!isCreator || !user) { setScheduleRequests([]); return; }
    const mine = new Map(
      allTournamentEvents.filter((e) => e.creator_id === user.uid).map((e) => [e.id, e.title ?? '']),
    );
    if (mine.size === 0) { setScheduleRequests([]); return; }
    return onSnapshot(
      query(collection(db, 'matches'), where('schedule_requested', '==', true)),
      (snap) => setScheduleRequests(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as TournamentMatch))
          .filter((m) => m.status !== 'complete' && mine.has(m.event_id))
          .map((m) => ({ ...m, event_title: mine.get(m.event_id) ?? '' })),
      ),
      // A denied or failed read leaves the queue empty rather than stranding a stale list.
      () => setScheduleRequests([]),
    );
  }, [isCreator, user, allTournamentEvents]);

  /**
   * Everyone registered but seated in no match, across EVERY tournament this organizer runs.
   * Cross-event so a registrant in one tournament can't be invisible while another is on screen,
   * and each row names its event. Nobody is seated automatically now, so this list is the only
   * place a registrant appears until the organizer places them.
   */
  const [unplacedParticipants, setUnplacedParticipants] = useState<UnplacedEntry[]>([]);
  useEffect(() => {
    if (!isCreator || !user) { setUnplacedParticipants([]); return; }
    const myEvents = allTournamentEvents.filter((e) => e.creator_id === user.uid);
    if (myEvents.length === 0) { setUnplacedParticipants([]); return; }

    let alive = true;
    const chunk = <T,>(xs: T[], n: number) =>
      Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));
    const ids = myEvents.map((e) => e.id);
    const titleById = new Map(myEvents.map((e) => [e.id, e.title ?? '']));

    (async () => {
      try {
        const [pSnaps, mSnaps] = await Promise.all([
          Promise.all(chunk(ids, 30).map((c) => getDocs(query(collection(db, 'event_participants'), where('event_id', 'in', c))))),
          Promise.all(chunk(ids, 30).map((c) => getDocs(query(collection(db, 'matches'), where('event_id', 'in', c))))),
        ]);

        // Draws, never events. One event runs Men's/Women's × band × zone side by side, so an
        // event-level test both keeps registrants whose own draw was never generated and hides
        // registrants of a live draw the moment a sibling draw's final is played.
        // `effectiveZone` normalizes the key, so a zone-less legacy draw and its Downtown twin
        // count as one draw rather than two.
        type Draw = { tc: string; division: string; band: string; zone: string; done: boolean; seats: Set<string> };
        const drawsByEvent = new Map<string, Map<string, Draw>>();
        mSnaps.forEach((s) => s.forEach((d) => {
          const m = normalizeTournamentMatch(d.id, d.data());
          if (!m) return;
          if (m.category !== 'singles' && m.category !== 'doubles') return;
          const draws = drawsByEvent.get(m.event_id) ?? new Map<string, Draw>();
          const zone = effectiveZone(m.zone);
          const key = `${m.tournament_choice}|${m.division}|${m.skill_group}|${zone}`;
          const draw = draws.get(key) ?? {
            tc: m.tournament_choice, division: m.division, band: m.skill_group as string,
            zone, done: false, seats: new Set<string>(),
          };
          [m.player_1_uid, m.player_2_uid].forEach((id) => id && draw.seats.add(id));
          if (m.round === 'F' && m.status === 'complete' && m.winner_uid) draw.done = true;
          draws.set(key, draw);
          drawsByEvent.set(m.event_id, draws);
        }));

        const candidates: EventParticipant[] = [];
        const seen = new Set<string>();
        pSnaps.forEach((s) => s.forEach((d) => {
          const p = normalizeEventParticipant(d.id, d.data());
          if (!p) return;
          const key = `${p.event_id}|${p.uid}`;
          if (!p.uid || p.removal || seen.has(key)) return;
          seen.add(key);
          candidates.push(p);
        }));

        // Zone is needed BEFORE the filter, not just for display: a player who changes zone keeps
        // playing the matches they're already in and appears here for the draw in their NEW zone.
        // For the display value, no courts and no hand-picked zone = genuinely no zone —
        // effectiveZone's Downtown default exists for PLACEMENT only, and showing it would report
        // a choice the player never made.
        const uids = [...new Set(candidates.map((r) => r.uid))];
        const prefs = new Map<string, { courts: string[]; zone: string; manual: boolean }>();
        const prefSnaps = uids.length === 0 ? [] : await Promise.all(
          chunk(uids, 30).map((c) => getDocs(query(collection(db, 'preferences'), where(documentId(), 'in', c)))),
        );
        prefSnaps.forEach((s) => s.forEach((d) => prefs.set(d.id, {
          courts: (d.data().preferred_courts ?? []) as string[],
          zone: (d.data().preferred_zone ?? '') as string,
          manual: d.data().preferred_zone_manual === true,
        })));
        const configById = new Map(myEvents.map((e) => [e.id, resolveZoneConfig(e.zone_draw_config)]));

        // Choice/division/band only. Zone is tested separately because it means different things
        // in the two cases below, and folding it in here listed players the creator had moved
        // across skill groups (a 3.5 seated in the Masters draw looked "missing" from Challengers).
        const covering = (dr: Draw, p: EventParticipant) => {
          const band = p.skill_group === 'Retired Pro' ? 'Retired Pro' : skillBand(Number(p.skill || 0));
          return dr.tc === p.tournament_choice
            && (dr.division === p.division || dr.division === 'All')
            && (dr.band === band || dr.band === 'All');
        };
        const inZone = (dr: Draw, p: EventParticipant) =>
          dr.zone === zoneBucketFor(prefs.get(p.uid)?.zone, configById.get(p.event_id));

        const rows = candidates.filter((p) => {
          const live = [...(drawsByEvent.get(p.event_id)?.values() ?? [])].filter((dr) => !dr.done);
          const cov = live.filter((dr) => covering(dr, p));
          if (cov.length === 0) return false;
          const seats = live.filter((dr) => dr.seats.has(p.uid));
          // Registered and never placed — any live draw they belong to is somewhere the organizer
          // could put them, whatever its zone.
          if (seats.length === 0) return true;
          // Zone isn't a doubles draw dimension, so a placed doubles player never resurfaces.
          if (p.tournament_choice === 'Doubles') return false;
          // Already placed. The ONE thing that brings them back is a zone change: every seat they
          // hold is in another zone AND the zone they moved to already has a draw they belong to.
          // They keep every match they're in — nothing here or in functions/zoneMoves.js unseats
          // them; this row is purely so the organizer can place them in the new zone by hand.
          return !seats.some((dr) => inZone(dr, p)) && cov.some((dr) => inZone(dr, p) && !dr.seats.has(p.uid));
        });

        if (!alive) return;
        setUnplacedParticipants(rows.map((p) => {
          const pref = prefs.get(p.uid);
          return {
            participantId: p.id,
            uid: p.uid,
            name: p.user_name || 'Player',
            eventId: p.event_id,
            eventTitle: titleById.get(p.event_id) ?? '',
            division: p.division,
            tournamentChoice: p.tournament_choice,
            skill: p.skill,
            zone: pref && (pref.manual || pref.courts.length > 0) ? pref.zone : '',
          };
        }));
      } catch (err) {
        console.error('Unplaced participants load failed:', err);
        if (alive) setUnplacedParticipants([]);
      }
    })();

    return () => { alive = false; };
  }, [isCreator, user, allTournamentEvents, matches, participants]);

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
            && (m.rr_group ?? 0) === (target.rr_group ?? 0)
            && m.event_id === target.event_id
            && m.tournament_choice === target.tournament_choice
            && m.division === target.division
            && m.skill_group === target.skill_group
            && (m.zone ?? null) === (target.zone ?? null))
          .flatMap((m) => [m.player_1_uid, m.player_2_uid])
          .filter((id): id is string => !!id && id !== uid),
      );
      if (overGroupCap(seated.size + 1)) return;
    }
    try {
      await updateDoc(doc(db, 'matches', matchId), { [`${slot}_name`]: name, [`${slot}_uid`]: uid });
      setMessage({ type: 'success', text: `${formatPlayerName(name)} placed in the draw.` });
    } catch (err) {
      console.error('Seat player failed:', err);
      setMessage({ type: 'error', text: 'Could not place the player.' });
    }
  };

  // Participants who asked the organizer for a different zone (creator-only queue) — notify-only,
  // same shape as scheduleRequests above. The organizer resolves it manually outside the app.
  const zoneChangeRequests = useMemo<EventParticipant[]>(
    () => (isCreator ? participants.filter((p) => p.req_zone_change) : []),
    [isCreator, participants],
  );

  const rrKnockoutReady = useMemo(
    () =>
      rrGroupMatches.length > 0 &&
      rrGroupMatches.every((m) => m.status === 'complete') &&
      rrKnockoutMatches.length === 0,
    [rrGroupMatches, rrKnockoutMatches],
  );

  // ── Internal helpers ──────────────────────────────────────────────────────

  const generateDraw = async (draw: DrawConfig, lockedDrawsize?: number) => {
    if (!event) return;
    const drawParticipants = filterParticipantsForDraw(participants, draw, effectiveStatsMap, zoneMap, zoneConfig);
    const players = buildPlayerList(drawParticipants, draw, effectiveStatsMap, userMap);
    const drawsize = lockedDrawsize ?? previewDrawSize[draw.label] ?? getDrawSize(players.length, draw.tournamentChoice);
    const slicedPlayers = players.slice(0, drawsize);

    const templateMatches = normalizeTemplateMatches(fallbackTemplate(drawsize));
    const slotMap = new Map<number, TournamentPlayer>();
    slicedPlayers.forEach((p, i) => slotMap.set(i + 1, p));

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
    };
    templateMatches.forEach((tm, index) => {
      batch.set(
        doc(db, 'matches', `${event.id}_${drawKey}_${tm.match_id}`),
        { ...buildMatchFields(tm, index, slotMap, cfg), bracket: null, started, created_at: new Date().toISOString() },
        { merge: true },
      );
    });
    await batch.commit();

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
        });
      });
      await advBatch.commit();
    }
  };

  const updateMatchWithSubmission = async (match: TournamentMatch, submission: ScoreSubmission, isWalkover?: boolean, isNoShow?: boolean) => {
    // No show: neither player played, so the only thing that moves is NO_SHOW_POINTS to each.
    // No winner, no games, no matchesPlayed — a match nobody played must not dilute a win rate.
    // Nothing to advance either, which is why this is RR group stage only.
    if (isNoShow) {
      const batch = writeBatch(db);
      batch.update(doc(db, 'matches', match.id), {
        winner_name: '', winner_uid: '',
        set_1_player_1: 0, set_1_player_2: 0,
        set_2_player_1: 0, set_2_player_2: 0,
        set_3_player_1: 0, set_3_player_2: 0,
        status: 'complete',
        no_show: true,
        walkover: false,
        ...(match.status !== 'complete'
          ? { completed_at: new Date().toISOString() }
          : { score_edited_at: new Date().toISOString() }),
        ...(submission.court ? { court: submission.court } : {}),
      });
      const matchLeague = match.tournament_choice === 'Doubles' ? 'Doubles' : match.division;
      [match.player_1_uid, match.player_2_uid].filter(Boolean).forEach((uid) => {
        batch.set(doc(db, 'stats', uid), { leaguePoints26: increment(NO_SHOW_POINTS), league: matchLeague }, { merge: true });
      });
      await batch.commit();
      return { needsManual: false };
    }

    const batch = writeBatch(db);
    batch.update(doc(db, 'matches', match.id), {
      winner_name: submission.claimed_winner_name,
      winner_uid: submission.claimed_winner_uid,
      set_1_player_1: submission.set_1_player_1, set_1_player_2: submission.set_1_player_2,
      set_2_player_1: submission.set_2_player_1, set_2_player_2: submission.set_2_player_2,
      set_3_player_1: submission.set_3_player_1, set_3_player_2: submission.set_3_player_2,
      status: 'complete',
      // completed_at stays pinned to first scoring — re-editing a complete match used to
      // overwrite it with "now", corrupting anything sorted by it. Edits stamp score_edited_at.
      ...(match.status !== 'complete'
        ? { completed_at: new Date().toISOString() }
        : { score_edited_at: new Date().toISOString() }),
      ...(isWalkover ? { walkover: true } : {}),
      ...(submission.court ? { court: submission.court } : {}),
      // Marks this match as scored under the "RR winners score live" formula. Written for the
      // one-off points correction pass (since run, script deleted) to skip matches the live app
      // had already scored; kept as a provenance marker for any future correction pass.
      ...(match.format === 'rr' && match.round === 'RR' ? { rr_winner_pts_v2: true } : {}),
    });

    // Update player stats + league points
    {
      const { loserPts, winnerPts, isFinal, winnerPointsApply } = matchAward(match);
      const matchLeague = match.tournament_choice === 'Doubles' ? 'Doubles' : match.division;
      // Doubles partner uid map — captain uid → their partner's uid. Both captains' partners
      // receive the same stats credit as the captain (games, matches, league points).
      const partnerUidByCaptain = match.tournament_choice === 'Doubles'
        ? new Map(participants
            .filter((p) => p.uid && p.partner_uid)
            .map((p) => [p.uid!, p.partner_uid!]))
        : new Map<string, string>();
      const winnerUid = submission.claimed_winner_uid;
      const loserUid = winnerUid === match.player_1_uid ? match.player_2_uid : match.player_1_uid;

      // Games won per player (set scores are absolute: player_1/2 = match positions)
      const newP1G = (submission.set_1_player_1 ?? 0) + (submission.set_2_player_1 ?? 0) + (submission.set_3_player_1 ?? 0);
      const newP2G = (submission.set_1_player_2 ?? 0) + (submission.set_2_player_2 ?? 0) + (submission.set_3_player_2 ?? 0);
      const newTotal = newP1G + newP2G;
      const winnerIsP1 = winnerUid === match.player_1_uid;

      const statUidsFor = (uid: string) => {
        if (!uid) return [];
        const partnerUid = partnerUidByCaptain.get(uid);
        return partnerUid && partnerUid !== uid ? [uid, partnerUid] : [uid];
      };

      if (match.status !== 'complete') {
        // First confirmation — apply all increments. Doubles partners get the same result as
        // their captain, so the leaderboard reflects individual player totals.
        statUidsFor(winnerUid).forEach((uid) => {
          batch.set(doc(db, 'stats', uid), {
            matchesPlayed: increment(1),
            wins: increment(1),
            league: matchLeague,
            pointswon: increment(winnerIsP1 ? newP1G : newP2G),
            totalPointsPlayed: increment(newTotal),
            ...(winnerPointsApply ? { leaguePoints26: increment(winnerPts) } : {}),
            ...(isFinal ? { tournamentsPlayed: increment(1) } : {}),
          }, { merge: true });
        });
        statUidsFor(loserUid).forEach((uid) => {
          batch.set(doc(db, 'stats', uid), {
            matchesPlayed: increment(1),
            loses: increment(1),
            leaguePoints26: increment(loserPts),
            tournamentsPlayed: increment(1),
            league: matchLeague,
            pointswon: increment(winnerIsP1 ? newP2G : newP1G),
            totalPointsPlayed: increment(newTotal),
          }, { merge: true });
        });
      } else {
        // Re-entry (edit score) — compute per-player delta (new − old) and apply
        const oldWinnerUid = match.winner_uid ?? '';
        const oldP1G = (match.set_1_player_1 ?? 0) + (match.set_2_player_1 ?? 0) + (match.set_3_player_1 ?? 0);
        const oldP2G = (match.set_1_player_2 ?? 0) + (match.set_2_player_2 ?? 0) + (match.set_3_player_2 ?? 0);
        const oldTotal = oldP1G + oldP2G;

        const applyPlayerDelta = (uid: string, isP1: boolean) => {
          if (!uid) return;
          const wasWinner = oldWinnerUid === uid;
          const isWinner = winnerUid === uid;
          const oldGames = isP1 ? oldP1G : oldP2G;
          const newGames = isP1 ? newP1G : newP2G;

          const delta: Record<string, unknown> = {};
          if (isWinner !== wasWinner) {
            delta.wins = increment(isWinner ? 1 : -1);
            delta.loses = increment(isWinner ? -1 : 1);
          }
          const oldPts = wasWinner ? (winnerPointsApply ? winnerPts : 0) : loserPts;
          const newPts = isWinner ? (winnerPointsApply ? winnerPts : 0) : loserPts;
          if (newPts !== oldPts) delta.leaguePoints26 = increment(newPts - oldPts);

          // tournamentsPlayed credit: losers always get +1; final winner also gets +1
          const oldTC = (!wasWinner ? 1 : 0) + (wasWinner && isFinal ? 1 : 0);
          const newTC = (!isWinner ? 1 : 0) + (isWinner && isFinal ? 1 : 0);
          if (newTC !== oldTC) delta.tournamentsPlayed = increment(newTC - oldTC);

          if (newGames !== oldGames) delta.pointswon = increment(newGames - oldGames);
          if (newTotal !== oldTotal) delta.totalPointsPlayed = increment(newTotal - oldTotal);

          if (Object.keys(delta).length > 0) {
            delta.league = matchLeague;
            batch.set(doc(db, 'stats', uid), delta, { merge: true });
          }
        };

        applyPlayerDelta(match.player_1_uid, true);
        applyPlayerDelta(match.player_2_uid, false);

        // Doubles partner delta — same score/match delta the captain received, applied to the
        // partner via the participant-linked partner_uid.
        const applyPartnerDelta = (captainUid: string, isP1: boolean) => {
          const partnerUid = partnerUidByCaptain.get(captainUid);
          if (!partnerUid || partnerUid === captainUid) return;
          const wasCaptainWinner = oldWinnerUid === captainUid;
          const isCaptainWinner = winnerUid === captainUid;

          const partnerDelta: Record<string, unknown> = {};
          if (isCaptainWinner !== wasCaptainWinner) {
            partnerDelta.wins = increment(isCaptainWinner ? 1 : -1);
            partnerDelta.loses = increment(isCaptainWinner ? -1 : 1);
          }
          const oldPartnerPts = wasCaptainWinner ? (winnerPointsApply ? winnerPts : 0) : loserPts;
          const newPartnerPts = isCaptainWinner ? (winnerPointsApply ? winnerPts : 0) : loserPts;
          if (newPartnerPts !== oldPartnerPts) partnerDelta.leaguePoints26 = increment(newPartnerPts - oldPartnerPts);

          const oldPartnerTC = (!wasCaptainWinner ? 1 : 0) + (wasCaptainWinner && isFinal ? 1 : 0);
          const newPartnerTC = (!isCaptainWinner ? 1 : 0) + (isCaptainWinner && isFinal ? 1 : 0);
          if (newPartnerTC !== oldPartnerTC) partnerDelta.tournamentsPlayed = increment(newPartnerTC - oldPartnerTC);

          const oldPartnerGames = isP1 ? oldP1G : oldP2G;
          const newPartnerGames = isP1 ? newP1G : newP2G;
          if (newPartnerGames !== oldPartnerGames) partnerDelta.pointswon = increment(newPartnerGames - oldPartnerGames);
          if (newTotal !== oldTotal) partnerDelta.totalPointsPlayed = increment(newTotal - oldTotal);

          if (Object.keys(partnerDelta).length > 0) {
            partnerDelta.league = matchLeague;
            batch.set(doc(db, 'stats', partnerUid), partnerDelta, { merge: true });
          }
        };

        applyPartnerDelta(match.player_1_uid, true);
        applyPartnerDelta(match.player_2_uid, false);
      }
    }

    await batch.commit();

    // No RR group bonus here: it is awarded by the organizer's "Group Bonus" button
    // (handleAwardGroupBonus), never automatically on the last match completing.

    // Best-effort, AFTER the result is committed, so a missing next-match doc can never roll back
    // the recorded winner, scores, or stats. Resolve the next match from loaded state (real doc
    // id) rather than reconstructing it from the draw key, which breaks for merged/regenerated
    // draws. Returns whether the winner still needs manual placement.
    if (!match.next_match_id) return { needsManual: false };

    // Normalize bracket and zone so undefined and null compare equal (legacy docs).
    // `zone` is essential: template ids (M1, M5…) repeat across zone draws, so without it
    // `matches.find` could overwrite a real player's slot in the OTHER zone, silently.
    const sameDraw = (m: TournamentMatch) =>
      (m.bracket ?? null) === (match.bracket ?? null) &&
      m.tournament_choice === match.tournament_choice &&
      m.division === match.division &&
      m.skill_group === match.skill_group &&
      (m.zone ?? null) === (match.zone ?? null);
    const nextMatch = matches.find((m) => sameDraw(m) && m.match_id === match.next_match_id);
    if (!nextMatch) {
      console.error('Winner recorded, but the next match could not be found in loaded state.');
      return { needsManual: true };
    }
    // Slot: stored next_slot, else inferred from sibling ordering (legacy docs).
    let slot = match.next_slot as 'player_1' | 'player_2' | '' | undefined;
    if (!slot) {
      const siblings = matches
        .filter((m) => sameDraw(m) && m.next_match_id === match.next_match_id)
        .sort((a, b) => a.position - b.position);
      const idx = siblings.findIndex((m) => m.id === match.id);
      slot = idx <= 0 ? 'player_1' : 'player_2';
    }
    try {
      await updateDoc(doc(db, 'matches', nextMatch.id), {
        [`${slot}_name`]: submission.claimed_winner_name,
        [`${slot}_uid`]: submission.claimed_winner_uid,
      });
      return { needsManual: false };
    } catch (err) {
      console.error('Winner recorded, but advancing to the next match failed:', err);
      return { needsManual: true };
    }
  };

  // ── Action handlers ───────────────────────────────────────────────────────

  const handleSaveZoneDrawConfig = async (config: TennisEvent['zone_draw_config']) => {
    if (!isCreator || !event) return;
    const updated: TennisEvent = { ...event, zone_draw_config: config };
    setEvent(updated);
    setAllTournamentEvents((prev) => prev.map((e) => (e.id === event.id ? updated : e)));
    try {
      await updateDoc(doc(db, 'events', event.id), { zone_draw_config: config ?? null });
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

  // Reverse the stats one completed match awarded — the exact inverse of the first-confirmation
  // increments in `updateMatchWithSubmission` — so cancelling a draw restores the leaderboard.
  // (RR group-completion bonuses are reversed separately by `reverseRRBonusesInto`.)
  const reverseMatchStatsInto = (batch: ReturnType<typeof writeBatch>, m: TournamentMatch, partnerUidByCaptain: Map<string, string> = new Map()) => {
    if (m.status !== 'complete') return;
    // No show first: it has no winner_uid, so the guard below would skip it and leave both
    // players holding a point from a match that's being deleted.
    if (m.no_show) {
      [m.player_1_uid, m.player_2_uid].filter(Boolean).forEach((uid) => {
        batch.set(doc(db, 'stats', uid), { leaguePoints26: increment(-NO_SHOW_POINTS) }, { merge: true });
      });
      return;
    }
    if (!m.winner_uid) return;
    const { loserPts, winnerPts, isFinal, winnerPointsApply } = matchAward(m);
    const winnerUid = m.winner_uid;
    const loserUid = winnerUid === m.player_1_uid ? m.player_2_uid : m.player_1_uid;
    // Reverses a stat increment for the uid AND its doubles partner (if any).
    const reverseStat = (uid: string, delta: Record<string, unknown>) => {
      batch.set(doc(db, 'stats', uid), delta, { merge: true });
      const partnerUid = partnerUidByCaptain.get(uid);
      if (partnerUid && partnerUid !== uid) batch.set(doc(db, 'stats', partnerUid), delta, { merge: true });
    };
    const p1G = (m.set_1_player_1 ?? 0) + (m.set_2_player_1 ?? 0) + (m.set_3_player_1 ?? 0);
    const p2G = (m.set_1_player_2 ?? 0) + (m.set_2_player_2 ?? 0) + (m.set_3_player_2 ?? 0);
    const total = p1G + p2G;
    const winnerIsP1 = winnerUid === m.player_1_uid;
    if (winnerUid) {
      reverseStat(winnerUid, {
        matchesPlayed: increment(-1),
        wins: increment(-1),
        pointswon: increment(-(winnerIsP1 ? p1G : p2G)),
        totalPointsPlayed: increment(-total),
        ...(winnerPointsApply ? { leaguePoints26: increment(-winnerPts) } : {}),
        ...(isFinal ? { tournamentsPlayed: increment(-1) } : {}),
      });
    }
    if (loserUid) {
      reverseStat(loserUid, {
        matchesPlayed: increment(-1),
        loses: increment(-1),
        leaguePoints26: increment(-loserPts),
        tournamentsPlayed: increment(-1),
        pointswon: increment(-(winnerIsP1 ? p2G : p1G)),
        totalPointsPlayed: increment(-total),
      });
    }
  };

  // Reverse the leaguePoints26 group bonus for every RR group the organizer awarded one to.
  const reverseRRBonusesInto = (batch: ReturnType<typeof writeBatch>, groupMatches: TournamentMatch[]) => {
    for (const gi of [...new Set(groupMatches.map((m) => m.rr_group ?? 0))]) {
      const ms = groupMatches.filter((m) => (m.rr_group ?? 0) === gi);
      // The stamp is the ONLY proof of payment — a complete group whose bonus was never awarded
      // must not be deducted, or players lose points they never received.
      if (ms.length === 0 || !ms.some((m) => m.rr_group_bonus_v2)) continue;
      const standings = computeGroupStandings(ms);
      standings.forEach((row) => {
        if (row.userId) batch.set(doc(db, 'stats', row.userId), { leaguePoints26: increment(-RR_GROUP_BONUS) }, { merge: true });
      });
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
      const batch = writeBatch(db);
      const partnerUidByCaptain = new Map(participants
        .filter((p) => p.uid && p.partner_uid)
        .map((p) => [p.uid!, p.partner_uid!]));
      completed.forEach((m) => reverseMatchStatsInto(batch, m, partnerUidByCaptain));
      currentMatches.forEach((m) => batch.delete(doc(db, 'matches', m.id)));
      await batch.commit();
      setEditMode(false);
      setPreviewSlotOverrides((prev) => deleteKey(prev, currentDraw.label));
      setPreviewDrawSize((prev) => deleteKey(prev, currentDraw.label));
      // Clear the merge for THIS zone only — cancelling Downtown's merged draw shouldn't unmerge
      // the same division in another zone.
      if (currentDraw.skillGroup === 'All' && currentDraw.tournamentChoice === 'Singles') {
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
      if (typeof slotNum !== 'number') return;
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
          !participants.some((p) => p.uid === player.uid)) {
        let skillLevel = statsMap[player.uid]?.skill_level ?? 0;
        if (!statsMap[player.uid]) {
          const statsSnap = await getDocs(query(collection(db, 'stats'), where('__name__', '==', player.uid)));
          skillLevel = (statsSnap.docs[0]?.data() as UserStats | undefined)?.skill_level ?? 0;
        }
        await addDoc(collection(db, 'event_participants'), {
          uid: player.uid,
          user_name: player.name,
          event_id: event.id,
          event_name: event.title,
          tournament_choice: currentDraw.tournamentChoice,
          division: currentDraw.division !== 'All' ? currentDraw.division : "Men's",
          skill: skillLevel,
          created_at: new Date().toISOString(),
        });
      }

      await updateDoc(doc(db, 'matches', matchId), {
        [`${slot}_name`]: player?.name || BYE,
        [`${slot}_uid`]: player?.uid || '',
      });
    } catch (err) {
      console.error('Edit player failed:', err);
      setMessage({ type: 'error', text: 'Could not update player.' });
    }
  };

  // The creator records scores immediately; a player in the match queues a submission
  // for the creator to confirm (players can't write the official record by security rules).
  const handleSubmitScore = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!scoreForm || !user) return;

    const match = matches.find((m) => m.id === scoreForm.matchDocId);
    if (!match) return;

    const isPlayerInMatch = user.uid === match.player_1_uid || user.uid === match.player_2_uid;
    if (!isCreator && !isPlayerInMatch) return;

    // No Show is the ONE result with no winner, so it's the one case the blank-winner guard below
    // must not reject. Organizer-only and RR group stage only — enforced here as well as in the
    // UI, since the modal's checkbox is only chrome.
    const isNoShow = !!scoreForm.noShow && isCreator && match.format === 'rr' && match.round === 'RR';

    // Without this the match completes with winner_uid: '', which displays player 2 as winner,
    // credits player 1 with a loss, awards nobody a win, and writes an empty uid into the next
    // round. The ladder and friendly paths already guard this.
    if (!isNoShow && !scoreForm.winnerUserId) {
      setMessage({ type: 'error', text: 'Please choose who won the match.' });
      return;
    }

    const parsedSets = scoreForm.sets.map((s) => ({
      mine: Number(s.mine || 0),
      opponent: Number(s.opponent || 0),
    }));
    if (parsedSets.some((s) => !Number.isInteger(s.mine) || !Number.isInteger(s.opponent) || s.mine < 0 || s.opponent < 0)) {
      setMessage({ type: 'error', text: 'Scores must be non-negative whole numbers.' });
      return;
    }

    // Map entered scores to absolute player_1/player_2 positions. The creator enters from
    // player_1's perspective; a player enters from their own ("mine" = their own score).
    const submitterIsP1 = isCreator ? true : user.uid === match.player_1_uid;
    const p1Scores = parsedSets.map((s) => (submitterIsP1 ? s.mine : s.opponent));
    const p2Scores = parsedSets.map((s) => (submitterIsP1 ? s.opponent : s.mine));

    // A no-show has no winner and no games, whatever the form happened to hold.
    const submission: ScoreSubmission = isNoShow ? {
      claimed_winner_name: '',
      claimed_winner_uid: '',
      set_1_player_1: 0, set_1_player_2: 0,
      set_2_player_1: 0, set_2_player_2: 0,
      set_3_player_1: 0, set_3_player_2: 0,
      ...(scoreForm.court.trim() ? { court: scoreForm.court.trim() } : {}),
    } : {
      claimed_winner_name: scoreForm.winnerUserId === match.player_1_uid ? match.player_1_name : match.player_2_name,
      claimed_winner_uid: scoreForm.winnerUserId,
      set_1_player_1: p1Scores[0], set_1_player_2: p2Scores[0],
      set_2_player_1: p1Scores[1], set_2_player_2: p2Scores[1],
      set_3_player_1: p1Scores[2], set_3_player_2: p2Scores[2],
      ...(scoreForm.court.trim() ? { court: scoreForm.court.trim() } : {}),
    };

    // A no-show is also all-zeros, so it must win this test — otherwise it'd be filed as a
    // walkover and pay 3/1 to a winner that doesn't exist.
    const isWalkover = !isNoShow && parsedSets.every((s) => s.mine === 0 && s.opponent === 0);

    // Player path → queue a pending submission for the creator to confirm.
    if (!isCreator) {
      try {
        await addDoc(collection(db, 'matches'), {
          category: 'score_submission',
          event_id: match.event_id,
          match_id: match.id,
          match_round: match.round,
          draw_label: currentDraw?.label ?? '',
          player_1_name: match.player_1_name,
          player_2_name: match.player_2_name,
          submitted_by: user.uid,
          submitted_by_name: profile?.user?.name || userParticipant?.user_name || 'Player',
          is_walkover: isWalkover,
          ...submission,
          created_at: new Date().toISOString(),
        });
        setScoreForm(null);
        setMessage({ type: 'success', text: '✓ Completed.' });
      } catch (err) {
        console.error('Score submission failed:', err);
        setMessage({ type: 'error', text: 'Could not submit your score. Please try again.' });
      }
      return;
    }

    // Creator path → record immediately.
    try {
      const { needsManual } = await updateMatchWithSubmission(match, submission, isWalkover, isNoShow);
      setScoreForm(null);
      setMessage(
        isNoShow
          ? { type: 'success', text: 'Recorded as a no show — 1 point to each player.' }
          : needsManual
            ? { type: 'error', text: 'Score recorded, but the winner could not be auto-advanced. Use Edit Draw to place them manually.' }
            : { type: 'success', text: 'Score recorded and draw updated.' },
      );
    } catch (err) {
      console.error('Score submission failed:', err);
      setMessage({ type: 'error', text: 'Could not record score. Please try again.' });
    }
  };

  // Creator confirms a player-submitted score → records it officially, then removes the pending doc.
  const handleConfirmSubmission = async (sub: ScoreSubmissionDoc) => {
    if (!isCreator) return;
    const match = matches.find((m) => m.id === sub.match_id);
    // Stale: match gone or already scored — discard without re-scoring/re-advancing.
    if (!match || match.status === 'complete') {
      // Don't claim it was cleared if the write failed — the organizer would keep seeing the
      // same submission in the queue with no idea why.
      const cleared = await updateDoc(doc(db, 'matches', sub.id), resolvedStamp('superseded'))
        .then(() => true)
        .catch(() => false);
      setMessage(cleared
        ? { type: 'error', text: 'That match is already scored. The submission was kept on record but not applied.' }
        : { type: 'error', text: 'That match is already scored, but the submission could not be cleared. Please try again.' });
      return;
    }
    const submission: ScoreSubmission = {
      claimed_winner_name: sub.claimed_winner_name,
      claimed_winner_uid: sub.claimed_winner_uid,
      set_1_player_1: sub.set_1_player_1, set_1_player_2: sub.set_1_player_2,
      set_2_player_1: sub.set_2_player_1, set_2_player_2: sub.set_2_player_2,
      set_3_player_1: sub.set_3_player_1, set_3_player_2: sub.set_3_player_2,
      ...(sub.court ? { court: sub.court } : {}),
    };
    try {
      const { needsManual } = await updateMatchWithSubmission(match, submission, sub.is_walkover);
      await updateDoc(doc(db, 'matches', sub.id), resolvedStamp('confirmed'));
      setMessage(
        needsManual
          ? { type: 'error', text: 'Score confirmed, but the winner could not be auto-advanced. Use Edit Draw to place them manually.' }
          : { type: 'success', text: 'Score confirmed and draw updated.' },
      );
    } catch (err) {
      console.error('Confirm submission failed:', err);
      setMessage({ type: 'error', text: 'Could not confirm the score. Please try again.' });
    }
  };

  /**
   * Organizer-only: send ONE completed match back to unplayed.
   *
   * Until now the only way to undo a score was Cancel Matches, which deletes the entire draw and
   * reverses every completed match in it. This reverses exactly the stats this one match awarded —
   * `reverseMatchStatsInto` already covers walkovers, no-shows and doubles partner credits — and
   * pulls the advanced winner back out of the next round.
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
      const batch = writeBatch(db);
      const partnerUidByCaptain = new Map(participants
        .filter((p) => p.uid && p.partner_uid)
        .map((p) => [p.uid!, p.partner_uid!]));
      reverseMatchStatsInto(batch, match, partnerUidByCaptain);
      batch.update(doc(db, 'matches', match.id), {
        status: 'pending',
        winner_uid: '', winner_name: '',
        set_1_player_1: 0, set_1_player_2: 0,
        set_2_player_1: 0, set_2_player_2: 0,
        set_3_player_1: 0, set_3_player_2: 0,
        walkover: false,
        no_show: false,
      });

      // Un-advance the winner. Same draw-matching rules as advancement (bracket and zone
      // normalized), and never touch a next-round match that has ALREADY been played — that
      // result belongs to whoever played it, whatever we think of this one.
      if (match.next_match_id && match.winner_uid) {
        const sameDraw = (m: TournamentMatch) =>
          (m.bracket ?? null) === (match.bracket ?? null) &&
          m.tournament_choice === match.tournament_choice &&
          m.division === match.division &&
          m.skill_group === match.skill_group &&
          (m.zone ?? null) === (match.zone ?? null);
        const next = matches.find((m) => sameDraw(m) && m.match_id === match.next_match_id);
        if (next && next.status !== 'complete') {
          const slot = next.player_1_uid === match.winner_uid ? 'player_1'
            : next.player_2_uid === match.winner_uid ? 'player_2' : null;
          if (slot) {
            batch.update(doc(db, 'matches', next.id), {
              [`${slot}_name`]: PLAYER_LOADING,
              [`${slot}_uid`]: '',
            });
          }
        }
      }

      await batch.commit();
      setScoreForm(null);
      setMessage({ type: 'success', text: 'Score reset — the match is unplayed again.' });
    } catch (err) {
      console.error('Reset match score failed:', err);
      setMessage({ type: 'error', text: 'Could not reset the score. Please try again.' });
    }
  };

  const handleRejectSubmission = async (sub: ScoreSubmissionDoc) => {
    if (!isCreator) return;
    try {
      // Kept, not deleted — a rejected claim is exactly the one worth being able to look up later.
      await updateDoc(doc(db, 'matches', sub.id), resolvedStamp('rejected'));
      setMessage({ type: 'success', text: 'Submission rejected.' });
    } catch (err) {
      console.error('Reject submission failed:', err);
      setMessage({ type: 'error', text: 'Could not reject the submission.' });
    }
  };

  const handleAddPlayer = async (userId: string, partnerName?: string, divisionOverride?: string) => {
    if (!event || !isCreator || !currentDraw) return;
    if (userId === PLAYER_LOADING_SENTINEL) {
      const division = divisionOverride ?? (currentDraw.division !== 'All' ? currentDraw.division : "Men's");
      try {
        await addDoc(collection(db, 'event_participants'), {
          uid: `__loading_${Date.now()}`,
          user_name: PLAYER_LOADING,
          event_id: event.id,
          event_name: event.title,
          tournament_choice: currentDraw.tournamentChoice,
          division,
          skill: 0,
          created_at: new Date().toISOString(),
        });
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
      await addDoc(collection(db, 'event_participants'), {
        uid: userId,
        user_name: userData.name,
        event_id: event.id,
        event_name: event.title,
        tournament_choice: currentDraw.tournamentChoice,
        division,
        skill: skillLevel,
        ...(partnerName ? { doubles: partnerName, partner_in_app: 'no' } : {}),
        created_at: new Date().toISOString(),
      });
      // Re-adding a player clears any prior withdrawal so they can be grouped again.
      if (currentDrawFormat === 'rr') { manuallyUnplacedIdsRef.current.delete(userId); await setRRWithdrawnMembership([], [userId]); }
      // A previously removed player who is re-added becomes active again.
      const priorRemoved = participants.filter((p) => p.uid === userId && p.removal);
      await Promise.all(priorRemoved.map((p) =>
        updateDoc(doc(db, 'event_participants', p.id), { removal: false })));
      setMessage({ type: 'success', text: `${userData.name} added. Use Move Players to assign their bracket.` });
    } catch (err) {
      console.error('Add player failed:', err);
      setMessage({ type: 'error', text: 'Could not add player.' });
    }
  };

  /**
   * Soft delete: the `event_participants` row survives with `removal: true`, and completed
   * matches and earned stats are left as they are. Their slot becomes Player Loading — shown in a
   * knockout so there's somewhere to drop a replacement, hidden in RR groups where it's noise.
   */
  const handleRemovePlayer = async (uid: string) => {
    if (!isCreator || !event || !uid) return;
    try {
      const rows = participants.filter((p) => p.uid === uid);
      const batch = writeBatch(db);
      rows.forEach((p) => batch.update(doc(db, 'event_participants', p.id), {
        removal: true,
        removal_at: new Date().toISOString(),
      }));
      // Blank them out of any unplayed match in this draw. Played matches keep their record —
      // rewriting a completed result to Player Loading would orphan the score.
      currentMatches
        .filter((m) => m.status !== 'complete')
        .forEach((m) => {
          if (m.player_1_uid === uid) batch.update(doc(db, 'matches', m.id), { player_1_uid: '', player_1_name: PLAYER_LOADING });
          if (m.player_2_uid === uid) batch.update(doc(db, 'matches', m.id), { player_2_uid: '', player_2_name: PLAYER_LOADING });
        });
      await batch.commit();
      // RR auto-placement would otherwise seat them again on the next pass.
      if (currentDrawFormat === 'rr') { manuallyUnplacedIdsRef.current.add(uid); await setRRWithdrawnMembership([uid]); }
      setMessage({ type: 'success', text: 'Player removed from the draw.' });
    } catch (err) {
      console.error('Remove player failed:', err);
      setMessage({ type: 'error', text: 'Could not remove the player.' });
    }
  };

  const scoreFormMatch = useMemo(
    () => (scoreForm ? (matches.find((m) => m.id === scoreForm.matchDocId) ?? null) : null),
    [matches, scoreForm],
  );

  const handleOpenScoreForm = (match: TournamentMatch) => {
    if (!match || !user) return;
    setScoreForm({
      matchDocId: match.id,
      winnerUserId: match.player_1_uid,
      sets: [{ mine: '', opponent: '' }, { mine: '', opponent: '' }, { mine: '', opponent: '' }],
      court: match.court ?? '',
    });
  };

  // ── Round Robin action handlers ───────────────────────────────────────────

  const rrDraftKey = () => currentDraw
    ? currentDrawKey : '';

  // Persist an edited pre-generation grouping to the draft doc (no matches written). Empty groups
  // are dropped so groups/labels/custom stay aligned; players placed back into a group are removed
  // from the withdrawn list.
  const saveRRDraft = async (groups: TournamentPlayer[][], labels: string[], custom: boolean[], withdrawnExtra: string[] = []) => {
    if (!event || !currentDraw) return;
    const rows = groups
      .map((g, i) => ({ uids: g.map((p) => p.uid), label: labels[i] ?? '', c: custom[i] ?? false }))
      .filter((r) => r.uids.length > 0);
    const placed = new Set(rows.flatMap((r) => r.uids));
    const withdrawn = [...new Set([...(rrDraft?.withdrawn ?? []), ...withdrawnExtra])].filter((uid) => !placed.has(uid));
    await setDoc(doc(db, 'events', event.id, 'rr_drafts', rrDraftKey()), {
      event_id: event.id,
      draw_key: rrDraftKey(),
      groups: rows.map((r) => r.uids.join(',')),
      labels: rows.map((r) => r.label),
      custom: rows.map((r) => r.c),
      withdrawn,
      updated_at: new Date().toISOString(),
    });
  };

  // Merge/remove withdrawn uids on the draft doc without disturbing the group arrangement — used
  // post-generation (Player Loading = durable removal) and by Add Player (un-withdraw).
  const setRRWithdrawnMembership = async (add: string[], remove: string[] = []) => {
    if (!event || !currentDraw) return;
    const next = [...new Set([...(rrDraft?.withdrawn ?? []), ...add])].filter((u) => !remove.includes(u));
    await setDoc(doc(db, 'events', event.id, 'rr_drafts', rrDraftKey()), {
      event_id: event.id, draw_key: rrDraftKey(), withdrawn: next, updated_at: new Date().toISOString(),
    }, { merge: true });
  };

  const handleGenerateRR = async (config: RRConfig) => {
    if (!isCreator || !event || !currentDraw) return;
    setGeneratingRR(true);
    setMessage(null);
    try {
      const drawKey = currentDrawKey;
      // Generate from what the creator sees (the draft arrangement if they edited one, else the
      // computed preview), so the confirmed groups + names match the preview exactly.
      const groups = previewRRGroups;
      const labels = previewRRLabels;
      const batch = writeBatch(db);
      // Clear any existing RR docs for this draw first so re-generating can't leave
      // orphaned groups/matches behind (deterministic doc IDs only overwrite a matching
      // group+match index; fewer/smaller groups would otherwise strand the old docs).
      currentMatches.filter((m) => m.format === 'rr').forEach((m) => batch.delete(doc(db, 'matches', m.id)));
      groups.forEach((players, gi) => {
        const pairings = players.length >= 2 ? generateGroupPairings(players.length) : [[0, 1]] as [number, number][];
        buildRRGroupMatchFields({
          eventId: event.id, drawKey, draw: currentDraw,
          groupIndex: gi, groupLabel: labels[gi] ?? `Group ${String.fromCharCode(65 + gi)}`,
          labelCustom: !!rrDraft?.custom[gi],
          groupPlayers: players, pairings,
          advancementCount: config.advancementCount, started,
        }).forEach(({ docId, fields }) => {
          batch.set(doc(db, 'matches', docId), fields);
        });
      });
      await batch.commit();
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

  // `rrGroup` is the real rr_group value (not the card's array position) — the caller
  // translates via rrGroupIndices so non-contiguous group indices resolve correctly.
  const handleSaveGroupEdit = async (rrGroup: number, newPlayers: TournamentPlayer[]) => {
    if (!isCreator || !event || !currentDraw) return;
    if (overGroupCap(newPlayers.length)) return;
    const drawKey = currentDrawKey;
    const advCount = rrConfig?.advancementCount ?? 1;

    // Draft state (no matches yet): apply the edit to the preview arrangement and persist it as a
    // draft — nothing is generated. Moved players are removed from their source groups.
    if (rrGroupMatches.length === 0) {
      try {
        const real = newPlayers.filter((p) => p.uid && p.uid !== PLAYER_LOADING_SENTINEL);
        const movedIn = new Set(real.map((p) => p.uid));
        const nextGroups = previewRRGroups.map((groupPlayers, gi) =>
          gi === rrGroup ? real : groupPlayers.filter((p) => !movedIn.has(p.uid)),
        );
        const nextCustom = previewRRGroups.map((_, i) => !!rrDraft?.custom[i]);
        await saveRRDraft(nextGroups, previewRRLabels, nextCustom);
        setMessage({ type: 'success', text: 'Group updated.' });
      } catch (err) {
        console.error('Group draft save failed:', err);
        setMessage({ type: 'error', text: 'Could not save group changes.' });
      }
      return;
    }

    let removedUids: string[];
    // drawKey → uids to withdraw there too, for a removed player who also has leftover match
    // docs in a draw other than the one being edited (a sibling skill draw, most commonly).
    const extraWithdrawnByDrawKey = new Map<string, Set<string>>();
    try {
      const batch = writeBatch(db);
      const queuedDeleteIds = new Set<string>();
      const queueDelete = (id: string) => {
        if (queuedDeleteIds.has(id)) return;
        queuedDeleteIds.add(id);
        batch.delete(doc(db, 'matches', id));
      };

      {
        // Rewrite the target group and atomically update source groups for players moved in.
        // A move protects someone who has already played here (below), but an outright removal
        // always proceeds — a departed player can't sensibly keep a match here.
        const oldMatches = rrGroupMatches.filter((m) => (m.rr_group ?? 0) === rrGroup);
        const groupLabel = oldMatches[0]?.rr_group_label ?? `Group ${String.fromCharCode(65 + rrGroup)}`;
        const labelCustom = oldMatches[0]?.rr_label_custom ?? false;

        // Strip PLAYER_LOADING sentinels — they must not generate match pairings.
        const realNewPlayers = newPlayers.filter((p) => p.uid !== PLAYER_LOADING_SENTINEL);
        // Players replaced with PLAYER_LOADING are withdrawn — persisted below so auto-placement
        // never re-adds them (even after a refresh).
        const prevPlayers = buildRRGroupsFrom(oldMatches, [rrGroup])[0] ?? [];
        removedUids = prevPlayers
          .filter((p) => p.uid && !realNewPlayers.some((np) => np.uid === p.uid))
          .map((p) => p.uid);
        removedUids.forEach((uid) => manuallyUnplacedIdsRef.current.add(uid));

        const existingIds = new Set<string>();
        oldMatches.forEach((m) => {
          if (m.player_1_uid) existingIds.add(m.player_1_uid);
          if (m.player_2_uid) existingIds.add(m.player_2_uid);
        });

        // Collect edits needed on source groups for cross-group moves. Only a player who has
        // personally played a match in their current group is protected from being moved out.
        const srcEdits = new Map<number, { players: TournamentPlayer[]; label: string; labelCustom: boolean }>();
        for (const p of newPlayers) {
          if (!p.uid || existingIds.has(p.uid)) continue;
          for (const srcGi of rrGroupIndices) {
            if (srcGi === rrGroup) continue;
            const srcMs = rrGroupMatches.filter((m) => (m.rr_group ?? 0) === srcGi);
            const srcPlayers = buildRRGroupsFrom(srcMs, [srcGi])[0] ?? [];
            if (!srcPlayers.some((sp) => sp.uid === p.uid)) continue;
            if (srcMs.some((m) => m.status === 'complete' && (m.player_1_uid === p.uid || m.player_2_uid === p.uid))) {
              setMessage({ type: 'error', text: 'Cannot move: this player has already played a match in their current group.' });
              return;
            }
            const prevSrcEdit = srcEdits.get(srcGi);
            const basePlayers = prevSrcEdit ? prevSrcEdit.players : srcPlayers;
            srcEdits.set(srcGi, {
              players: basePlayers.filter((sp) => sp.uid !== p.uid),
              label: srcMs[0]?.rr_group_label ?? `Group ${String.fromCharCode(65 + srcGi)}`,
              labelCustom: srcMs[0]?.rr_label_custom ?? false,
            });
            break;
          }
        }

        const rewrite = buildSafeGroupRewrite({
          eventId: event.id, drawKey, draw: currentDraw,
          groupIndex: rrGroup, groupLabel, labelCustom,
          oldMatches, newPlayers: realNewPlayers,
          advancementCount: advCount, started,
        });
        rewrite.toDelete.forEach((id) => queueDelete(id));
        rewrite.toWrite.forEach(({ docId, fields }) => batch.set(doc(db, 'matches', docId), fields));

        for (const [srcGi, srcEdit] of srcEdits) {
          const srcMs = rrGroupMatches.filter((m) => (m.rr_group ?? 0) === srcGi);
          const srcRewrite = buildSafeGroupRewrite({
            eventId: event.id, drawKey, draw: currentDraw,
            groupIndex: srcGi, groupLabel: srcEdit.label, labelCustom: srcEdit.labelCustom,
            oldMatches: srcMs, newPlayers: srcEdit.players,
            advancementCount: advCount, started,
          });
          srcRewrite.toDelete.forEach((id) => queueDelete(id));
          srcRewrite.toWrite.forEach(({ docId, fields }) => batch.set(doc(db, 'matches', docId), fields));
        }
      }

      // Purge the player from the WHOLE event, not just this group — any match doc still listing
      // them (another RR group, a sibling skill draw, the knockout) is deleted, played or not.
      // One leftover doc keeps reconstructing their name on the group card and lets the
      // late-joiner effect re-seat them the moment they look "unplaced but registered".
      if (removedUids.length) {
        const removedSet = new Set(removedUids);
        matches.forEach((m) => {
          if (!removedSet.has(m.player_1_uid ?? '') && !removedSet.has(m.player_2_uid ?? '')) return;
          queueDelete(m.id);
          if (m.format === 'rr' && m.round === 'RR' && m.tournament_choice && m.division && m.skill_group) {
            const otherDrawKey = getDrawKey(m.tournament_choice, m.division, m.skill_group, m.zone);
            if (otherDrawKey === drawKey) return;
            if (!extraWithdrawnByDrawKey.has(otherDrawKey)) extraWithdrawnByDrawKey.set(otherDrawKey, new Set());
            const uidsHere = extraWithdrawnByDrawKey.get(otherDrawKey)!;
            if (removedSet.has(m.player_1_uid ?? '')) uidsHere.add(m.player_1_uid!);
            if (removedSet.has(m.player_2_uid ?? '')) uidsHere.add(m.player_2_uid!);
          }
        });
      }

      // Deregister from the event entirely — this is what stops the late-joiner effect finding
      // them again. Withdrawing only in the draws with a leftover match doc isn't enough:
      // `event_participants` is what routes a player into a draw by skill, so while it exists
      // they can be auto-placed into a DIFFERENT draw. Re-adding goes through Add Player.
      if (removedUids.length) {
        const removedSet = new Set(removedUids);
        participants.forEach((p) => {
          if (removedSet.has(p.uid)) batch.delete(doc(db, 'event_participants', p.id));
        });
      }

      // Same batch as the match-doc changes, so both commit atomically. Written separately, the
      // matches change reaches onSnapshot (and the late-joiner effect) before the withdrawn
      // list's round trip finishes, so the just-removed player could be re-seated before the
      // withdrawal was ever visible — persisting across a reload.
      if (removedUids.length) {
        const nextWithdrawn = [...new Set([...(rrDraft?.withdrawn ?? []), ...removedUids])];
        batch.set(doc(db, 'events', event.id, 'rr_drafts', rrDraftKey()), {
          event_id: event.id, draw_key: rrDraftKey(), withdrawn: nextWithdrawn, updated_at: new Date().toISOString(),
        }, { merge: true });
      }
      // A different draw's rr_drafts doc isn't loaded client-side, so its existing withdrawn
      // list is unknown here — arrayUnion appends without needing (or risking clobbering) it.
      for (const [otherDrawKey, uids] of extraWithdrawnByDrawKey) {
        batch.set(doc(db, 'events', event.id, 'rr_drafts', otherDrawKey), {
          event_id: event.id, draw_key: otherDrawKey, withdrawn: arrayUnion(...uids), updated_at: new Date().toISOString(),
        }, { merge: true });
      }

      await batch.commit();
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
    const nextIndex = (rrGroupIndices.length ? Math.max(...rrGroupIndices) : -1) + 1;
    const advCount = rrConfig?.advancementCount ?? 1;
    const trimmed = (label ?? '').trim();

    // Draft state: append a new group to the draft (no matches written).
    if (rrGroupMatches.length === 0) {
      try {
        const real = newPlayers.filter((p) => p.uid && p.uid !== PLAYER_LOADING_SENTINEL);
        if (real.length === 0) return;
        const movedIn = new Set(real.map((p) => p.uid));
        const base = previewRRGroups.map((g) => g.filter((p) => !movedIn.has(p.uid)));
        const nextGroups = [...base, real];
        const nextLabels = [...previewRRLabels, trimmed];
        const nextCustom = [...previewRRGroups.map((_, i) => !!rrDraft?.custom[i]), !!trimmed];
        await saveRRDraft(nextGroups, nextLabels, nextCustom);
        setMessage({ type: 'success', text: 'Group created.' });
      } catch (err) {
        console.error('RR draft group create failed:', err);
        setMessage({ type: 'error', text: 'Could not create the group.' });
      }
      return;
    }

    // 0 or 1 player → placeholder match so the empty/solo group remains visible.
    const pairings: [number, number][] = newPlayers.length >= 2 ? generateGroupPairings(newPlayers.length) : [[0, 1]];
    try {
      const batch = writeBatch(db);
      buildRRGroupMatchFields({
        eventId: event.id, drawKey, draw: currentDraw,
        groupIndex: nextIndex,
        groupLabel: trimmed || `Group ${String.fromCharCode(65 + nextIndex)}`,
        labelCustom: !!trimmed,
        groupPlayers: newPlayers,
        pairings,
        advancementCount: advCount, started,
      }).forEach(({ docId, fields }) => batch.set(doc(db, 'matches', docId), fields));
      await batch.commit();
      setMessage({ type: 'success', text: 'Group created.' });
    } catch (err) {
      console.error('RR group create failed:', err);
      setMessage({ type: 'error', text: 'Could not create the group.' });
    }
  };

  // Rename a group. A non-empty label is stored as a custom label (shown verbatim); empty is a
  // no-op (labels revert to auto only when the group is regenerated).
  const handleRenameGroup = async (rrGroup: number, label: string) => {
    if (!isCreator || !event || !currentDraw) return;
    const trimmed = label.trim();
    if (!trimmed) return;

    // Draft state: store the custom label on the draft (no matches yet).
    if (rrGroupMatches.length === 0) {
      try {
        const nextLabels = previewRRLabels.map((l, i) => (i === rrGroup ? trimmed : l));
        const nextCustom = previewRRGroups.map((_, i) => (i === rrGroup ? true : !!rrDraft?.custom[i]));
        await saveRRDraft(previewRRGroups, nextLabels, nextCustom);
        setMessage({ type: 'success', text: 'Group renamed.' });
      } catch (err) {
        console.error('RR draft rename failed:', err);
        setMessage({ type: 'error', text: 'Could not rename the group.' });
      }
      return;
    }

    const groupMatches = rrGroupMatches.filter((m) => (m.rr_group ?? 0) === rrGroup);
    if (groupMatches.length === 0) return;
    try {
      const batch = writeBatch(db);
      groupMatches.forEach((m) => batch.update(doc(db, 'matches', m.id), { rr_group_label: trimmed, rr_label_custom: true }));
      await batch.commit();
      setMessage({ type: 'success', text: 'Group renamed.' });
    } catch (err) {
      console.error('RR group rename failed:', err);
      setMessage({ type: 'error', text: 'Could not rename the group.' });
    }
  };

  // Organizer's Group Bonus switch: pays every player in one RR group `RR_GROUP_BONUS`, or takes it
  // back. This is the ONLY way the bonus moves — scoring a group's last match awards nothing.
  // `rr_group_bonus_v2` on every match in the group IS the switch's state: it makes the payout
  // idempotent, and `reverseRRBonusesInto` reads it to know whether a reset owes a deduction.
  const handleSetGroupBonus = async (rrGroup: number, award: boolean) => {
    if (!isCreator || !event || !currentDraw) return;
    const groupMatches = rrGroupMatches.filter((m) => (m.rr_group ?? 0) === rrGroup);
    if (groupMatches.length === 0) return;
    // Already in the requested state — nothing to pay or refund.
    if (groupMatches.some((m) => m.rr_group_bonus_v2) === award) return;
    const recipients = computeGroupStandings(groupMatches).filter((r) => r.userId);
    if (recipients.length === 0) return;
    const pending = groupMatches.filter((m) => m.status !== 'complete').length;
    if (!window.confirm(award
      ? `Award ${RR_GROUP_BONUS} points to all ${recipients.length} players in this group?`
        + (pending > 0 ? `\n\n${pending} match${pending > 1 ? 'es are' : ' is'} still unplayed.` : '')
      : `Take the ${RR_GROUP_BONUS}-point bonus back from all ${recipients.length} players in this group?`,
    )) return;
    try {
      const batch = writeBatch(db);
      const delta = award ? RR_GROUP_BONUS : -RR_GROUP_BONUS;
      recipients.forEach((row) => batch.set(doc(db, 'stats', row.userId), { leaguePoints26: increment(delta) }, { merge: true }));
      groupMatches.forEach((m) => batch.set(doc(db, 'matches', m.id), { rr_group_bonus_v2: award }, { merge: true }));
      await batch.commit();
      setMessage({ type: 'success', text: award ? `Group bonus awarded to ${recipients.length} players.` : 'Group bonus taken back.' });
    } catch (err) {
      console.error('RR group bonus failed:', err);
      setMessage({ type: 'error', text: 'Could not update the group bonus.' });
    }
  };

  // ── Match scheduling ──────────────────────────────────────────────────────
  // Players may write only the scheduling fields (Firestore rules carve-out); scores stay
  // organizer-only. Preview (ungenerated) matches have no doc, so they're guarded out.
  type SchedulePatch = {
    schedule_requested?: boolean;
    proposed_date?: string;
    proposed_slot?: 'AM' | 'PM';
    schedule_status?: string;
  };
  const writeSchedule = async (matchId: string, patch: SchedulePatch, successText: string) => {
    if (!matchId || matchId.startsWith('preview_')) return;
    try {
      await updateDoc(doc(db, 'matches', matchId), patch);
      setMessage({ type: 'success', text: successText });
    } catch (err) {
      console.error('Schedule update failed:', err);
      setMessage({ type: 'error', text: 'Could not update the schedule.' });
    }
  };

  const handleAskOrganizerSchedule = async (match: TournamentMatch) => {
    // Setting schedule_requested is all the client does — a Cloud Function watches for the flag
    // and notifies the organizer (clients can no longer write notifications directly).
    await writeSchedule(match.id, { schedule_requested: true }, 'The organizer has been asked to schedule this match.');
  };

  // Organizer sets the schedule authoritatively (also clears any player request).
  const handleSetSchedule = (match: TournamentMatch, date: string, slot: 'AM' | 'PM') => {
    if (!isCreator || !date) return;
    return writeSchedule(match.id, {
      proposed_date: date, proposed_slot: slot, schedule_status: 'scheduled', schedule_requested: false,
    }, 'Schedule set.');
  };

  /**
   * A doubles participant fills in the partner their registration is missing. Writes exactly the
   * fields the join flow writes (`doubles`, `partner_in_app`, and the combined `skill` when the
   * partner isn't an app member), so `deduplicateDoublesTeams` pairs them up the same way.
   */
  const [savingTeammate, setSavingTeammate] = useState(false);
  const handleAddTeammate = async (
    participantId: string,
    partnerName: string,
    partnerInApp: 'yes' | 'no',
    combinedSkill: number | null,
  ) => {
    setSavingTeammate(true);
    try {
      await updateDoc(doc(db, 'event_participants', participantId), {
        doubles: partnerName,
        partner_in_app: partnerInApp,
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

  // Notify-only — same pattern as handleAskOrganizerSchedule above. A Cloud Function watches
  // event_participants for this flag and notifies the organizer; they resolve it manually
  // outside the app (no in-app approve/deny step).
  const handleRequestZoneChange = async (participantId: string, newZone?: string) => {
    try {
      await updateDoc(doc(db, 'event_participants', participantId), {
        req_zone_change: true,
        ...(newZone ? { new_zone: newZone } : {}),
      });
      setMessage({ type: 'success', text: 'The organizer has been asked about your zone.' });
    } catch (err) {
      console.error('Zone change request failed:', err);
      setMessage({ type: 'error', text: 'Could not send the request.' });
    }
  };

  /**
   * Same move, addressed by uid rather than participant doc id — group cards know a player by uid.
   * Lets an organizer move anyone in the draw they're viewing, not only those who filed a request.
   */
  const handleMoveZoneByUid = async (uid: string, bucketId: string) => {
    const participant = participants.find((p) => p.uid === uid);
    if (!participant?.id) {
      setMessage({ type: 'error', text: 'Could not find that player’s registration.' });
      return;
    }
    await handleMovePlayerZone(participant.id, bucketId);
  };

  /**
   * Pins `zone_override` on the participant (beating their derived zone) and clears any
   * outstanding request in the same write. Zones are how a full draw gains capacity, so this is
   * the release valve when a bracket fills up.
   *
   * Existing matches are left alone — this changes where they route next, not where they are.
   */
  const handleMovePlayerZone = async (participantId: string, bucketId: string) => {
    if (!isCreator) return;
    const target = participants.find((p) => p.id === participantId);
    if (!target?.uid) return;

    // Scoped to THIS player, not the whole division. Checking the division meant that once any
    // draw was generated — i.e. for most of a tournament — no zone change could ever be approved.
    const theirMatches = matches.filter((m) =>
      m.player_1_uid === target.uid || m.player_2_uid === target.uid);
    // A played match is the one genuine blocker: its result belongs to the old zone's draw, and
    // moving them would leave that result stranded somewhere they no longer play.
    if (theirMatches.some((m) => m.status === 'complete')) {
      setMessage({ type: 'error', text: 'This player has already played a match. They can only change zone once the event is over.' });
      return;
    }

    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'event_participants', participantId), {
        zone_override: bucketId,
        req_zone_change: false,
      });
      // Vacate their unplayed slots so they actually leave the old zone's draw. Without this
      // they'd be routed to the new zone while still sitting in the old one's bracket.
      theirMatches.forEach((m) => {
        if (m.player_1_uid === target.uid) batch.update(doc(db, 'matches', m.id), { player_1_uid: '', player_1_name: PLAYER_LOADING });
        if (m.player_2_uid === target.uid) batch.update(doc(db, 'matches', m.id), { player_2_uid: '', player_2_name: PLAYER_LOADING });
      });
      await batch.commit();
      setMessage({
        type: 'success',
        text: theirMatches.length > 0
          ? `Player moved. ${theirMatches.length} unplayed slot${theirMatches.length === 1 ? '' : 's'} freed up in their old draw.`
          : 'Player moved to the new zone.',
      });
    } catch (err) {
      console.error('Zone move failed:', err);
      setMessage({ type: 'error', text: 'Could not move the player.' });
    }
  };

  /**
   * Merge one zone into another. The source stops producing draws; its players route to the target.
   *
   * Recorded in two places on purpose: on the event's zone config, so later signups route
   * automatically; and stamped per participant, for a record of who moved. Unmerge clears both.
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
      const affected = participants.filter((p) =>
        (p.zone_override ?? zoneBucketFor(zoneMap[p.uid], zoneConfig)) === sourceId);
      if (affected.length > 0) {
        const batch = writeBatch(db);
        affected.forEach((p) => batch.update(doc(db, 'event_participants', p.id), {
          merged_zone: true, merged_into: targetId,
        }));
        await batch.commit();
      }
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

  /** Undo one merge — the source runs on its own again and its players' stamps are cleared. */
  const handleUnmergeZone = async (sourceId: string) => {
    if (!isCreator || !event) return;
    try {
      const nextMerges = { ...(zoneConfig.merges ?? {}) };
      delete nextMerges[sourceId];
      await handleSaveZoneDrawConfig({ ...zoneConfig, merges: nextMerges });
      const stamped = participants.filter((p) => p.merged_zone && p.zone_override !== sourceId
        && zoneBucketFor(zoneMap[p.uid], { ...zoneConfig, merges: {} }) === sourceId);
      if (stamped.length > 0) {
        const batch = writeBatch(db);
        stamped.forEach((p) => batch.update(doc(db, 'event_participants', p.id), {
          merged_zone: false, merged_into: '',
        }));
        await batch.commit();
      }
      setMessage({ type: 'success', text: 'Zone unmerged.' });
    } catch (err) {
      console.error('Zone unmerge failed:', err);
      setMessage({ type: 'error', text: 'Could not unmerge the zone.' });
    }
  };

  // Organizer housekeeping — clears the flag once they've followed up with the player. Doesn't
  // move the player itself; that's done manually via the existing edit-group/move tools.
  const handleClearZoneChangeRequest = async (participantId: string) => {
    if (!isCreator) return;
    try {
      await updateDoc(doc(db, 'event_participants', participantId), { req_zone_change: false });
    } catch (err) {
      console.error('Failed to clear zone change request:', err);
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
      const batch = writeBatch(db);
      const partnerUidByCaptain = new Map(participants
        .filter((p) => p.uid && p.partner_uid)
        .map((p) => [p.uid!, p.partner_uid!]));
      completed.forEach((m) => reverseMatchStatsInto(batch, m, partnerUidByCaptain));
      reverseRRBonusesInto(batch, currentMatches.filter((m) => m.format === 'rr' && m.round === 'RR'));
      currentMatches.forEach((m) => batch.delete(doc(db, 'matches', m.id)));
      await batch.commit();
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
      const winners = selectGroupWinners(rrGroups, rrStandingsByGroup);
      const docs = buildRRKnockoutDocs({
        eventId: event.id, drawKey, draw: currentDraw, advancingPlayers: winners, started,
        drawsize: size, manualFill: true,
      });
      const batch = writeBatch(db);
      rrKnockoutMatches.forEach((m) => batch.delete(doc(db, 'matches', m.id)));
      docs.forEach(({ docId, fields }) => batch.set(doc(db, 'matches', docId), fields));
      await batch.commit();
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
    scoreForm,
    scoreFormMatch,
    setScoreForm,
    generating,
    resettingDraw,
    editMode,
    setEditMode,
    // Merges are stored per (division, zone); these read and write the merge for the zone the
    // creator is currently looking at, so the header's controls stay a simple pair of toggles.
    // Keyed off the DRAW's zone before `activeZone`: activeZone starts undefined, and reading a
    // zone-less key while the visible draw is zoned made the toggle disagree with the page.
    mensSkillMerge: skillMerges[skillMergeKey("Men's", mergeZoneKey(currentDraw?.zone ?? activeZone))] ?? null,
    setMensSkillMerge: (pair: SkillMergePair | null) =>
      setSkillMerges((prev) => ({ ...prev, [skillMergeKey("Men's", mergeZoneKey(currentDraw?.zone ?? activeZone))]: pair })),
    womensSkillMerge: skillMerges[skillMergeKey("Women's", mergeZoneKey(currentDraw?.zone ?? activeZone))] ?? null,
    setWomensSkillMerge: (pair: SkillMergePair | null) =>
      setSkillMerges((prev) => ({ ...prev, [skillMergeKey("Women's", mergeZoneKey(currentDraw?.zone ?? activeZone))]: pair })),
    consolidateDoubles,
    setConsolidateDoubles,
    activeTab,
    setActiveTab,
    activeSkill,
    setActiveSkill,
    activeZone,
    setActiveZone,
    activeDoubles,
    setActiveDoubles,
    availableUsers,
    handleSaveZoneDrawConfig,
    handleUpdateRoundDeadline,
    handleSetPreviewDrawSize,
    handleAddPlayer,
    handleRemovePlayer,
    handleGenerateAll,
    handleResetDraw,
    handleEditPlayer,
    handleSubmitScore,
    handleOpenScoreForm,
    pendingSubmissions: actionablePendingSubmissions,
    pendingMatchIds,
    submittableMatchIds,
    handleConfirmSubmission,
    handleRejectSubmission,
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
    userRRGroup,
    rrStandingsByGroup,
    rrGroupMatches,
    rrKnockoutMatches,
    rrKnockoutReady,
    rrConfig,
    rrGroupLabels,
    rrGroupIndices,
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
    // Scheduling
    visibleUserMatch,
    userRRMatches,
    scheduleRequests,
    unplacedParticipants,
    openDrawSlots,
    handleSeatParticipant,
    handleAskOrganizerSchedule,
    handleSetSchedule,
    zoneChangeRequests,
    handleRequestZoneChange,
    handleMovePlayerZone,
    handleMoveZoneByUid,
    handleMergeZone,
    handleSetZoneDrawsEnabled,
    handleUnmergeZone,
    zoneConfig,
    handleAddTeammate,
    savingTeammate,
    handleClearZoneChangeRequest,
  };
};
