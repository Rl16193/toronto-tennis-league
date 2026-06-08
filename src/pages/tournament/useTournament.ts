import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  addDoc, collection, doc, getDocs, increment, onSnapshot, query, setDoc, updateDoc, where, writeBatch,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { EventParticipant, TennisEvent, UserData, UserStats } from '../../types';
import { DrawConfig, DrawTab, RRConfig, RRStandingRow, ScoreForm, ScoreSubmission, SkillGroup, TournamentFormat, TournamentMatch, TournamentPlayer, TournamentTemplate } from './types';
import {
  buildRRGroupMatchFields, buildRRKnockoutDocs, computeGroupStandings,
  deriveRRConfig, distributePlayersIntoGroups, generateGroupPairings, selectAdvancingPlayers,
} from './rrGeneration';
import {
  BYE, PLAYER_LOADING,
  buildMatchFields, buildPlayerList, deleteKey, fallbackTemplate, filterParticipantsForDraw,
  getDrawKey, getDrawSize, getEventDate,
  isTournamentStarted, normalizeTemplateMatches, scoresMatch,
} from './utils';
import { CONSOLIDATED_DOUBLES_DRAW, MENS_MERGED_DRAW, VISIBLE_DRAWS, WOMENS_MERGED_DRAW } from './drawConfigs';

export const useTournament = (eventIdOverride?: string) => {
  const { user, profile, loading: authLoading } = useAuth();

  const [allTournamentEvents, setAllTournamentEvents] = useState<TennisEvent[]>([]);
  const [event, setEvent] = useState<TennisEvent | null>(null);
  const [participants, setParticipants] = useState<EventParticipant[]>([]);
  const [matches, setMatches] = useState<TournamentMatch[]>([]);
  const [submissions, setSubmissions] = useState<ScoreSubmission[]>([]);
  const [templates, setTemplates] = useState<TournamentTemplate[]>([]);
  const [userMap, setUserMap] = useState<Record<string, UserData>>({});
  const [statsMap, setStatsMap] = useState<Record<string, UserStats>>({});

  const [activeTab, setActiveTab] = useState<DrawTab>('mens');
  const [activeSkill, setActiveSkill] = useState<SkillGroup>('Challengers');
  const [activeDoubles, setActiveDoubles] = useState("Men's");
  const [scoreForm, setScoreForm] = useState<ScoreForm | null>(null);
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
  const [generatingReserves, setGeneratingReserves] = useState(false);
  const [showReserves, setShowReserves] = useState(false);
  // LL Draw state — keyed by draw key so each division has independent size/slots
  const [llDrawSizes, setLLDrawSizes] = useState<Record<string, number>>({});
  const [llDrawSlotOverrides, setLLDrawSlotOverrides] = useState<Record<string, Record<number, TournamentPlayer | null>>>({});

  // Round Robin state
  const [drawFormat, setDrawFormat] = useState<TournamentFormat>('bracket');
  const [showRRConfig, setShowRRConfig] = useState(false);
  const [isConversionMode, setIsConversionMode] = useState(false);
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
    let draws = VISIBLE_DRAWS.filter((d) => {
      if (mergeMensSingles && d.tab === 'mens' && d.tournamentChoice === 'Singles') return false;
      if (mergeWomensSingles && d.tab === 'womens' && d.tournamentChoice === 'Singles') return false;
      if (consolidateDoubles && d.tab === 'doubles') return false;
      return true;
    });
    if (mergeMensSingles) draws = [...draws, MENS_MERGED_DRAW];
    if (mergeWomensSingles) draws = [...draws, WOMENS_MERGED_DRAW];
    if (consolidateDoubles) draws = [...draws, CONSOLIDATED_DOUBLES_DRAW];
    const tabOrder = { mens: 0, womens: 1, doubles: 2 };
    return draws.sort((a, b) => tabOrder[a.tab] - tabOrder[b.tab]);
  }, [mergeMensSingles, mergeWomensSingles, consolidateDoubles]);

  // ── Data loading ──────────────────────────────────────────────────────────

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [eventsSnap, templatesSnap] = await Promise.all([
          getDocs(collection(db, 'events')),
          getDocs(collection(db, 'tournament_template')),
        ]);
        const tournamentEvents = eventsSnap.docs
          .map((d) => ({ id: d.id, ...d.data() } as TennisEvent))
          .filter((e) => e.type?.toLowerCase().includes('tournament'))
          .sort((a, b) => (getEventDate(b)?.getTime() || 0) - (getEventDate(a)?.getTime() || 0));
        setAllTournamentEvents(tournamentEvents);
        setTemplates(templatesSnap.docs.map((d) => ({ id: d.id, ...d.data() } as TournamentTemplate)));
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
    setSubmissions([]);
    setEditMode(false);
    setSkillOverrides({});
    setPreviewSlotOverrides({});
    setPreviewDrawSize({});
    setLLDrawSizes({});
    setLLDrawSlotOverrides({});
    setDrawFormat('bracket');
    setShowRRConfig(false);
    setIsConversionMode(false);
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
        if (loaded.some((m) => m.format === 'rr' && m.bracket !== 'reserves'))
          setDrawFormat('rr');
      },
    );
  }, [event]);

  useEffect(() => {
    if (!event || !user) return;
    return onSnapshot(
      query(collection(db, 'score_submissions'), where('event_id', '==', event.id)),
      (snap) => setSubmissions(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ScoreSubmission))),
    );
  }, [event, user]);


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

  // ── Derived data ──────────────────────────────────────────────────────────

  const userParticipant = useMemo(
    () => participants.find((p) => p.user_id === user?.uid) ?? null,
    [participants, user],
  );

  const userDraw = useMemo<DrawConfig | undefined>(() => {
    if (!userParticipant) return undefined;
    if (mergeWomensSingles && userParticipant.tournament_choice === 'Singles' && userParticipant.division === "Women's") {
      return WOMENS_MERGED_DRAW;
    }
    if (consolidateDoubles && userParticipant.tournament_choice === 'Doubles') {
      return CONSOLIDATED_DOUBLES_DRAW;
    }
    const effectiveSkill = statsMap[userParticipant.user_id]?.skill_level ?? Number(userParticipant.skill || 0);
    const skillGroup: SkillGroup =
      userParticipant.tournament_choice === 'Doubles' ? 'All'
      : effectiveSkill >= 4 ? 'Masters'
      : 'Challengers';
    return VISIBLE_DRAWS.find(
      (d) => d.tournamentChoice === userParticipant.tournament_choice &&
        d.division === userParticipant.division &&
        d.skillGroup === skillGroup,
    );
  }, [userParticipant, statsMap, mergeWomensSingles, consolidateDoubles]);

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
    const template = templates.find((t) => Number(t.size || t.drawsize || t.draw_size) === drawsize);
    const templateMatches = normalizeTemplateMatches(
      template?.matches?.length ? template.matches : fallbackTemplate(drawsize),
    );
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
      templateId: template?.id || `fallback_${drawsize}`,
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
  }, [currentDraw, currentDrawAllPlayers, currentMatches, event?.id, previewDrawSize, previewSlotOverrides, started, templates]);


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

  const skillMismatchedCount = useMemo(() => {
    if (!isCreator || matches.length === 0) return 0;
    const allUids = new Set<string>();
    matches.forEach((m) => {
      if (m.player_1_user_id) allUids.add(m.player_1_user_id);
      if (m.player_2_user_id) allUids.add(m.player_2_user_id);
    });
    let count = 0;
    allUids.forEach((uid) => {
      const p = participants.find((x) => x.user_id === uid && x.tournament_choice === 'Singles');
      if (!p) return;
      const effectiveSkill = statsMap[uid]?.skill_level ?? Number(p.skill || 0);
      const correctGroup = effectiveSkill >= 4 ? 'Masters' : 'Challengers';
      const inCorrectBracket = matches.some(
        (m) => (m.skill_group === correctGroup || m.skill_group === 'All') && (m.player_1_user_id === uid || m.player_2_user_id === uid),
      );
      if (!inCorrectBracket) count += 1;
    });
    return count;
  }, [isCreator, matches, participants, statsMap]);

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
    const template = templates.find((t) => Number(t.size || t.drawsize || t.draw_size) === drawsize);
    const templateMatches = normalizeTemplateMatches(
      template?.matches?.length ? template.matches : fallbackTemplate(drawsize),
    );
    const slotMap = new Map<number, TournamentPlayer>();
    Object.entries(currentLLSlotOverrides).forEach(([slotStr, player]) => {
      if (player !== null) slotMap.set(Number(slotStr), player);
    });
    const cfg = {
      eventId: event?.id || 'preview',
      templateId: template?.id || `fallback_${drawsize}`,
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
  }, [currentReservesMatches, currentDraw, currentLLSize, currentLLSlotOverrides, llCurrentKey, templates, event?.id]);

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
        return {
          name: isP1 ? visibleUserMatch.player_2_name : visibleUserMatch.player_1_name,
          userId: opponentUid,
          contact: isP1 ? visibleUserMatch.player_2_contact : visibleUserMatch.player_1_contact,
          email: opponentUser?.email ?? '',
          phone: opponentUser?.phone ?? '',
        };
      })()
    : null;

  // ── Round Robin derived data ──────────────────────────────────────────────

  const currentDrawFormat = useMemo<TournamentFormat>(
    () => (currentMatches.some((m) => m.format === 'rr') ? 'rr' : drawFormat),
    [currentMatches, drawFormat],
  );

  const rrGroupMatches = useMemo(
    () => currentMatches.filter((m) => m.format === 'rr' && m.round === 'RR'),
    [currentMatches],
  );

  const rrKnockoutMatches = useMemo(
    () => currentMatches.filter((m) => m.format === 'rr' && m.round !== 'RR'),
    [currentMatches],
  );

  const rrGroups = useMemo<TournamentPlayer[][]>(() => {
    if (rrGroupMatches.length === 0) return [];
    const groupIndices = [...new Set(rrGroupMatches.map((m) => m.rr_group ?? 0))].sort((a, b) => a - b);
    return groupIndices.map((gi) => {
      const groupMs = rrGroupMatches.filter((m) => (m.rr_group ?? 0) === gi);
      const seen = new Set<string>();
      const players: TournamentPlayer[] = [];
      for (const m of groupMs) {
        if (m.player_1_user_id && !seen.has(m.player_1_user_id)) {
          seen.add(m.player_1_user_id);
          players.push({ user_id: m.player_1_user_id, name: m.player_1_name, contact: m.player_1_contact, preferredContact: 'email', participantId: '' });
        }
        if (m.player_2_user_id && !seen.has(m.player_2_user_id)) {
          seen.add(m.player_2_user_id);
          players.push({ user_id: m.player_2_user_id, name: m.player_2_name, contact: m.player_2_contact, preferredContact: 'email', participantId: '' });
        }
      }
      return players;
    });
  }, [rrGroupMatches]);

  const rrStandingsByGroup = useMemo<RRStandingRow[][]>(
    () => rrGroups.map((_, gi) => computeGroupStandings(rrGroupMatches.filter((m) => (m.rr_group ?? 0) === gi))),
    [rrGroups, rrGroupMatches],
  );

  const rrConfig = useMemo(() => deriveRRConfig(currentMatches), [currentMatches]);

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

    const template = templates.find((t) => Number(t.size || t.drawsize || t.draw_size) === drawsize);
    const templateMatches = normalizeTemplateMatches(
      template?.matches?.length ? template.matches : fallbackTemplate(drawsize),
    );
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
      templateId: template?.id || `fallback_${drawsize}`,
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

    submissions
      .filter((s) => s.match_doc_id === match.id)
      .forEach((s) => batch.update(doc(db, 'score_submissions', s.id), { status: 'accepted' }));

    // Update player stats + league points
    // LL Draw (reserves) earns halved points; main draw earns full points
    {
      const isLL = match.bracket === 'reserves';
      const isRRGroupStage = match.format === 'rr' && match.round === 'RR';
      const LOSER_PTS: Record<string, number> = isLL
        ? { R32: 0.5, R16: 1, QF: 1.5, SF: 2.5, F: 5 }
        : { R32: 1, R16: 2, QF: 3, RR: 1, SF: 5, F: 10 };
      const loserPts = LOSER_PTS[match.round] ?? (isLL ? 0.5 : 1);
      const winnerPts = isLL ? 10 : isRRGroupStage ? (isWalkover ? 1 : 3) : 20;
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
    if (match.next_match_id) {
      const sameDraw = (m: TournamentMatch) =>
        m.bracket === match.bracket &&
        m.tournament_choice === match.tournament_choice &&
        m.division === match.division &&
        m.skill_group === match.skill_group;
      const nextMatch = matches.find((m) => sameDraw(m) && m.match_id === match.next_match_id);
      if (nextMatch) {
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
        } catch (err) {
          console.error('Winner recorded, but advancing to the next match failed:', err);
        }
      }
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

  // Only the creator can submit scores — no player-side submission.
  const handleSubmitScore = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!scoreForm || !user || !profile || !isCreator) return;

    const match = matches.find((m) => m.id === scoreForm.matchDocId);
    if (!match) return;

    const parsedSets = scoreForm.sets.map((s) => ({
      mine: Number(s.mine || 0),
      opponent: Number(s.opponent || 0),
    }));
    if (parsedSets.some((s) => !Number.isInteger(s.mine) || !Number.isInteger(s.opponent) || s.mine < 0 || s.opponent < 0)) {
      setMessage({ type: 'error', text: 'Scores must be non-negative whole numbers.' });
      return;
    }

    // Creator always submits from player_1's perspective
    const p1Scores = parsedSets.map((s) => s.mine);
    const p2Scores = parsedSets.map((s) => s.opponent);
    const pointsWon = parsedSets.reduce((t, s) => t + s.mine, 0);
    const opponentPoints = parsedSets.reduce((t, s) => t + s.opponent, 0);

    const submission: ScoreSubmission = {
      id: `${match.id}_${user.uid}`,
      match_doc_id: match.id,
      match_id: match.match_id,
      event_id: match.event_id,
      submitted_by: user.uid,
      submitted_by_name: profile.user.name,
      claimed_winner_name: scoreForm.winnerUserId === match.player_1_user_id ? match.player_1_name : match.player_2_name,
      claimed_winner_user_id: scoreForm.winnerUserId,
      set_1_player_1: p1Scores[0], set_1_player_2: p2Scores[0],
      set_2_player_1: p1Scores[1], set_2_player_2: p2Scores[1],
      set_3_player_1: p1Scores[2], set_3_player_2: p2Scores[2],
      points_won_by_submitter: pointsWon,
      opponent_points_won: opponentPoints,
      total_points_played: pointsWon + opponentPoints,
      status: 'accepted',
      created_at: new Date().toISOString(),
    };

    const isWalkover = parsedSets.every((s) => s.mine === 0 && s.opponent === 0);

    try {
      await setDoc(doc(db, 'score_submissions', submission.id), submission);
      await updateMatchWithSubmission(match, submission, isWalkover);
      setScoreForm(null);
      setMessage({ type: 'success', text: 'Score recorded and draw updated.' });
    } catch (err) {
      console.error('Score submission failed:', err);
      setMessage({ type: 'error', text: 'Could not record score. Please try again.' });
    }
  };

  const handleAddPlayer = async (userId: string, partnerName?: string, divisionOverride?: string) => {
    if (!event || !isCreator || !currentDraw) return;
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
      const template = templates.find((t) => Number(t.size || t.drawsize || t.draw_size) === drawsize);
      const templateMatches = normalizeTemplateMatches(
        template?.matches?.length ? template.matches : fallbackTemplate(drawsize),
      );
      const slotMap = new Map<number, TournamentPlayer>();
      Object.entries(currentLLSlotOverrides).forEach(([slotStr, player]) => {
        if (player !== null) slotMap.set(Number(slotStr), player);
      });
      const drawKey = getDrawKey(currentDraw.tournamentChoice, currentDraw.division, 'All');
      const batch = writeBatch(db);
      const cfg = {
        eventId: event.id,
        templateId: template?.id || `fallback_${drawsize}`,
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
      const groups = distributePlayersIntoGroups(currentDrawAllPlayers, config.groupSize);
      const batch = writeBatch(db);
      groups.forEach((groupPlayers, gi) => {
        const pairings = generateGroupPairings(groupPlayers.length);
        buildRRGroupMatchFields({
          eventId: event.id, drawKey, draw: currentDraw,
          groupIndex: gi, groupPlayers, pairings,
          advancementCount: config.advancementCount, started,
        }).forEach(({ docId, fields }) => {
          batch.set(doc(db, 'tournament_matches', docId), fields);
        });
      });
      await batch.commit();
      setDrawFormat('rr');
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
      setDrawFormat('bracket');
      setEditMode(false);
      setMessage({ type: 'success', text: 'Round Robin draw reset.' });
    } catch (err) {
      console.error('RR reset failed:', err);
      setMessage({ type: 'error', text: 'Could not reset the draw.' });
    } finally {
      setResettingDraw(false);
    }
  };

  const handleConvertToRR = async (config: RRConfig) => {
    if (!isCreator || !event || !currentDraw) return;
    setGeneratingRR(true);
    setMessage(null);
    try {
      const drawKey = getDrawKey(currentDraw.tournamentChoice, currentDraw.division, currentDraw.skillGroup);
      const batch = writeBatch(db);
      // Delete existing bracket matches
      currentMatches.forEach((m) => batch.delete(doc(db, 'tournament_matches', m.id)));
      // Delete orphaned score submissions
      const matchIds = new Set(currentMatches.map((m) => m.id));
      submissions.filter((s) => matchIds.has(s.match_doc_id)).forEach((s) => batch.delete(doc(db, 'score_submissions', s.id)));
      await batch.commit();

      // Generate RR matches in a new batch
      const groups = distributePlayersIntoGroups(currentDrawAllPlayers, config.groupSize);
      const batch2 = writeBatch(db);
      groups.forEach((groupPlayers, gi) => {
        const pairings = generateGroupPairings(groupPlayers.length);
        buildRRGroupMatchFields({
          eventId: event.id, drawKey, draw: currentDraw,
          groupIndex: gi, groupPlayers, pairings,
          advancementCount: config.advancementCount, started,
        }).forEach(({ docId, fields }) => batch2.set(doc(db, 'tournament_matches', docId), fields));
      });
      await batch2.commit();
      setDrawFormat('rr');
      setShowRRConfig(false);
      setIsConversionMode(false);
      setEditMode(false);
      setMessage({ type: 'success', text: `Converted to Round Robin — ${groups.length} group${groups.length > 1 ? 's' : ''}.` });
    } catch (err) {
      console.error('Conversion failed:', err);
      setMessage({ type: 'error', text: 'Could not convert the draw.' });
    } finally {
      setGeneratingRR(false);
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
    submissions,
    isCreator,
    started,
    userParticipant,
    currentDraw,
    currentMatches,
    displayMatches,
    visibleDraws,
    opponent,
    editPlayers,
    reservesPlayers,
    currentDrawAllPlayers,
    currentDrawSize,
    skillMismatchedCount,
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
    setDrawFormat,
    showRRConfig,
    setShowRRConfig,
    isConversionMode,
    setIsConversionMode,
    generatingRR,
    rrGroups,
    rrStandingsByGroup,
    rrGroupMatches,
    rrKnockoutMatches,
    rrKnockoutReady,
    rrConfig,
    handleGenerateRR,
    handleResetRR,
    handleConvertToRR,
    handleGenerateRRKnockout,
  };
};
