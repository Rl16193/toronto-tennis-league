import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  addDoc, collection, deleteDoc, doc, documentId, getDocs, increment, onSnapshot, query, setDoc, updateDoc, where, writeBatch,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { EventParticipant, TennisEvent, UserData, UserStats } from '../../types';
import { DrawConfig, DrawTab, RRConfig, RRStandingRow, ScoreForm, ScoreSubmission, ScoreSubmissionDoc, SkillGroup, TournamentFormat, TournamentMatch, TournamentPlayer } from './types';
import {
  autoLabel, buildRRGroupMatchFields, buildRRKnockoutDocs, buildZoneTierGroups, computeGroupStandings,
  deriveRRConfig, generateGroupPairings, selectGroupWinners, sharedBand, sharedZone, splitEvenly,
} from './rrGeneration';
import {
  BYE, PLAYER_LOADING, skillBand,
  buildMatchFields, buildPlayerList, deleteKey, fallbackTemplate, filterParticipantsForDraw,
  formatPlayerName, getDrawKey, getDrawSize, getEventDate,
  isTournamentStarted, normalizeTemplateMatches,
} from './utils';
import { CONSOLIDATED_DOUBLES_DRAW, MENS_MERGED_DRAW, VISIBLE_DRAWS, WOMENS_MERGED_DRAW } from './drawConfigs';
import { PLAYER_LOADING_SENTINEL } from './AddPlayerPanel';

export const useTournament = (eventIdOverride?: string) => {
  const { user, profile, loading: authLoading } = useAuth();

  const [allTournamentEvents, setAllTournamentEvents] = useState<TennisEvent[]>([]);
  const [event, setEvent] = useState<TennisEvent | null>(null);
  const [participants, setParticipants] = useState<EventParticipant[]>([]);
  const [matches, setMatches] = useState<TournamentMatch[]>([]);

  const [userMap, setUserMap] = useState<Record<string, UserData>>({});
  const [statsMap, setStatsMap] = useState<Record<string, UserStats>>({});

  const [activeTab, setActiveTab] = useState<DrawTab>('mens');
  const [activeSkill, setActiveSkill] = useState<SkillGroup>('Challengers');
  const [activeDoubles, setActiveDoubles] = useState("Men's");
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
  const [mergeMensSingles, setMergeMensSingles] = useState(false);
  const [mergeWomensSingles, setMergeWomensSingles] = useState(false);
  const [consolidateDoubles, setConsolidateDoubles] = useState(false);
  const [previewDrawSize, setPreviewDrawSize] = useState<Record<string, number>>({});
  const [skillOverrides, setSkillOverrides] = useState<Record<string, SkillGroup>>({});
  const [allUsers, setAllUsers] = useState<Record<string, UserData>>({});
  const [courtsMap, setCourtsMap] = useState<Record<string, string[]>>({});
  const [zoneMap, setZoneMap] = useState<Record<string, string>>({});
  // Round Robin 3rd-level view: group stage vs knockout.
  const [rrView, setRRView] = useState<'groups' | 'knockout'>('groups');
  // Server-persisted RR draft for the current draw (edited groups + withdrawn players) — lets the
  // creator arrange groups before generation without writing matches, surviving refresh.
  const [rrDraft, setRRDraft] = useState<{ groups: string[][]; custom: boolean[]; customLabels: string[]; withdrawn: string[] } | null>(null);
  const [generatingReserves, setGeneratingReserves] = useState(false);
  const [showReserves, setShowReserves] = useState(false);
  // LL Draw state — keyed by draw key so each division has independent size/slots
  const [llDrawSizes, setLLDrawSizes] = useState<Record<string, number>>({});
  const [llDrawSlotOverrides, setLLDrawSlotOverrides] = useState<Record<string, Record<number, TournamentPlayer | null>>>({});

  // Round Robin state
  const [showRRConfig, setShowRRConfig] = useState(false);
  const [generatingRR, setGeneratingRR] = useState(false);

  const activeEventIdRef = useRef<string | undefined>(undefined);
  const autoPlacingRef = useRef(false);
  // Players intentionally replaced with PLAYER_LOADING by the creator — excluded from auto-placement.
  const manuallyUnplacedIdsRef = useRef<Set<string>>(new Set());

  const isCreator = !!user && !!event?.creator_id && event.creator_id === user.uid;
  const started = isTournamentStarted(event);

  const effectiveStatsMap = useMemo(() => {
    if (Object.keys(skillOverrides).length === 0) return statsMap;
    const copy = { ...statsMap };
    Object.entries(skillOverrides).forEach(([uid, group]) => {
      copy[uid] = { ...(copy[uid] ?? {}), skill_level: group === 'Masters' ? 4 : 3 } as typeof copy[string];
    });
    return copy;
  }, [statsMap, skillOverrides]);

  const effectiveDraws = useMemo<DrawConfig[]>(() => {
    const eventChoice = event?.tournament_choice;
    let draws = VISIBLE_DRAWS.filter((d) => {
      if (mergeMensSingles && d.tab === 'mens' && d.tournamentChoice === 'Singles') return false;
      if (mergeWomensSingles && d.tab === 'womens' && d.tournamentChoice === 'Singles') return false;
      if (consolidateDoubles && d.tab === 'doubles') return false;
      if (eventChoice === 'Singles' && d.tournamentChoice !== 'Singles') return false;
      if (eventChoice === 'Doubles' && d.tournamentChoice !== 'Doubles') return false;
      return true;
    });
    if (mergeMensSingles) draws = [...draws, MENS_MERGED_DRAW];
    if (mergeWomensSingles) draws = [...draws, WOMENS_MERGED_DRAW];
    if (consolidateDoubles) draws = [...draws, CONSOLIDATED_DOUBLES_DRAW];
    const tabOrder = { mens: 0, womens: 1, doubles: 2 };
    return draws.sort((a, b) => tabOrder[a.tab] - tabOrder[b.tab]);
  }, [mergeMensSingles, mergeWomensSingles, consolidateDoubles, event?.tournament_choice]);

  // ── Data loading ──────────────────────────────────────────────────────────

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const eventsSnap = await getDocs(collection(db, 'events'));
        const tournamentEvents = eventsSnap.docs
          .map((d) => ({ id: d.id, ...d.data() } as TennisEvent))
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
    setEditMode(false);
    setSkillOverrides({});
    setPreviewSlotOverrides({});
    setPreviewDrawSize({});
    setLLDrawSizes({});
    setLLDrawSlotOverrides({});
    setShowRRConfig(false);
    setMergeMensSingles(false);
    setMergeWomensSingles(false);
    setConsolidateDoubles(false);
  }, [eventIdOverride, allTournamentEvents]);

  useEffect(() => {
    if (!event) return;
    return onSnapshot(
      query(collection(db, 'event_participants'), where('event_id', '==', event.id)),
      (snap) => setParticipants(snap.docs.map((d) => ({ id: d.id, ...d.data() } as EventParticipant))),
    );
  }, [event]);

  useEffect(() => {
    if (!event) return;
    return onSnapshot(
      query(collection(db, 'tournament_matches'), where('event_id', '==', event.id)),
      (snap) => {
        const loaded = snap.docs.map((d) => ({ id: d.id, ...d.data() } as TournamentMatch));
        setMatches(loaded);
        // Auto-enable merge/consolidate toggles if that draw data already exists in Firestore
        // Exclude reserves matches to avoid false positives
        if (loaded.some((m) => m.tournament_choice === 'Singles' && m.division === "Men's" && m.skill_group === 'All' && m.bracket !== 'reserves'))
          setMergeMensSingles(true);
        if (loaded.some((m) => m.tournament_choice === 'Singles' && m.division === "Women's" && m.skill_group === 'All' && m.bracket !== 'reserves'))
          setMergeWomensSingles(true);
        if (loaded.some((m) => m.tournament_choice === 'Doubles' && m.division === 'All' && m.bracket !== 'reserves'))
          setConsolidateDoubles(true);
      },
    );
  }, [event]);


  // Player-submitted scores awaiting the creator's confirmation
  useEffect(() => {
    if (!event) { setPendingSubmissions([]); return; }
    return onSnapshot(
      query(collection(db, 'score_submissions'), where('event_id', '==', event.id)),
      (snap) => setPendingSubmissions(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ScoreSubmissionDoc))),
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

  // Auto-remove stale submissions (match already scored or gone). Creator only — they're
  // the only ones permitted to delete other players' docs.
  const cleaningStaleRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!isCreator) return;
    const stale = pendingSubmissions.filter((s) => {
      const m = matches.find((mm) => mm.id === s.match_id);
      return !m || m.status === 'complete';
    });
    for (const s of stale) {
      if (cleaningStaleRef.current.has(s.id)) continue;
      cleaningStaleRef.current.add(s.id);
      deleteDoc(doc(db, 'score_submissions', s.id))
        .catch(() => {})
        .finally(() => cleaningStaleRef.current.delete(s.id));
    }
  }, [isCreator, pendingSubmissions, matches]);

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
      if (!p.doubles || !p.user_id) continue;
      const partner = byName.get(norm(p.doubles));
      if (partner && partner.user_id && norm(partner.doubles) === norm(p.user_name)) {
        teammateByUid.set(p.user_id, partner.user_id);
      }
    }
    const ids = new Set<string>();
    for (const m of matches) {
      const slotUids = [m.player_1_user_id, m.player_2_user_id].filter(Boolean);
      const authorized = slotUids.some((su) => su === user.uid || teammateByUid.get(su) === user.uid);
      if (authorized) ids.add(m.id);
    }
    return ids;
  }, [user, isCreator, participants, matches]);

  // Reload all registered users every time the creator enters edit mode
  useEffect(() => {
    if (!editMode || !isCreator) return;
    getDocs(collection(db, 'users')).then((snap) => {
      const map: Record<string, UserData> = {};
      snap.docs.forEach((d) => { map[d.id] = d.data() as UserData; });
      setAllUsers(map);
    });
  }, [editMode, isCreator]);

  // Fetch users + stats in one effect, parallel per participant
  useEffect(() => {
    if (!user) return;
    const allIds = [...new Set(participants.map((p) => p.user_id).filter(Boolean))];
    const missingUsers = allIds.filter((id) => !userMap[id]);
    const missingStats = allIds.filter((id) => !statsMap[id]);
    if (missingUsers.length === 0 && missingStats.length === 0) return;

    const fetchDoc = <T,>(col: string, id: string) =>
      getDocs(query(collection(db, col), where('__name__', '==', id)))
        .then((snap) => snap.docs[0] ? ([id, snap.docs[0].data() as T] as const) : null);

    Promise.all([
      Promise.all(missingUsers.map((id) => fetchDoc<UserData>('users', id))),
      Promise.all(missingStats.map((id) => fetchDoc<UserStats>('stats', id))),
    ]).then(([userEntries, statsEntries]) => {
      if (userEntries.some(Boolean))
        setUserMap((prev) => ({ ...prev, ...Object.fromEntries(userEntries.filter(Boolean) as [string, UserData][]) }));
      if (statsEntries.some(Boolean))
        setStatsMap((prev) => ({ ...prev, ...Object.fromEntries(statsEntries.filter(Boolean) as [string, UserStats][]) }));
    });
  }, [participants, user, userMap, statsMap]);

  // Fetch preferred_courts for all participants (used for RR court-aware preview grouping)
  useEffect(() => {
    if (!user) return;
    const allIds = [...new Set(participants.map((p) => p.user_id).filter(Boolean))];
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
      for (const id of missingIds) { courtEntries[id] = []; zoneEntries[id] = ''; }
      snaps.forEach((snap) => snap.forEach((d) => {
        courtEntries[d.id] = (d.data().preferred_courts ?? []) as string[];
        zoneEntries[d.id] = (d.data().preferred_zone ?? '') as string;
      }));
      setCourtsMap((prev) => ({ ...prev, ...courtEntries }));
      setZoneMap((prev) => ({ ...prev, ...zoneEntries }));
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [participants, user]);

  // ── Derived data ──────────────────────────────────────────────────────────

  const userParticipant = useMemo(
    () => participants.find((p) => p.user_id === user?.uid) ?? null,
    [participants, user],
  );

  const userDraw = useMemo<DrawConfig | undefined>(() => {
    if (!userParticipant) return undefined;

    // Prefer the participant's ACTUAL placement: if they appear in a generated match, show
    // that draw. This covers players the creator moved across skill groups (e.g.
    // Challengers → Masters) whose event_participants skill was never changed — otherwise
    // their visibility would stay on the skill-derived draw and they couldn't see the one
    // they're really in. Skill-derived routing below is only the pre-generation fallback.
    const placement = matches.find(
      (m) => m.bracket !== 'reserves' &&
        (m.player_1_user_id === userParticipant.user_id || m.player_2_user_id === userParticipant.user_id),
    );
    if (placement) {
      const all = [...VISIBLE_DRAWS, MENS_MERGED_DRAW, WOMENS_MERGED_DRAW, CONSOLIDATED_DOUBLES_DRAW];
      const found = all.find(
        (d) => d.tournamentChoice === placement.tournament_choice &&
          d.division === placement.division &&
          d.skillGroup === placement.skill_group,
      );
      if (found) return found;
    }

    return undefined;
  }, [userParticipant, matches]);

  // Creators see every draw. A participant sees both skill draws in their own division
  // (Challengers + Masters for their gender) so they can view both; for doubles they see
  // only their own division draw. Non-creators can't edit (controls gate on isCreator).
  const visibleDraws = useMemo(() => {
    if (isCreator || !userDraw) return effectiveDraws;
    return effectiveDraws.filter(
      (d) => d.tab === userDraw.tab && (userDraw.tab !== 'doubles' || d.division === userDraw.division),
    );
  }, [isCreator, userDraw, effectiveDraws]);

  useEffect(() => {
    if (isCreator || !userDraw) return;
    setActiveTab(userDraw.tab);
    if (userDraw.tab === 'doubles') setActiveDoubles(userDraw.division);
    else setActiveSkill(userDraw.skillGroup as SkillGroup);
  }, [isCreator, userDraw]);

  const currentDraw = useMemo<DrawConfig | undefined>(() => {
    if (activeTab === 'doubles')
      return effectiveDraws.find((d) => d.tab === 'doubles' && d.division === activeDoubles)
        ?? effectiveDraws.find((d) => d.tab === 'doubles');
    return effectiveDraws.find((d) => d.tab === activeTab && d.skillGroup === activeSkill)
      ?? effectiveDraws.find((d) => d.tab === activeTab);
  }, [activeDoubles, activeSkill, activeTab, effectiveDraws]);

  const currentMatches = useMemo(() => {
    if (!currentDraw) return [];
    return matches
      .filter((m) =>
        m.tournament_choice === currentDraw.tournamentChoice &&
        m.division === currentDraw.division &&
        m.skill_group === currentDraw.skillGroup &&
        m.bracket !== 'reserves',
      )
      .sort((a, b) => a.position - b.position);
  }, [currentDraw, matches]);

  // Full sorted player list for the current draw — shared by displayMatches, editPlayers, and reservesPlayers.
  const currentDrawAllPlayers = useMemo(() => {
    if (!currentDraw) return [];
    return buildPlayerList(
      filterParticipantsForDraw(participants, currentDraw, effectiveStatsMap),
      currentDraw,
      effectiveStatsMap,
      userMap,
    );
  }, [currentDraw, participants, effectiveStatsMap, userMap]);

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


  const visibleUserMatch = useMemo(() => {
    if (!user) return null;
    const pool = showReserves
      ? matches.filter(
          (m) =>
            m.bracket === 'reserves' &&
            m.status !== 'complete' &&
            m.player_1_name !== BYE &&
            m.player_2_name !== BYE,
        )
      : displayMatches.filter(
          (m) => m.player_1_name !== BYE && m.player_2_name !== BYE,
        );
    return pool.find((m) =>
      [m.player_1_user_id, m.player_2_user_id].includes(user.uid),
    ) ?? null;
  }, [displayMatches, matches, showReserves, user]);


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

  const reservesPlayers = useMemo(() => {
    if (currentMatches.length > 0) return [];
    const placedIds = new Set(
      displayMatches.flatMap((m) => [m.player_1_user_id, m.player_2_user_id]).filter(Boolean),
    );
    return currentDrawAllPlayers.filter((p) => !placedIds.has(p.user_id));
  }, [currentDrawAllPlayers, currentMatches, displayMatches]);

  const availableUsers = useMemo(() => {
    const joinedIds = new Set(participants.map((p) => p.user_id));
    return Object.entries(allUsers)
      .filter(([id]) => !joinedIds.has(id))
      .map(([id, data]) => ({ id, name: data.name || data.email || id, email: data.email || '' }))
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [allUsers, participants]);

  const currentReservesMatches = useMemo(() => {
    if (!currentDraw) return [];
    return matches
      .filter((m) =>
        m.bracket === 'reserves' &&
        m.tournament_choice === currentDraw.tournamentChoice &&
        m.division === currentDraw.division,
      )
      .sort((a, b) => a.position - b.position);
  }, [currentDraw, matches]);

  // LL Draw per-division key and current preview state
  const llCurrentKey = currentDraw
    ? getDrawKey(currentDraw.tournamentChoice, currentDraw.division, 'All')
    : '';
  const currentLLSize = llCurrentKey ? (llDrawSizes[llCurrentKey] ?? 4) : 4;
  const currentLLSlotOverrides = llCurrentKey ? (llDrawSlotOverrides[llCurrentKey] ?? {}) : {};

  // LL Draw preview — always shown when no finalized LL matches exist
  const llDrawDisplayMatches = useMemo(() => {
    if (currentReservesMatches.length > 0) return currentReservesMatches;
    if (!currentDraw) return [];
    const drawsize = currentLLSize;
    const templateMatches = normalizeTemplateMatches(fallbackTemplate(drawsize));
    const slotMap = new Map<number, TournamentPlayer>();
    Object.entries(currentLLSlotOverrides).forEach(([slotStr, player]) => {
      if (player !== null) slotMap.set(Number(slotStr), player);
    });
    const cfg = {
      eventId: event?.id || 'preview',
      tournamentChoice: currentDraw.tournamentChoice,
      division: currentDraw.division,
      skillGroup: 'All' as const,
      drawsize,
      allMatches: templateMatches,
    };
    return templateMatches.map<TournamentMatch>((tm, index) => ({
      id: `ll_preview_${llCurrentKey}_${tm.match_id}`,
      bracket: 'reserves',
      started: false,
      ...buildMatchFields(tm, index, slotMap, cfg),
    }));
  }, [currentReservesMatches, currentDraw, currentLLSize, currentLLSlotOverrides, llCurrentKey, event?.id]);

  // LL Draw dropdown: only participants of the CURRENT draw's division/choice who are
  // NOT already placed in the main draw. Prevents main-draw players (e.g. semi-finalists)
  // from being added to the reserves draw — applies uniformly to every draw.
  const allUsersAsTournamentPlayers = useMemo(
    () => {
      if (!currentDraw) return [];
      const mainMatches = currentMatches.length > 0 ? currentMatches : displayMatches;
      const placedIds = new Set(
        mainMatches.flatMap((m) => [m.player_1_user_id, m.player_2_user_id]).filter(Boolean),
      );
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
      ).filter((p) => !placedIds.has(p.user_id));
    },
    [currentDraw, currentMatches, displayMatches, participants, effectiveStatsMap, userMap],
  );

  const opponent = visibleUserMatch && user
    ? (() => {
        const isP1 = visibleUserMatch.player_1_user_id === user.uid;
        const opponentUid = isP1 ? visibleUserMatch.player_2_user_id : visibleUserMatch.player_1_user_id;
        const opponentUser = userMap[opponentUid] ?? allUsers[opponentUid];
        const opponentStats = statsMap[opponentUid];
        const fallbackContact = isP1 ? visibleUserMatch.player_2_contact : visibleUserMatch.player_1_contact;
        const snapshotName = isP1 ? visibleUserMatch.player_2_name : visibleUserMatch.player_1_name;
        // Prefer the live user-doc name (fall back to the match snapshot) so a re-seated or
        // renamed opponent shows current info. Singles only — doubles names embed the partner.
        const isDoubles = visibleUserMatch.tournament_choice === 'Doubles';
        return {
          name: !isDoubles && opponentUser?.name ? formatPlayerName(opponentUser.name) : snapshotName,
          userId: opponentUid,
          contact: fallbackContact,
          email: opponentUser?.email ?? '',
          phone: opponentUser?.phone ?? fallbackContact ?? '',
          round: visibleUserMatch.round,
          skill: opponentStats?.skill_level ?? null,
          wins: opponentStats?.wins ?? 0,
          losses: opponentStats?.loses ?? 0,
        };
      })()
    : null;

  const nextMatchOpponents = useMemo(() => {
    if (!visibleUserMatch?.next_match_id || !user) return [];

    const normBracket = (b: unknown) => b ?? null;
    const sameDraw = (m: TournamentMatch) =>
      normBracket(m.bracket) === normBracket(visibleUserMatch.bracket) &&
      m.tournament_choice === visibleUserMatch.tournament_choice &&
      m.division === visibleUserMatch.division &&
      m.skill_group === visibleUserMatch.skill_group;

    const sibling = matches.find(
      (m) => sameDraw(m) && m.next_match_id === visibleUserMatch.next_match_id && m.id !== visibleUserMatch.id,
    );
    if (!sibling) return [];

    const nextRoundDoc = matches.find((m) => sameDraw(m) && m.match_id === visibleUserMatch.next_match_id);
    const nextRound = nextRoundDoc?.round ?? '';

    return (
      [
        { name: sibling.player_1_name, uid: sibling.player_1_user_id, contact: sibling.player_1_contact },
        { name: sibling.player_2_name, uid: sibling.player_2_user_id, contact: sibling.player_2_contact },
      ] as Array<{ name: string; uid: string; contact: string }>
    )
      .filter(({ name }) => !!name && name !== PLAYER_LOADING && name !== BYE)
      .map(({ name, uid, contact }) => {
        const userData = userMap[uid] ?? allUsers[uid];
        const statsData = statsMap[uid];
        return {
          name,
          userId: uid,
          email: userData?.email ?? '',
          phone: userData?.phone ?? contact ?? '',
          round: nextRound,
          skill: statsData?.skill_level ?? null,
          wins: statsData?.wins ?? 0,
          losses: statsData?.loses ?? 0,
        };
      });
  }, [visibleUserMatch, matches, userMap, allUsers, statsMap, user]);

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
    const drawKey = getDrawKey(currentDraw.tournamentChoice, currentDraw.division, currentDraw.skillGroup);
    const unsub = onSnapshot(
      doc(db, 'rr_drafts', `${event.id}_${drawKey}`),
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
  }, [event?.id, currentDrawFormat, currentDraw?.tournamentChoice, currentDraw?.division, currentDraw?.skillGroup]);

  // Players the creator withdrew from this draw (persisted) — never auto-placed back.
  const rrWithdrawn = useMemo(() => new Set(rrDraft?.withdrawn ?? []), [rrDraft]);

  // Preview groups shown before any RR matches are generated. When the creator has saved a draft
  // arrangement, that (server-persisted) grouping is used; otherwise the SAME skill-first grouping
  // as generation (buildZoneTierGroups). Withdrawn players are excluded either way.
  const previewRRGroups = useMemo<TournamentPlayer[][]>(() => {
    if (currentDrawFormat !== 'rr' || currentMatches.length > 0) return [];
    const available = currentDrawAllPlayers.filter((p) => !rrWithdrawn.has(p.user_id));
    if (rrDraft && rrDraft.groups.length > 0) {
      const byId = new Map(available.map((p) => [p.user_id, p]));
      return rrDraft.groups.map((uids) =>
        uids.map((uid) => byId.get(uid)).filter((p): p is TournamentPlayer => !!p),
      );
    }
    const skillMap: Record<string, number> = {};
    for (const p of available) {
      skillMap[p.user_id] = effectiveStatsMap[p.user_id]?.skill_level ?? p.skillLevel ?? 0;
    }
    return buildZoneTierGroups(available, zoneMap, skillMap).map((g) => g.players);
  }, [currentDrawFormat, currentMatches, currentDrawAllPlayers, effectiveStatsMap, zoneMap, rrDraft, rrWithdrawn]);

  // Labels for the preview/draft groups (custom rename shown verbatim, else auto band/zone).
  const previewRRLabels = useMemo<string[]>(() =>
    previewRRGroups.map((players, i) => {
      if (rrDraft?.custom[i]) return rrDraft.customLabels[i] || `Group ${String.fromCharCode(65 + i)}`;
      const zoneOf = (p: TournamentPlayer) => (zoneMap[p.user_id] || '').trim();
      const skillOf = (p: TournamentPlayer) => effectiveStatsMap[p.user_id]?.skill_level ?? p.skillLevel ?? 0;
      const bandOf = (p: TournamentPlayer) => skillBand(skillOf(p));
      return autoLabel(i, sharedBand(players, bandOf), sharedZone(players, zoneOf));
    }), [previewRRGroups, rrDraft, zoneMap, effectiveStatsMap]);


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
  // Names/contacts resolve live from userMap (fallback to the match-doc snapshot); singles
  // names are overridden, doubles keep the embedded "A / B" value.
  const buildRRGroupsFrom = useCallback((groupMatches: TournamentMatch[], indices: number[]): TournamentPlayer[][] => {
    const isDoubles = groupMatches[0]?.tournament_choice === 'Doubles';
    const liveName = (uid: string, snapshot: string) => {
      const u = userMap[uid];
      return !isDoubles && u?.name ? formatPlayerName(u.name) : snapshot;
    };
    const liveContact = (uid: string, snapshot: string) => {
      const u = userMap[uid];
      if (!u) return snapshot;
      return (u.preferred_mode_of_contact === 'phone' ? u.phone : u.email) || snapshot;
    };
    return indices.map((gi) => {
      const groupMs = groupMatches.filter((m) => (m.rr_group ?? 0) === gi);
      const seen = new Set<string>();
      const players: TournamentPlayer[] = [];
      for (const m of groupMs) {
        if (m.player_1_user_id && !seen.has(m.player_1_user_id)) {
          seen.add(m.player_1_user_id);
          players.push({ user_id: m.player_1_user_id, name: liveName(m.player_1_user_id, m.player_1_name), contact: liveContact(m.player_1_user_id, m.player_1_contact), preferredContact: 'email', participantId: '' });
        }
        if (m.player_2_user_id && !seen.has(m.player_2_user_id)) {
          seen.add(m.player_2_user_id);
          players.push({ user_id: m.player_2_user_id, name: liveName(m.player_2_user_id, m.player_2_name), contact: liveContact(m.player_2_user_id, m.player_2_contact), preferredContact: 'email', participantId: '' });
        }
      }
      return players;
    });
  }, [userMap]);

  // Positional labels: the letter follows the sorted display position (always A, B, C…). A
  // creator-edited (custom) label is shown verbatim; otherwise the stored "band · zone"
  // suffix is kept and re-prefixed with the positional letter.
  // Group label recomputed from the group's CURRENT players (positional letter + shared band/zone)
  // so it stays correct after any edit/move/remove — never resets to a bare "Group X". A group the
  // creator renamed (rr_label_custom) is shown verbatim.
  const buildRRLabelsFrom = useCallback((groupMatches: TournamentMatch[], indices: number[]): string[] =>
    indices.map((gi, idx) => {
      const first = groupMatches.find((m) => (m.rr_group ?? 0) === gi);
      const letter = String.fromCharCode(65 + idx);
      if (first?.rr_label_custom) return first.rr_group_label || `Group ${letter}`;
      const players = buildRRGroupsFrom(groupMatches, [gi])[0] ?? [];
      const zoneOf = (p: TournamentPlayer) => (zoneMap[p.user_id] || '').trim();
      const skillOf = (p: TournamentPlayer) => effectiveStatsMap[p.user_id]?.skill_level ?? p.skillLevel ?? 0;
      const bandOf = (p: TournamentPlayer) => skillBand(skillOf(p));
      return autoLabel(idx, sharedBand(players, bandOf), sharedZone(players, zoneOf));
    }), [buildRRGroupsFrom, zoneMap, effectiveStatsMap]);

  const rrGroups = useMemo<TournamentPlayer[][]>(
    () => (rrGroupMatches.length === 0 ? [] : buildRRGroupsFrom(rrGroupMatches, rrGroupIndices)),
    [rrGroupMatches, rrGroupIndices, buildRRGroupsFrom],
  );

  const rrStandingsByGroup = useMemo<RRStandingRow[][]>(
    () => rrGroups.map((players) => {
      const ids = new Set(players.map((p) => p.user_id));
      return computeGroupStandings(rrGroupMatches.filter((m) => ids.has(m.player_1_user_id) || ids.has(m.player_2_user_id)));
    }),
    [rrGroups, rrGroupMatches],
  );

  const rrConfig = useMemo(() => deriveRRConfig(currentMatches), [currentMatches]);

  const rrGroupLabels = useMemo<string[]>(
    () => (rrGroupMatches.length === 0 ? [] : buildRRLabelsFrom(rrGroupMatches, rrGroupIndices)),
    [rrGroupMatches, rrGroupIndices, buildRRLabelsFrom],
  );

  // Players registered for this draw but not yet in any group (late joiners) — the pool the
  // creator's "Add Group" form draws from.
  const rrUnplacedPlayers = useMemo<TournamentPlayer[]>(() => {
    if (rrGroupMatches.length === 0) return [];
    const placed = new Set(rrGroups.flat().map((p) => p.user_id));
    return currentDrawAllPlayers.filter((p) => !placed.has(p.user_id));
  }, [rrGroupMatches, rrGroups, currentDrawAllPlayers]);

  // Auto-place late joiners: when unplaced players appear after the draw is generated,
  // distribute them into eligible groups (no played matches, < 5 players) automatically.
  // Overflow players form new groups. Creator sees a toast; no manual action required.
  useEffect(() => {
    if (!isCreator || !event || !currentDraw) return;
    if (rrGroupMatches.length === 0 || rrUnplacedPlayers.length === 0) return;
    if (autoPlacingRef.current) return;
    autoPlacingRef.current = true;

    const run = async () => {
      try {
        const drawKey = getDrawKey(currentDraw.tournamentChoice, currentDraw.division, currentDraw.skillGroup);
        const advCount = rrConfig?.advancementCount ?? 1;
        const makePairings = (n: number): [number, number][] => n >= 2 ? generateGroupPairings(n) : [[0, 1]];

        type GState = { gi: number; players: TournamentPlayer[]; hasPlayed: boolean };
        const groupStates: GState[] = rrGroupIndices.map((gi, idx) => ({
          gi,
          players: rrGroups[idx] ?? [],
          hasPlayed: rrGroupMatches.filter((m) => (m.rr_group ?? 0) === gi).some((m) => m.status === 'complete'),
        }));

        const eligible = groupStates
          .filter((gs) => !gs.hasPlayed)
          .sort((a, b) => a.players.length - b.players.length);

        const assignments = new Map<number, TournamentPlayer[]>(eligible.map((gs) => [gs.gi, [...gs.players]]));
        const overflow: TournamentPlayer[] = [];

        // Players already placed in the sibling draw (e.g. moved Challengers → Masters by
        // the creator) must never be auto-placed back into this draw.
        const siblingPlacedIds = new Set<string>(
          matches
            .filter((m) => m.format === 'rr' && m.round === 'RR' &&
              m.tournament_choice === currentDraw.tournamentChoice &&
              m.division === currentDraw.division &&
              m.skill_group !== currentDraw.skillGroup)
            .flatMap((m) => [m.player_1_user_id, m.player_2_user_id])
            .filter((id): id is string => !!id),
        );

        for (const p of rrUnplacedPlayers) {
          if (siblingPlacedIds.has(p.user_id)) continue;
          // Persisted withdrawals (survive refresh) + in-session removals are never re-added.
          if (rrWithdrawn.has(p.user_id) || manuallyUnplacedIdsRef.current.has(p.user_id)) continue;
          const target = eligible.find((gs) => (assignments.get(gs.gi) ?? []).length < 5);
          if (target) {
            assignments.get(target.gi)!.push(p);
          } else {
            overflow.push(p);
          }
        }

        const nextBaseIndex = (rrGroupIndices.length ? Math.max(...rrGroupIndices) : -1) + 1;
        const newGroups: TournamentPlayer[][] = [];
        if (overflow.length > 0) {
          const sizes = splitEvenly(overflow.length);
          let offset = 0;
          for (const size of sizes) {
            newGroups.push(overflow.slice(offset, offset + size));
            offset += size;
          }
        }

        const batch = writeBatch(db);

        for (const [gi, updatedPlayers] of assignments) {
          const gs = groupStates.find((g) => g.gi === gi)!;
          if (updatedPlayers.length === gs.players.length) continue;
          const oldMs = rrGroupMatches.filter((m) => (m.rr_group ?? 0) === gi);
          const label = oldMs[0]?.rr_group_label ?? `Group ${String.fromCharCode(65 + gi)}`;
          const labelCustom = oldMs[0]?.rr_label_custom ?? false;
          oldMs.forEach((m) => batch.delete(doc(db, 'tournament_matches', m.id)));
          buildRRGroupMatchFields({
            eventId: event.id, drawKey, draw: currentDraw,
            groupIndex: gi, groupLabel: label, labelCustom,
            groupPlayers: updatedPlayers, pairings: makePairings(updatedPlayers.length),
            advancementCount: advCount, started,
          }).forEach(({ docId, fields }) => batch.set(doc(db, 'tournament_matches', docId), fields));
        }

        for (let i = 0; i < newGroups.length; i++) {
          const gi = nextBaseIndex + i;
          const gPlayers = newGroups[i];
          buildRRGroupMatchFields({
            eventId: event.id, drawKey, draw: currentDraw,
            groupIndex: gi, groupLabel: `Group ${String.fromCharCode(65 + gi)}`,
            groupPlayers: gPlayers, pairings: makePairings(gPlayers.length),
            advancementCount: advCount, started,
          }).forEach(({ docId, fields }) => batch.set(doc(db, 'tournament_matches', docId), fields));
        }

        await batch.commit();
        const unplacedCount = rrUnplacedPlayers.length;
        setMessage({
          type: 'success',
          text: newGroups.length > 0
            ? `New group${newGroups.length > 1 ? 's' : ''} created — please review`
            : `${unplacedCount} late joiner${unplacedCount > 1 ? 's' : ''} placed`,
        });
      } catch (err) {
        console.error('Auto-place failed:', err);
      } finally {
        autoPlacingRef.current = false;
      }
    };

    run();
  }, [isCreator, event?.id, currentDraw?.label, rrGroupMatches, rrUnplacedPlayers, rrGroupIndices, rrGroups, rrConfig, started, matches, rrWithdrawn]);

  // Sibling skill draw (Challengers ↔ Masters, same gender) — the extra targets a creator can
  // move an RR player into. Undefined for doubles/merged draws.
  const rrSiblingDraw = useMemo<DrawConfig | undefined>(() => {
    if (!currentDraw || currentDraw.tournamentChoice !== 'Singles') return undefined;
    if (currentDraw.skillGroup !== 'Challengers' && currentDraw.skillGroup !== 'Masters') return undefined;
    const otherSkill: SkillGroup = currentDraw.skillGroup === 'Challengers' ? 'Masters' : 'Challengers';
    return effectiveDraws.find((d) => d.tab === currentDraw.tab && d.skillGroup === otherSkill);
  }, [currentDraw, effectiveDraws]);

  const rrSiblingMatches = useMemo(
    () => (!rrSiblingDraw ? [] : matches.filter((m) =>
      m.format === 'rr' && m.round === 'RR' &&
      m.tournament_choice === rrSiblingDraw.tournamentChoice &&
      m.division === rrSiblingDraw.division &&
      m.skill_group === rrSiblingDraw.skillGroup &&
      m.bracket !== 'reserves')),
    [rrSiblingDraw, matches],
  );

  const rrSiblingIndices = useMemo<number[]>(
    () => [...new Set(rrSiblingMatches.map((m) => m.rr_group ?? 0))].sort((a, b) => a - b),
    [rrSiblingMatches],
  );

  const rrSiblingGroups = useMemo<TournamentPlayer[][]>(
    () => (rrSiblingMatches.length === 0 ? [] : buildRRGroupsFrom(rrSiblingMatches, rrSiblingIndices)),
    [rrSiblingMatches, rrSiblingIndices, buildRRGroupsFrom],
  );

  const rrSiblingLabels = useMemo<string[]>(
    () => (rrSiblingMatches.length === 0 ? [] : buildRRLabelsFrom(rrSiblingMatches, rrSiblingIndices)),
    [rrSiblingMatches, rrSiblingIndices, buildRRLabelsFrom],
  );

  // Cross-draw deduplication: if a player appears in both this draw's groups and the sibling
  // draw's groups (e.g. was moved Challengers → Masters but auto-placement wrote them back),
  // silently remove them from this draw. Skips groups with played matches.
  const deduplicatingRef = useRef(false);
  useEffect(() => {
    if (!isCreator || !event || !currentDraw || !rrSiblingDraw) return;
    if (rrGroupMatches.length === 0 || rrSiblingMatches.length === 0) return;
    if (deduplicatingRef.current) return;

    const siblingIds = new Set(
      rrSiblingMatches
        .flatMap((m) => [m.player_1_user_id, m.player_2_user_id])
        .filter((id): id is string => !!id),
    );

    const groupsToFix: Array<{ gi: number; players: TournamentPlayer[] }> = [];
    for (let i = 0; i < rrGroupIndices.length; i++) {
      const gi = rrGroupIndices[i];
      const groupPlayers = rrGroups[i] ?? [];
      const cleaned = groupPlayers.filter((p) => !siblingIds.has(p.user_id));
      if (cleaned.length < groupPlayers.length) groupsToFix.push({ gi, players: cleaned });
    }
    if (groupsToFix.length === 0) return;

    deduplicatingRef.current = true;
    const run = async () => {
      try {
        const drawKey = getDrawKey(currentDraw.tournamentChoice, currentDraw.division, currentDraw.skillGroup);
        const advCount = rrConfig?.advancementCount ?? 1;
        const makePairings = (n: number): [number, number][] => n >= 2 ? generateGroupPairings(n) : [[0, 1]];
        const batch = writeBatch(db);
        for (const { gi, players } of groupsToFix) {
          const groupMs = rrGroupMatches.filter((m) => (m.rr_group ?? 0) === gi);
          if (groupMs.some((m) => m.status === 'complete')) continue;
          const groupLabel = groupMs[0]?.rr_group_label ?? `Group ${String.fromCharCode(65 + gi)}`;
          const labelCustom = groupMs[0]?.rr_label_custom ?? false;
          groupMs.forEach((m) => batch.delete(doc(db, 'tournament_matches', m.id)));
          if (players.length > 0) {
            buildRRGroupMatchFields({
              eventId: event.id, drawKey, draw: currentDraw,
              groupIndex: gi, groupLabel, labelCustom,
              groupPlayers: players, pairings: makePairings(players.length),
              advancementCount: advCount, started,
            }).forEach(({ docId, fields }) => batch.set(doc(db, 'tournament_matches', docId), fields));
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
  }, [isCreator, event?.id, currentDraw?.label, rrGroupMatches, rrSiblingMatches, rrGroupIndices, rrGroups, rrSiblingDraw, rrConfig, started]);

  // Players in the current user's RR group (null if not in RR or not a participant)
  const userRRGroup = useMemo<TournamentPlayer[] | null>(() => {
    if (!user || rrGroups.length === 0) return null;
    return rrGroups.find((g) => g.some((p) => p.user_id === user.uid)) ?? null;
  }, [user, rrGroups]);

  // The current user's RR pairing matches (for per-pairing scheduling + score submission).
  const userRRMatches = useMemo<TournamentMatch[]>(() => {
    if (!user) return [];
    return rrGroupMatches.filter((m) => m.player_1_user_id === user.uid || m.player_2_user_id === user.uid);
  }, [rrGroupMatches, user]);

  // Matches where a player asked the organizer to schedule (creator-only queue).
  const scheduleRequests = useMemo<TournamentMatch[]>(
    () => (isCreator ? matches.filter((m) => m.schedule_requested && m.status !== 'complete') : []),
    [isCreator, matches],
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
    const drawParticipants = filterParticipantsForDraw(participants, draw, effectiveStatsMap);
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
    const drawKey = getDrawKey(draw.tournamentChoice, draw.division, draw.skillGroup);
    const cfg = {
      eventId: event.id,
      tournamentChoice: draw.tournamentChoice,
      division: draw.division,
      skillGroup: draw.skillGroup,
      drawsize,
      allMatches: templateMatches,
    };
    templateMatches.forEach((tm, index) => {
      batch.set(
        doc(db, 'tournament_matches', `${event.id}_${drawKey}_${tm.match_id}`),
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
        advBatch.update(doc(db, 'tournament_matches', nextMatchId), {
          [`${slot}_name`]: player.name,
          [`${slot}_user_id`]: player.user_id,
          [`${slot}_contact`]: player.contact,
        });
      });
      await advBatch.commit();
    }
  };

  const updateMatchWithSubmission = async (match: TournamentMatch, submission: ScoreSubmission, isWalkover?: boolean) => {
    const batch = writeBatch(db);
    batch.update(doc(db, 'tournament_matches', match.id), {
      winner_name: submission.claimed_winner_name,
      winner_user_id: submission.claimed_winner_user_id,
      set_1_player_1: submission.set_1_player_1, set_1_player_2: submission.set_1_player_2,
      set_2_player_1: submission.set_2_player_1, set_2_player_2: submission.set_2_player_2,
      set_3_player_1: submission.set_3_player_1, set_3_player_2: submission.set_3_player_2,
      status: 'complete',
      completed_at: new Date().toISOString(),
      ...(isWalkover ? { walkover: true } : {}),
    });

    // Update player stats + league points
    // LL Draw (reserves) earns halved points; main draw earns full points
    {
      const isLL = match.bracket === 'reserves';
      const isRRGroupStage = match.format === 'rr' && match.round === 'RR';
      const LOSER_PTS: Record<string, number> = isLL
        ? { R32: 0.5, R16: 1, QF: 1.5, SF: 2.5, F: 5 }
        : { R32: 1, R16: 2, QF: 3, RR: 1, SF: 5, F: 10 };
      const loserPts = LOSER_PTS[match.round] ?? (isLL ? 0.5 : 1);
      const winnerPts = isLL ? 10 : isRRGroupStage ? (isWalkover ? 1 : 2) : 20;
      const isFinal = match.round === 'F';
      const matchLeague = match.tournament_choice === 'Doubles' ? 'Doubles' : match.division;
      const winnerUid = submission.claimed_winner_user_id;
      const loserUid = winnerUid === match.player_1_user_id ? match.player_2_user_id : match.player_1_user_id;

      // Games won per player (set scores are absolute: player_1/2 = match positions)
      const newP1G = (submission.set_1_player_1 ?? 0) + (submission.set_2_player_1 ?? 0) + (submission.set_3_player_1 ?? 0);
      const newP2G = (submission.set_1_player_2 ?? 0) + (submission.set_2_player_2 ?? 0) + (submission.set_3_player_2 ?? 0);
      const newTotal = newP1G + newP2G;
      const winnerIsP1 = winnerUid === match.player_1_user_id;

      if (match.status !== 'complete') {
        // First confirmation — apply all increments
        if (winnerUid) {
          batch.set(doc(db, 'stats', winnerUid), {
            matchesPlayed: increment(1),
            wins: increment(1),
            league: matchLeague,
            pointswon: increment(winnerIsP1 ? newP1G : newP2G),
            totalPointsPlayed: increment(newTotal),
            ...(isFinal ? { leaguePoints26: increment(winnerPts), tournamentsPlayed: increment(1) } : {}),
          }, { merge: true });
        }
        if (loserUid) {
          batch.set(doc(db, 'stats', loserUid), {
            matchesPlayed: increment(1),
            loses: increment(1),
            leaguePoints26: increment(loserPts),
            tournamentsPlayed: increment(1),
            league: matchLeague,
            pointswon: increment(winnerIsP1 ? newP2G : newP1G),
            totalPointsPlayed: increment(newTotal),
          }, { merge: true });
        }
      } else {
        // Re-entry (edit score) — compute per-player delta (new − old) and apply
        const oldWinnerUid = match.winner_user_id ?? '';
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
          const oldPts = wasWinner ? (isFinal ? winnerPts : 0) : loserPts;
          const newPts = isWinner ? (isFinal ? winnerPts : 0) : loserPts;
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

        applyPlayerDelta(match.player_1_user_id, true);
        applyPlayerDelta(match.player_2_user_id, false);
      }
    }

    await batch.commit();

    // Advance the winner into the next match as a best-effort follow-up, AFTER the
    // result is committed — so a missing/mismatched next-match document can never roll
    // back the recorded winner, scores, or stats. Resolve the next match from loaded
    // state (use its real doc id) rather than reconstructing the id from the draw key,
    // which breaks for merged/regenerated draws whose next round lives under a
    // different key.
    // Returns whether the winner still needs manual placement (advancement couldn't complete).
    if (!match.next_match_id) return { needsManual: false };

    // Normalize bracket so undefined and null compare equal (legacy/regenerated docs).
    const sameDraw = (m: TournamentMatch) =>
      (m.bracket ?? null) === (match.bracket ?? null) &&
      m.tournament_choice === match.tournament_choice &&
      m.division === match.division &&
      m.skill_group === match.skill_group;
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
      await updateDoc(doc(db, 'tournament_matches', nextMatch.id), {
        [`${slot}_name`]: submission.claimed_winner_name,
        [`${slot}_user_id`]: submission.claimed_winner_user_id,
        [`${slot}_contact`]:
          submission.claimed_winner_user_id === match.player_1_user_id
            ? match.player_1_contact
            : match.player_2_contact,
      });
      return { needsManual: false };
    } catch (err) {
      console.error('Winner recorded, but advancing to the next match failed:', err);
      return { needsManual: true };
    }
  };

  // ── Action handlers ───────────────────────────────────────────────────────

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

    const completedSnap = await getDocs(
      query(collection(db, 'tournament_matches'),
        where('event_id', '==', event!.id),
        where('status', '==', 'complete'),
      )
    );
    if (!completedSnap.empty) {
      setMessage({ type: 'error', text: 'Cannot cancel — a match has already been played in this draw.' });
      return;
    }

    if (!window.confirm(`Cancel all matches for ${currentDraw.label}? This will clear the draw and return to preview mode.`)) return;
    setResettingDraw(true);
    setMessage(null);
    try {
      const batch = writeBatch(db);
      currentMatches.forEach((m) => batch.delete(doc(db, 'tournament_matches', m.id)));
      await batch.commit();
      setEditMode(false);
      setPreviewSlotOverrides((prev) => deleteKey(prev, currentDraw.label));
      setPreviewDrawSize((prev) => deleteKey(prev, currentDraw.label));
      if (currentDraw.skillGroup === 'All' && currentDraw.tournamentChoice === 'Singles' && currentDraw.division === "Men's") setMergeMensSingles(false);
      if (currentDraw.skillGroup === 'All' && currentDraw.tournamentChoice === 'Singles' && currentDraw.division === "Women's") setMergeWomensSingles(false);
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
    if (matchId.startsWith('ll_preview_')) {
      const match = llDrawDisplayMatches.find((m) => m.id === matchId);
      if (!match || !llCurrentKey) return;
      const slotNum = slot === 'player_1' ? match.player_1_slot : match.player_2_slot;
      if (typeof slotNum !== 'number') return;
      setLLDrawSlotOverrides((prev) => ({
        ...prev,
        [llCurrentKey]: { ...(prev[llCurrentKey] ?? {}), [slotNum]: player },
      }));
      return;
    }
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
      // Invariant: any player placed into a real (persisted) bracket slot MUST have a
      // matching event_participants entry for this event. Otherwise they appear in the
      // draw but are invisible to engagement reports — flagged as "inactive" or a Slam
      // "no-show" despite clearly being in the tournament. Self-heal here so the entry
      // always exists, regardless of how the player became selectable. No-op when the
      // player is already a participant, so the normal Add Player → Move Players flow
      // is unaffected.
      if (player?.user_id && event && currentDraw &&
          !participants.some((p) => p.user_id === player.user_id)) {
        let skillLevel = statsMap[player.user_id]?.skill_level ?? 0;
        if (!statsMap[player.user_id]) {
          const statsSnap = await getDocs(query(collection(db, 'stats'), where('__name__', '==', player.user_id)));
          skillLevel = (statsSnap.docs[0]?.data() as UserStats | undefined)?.skill_level ?? 0;
        }
        await addDoc(collection(db, 'event_participants'), {
          user_id: player.user_id,
          user_name: player.name,
          event_id: event.id,
          event_name: event.title,
          tournament_choice: currentDraw.tournamentChoice,
          division: currentDraw.division !== 'All' ? currentDraw.division : "Men's",
          skill: skillLevel,
          createdAt: new Date().toISOString(),
        });
      }

      await updateDoc(doc(db, 'tournament_matches', matchId), {
        [`${slot}_name`]: player?.name || BYE,
        [`${slot}_user_id`]: player?.user_id || '',
        [`${slot}_contact`]: player?.contact || '',
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

    const isPlayerInMatch = user.uid === match.player_1_user_id || user.uid === match.player_2_user_id;
    if (!isCreator && !isPlayerInMatch) return;

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
    const submitterIsP1 = isCreator ? true : user.uid === match.player_1_user_id;
    const p1Scores = parsedSets.map((s) => (submitterIsP1 ? s.mine : s.opponent));
    const p2Scores = parsedSets.map((s) => (submitterIsP1 ? s.opponent : s.mine));

    const submission: ScoreSubmission = {
      claimed_winner_name: scoreForm.winnerUserId === match.player_1_user_id ? match.player_1_name : match.player_2_name,
      claimed_winner_user_id: scoreForm.winnerUserId,
      set_1_player_1: p1Scores[0], set_1_player_2: p2Scores[0],
      set_2_player_1: p1Scores[1], set_2_player_2: p2Scores[1],
      set_3_player_1: p1Scores[2], set_3_player_2: p2Scores[2],
    };

    const isWalkover = parsedSets.every((s) => s.mine === 0 && s.opponent === 0);

    // Player path → queue a pending submission for the creator to confirm.
    if (!isCreator) {
      try {
        await addDoc(collection(db, 'score_submissions'), {
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
        setMessage({ type: 'success', text: 'Score submitted — the organizer will confirm it.' });
      } catch (err) {
        console.error('Score submission failed:', err);
        setMessage({ type: 'error', text: 'Could not submit your score. Please try again.' });
      }
      return;
    }

    // Creator path → record immediately.
    try {
      const { needsManual } = await updateMatchWithSubmission(match, submission, isWalkover);
      setScoreForm(null);
      setMessage(
        needsManual
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
      await deleteDoc(doc(db, 'score_submissions', sub.id)).catch(() => {});
      setMessage({ type: 'error', text: 'That match is already scored — the submission was discarded.' });
      return;
    }
    const submission: ScoreSubmission = {
      claimed_winner_name: sub.claimed_winner_name,
      claimed_winner_user_id: sub.claimed_winner_user_id,
      set_1_player_1: sub.set_1_player_1, set_1_player_2: sub.set_1_player_2,
      set_2_player_1: sub.set_2_player_1, set_2_player_2: sub.set_2_player_2,
      set_3_player_1: sub.set_3_player_1, set_3_player_2: sub.set_3_player_2,
    };
    try {
      const { needsManual } = await updateMatchWithSubmission(match, submission, sub.is_walkover);
      await deleteDoc(doc(db, 'score_submissions', sub.id));
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

  const handleRejectSubmission = async (sub: ScoreSubmissionDoc) => {
    if (!isCreator) return;
    try {
      await deleteDoc(doc(db, 'score_submissions', sub.id));
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
          user_id: `__loading_${Date.now()}`,
          user_name: PLAYER_LOADING,
          event_id: event.id,
          event_name: event.title,
          tournament_choice: currentDraw.tournamentChoice,
          division,
          skill: 0,
          createdAt: new Date().toISOString(),
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
        user_id: userId,
        user_name: userData.name,
        event_id: event.id,
        event_name: event.title,
        tournament_choice: currentDraw.tournamentChoice,
        division,
        skill: skillLevel,
        ...(partnerName ? { doubles: partnerName, partner_in_app: 'no' } : {}),
        createdAt: new Date().toISOString(),
      });
      // Re-adding a player clears any prior withdrawal so they can be grouped again.
      if (currentDrawFormat === 'rr') { manuallyUnplacedIdsRef.current.delete(userId); await setRRWithdrawnMembership([], [userId]); }
      setMessage({ type: 'success', text: `${userData.name} added. Use Move Players to assign their bracket.` });
    } catch (err) {
      console.error('Add player failed:', err);
      setMessage({ type: 'error', text: 'Could not add player.' });
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
      winnerUserId: match.player_1_user_id,
      sets: [{ mine: '', opponent: '' }, { mine: '', opponent: '' }, { mine: '', opponent: '' }],
    });
  };

  const handleSetLLDrawSize = (size: number) => {
    if (!llCurrentKey) return;
    setLLDrawSizes((prev) => ({ ...prev, [llCurrentKey]: size }));
  };

  const handleResetLLDraw = async () => {
    if (!isCreator || !currentDraw || currentReservesMatches.length === 0) return;
    if (!window.confirm('Reset the LL Draw? This will delete all LL Draw matches and return to preview mode.')) return;
    try {
      const batch = writeBatch(db);
      currentReservesMatches.forEach((m) => batch.delete(doc(db, 'tournament_matches', m.id)));
      await batch.commit();
      if (llCurrentKey) {
        setLLDrawSizes((prev) => deleteKey(prev, llCurrentKey));
        setLLDrawSlotOverrides((prev) => deleteKey(prev, llCurrentKey));
      }
      setMessage({ type: 'success', text: 'LL Draw reset.' });
    } catch (err) {
      console.error('LL Draw reset failed:', err);
      setMessage({ type: 'error', text: 'Could not reset the LL Draw.' });
    }
  };

  const handleGenerateReservesDraw = async () => {
    if (!event || !isCreator || !currentDraw || !llCurrentKey) return;
    setGeneratingReserves(true);
    setMessage(null);
    try {
      const drawsize = currentLLSize;
      const templateMatches = normalizeTemplateMatches(fallbackTemplate(drawsize));
      const slotMap = new Map<number, TournamentPlayer>();
      Object.entries(currentLLSlotOverrides).forEach(([slotStr, player]) => {
        if (player !== null) slotMap.set(Number(slotStr), player);
      });
      const drawKey = getDrawKey(currentDraw.tournamentChoice, currentDraw.division, 'All');
      const batch = writeBatch(db);
      const cfg = {
        eventId: event.id,
        tournamentChoice: currentDraw.tournamentChoice,
        division: currentDraw.division,
        skillGroup: 'All' as const,
        drawsize,
        allMatches: templateMatches,
      };
      templateMatches.forEach((tm, index) => {
        batch.set(
          doc(db, 'tournament_matches', `${event.id}_reserves_${drawKey}_${tm.match_id}`),
          { ...buildMatchFields(tm, index, slotMap, cfg), bracket: 'reserves', started: false, created_at: new Date().toISOString() },
          { merge: true },
        );
      });
      await batch.commit();
      setLLDrawSlotOverrides((prev) => deleteKey(prev, llCurrentKey));
      setShowReserves(true);
      setMessage({ type: 'success', text: 'LL Draw finalized.' });
    } catch (err) {
      console.error('LL Draw generation failed:', err);
      setMessage({ type: 'error', text: 'Could not finalize the LL Draw.' });
    } finally {
      setGeneratingReserves(false);
    }
  };

  // ── Round Robin action handlers ───────────────────────────────────────────

  const rrDraftKey = () => currentDraw
    ? getDrawKey(currentDraw.tournamentChoice, currentDraw.division, currentDraw.skillGroup) : '';

  // Persist an edited pre-generation grouping to the draft doc (no matches written). Empty groups
  // are dropped so groups/labels/custom stay aligned; players placed back into a group are removed
  // from the withdrawn list.
  const saveRRDraft = async (groups: TournamentPlayer[][], labels: string[], custom: boolean[], withdrawnExtra: string[] = []) => {
    if (!event || !currentDraw) return;
    const rows = groups
      .map((g, i) => ({ uids: g.map((p) => p.user_id), label: labels[i] ?? '', c: custom[i] ?? false }))
      .filter((r) => r.uids.length > 0);
    const placed = new Set(rows.flatMap((r) => r.uids));
    const withdrawn = [...new Set([...(rrDraft?.withdrawn ?? []), ...withdrawnExtra])].filter((uid) => !placed.has(uid));
    await setDoc(doc(db, 'rr_drafts', `${event.id}_${rrDraftKey()}`), {
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
    await setDoc(doc(db, 'rr_drafts', `${event.id}_${rrDraftKey()}`), {
      event_id: event.id, draw_key: rrDraftKey(), withdrawn: next, updated_at: new Date().toISOString(),
    }, { merge: true });
  };

  const handleGenerateRR = async (config: RRConfig) => {
    if (!isCreator || !event || !currentDraw) return;
    setGeneratingRR(true);
    setMessage(null);
    try {
      const drawKey = getDrawKey(currentDraw.tournamentChoice, currentDraw.division, currentDraw.skillGroup);
      // Generate from what the creator sees (the draft arrangement if they edited one, else the
      // computed preview), so the confirmed groups + names match the preview exactly.
      const groups = previewRRGroups;
      const labels = previewRRLabels;
      const batch = writeBatch(db);
      // Clear any existing RR docs for this draw first so re-generating can't leave
      // orphaned groups/matches behind (deterministic doc IDs only overwrite a matching
      // group+match index; fewer/smaller groups would otherwise strand the old docs).
      currentMatches.filter((m) => m.format === 'rr').forEach((m) => batch.delete(doc(db, 'tournament_matches', m.id)));
      groups.forEach((players, gi) => {
        const pairings = players.length >= 2 ? generateGroupPairings(players.length) : [[0, 1]] as [number, number][];
        buildRRGroupMatchFields({
          eventId: event.id, drawKey, draw: currentDraw,
          groupIndex: gi, groupLabel: labels[gi] ?? `Group ${String.fromCharCode(65 + gi)}`,
          labelCustom: !!rrDraft?.custom[gi],
          groupPlayers: players, pairings,
          advancementCount: config.advancementCount, started,
        }).forEach(({ docId, fields }) => {
          batch.set(doc(db, 'tournament_matches', docId), fields);
        });
      });
      await batch.commit();
      setShowRRConfig(false);
      setEditMode(false);
      setMessage({ type: 'success', text: `Round Robin draw generated — ${groups.length} group${groups.length > 1 ? 's' : ''}.` });
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
    const drawKey = getDrawKey(currentDraw.tournamentChoice, currentDraw.division, currentDraw.skillGroup);
    const advCount = rrConfig?.advancementCount ?? 1;
    // 0 or 1 player → write one placeholder match so the group stays visible.
    const makePairings = (n: number): [number, number][] => n >= 2 ? generateGroupPairings(n) : [[0, 1]];

    // Draft state (no matches yet): apply the edit to the preview arrangement and persist it as a
    // draft — nothing is generated. Moved players are removed from their source groups.
    if (rrGroupMatches.length === 0) {
      try {
        const real = newPlayers.filter((p) => p.user_id && p.user_id !== PLAYER_LOADING_SENTINEL);
        const movedIn = new Set(real.map((p) => p.user_id));
        const nextGroups = previewRRGroups.map((groupPlayers, gi) =>
          gi === rrGroup ? real : groupPlayers.filter((p) => !movedIn.has(p.user_id)),
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

    let removedUids: string[] = [];
    try {
      const batch = writeBatch(db);

      {
        // Generated state: rewrite the target group and atomically update any source groups
        // for players moved in from elsewhere.
        const oldMatches = rrGroupMatches.filter((m) => (m.rr_group ?? 0) === rrGroup);
        if (oldMatches.some((m) => m.status === 'complete')) {
          setMessage({ type: 'error', text: 'Cannot edit a group with played matches.' });
          return;
        }
        const groupLabel = oldMatches[0]?.rr_group_label ?? `Group ${String.fromCharCode(65 + rrGroup)}`;
        const labelCustom = oldMatches[0]?.rr_label_custom ?? false;

        const existingIds = new Set<string>();
        oldMatches.forEach((m) => {
          if (m.player_1_user_id) existingIds.add(m.player_1_user_id);
          if (m.player_2_user_id) existingIds.add(m.player_2_user_id);
        });

        // Collect edits needed on source groups for cross-group moves.
        const srcEdits = new Map<number, { players: TournamentPlayer[]; label: string; labelCustom: boolean }>();
        for (const p of newPlayers) {
          if (!p.user_id || existingIds.has(p.user_id)) continue;
          for (const srcGi of rrGroupIndices) {
            if (srcGi === rrGroup) continue;
            const srcMs = rrGroupMatches.filter((m) => (m.rr_group ?? 0) === srcGi);
            if (srcMs.some((m) => m.status === 'complete')) {
              setMessage({ type: 'error', text: 'Cannot move — source group has played matches.' });
              return;
            }
            const srcPlayers = buildRRGroupsFrom(srcMs, [srcGi])[0] ?? [];
            if (srcPlayers.some((sp) => sp.user_id === p.user_id)) {
              srcEdits.set(srcGi, {
                players: srcPlayers.filter((sp) => sp.user_id !== p.user_id),
                label: srcMs[0]?.rr_group_label ?? `Group ${String.fromCharCode(65 + srcGi)}`,
                labelCustom: srcMs[0]?.rr_label_custom ?? false,
              });
              break;
            }
          }
        }

        // Strip PLAYER_LOADING sentinels — they must not generate match pairings.
        const realNewPlayers = newPlayers.filter((p) => p.user_id !== PLAYER_LOADING_SENTINEL);
        // Players replaced with PLAYER_LOADING are withdrawn — persisted below so auto-placement
        // never re-adds them (even after a refresh).
        const prevPlayers = buildRRGroupsFrom(oldMatches, [rrGroup])[0] ?? [];
        removedUids = prevPlayers
          .filter((p) => p.user_id && !realNewPlayers.some((np) => np.user_id === p.user_id))
          .map((p) => p.user_id);
        removedUids.forEach((uid) => manuallyUnplacedIdsRef.current.add(uid));

        oldMatches.forEach((m) => batch.delete(doc(db, 'tournament_matches', m.id)));
        // Empty group → dissolve it entirely; do not write a placeholder match.
        if (realNewPlayers.length > 0) {
          buildRRGroupMatchFields({
            eventId: event.id, drawKey, draw: currentDraw,
            groupIndex: rrGroup, groupLabel, labelCustom,
            groupPlayers: realNewPlayers, pairings: makePairings(realNewPlayers.length),
            advancementCount: advCount, started,
          }).forEach(({ docId, fields }) => batch.set(doc(db, 'tournament_matches', docId), fields));
        }

        for (const [srcGi, srcEdit] of srcEdits) {
          const srcMs = rrGroupMatches.filter((m) => (m.rr_group ?? 0) === srcGi);
          srcMs.forEach((m) => batch.delete(doc(db, 'tournament_matches', m.id)));
          buildRRGroupMatchFields({
            eventId: event.id, drawKey, draw: currentDraw,
            groupIndex: srcGi, groupLabel: srcEdit.label, labelCustom: srcEdit.labelCustom,
            groupPlayers: srcEdit.players, pairings: makePairings(srcEdit.players.length),
            advancementCount: advCount, started,
          }).forEach(({ docId, fields }) => batch.set(doc(db, 'tournament_matches', docId), fields));
        }
      }

      await batch.commit();
      if (removedUids.length) await setRRWithdrawnMembership(removedUids);
      setMessage({ type: 'success', text: 'Group updated.' });
    } catch (err) {
      console.error('Group edit failed:', err);
      setMessage({ type: 'error', text: 'Could not save group changes.' });
    }
  };

  // True move of one player between two groups (a "dissolve" is repeated moves until a group
  // is emptied). `fromRRGroup`/`toRRGroup` are real rr_group values; the caller passes the
  // rebuilt player lists for each. When `targetDraw` differs from the current draw (Challengers
  // ↔ Masters, same gender), the player is rewritten into that draw's group (its own drawKey /
  // skill_group). Both groups are rewritten in one batch.
  const handleMoveRRPlayer = async (
    fromRRGroup: number,
    toRRGroup: number,
    newFromPlayers: TournamentPlayer[],
    newToPlayers: TournamentPlayer[],
    targetDraw?: DrawConfig,
  ) => {
    if (!isCreator || !event || !currentDraw) return;
    const toDraw = targetDraw ?? currentDraw;
    const crossDraw =
      toDraw.skillGroup !== currentDraw.skillGroup ||
      toDraw.division !== currentDraw.division ||
      toDraw.tournamentChoice !== currentDraw.tournamentChoice;
    if (!crossDraw && fromRRGroup === toRRGroup) return;

    // Draft state (no matches yet): apply same-draw moves to the draft; cross-skill moves need a
    // generated draw.
    if (rrGroupMatches.length === 0) {
      if (crossDraw) {
        setMessage({ type: 'error', text: 'Generate the draw before moving players across skill groups.' });
        return;
      }
      try {
        const clean = (arr: TournamentPlayer[]) => arr.filter((p) => p.user_id && p.user_id !== PLAYER_LOADING_SENTINEL);
        const nextGroups = previewRRGroups.map((g, gi) =>
          gi === toRRGroup ? clean(newToPlayers) : gi === fromRRGroup ? clean(newFromPlayers) : g,
        );
        const nextCustom = previewRRGroups.map((_, i) => !!rrDraft?.custom[i]);
        await saveRRDraft(nextGroups, previewRRLabels, nextCustom);
        setMessage({ type: 'success', text: 'Player moved.' });
      } catch (err) {
        console.error('RR draft move failed:', err);
        setMessage({ type: 'error', text: 'Could not move the player.' });
      }
      return;
    }

    const fromKey = getDrawKey(currentDraw.tournamentChoice, currentDraw.division, currentDraw.skillGroup);
    const toKey = getDrawKey(toDraw.tournamentChoice, toDraw.division, toDraw.skillGroup);
    const fromMatches = rrGroupMatches.filter((m) => (m.rr_group ?? 0) === fromRRGroup);
    const toMatches = (crossDraw ? rrSiblingMatches : rrGroupMatches).filter((m) => (m.rr_group ?? 0) === toRRGroup);
    // Never disturb a group with a played match.
    if ([...fromMatches, ...toMatches].some((m) => m.status === 'complete' || m.started)) {
      setMessage({ type: 'error', text: 'Cannot move — a match has already been played in one of these groups.' });
      return;
    }
    const advCount = rrConfig?.advancementCount ?? 1;
    const fromLabel = fromMatches[0]?.rr_group_label ?? `Group ${String.fromCharCode(65 + fromRRGroup)}`;
    const toLabel = toMatches[0]?.rr_group_label ?? `Group ${String.fromCharCode(65 + toRRGroup)}`;
    const fromCustom = fromMatches[0]?.rr_label_custom ?? false;
    const toCustom = toMatches[0]?.rr_label_custom ?? false;
    try {
      const batch = writeBatch(db);
      // Clear both groups, then rebuild each.
      [...fromMatches, ...toMatches].forEach((m) => batch.delete(doc(db, 'tournament_matches', m.id)));

      // Target group (in the current or the sibling draw) — always ≥ 2 after gaining a player.
      buildRRGroupMatchFields({
        eventId: event.id, drawKey: toKey, draw: toDraw,
        groupIndex: toRRGroup, groupLabel: toLabel, labelCustom: toCustom, groupPlayers: newToPlayers,
        pairings: newToPlayers.length === 1 ? [[0, 1]] : generateGroupPairings(newToPlayers.length),
        advancementCount: advCount, started,
      }).forEach(({ docId, fields }) => batch.set(doc(db, 'tournament_matches', docId), fields));

      // Source group: 0 left → removed (write nothing). 1 left → keep one placeholder match
      // (player vs PLAYER_LOADING) so the lone player stays visible and movable rather than
      // vanishing. ≥2 → normal round-robin.
      if (newFromPlayers.length >= 1) {
        buildRRGroupMatchFields({
          eventId: event.id, drawKey: fromKey, draw: currentDraw,
          groupIndex: fromRRGroup, groupLabel: fromLabel, labelCustom: fromCustom, groupPlayers: newFromPlayers,
          pairings: newFromPlayers.length === 1 ? [[0, 1]] : generateGroupPairings(newFromPlayers.length),
          advancementCount: advCount, started,
        }).forEach(({ docId, fields }) => batch.set(doc(db, 'tournament_matches', docId), fields));
      }

      await batch.commit();
      setMessage(
        newFromPlayers.length === 1
          ? { type: 'success', text: 'Player moved. Finish moving the remaining player to dissolve the group.' }
          : { type: 'success', text: 'Player moved.' },
      );
    } catch (err) {
      console.error('RR player move failed:', err);
      setMessage({ type: 'error', text: 'Could not move the player.' });
    }
  };

  // Create a new group in the current draw from a set of players (typically unplaced late
  // joiners). ≥2 → round-robin; exactly 1 → lone-player placeholder. Optional custom label.
  const handleCreateRRGroup = async (newPlayers: TournamentPlayer[], label?: string) => {
    if (!isCreator || !event || !currentDraw) return;
    const drawKey = getDrawKey(currentDraw.tournamentChoice, currentDraw.division, currentDraw.skillGroup);
    const nextIndex = (rrGroupIndices.length ? Math.max(...rrGroupIndices) : -1) + 1;
    const advCount = rrConfig?.advancementCount ?? 1;
    const trimmed = (label ?? '').trim();

    // Draft state: append a new group to the draft (no matches written).
    if (rrGroupMatches.length === 0) {
      try {
        const real = newPlayers.filter((p) => p.user_id && p.user_id !== PLAYER_LOADING_SENTINEL);
        if (real.length === 0) return;
        const movedIn = new Set(real.map((p) => p.user_id));
        const base = previewRRGroups.map((g) => g.filter((p) => !movedIn.has(p.user_id)));
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
      }).forEach(({ docId, fields }) => batch.set(doc(db, 'tournament_matches', docId), fields));
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
      groupMatches.forEach((m) => batch.update(doc(db, 'tournament_matches', m.id), { rr_group_label: trimmed, rr_label_custom: true }));
      await batch.commit();
      setMessage({ type: 'success', text: 'Group renamed.' });
    } catch (err) {
      console.error('RR group rename failed:', err);
      setMessage({ type: 'error', text: 'Could not rename the group.' });
    }
  };

  // ── Remove participant ────────────────────────────────────────────────────
  const handleRemoveParticipant = async (userId: string) => {
    if (!isCreator || !event) return;
    const participantDoc = participants.find((p) => p.user_id === userId && p.event_id === event.id);
    if (!participantDoc) return;
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, 'event_participants', participantDoc.id));

      if (currentDrawFormat === 'rr' && currentDraw) {
        const drawKey = getDrawKey(currentDraw.tournamentChoice, currentDraw.division, currentDraw.skillGroup);
        const advCount = rrConfig?.advancementCount ?? 1;
        const makePairings = (n: number): [number, number][] => n >= 2 ? generateGroupPairings(n) : [[0, 1]];

        for (const gi of rrGroupIndices) {
          const groupMs = rrGroupMatches.filter((m) => (m.rr_group ?? 0) === gi);
          const groupPlayers = buildRRGroupsFrom(groupMs, [gi])[0] ?? [];
          if (!groupPlayers.some((p) => p.user_id === userId)) continue;
          if (groupMs.some((m) => m.status === 'complete')) {
            setMessage({ type: 'error', text: 'Cannot remove — this player has a played match.' });
            return;
          }
          const newPlayers = groupPlayers.filter((p) => p.user_id !== userId);
          const groupLabel = groupMs[0]?.rr_group_label ?? `Group ${String.fromCharCode(65 + gi)}`;
          const labelCustom = groupMs[0]?.rr_label_custom ?? false;
          groupMs.forEach((m) => batch.delete(doc(db, 'tournament_matches', m.id)));
          buildRRGroupMatchFields({
            eventId: event.id, drawKey, draw: currentDraw,
            groupIndex: gi, groupLabel, labelCustom,
            groupPlayers: newPlayers, pairings: makePairings(newPlayers.length),
            advancementCount: advCount, started,
          }).forEach(({ docId, fields }) => batch.set(doc(db, 'tournament_matches', docId), fields));
          break;
        }
      }

      await batch.commit();
      setMessage({ type: 'success', text: 'Player removed from event.' });
    } catch (err) {
      console.error('Remove participant failed:', err);
      setMessage({ type: 'error', text: 'Could not remove the player.' });
    }
  };

  // ── Match scheduling ──────────────────────────────────────────────────────
  // Players may write only the scheduling fields (Firestore rules carve-out); scores stay
  // organizer-only. Preview (ungenerated) matches have no doc, so they're guarded out.
  const writeSchedule = async (matchId: string, patch: Record<string, unknown>, successText: string) => {
    if (!matchId || matchId.startsWith('preview_')) return;
    try {
      await updateDoc(doc(db, 'tournament_matches', matchId), patch);
      setMessage({ type: 'success', text: successText });
    } catch (err) {
      console.error('Schedule update failed:', err);
      setMessage({ type: 'error', text: 'Could not update the schedule.' });
    }
  };

  const handleProposeTime = (match: TournamentMatch, date: string, slot: 'AM' | 'PM') => {
    if (!user || !date) return;
    return writeSchedule(match.id, {
      proposed_date: date, proposed_slot: slot, proposed_by: user.uid,
      schedule_status: 'proposed', schedule_requested: false,
    }, 'Time proposed — waiting for your opponent to confirm.');
  };

  const handleConfirmTime = (match: TournamentMatch) => {
    if (!user || match.proposed_by === user.uid) return;
    return writeSchedule(match.id, { schedule_status: 'scheduled' }, 'Match scheduled.');
  };

  const handleAskOrganizerSchedule = async (match: TournamentMatch) => {
    await writeSchedule(match.id, { schedule_requested: true }, 'The organizer has been asked to schedule this match.');
    // Leave a notification for the organizer — consumed later by the Notifications tab.
    if (!event?.creator_id || match.id.startsWith('preview_')) return;
    try {
      await addDoc(collection(db, 'notifications'), {
        recipient_id: event.creator_id,
        type: 'schedule_request',
        event_id: event.id,
        event_title: event.title ?? '',
        match_id: match.id,
        match_round: match.round ?? '',
        player_1_name: match.player_1_name ?? '',
        player_2_name: match.player_2_name ?? '',
        requested_by: user?.uid ?? null,
        requested_by_name: profile?.user?.name || userParticipant?.user_name || 'A player',
        read: false,
        created_at: new Date().toISOString(),
      });
    } catch (err) {
      console.error('Notification write failed:', err);
    }
  };

  // Organizer sets the schedule authoritatively (also clears any player request).
  const handleSetSchedule = (match: TournamentMatch, date: string, slot: 'AM' | 'PM') => {
    if (!isCreator || !date) return;
    return writeSchedule(match.id, {
      proposed_date: date, proposed_slot: slot, schedule_status: 'scheduled', schedule_requested: false,
    }, 'Schedule set.');
  };

  const handleResetRR = async () => {
    if (!isCreator || !currentDraw || currentMatches.length === 0) return;
    const hasComplete = currentMatches.some((m) => m.status === 'complete');
    if (hasComplete) {
      setMessage({ type: 'error', text: 'Cannot reset — a match has already been played.' });
      return;
    }
    if (!window.confirm('Reset the Round Robin draw? This will clear all group and knockout matches.')) return;
    setResettingDraw(true);
    try {
      const batch = writeBatch(db);
      currentMatches.forEach((m) => batch.delete(doc(db, 'tournament_matches', m.id)));
      await batch.commit();
      setEditMode(false);
      setMessage({ type: 'success', text: 'Round Robin draw reset.' });
    } catch (err) {
      console.error('RR reset failed:', err);
      setMessage({ type: 'error', text: 'Could not reset the draw.' });
    } finally {
      setResettingDraw(false);
    }
  };

  // Build (or rebuild) the RR knockout at a creator-chosen size (R4/R8/R16). Group winners are
  // auto-seeded; the remaining slots are left empty (PLAYER_LOADING) for manual placement via the
  // draw editor. Available anytime after the group stage is generated. Re-selecting a size rebuilds
  // — refused if any knockout match has already been played.
  const handleGenerateRRKnockout = async (size?: number) => {
    if (!isCreator || !event || !currentDraw || rrGroupMatches.length === 0) return;
    if (rrKnockoutMatches.some((m) => m.status === 'complete' || m.started)) {
      setMessage({ type: 'error', text: 'Cannot rebuild — a knockout match has already been played.' });
      return;
    }
    setGeneratingRR(true);
    setMessage(null);
    try {
      const drawKey = getDrawKey(currentDraw.tournamentChoice, currentDraw.division, currentDraw.skillGroup);
      const winners = selectGroupWinners(rrGroups, rrStandingsByGroup);
      const docs = buildRRKnockoutDocs({
        eventId: event.id, drawKey, draw: currentDraw, advancingPlayers: winners, started,
        drawsize: size, manualFill: true,
      });
      const batch = writeBatch(db);
      rrKnockoutMatches.forEach((m) => batch.delete(doc(db, 'tournament_matches', m.id)));
      docs.forEach(({ docId, fields }) => batch.set(doc(db, 'tournament_matches', docId), fields));
      await batch.commit();
      setRRView('knockout');
      setMessage({ type: 'success', text: 'Knockout bracket ready — place the remaining players via Edit Draw.' });
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
    user,
    allTournamentEvents,
    event,
    matches,
    participants,
    isCreator,
    started,
    userParticipant,
    zoneMap,
    userMap,
    currentDraw,
    currentMatches,
    displayMatches,
    visibleDraws,
    opponent,
    nextMatchOpponents,
    editPlayers,
    reservesPlayers,
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
    mergeMensSingles,
    setMergeMensSingles,
    mergeWomensSingles,
    setMergeWomensSingles,
    consolidateDoubles,
    setConsolidateDoubles,
    activeTab,
    setActiveTab,
    activeSkill,
    setActiveSkill,
    activeDoubles,
    setActiveDoubles,
    availableUsers,
    handleUpdateRoundDeadline,
    handleSetPreviewDrawSize,
    handleAddPlayer,
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
    currentReservesMatches,
    llDrawDisplayMatches,
    currentLLSize,
    allUsersAsTournamentPlayers,
    showReserves,
    setShowReserves,
    generatingReserves,
    handleSetLLDrawSize,
    handleGenerateReservesDraw,
    handleResetLLDraw,
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
    rrSiblingDraw,
    rrSiblingGroups,
    rrSiblingLabels,
    rrSiblingIndices,
    rrView,
    setRRView,
    handleGenerateRR,
    handleResetRR,
    handleGenerateRRKnockout,
    handleSaveGroupEdit,
    handleMoveRRPlayer,
    handleCreateRRGroup,
    handleRenameGroup,
    handleRemoveParticipant,
    // Scheduling
    visibleUserMatch,
    userRRMatches,
    scheduleRequests,
    handleProposeTime,
    handleConfirmTime,
    handleAskOrganizerSchedule,
    handleSetSchedule,
  };
};
