import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  addDoc, collection, doc, getDocs, onSnapshot, query, updateDoc, where, writeBatch,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { EventParticipant, TennisEvent, UserData, UserStats } from '../../types';
import { DrawConfig, DrawTab, ScoreForm, ScoreSubmission, SkillGroup, TournamentMatch, TournamentPlayer } from './types';
import {
  BYE, PLAYER_LOADING,
  buildMatchFields, buildPlayerList, deleteKey, fallbackTemplate, filterParticipantsForDraw,
  getDrawKey, getDrawSize, getEventDate,
  isTournamentStarted, normalizeTemplateMatches,
} from './utils';
import { CONSOLIDATED_DOUBLES_DRAW, MENS_MERGED_DRAW, VISIBLE_DRAWS, WOMENS_MERGED_DRAW } from './drawConfigs';
import { generateDraw as generateDrawFn, GenerateDrawParams } from './drawGeneration';
import { updateMatchWithSubmission as updateMatchWithSubmissionFn } from './scoreSubmission';

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
        return {
          name: isP1 ? visibleUserMatch.player_2_name : visibleUserMatch.player_1_name,
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

  // Potential next-round opponents: players in the sibling match (same next_match_id,
  // different match), filtering out PLAYER_LOADING and BYE placeholders.
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

  // ── Internal helpers ──────────────────────────────────────────────────────

  const generateDraw = (draw: DrawConfig, lockedDrawsize?: number) => {
    if (!event) return Promise.resolve();
    const params: GenerateDrawParams = {
      event, participants, effectiveStatsMap, userMap,
      previewDrawSize, previewSlotOverrides, started,
    };
    return generateDrawFn(draw, params, db, lockedDrawsize);
  };

  const updateMatchWithSubmission = (match: TournamentMatch, submission: ScoreSubmission) =>
    updateMatchWithSubmissionFn(match, submission, matches, db, setMessage);

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

    const submission: ScoreSubmission = {
      claimed_winner_name: scoreForm.winnerUserId === match.player_1_user_id ? match.player_1_name : match.player_2_name,
      claimed_winner_user_id: scoreForm.winnerUserId,
      set_1_player_1: p1Scores[0], set_1_player_2: p2Scores[0],
      set_2_player_1: p1Scores[1], set_2_player_2: p2Scores[1],
      set_3_player_1: p1Scores[2], set_3_player_2: p2Scores[2],
    };

    try {
      await updateMatchWithSubmission(match, submission);
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

  return {
    authLoading,
    loading,
    user,
    allTournamentEvents,
    event,
    matches,
    isCreator,
    started,
    userParticipant,
    currentDraw,
    currentMatches,
    displayMatches,
    visibleDraws,
    opponent,
    nextMatchOpponents,
    editPlayers,
    reservesPlayers,
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
  };
};
