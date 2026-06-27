import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  addDoc, collection, deleteDoc, doc, documentId, getDocs, increment, onSnapshot, query, updateDoc, where, writeBatch,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { EventParticipant, TennisEvent, UserData, UserStats } from '../../types';
import { DrawConfig, DrawTab, RRConfig, RRStandingRow, ScoreForm, ScoreSubmission, ScoreSubmissionDoc, SkillGroup, TournamentFormat, TournamentMatch, TournamentPlayer } from './types';
import {
  buildRRGroupMatchFields, buildRRKnockoutDocs, buildZoneTierGroups, computeGroupStandings,
  deriveRRConfig, generateGroupPairings, selectAdvancingPlayers,
} from './rrGeneration';
import {
  BYE, PLAYER_LOADING,
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
  const [generatingReserves, setGeneratingReserves] = useState(false);
  const [showReserves, setShowReserves] = useState(false);
  // LL Draw state — keyed by draw key so each division has independent size/slots
  const [llDrawSizes, setLLDrawSizes] = useState<Record<string, number>>({});
  const [llDrawSlotOverrides, setLLDrawSlotOverrides] = useState<Record<string, Record<number, TournamentPlayer | null>>>({});

  // Round Robin state
  const [showRRConfig, setShowRRConfig] = useState(false);
  const [generatingRR, setGeneratingRR] = useState(false);

  const activeEventIdRef = useRef<string | undefined>(undefined);

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

  const pendingMatchIds = useMemo(
    () => new Set(pendingSubmissions.map((s) => s.match_id)),
    [pendingSubmissions],
  );

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

  const visibleDraws = useMemo(
    () => (isCreator || !userDraw ? effectiveDraws : [userDraw]),
    [isCreator, userDraw, effectiveDraws],
  );

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

  // Preview groups shown before any RR matches are generated. Uses the SAME skill-first
  // grouping as generation (buildZoneTierGroups) so the preview shape matches the generated
  // draw. Group size isn't chosen until the config modal runs, so preview defaults to 4.
  const previewRRGroups = useMemo<TournamentPlayer[][]>(() => {
    if (currentDrawFormat !== 'rr' || currentMatches.length > 0) return [];
    const skillMap: Record<string, number> = {};
    for (const p of currentDrawAllPlayers) {
      skillMap[p.user_id] = effectiveStatsMap[p.user_id]?.skill_level ?? p.skillLevel ?? 0;
    }
    return buildZoneTierGroups(currentDrawAllPlayers, zoneMap, skillMap, 4).map((g) => g.players);
  }, [currentDrawFormat, currentMatches, currentDrawAllPlayers, effectiveStatsMap, zoneMap]);


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

  const rrGroups = useMemo<TournamentPlayer[][]>(() => {
    if (rrGroupMatches.length === 0) return [];
    const isDoubles = rrGroupMatches[0]?.tournament_choice === 'Doubles';
    // Resolve name/contact live from userMap by user_id (fall back to the match-doc
    // snapshot) so re-seated or profile-updated players show current info and a working
    // profile link. Names are only overridden for singles — doubles names embed the
    // partner ("A / B") and must keep the match-doc value.
    const liveName = (uid: string, snapshot: string) => {
      const u = userMap[uid];
      return !isDoubles && u?.name ? formatPlayerName(u.name) : snapshot;
    };
    const liveContact = (uid: string, snapshot: string) => {
      const u = userMap[uid];
      if (!u) return snapshot;
      return (u.preferred_mode_of_contact === 'phone' ? u.phone : u.email) || snapshot;
    };
    return rrGroupIndices.map((gi) => {
      const groupMs = rrGroupMatches.filter((m) => (m.rr_group ?? 0) === gi);
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
  }, [rrGroupMatches, rrGroupIndices, userMap]);

  const rrStandingsByGroup = useMemo<RRStandingRow[][]>(
    () => rrGroups.map((players) => {
      const ids = new Set(players.map((p) => p.user_id));
      return computeGroupStandings(rrGroupMatches.filter((m) => ids.has(m.player_1_user_id) || ids.has(m.player_2_user_id)));
    }),
    [rrGroups, rrGroupMatches],
  );

  const rrConfig = useMemo(() => deriveRRConfig(currentMatches), [currentMatches]);

  // Per-group labels. The letter is derived from the sorted display position so groups
  // always read A, B, C… even when the stored rr_group values are non-contiguous; only
  // the zone suffix is reused from the stored rr_group_label.
  const rrGroupLabels = useMemo<string[]>(() => {
    if (rrGroupMatches.length === 0) return [];
    const groupIndices = [...new Set(rrGroupMatches.map((m) => m.rr_group ?? 0))].sort((a, b) => a - b);
    return groupIndices.map((gi, idx) => {
      const first = rrGroupMatches.find((m) => (m.rr_group ?? 0) === gi);
      const letter = String.fromCharCode(65 + idx);
      const stored = first?.rr_group_label ?? '';
      const dash = stored.indexOf(' - ');
      const zone = dash >= 0 ? stored.slice(dash + 3) : '';
      return zone ? `Group ${letter} - ${zone}` : `Group ${letter}`;
    });
  }, [rrGroupMatches]);

  // Players in the current user's RR group (null if not in RR or not a participant)
  const userRRGroup = useMemo<TournamentPlayer[] | null>(() => {
    if (!user || rrGroups.length === 0) return null;
    return rrGroups.find((g) => g.some((p) => p.user_id === user.uid)) ?? null;
  }, [user, rrGroups]);

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
    if (!match) {
      setMessage({ type: 'error', text: 'That match no longer exists. Removing the submission.' });
      await deleteDoc(doc(db, 'score_submissions', sub.id)).catch(() => {});
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

  const handleGenerateRR = async (config: RRConfig) => {
    if (!isCreator || !event || !currentDraw) return;
    setGeneratingRR(true);
    setMessage(null);
    try {
      const drawKey = getDrawKey(currentDraw.tournamentChoice, currentDraw.division, currentDraw.skillGroup);
      // Build skill map from statsMap, falling back to participant.skill snapshot
      const skillMap: Record<string, number> = {};
      for (const p of currentDrawAllPlayers) {
        skillMap[p.user_id] = statsMap[p.user_id]?.skill_level ?? p.skillLevel ?? 0;
      }
      const zoneTierGroups = buildZoneTierGroups(currentDrawAllPlayers, zoneMap, skillMap, config.groupSize);
      const batch = writeBatch(db);
      // Clear any existing RR docs for this draw first so re-generating can't leave
      // orphaned groups/matches behind (deterministic doc IDs only overwrite a matching
      // group+match index; fewer/smaller groups would otherwise strand the old docs).
      currentMatches.filter((m) => m.format === 'rr').forEach((m) => batch.delete(doc(db, 'tournament_matches', m.id)));
      zoneTierGroups.forEach((group, gi) => {
        const pairings = generateGroupPairings(group.players.length);
        buildRRGroupMatchFields({
          eventId: event.id, drawKey, draw: currentDraw,
          groupIndex: gi, groupLabel: group.label, groupPlayers: group.players, pairings,
          advancementCount: config.advancementCount, started,
        }).forEach(({ docId, fields }) => {
          batch.set(doc(db, 'tournament_matches', docId), fields);
        });
      });
      await batch.commit();
      setShowRRConfig(false);
      setEditMode(false);
      setMessage({ type: 'success', text: `Round Robin draw generated — ${zoneTierGroups.length} group${zoneTierGroups.length > 1 ? 's' : ''}.` });
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
    const oldMatches = rrGroupMatches.filter((m) => (m.rr_group ?? 0) === rrGroup);
    const groupLabel = oldMatches[0]?.rr_group_label ?? `Group ${String.fromCharCode(65 + rrGroup)}`;
    const pairings = generateGroupPairings(newPlayers.length);
    const advCount = rrConfig?.advancementCount ?? 1;
    try {
      const batch = writeBatch(db);
      oldMatches.forEach((m) => batch.delete(doc(db, 'tournament_matches', m.id)));
      buildRRGroupMatchFields({
        eventId: event.id, drawKey, draw: currentDraw,
        groupIndex: rrGroup, groupLabel, groupPlayers: newPlayers, pairings,
        advancementCount: advCount, started,
      }).forEach(({ docId, fields }) => batch.set(doc(db, 'tournament_matches', docId), fields));
      await batch.commit();
      setMessage({ type: 'success', text: `Group ${groupLabel} updated.` });
    } catch (err) {
      console.error('Group edit failed:', err);
      setMessage({ type: 'error', text: 'Could not save group changes.' });
    }
  };

  // True move of one player between two groups (a "dissolve" is repeated moves until a group
  // is emptied). `fromRRGroup`/`toRRGroup` are real rr_group values; the caller passes the
  // rebuilt player lists for each. Both groups are rewritten in one batch.
  const handleMoveRRPlayer = async (
    fromRRGroup: number,
    toRRGroup: number,
    newFromPlayers: TournamentPlayer[],
    newToPlayers: TournamentPlayer[],
  ) => {
    if (!isCreator || !event || !currentDraw || fromRRGroup === toRRGroup) return;
    const drawKey = getDrawKey(currentDraw.tournamentChoice, currentDraw.division, currentDraw.skillGroup);
    const fromMatches = rrGroupMatches.filter((m) => (m.rr_group ?? 0) === fromRRGroup);
    const toMatches = rrGroupMatches.filter((m) => (m.rr_group ?? 0) === toRRGroup);
    // Never disturb a group with a played match.
    if ([...fromMatches, ...toMatches].some((m) => m.status === 'complete' || m.started)) {
      setMessage({ type: 'error', text: 'Cannot move — a match has already been played in one of these groups.' });
      return;
    }
    const advCount = rrConfig?.advancementCount ?? 1;
    const fromLabel = fromMatches[0]?.rr_group_label ?? `Group ${String.fromCharCode(65 + fromRRGroup)}`;
    const toLabel = toMatches[0]?.rr_group_label ?? `Group ${String.fromCharCode(65 + toRRGroup)}`;
    try {
      const batch = writeBatch(db);
      // Clear both groups, then rebuild each.
      [...fromMatches, ...toMatches].forEach((m) => batch.delete(doc(db, 'tournament_matches', m.id)));

      // Target group (always ≥ 2 after gaining a player).
      buildRRGroupMatchFields({
        eventId: event.id, drawKey, draw: currentDraw,
        groupIndex: toRRGroup, groupLabel: toLabel, groupPlayers: newToPlayers,
        pairings: generateGroupPairings(newToPlayers.length),
        advancementCount: advCount, started,
      }).forEach(({ docId, fields }) => batch.set(doc(db, 'tournament_matches', docId), fields));

      // Source group: 0 left → removed (write nothing). 1 left → keep one placeholder match
      // (player vs PLAYER_LOADING) so the lone player stays visible and movable rather than
      // vanishing. ≥2 → normal round-robin.
      if (newFromPlayers.length === 1) {
        buildRRGroupMatchFields({
          eventId: event.id, drawKey, draw: currentDraw,
          groupIndex: fromRRGroup, groupLabel: fromLabel, groupPlayers: newFromPlayers,
          pairings: [[0, 1]], advancementCount: advCount, started,
        }).forEach(({ docId, fields }) => batch.set(doc(db, 'tournament_matches', docId), fields));
      } else if (newFromPlayers.length >= 2) {
        buildRRGroupMatchFields({
          eventId: event.id, drawKey, draw: currentDraw,
          groupIndex: fromRRGroup, groupLabel: fromLabel, groupPlayers: newFromPlayers,
          pairings: generateGroupPairings(newFromPlayers.length),
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

  const handleGenerateRRKnockout = async () => {
    if (!isCreator || !event || !currentDraw || !rrKnockoutReady) return;
    setGeneratingRR(true);
    setMessage(null);
    try {
      const drawKey = getDrawKey(currentDraw.tournamentChoice, currentDraw.division, currentDraw.skillGroup);
      const advancing = selectAdvancingPlayers(rrGroups, rrStandingsByGroup, rrConfig?.advancementCount ?? 1);
      const docs = buildRRKnockoutDocs({ eventId: event.id, drawKey, draw: currentDraw, advancingPlayers: advancing, started });
      const batch = writeBatch(db);
      docs.forEach(({ docId, fields }) => batch.set(doc(db, 'tournament_matches', docId), fields));
      await batch.commit();
      setMessage({ type: 'success', text: 'Knockout stage generated.' });
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
    pendingSubmissions,
    pendingMatchIds,
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
    userRRGroup,
    rrStandingsByGroup,
    rrGroupMatches,
    rrKnockoutMatches,
    rrKnockoutReady,
    rrConfig,
    rrGroupLabels,
    rrGroupIndices,
    handleGenerateRR,
    handleResetRR,
    handleGenerateRRKnockout,
    handleSaveGroupEdit,
    handleMoveRRPlayer,
  };
};
