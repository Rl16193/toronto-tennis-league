import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  addDoc, collection, deleteDoc, doc, getDocs, onSnapshot, query, setDoc, updateDoc, where, writeBatch,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { EventParticipant, TennisEvent, UserData, UserStats } from '../../types';
import { DrawConfig, DrawTab, ReservesParticipant, ScoreForm, ScoreSubmission, SkillGroup, TournamentMatch, TournamentPlayer, TournamentTemplate } from './types';
import {
  BYE, PLAYER_LOADING,
  buildPlayerList, fallbackTemplate, filterParticipantsForDraw,
  getDrawKey, getDrawSize, getReservesDrawSize, getEventDate, getWinnerPlaceholder,
  isTournamentStarted, normalizeTemplateMatches, scoresMatch,
} from './utils';

export const VISIBLE_DRAWS: DrawConfig[] = [
  { tab: 'mens', label: "Men's Challengers", tournamentChoice: 'Singles', division: "Men's", skillGroup: 'Challengers' },
  { tab: 'mens', label: "Men's Masters", tournamentChoice: 'Singles', division: "Men's", skillGroup: 'Masters' },
  { tab: 'womens', label: "Women's Challengers", tournamentChoice: 'Singles', division: "Women's", skillGroup: 'Challengers' },
  { tab: 'womens', label: "Women's Masters", tournamentChoice: 'Singles', division: "Women's", skillGroup: 'Masters' },
  { tab: 'doubles', label: "Men's Doubles", tournamentChoice: 'Doubles', division: "Men's", skillGroup: 'All' },
  { tab: 'doubles', label: "Women's Doubles", tournamentChoice: 'Doubles', division: "Women's", skillGroup: 'All' },
  { tab: 'doubles', label: 'Mixed Doubles', tournamentChoice: 'Doubles', division: 'Mixed Doubles', skillGroup: 'All' },
];

const WOMENS_MERGED_DRAW: DrawConfig = {
  tab: 'womens', label: "Women's Masters", tournamentChoice: 'Singles', division: "Women's", skillGroup: 'All',
};
const CONSOLIDATED_DOUBLES_DRAW: DrawConfig = {
  tab: 'doubles', label: 'Doubles', tournamentChoice: 'Doubles', division: 'All', skillGroup: 'All',
};

const deleteKey = <T extends Record<string, unknown>>(obj: T, key: string): T => {
  const next = { ...obj };
  delete next[key];
  return next;
};

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

  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [updatingDraw, setUpdatingDraw] = useState(false);
  const [resettingDraw, setResettingDraw] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [previewSlotOverrides, setPreviewSlotOverrides] = useState<Record<string, Record<number, TournamentPlayer | null>>>({});
  const [mergeWomensSingles, setMergeWomensSingles] = useState(false);
  const [consolidateDoubles, setConsolidateDoubles] = useState(false);
  const [previewDrawSize, setPreviewDrawSize] = useState<Record<string, number>>({});
  const [skillOverrides, setSkillOverrides] = useState<Record<string, SkillGroup>>({});
  const [allUsers, setAllUsers] = useState<Record<string, UserData>>({});
  const [reservesParticipants, setReservesParticipants] = useState<ReservesParticipant[]>([]);
  const [generatingReserves, setGeneratingReserves] = useState(false);
  const [showReserves, setShowReserves] = useState(false);

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
      if (mergeWomensSingles && d.tab === 'womens' && d.tournamentChoice === 'Singles') return false;
      if (consolidateDoubles && d.tab === 'doubles') return false;
      return true;
    });
    if (mergeWomensSingles) draws = [...draws, WOMENS_MERGED_DRAW];
    if (consolidateDoubles) draws = [...draws, CONSOLIDATED_DOUBLES_DRAW];
    const tabOrder = { mens: 0, womens: 1, doubles: 2 };
    return draws.sort((a, b) => tabOrder[a.tab] - tabOrder[b.tab]);
  }, [mergeWomensSingles, consolidateDoubles]);

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
        if (loaded.some((m) => m.tournament_choice === 'Singles' && m.division === "Women's" && m.skill_group === 'All'))
          setMergeWomensSingles(true);
        if (loaded.some((m) => m.tournament_choice === 'Doubles' && m.division === 'All'))
          setConsolidateDoubles(true);
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

  useEffect(() => {
    if (!event) return;
    return onSnapshot(
      query(collection(db, 'reserves_participants'), where('event_id', '==', event.id)),
      (snap) => setReservesParticipants(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ReservesParticipant))),
    );
  }, [event]);

  // Lazy-load all registered users the first time the creator enters edit mode
  useEffect(() => {
    if (!editMode || !isCreator || Object.keys(allUsers).length > 0) return;
    getDocs(collection(db, 'users')).then((snap) => {
      const map: Record<string, UserData> = {};
      snap.docs.forEach((d) => { map[d.id] = d.data() as UserData; });
      setAllUsers(map);
    });
  }, [editMode, isCreator, allUsers]);

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

    return templateMatches.map<TournamentMatch>((tm, index) => {
      const p1 = typeof tm.player_1 === 'number' ? slotMap.get(tm.player_1) : null;
      const p2 = typeof tm.player_2 === 'number' ? slotMap.get(tm.player_2) : null;
      return {
        id: `preview_${currentDraw.label}_${tm.match_id}`,
        event_id: event?.id || 'preview',
        template_id: template?.id || `fallback_${drawsize}`,
        tournament_choice: currentDraw.tournamentChoice,
        division: currentDraw.division,
        skill_group: currentDraw.skillGroup,
        drawsize,
        match_id: tm.match_id,
        round: tm.round,
        position: index + 1,
        player_1_slot: tm.player_1,
        player_2_slot: tm.player_2,
        player_1_name: p1?.name || (typeof tm.player_1 === 'number' ? PLAYER_LOADING : getWinnerPlaceholder(tm.player_1, templateMatches)),
        player_1_user_id: p1?.user_id || '',
        player_1_contact: p1?.contact || '',
        player_2_name: p2?.name || (typeof tm.player_2 === 'number' ? PLAYER_LOADING : getWinnerPlaceholder(tm.player_2, templateMatches)),
        player_2_user_id: p2?.user_id || '',
        player_2_contact: p2?.contact || '',
        next_match_id: tm.next_match_id || '',
        next_slot: tm.next_slot,
        status: 'pending',
        bracket: null,
        started,
      };
    });
  }, [currentDraw, currentDrawAllPlayers, currentMatches, event?.id, previewDrawSize, previewSlotOverrides, started, templates]);

  const myActiveMatch = useMemo(
    () => user
      ? matches.find((m) =>
          m.status !== 'complete' &&
          [m.player_1_user_id, m.player_2_user_id].includes(user.uid) &&
          m.player_1_name !== BYE && m.player_2_name !== BYE &&
          m.player_1_name !== PLAYER_LOADING && m.player_2_name !== PLAYER_LOADING,
        ) ?? null
      : null,
    [matches, user],
  );

  const visibleUserMatch = useMemo(
    () => user
      ? displayMatches.find((m) =>
          [m.player_1_user_id, m.player_2_user_id].includes(user.uid) &&
          m.player_1_name !== BYE && m.player_2_name !== BYE,
        ) ?? null
      : null,
    [displayMatches, user],
  );

  const hasSubmittedScore = useMemo(
    () => !!myActiveMatch && submissions.some(
      (s) => s.match_doc_id === myActiveMatch.id && s.submitted_by === user?.uid,
    ),
    [myActiveMatch, submissions, user],
  );

  const editPlayers = editMode ? currentDrawAllPlayers : [];

  const currentDrawSize = displayMatches[0]?.drawsize ?? 16;

  const reservesPlayers = useMemo(() => {
    if (currentMatches.length > 0) return [];
    const placedIds = new Set(
      displayMatches.flatMap((m) => [m.player_1_user_id, m.player_2_user_id]).filter(Boolean),
    );
    return currentDrawAllPlayers.filter((p) => !placedIds.has(p.user_id));
  }, [currentDrawAllPlayers, currentMatches, displayMatches]);

  // All singles players for the active tab with their current bracket — used by the move panel.
  // Only populated when two skill-group draws exist (i.e. not merged).
  const moveablePlayers = useMemo(() => {
    if (activeTab === 'doubles') return [];
    const tabDraws = effectiveDraws.filter((d) => d.tab === activeTab);
    if (tabDraws.length < 2) return [];
    const seenIds = new Set<string>();
    const result: Array<TournamentPlayer & { currentGroup: SkillGroup }> = [];
    tabDraws.forEach((draw) => {
      buildPlayerList(
        filterParticipantsForDraw(participants, draw, effectiveStatsMap),
        draw,
        effectiveStatsMap,
        userMap,
      ).forEach((p) => {
        if (seenIds.has(p.user_id)) return;
        seenIds.add(p.user_id);
        const effectiveSkill = effectiveStatsMap[p.user_id]?.skill_level ?? 0;
        result.push({ ...p, currentGroup: effectiveSkill >= 4 ? 'Masters' : 'Challengers' });
      });
    });
    return result.sort((a, b) => a.name.localeCompare(b.name));
  }, [activeTab, effectiveDraws, participants, effectiveStatsMap, userMap]);

  const availableUsers = useMemo(() => {
    const joinedIds = new Set(participants.map((p) => p.user_id));
    return Object.entries(allUsers)
      .filter(([id]) => !joinedIds.has(id))
      .map(([id, data]) => ({ id, name: data.name, email: data.email }))
      .sort((a, b) => a.name.localeCompare(b.name));
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

  const reserveDrawLabels = useMemo(() => {
    const labels = new Set<string>();
    const reserveMatches = matches.filter((m) => m.bracket === 'reserves');
    for (const m of reserveMatches) {
      const draw = effectiveDraws.find(
        (d) => d.tournamentChoice === m.tournament_choice && d.division === m.division && d.skillGroup === m.skill_group,
      );
      if (draw) labels.add(draw.label);
    }
    return labels;
  }, [matches, effectiveDraws]);

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

  const currentReservesParticipants = useMemo(() => {
    if (!currentDraw) return [];
    return reservesParticipants.filter(
      (p) => p.tournament_choice === currentDraw.tournamentChoice && p.division === currentDraw.division,
    );
  }, [reservesParticipants, currentDraw]);

  const userReservesParticipant = useMemo(() => {
    if (!user || !currentDraw) return null;
    return currentReservesParticipants.find((p) => p.user_id === user.uid) ?? null;
  }, [currentReservesParticipants, user, currentDraw]);

  const opponentMatch = myActiveMatch || visibleUserMatch;
  const opponent = opponentMatch && user
    ? opponentMatch.player_1_user_id === user.uid
      ? { name: opponentMatch.player_2_name, userId: opponentMatch.player_2_user_id, contact: opponentMatch.player_2_contact }
      : { name: opponentMatch.player_1_name, userId: opponentMatch.player_1_user_id, contact: opponentMatch.player_1_contact }
    : null;

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
    templateMatches.forEach((tm, index) => {
      const p1 = typeof tm.player_1 === 'number' ? slotMap.get(tm.player_1) : null;
      const p2 = typeof tm.player_2 === 'number' ? slotMap.get(tm.player_2) : null;
      batch.set(
        doc(db, 'tournament_matches', `${event.id}_${drawKey}_${tm.match_id}`),
        {
          event_id: event.id,
          template_id: template?.id || `fallback_${drawsize}`,
          tournament_choice: draw.tournamentChoice,
          division: draw.division,
          skill_group: draw.skillGroup,
          drawsize,
          match_id: tm.match_id,
          round: tm.round,
          position: index + 1,
          player_1_slot: tm.player_1,
          player_2_slot: tm.player_2,
          player_1_name: p1?.name || (typeof tm.player_1 === 'number' ? PLAYER_LOADING : getWinnerPlaceholder(tm.player_1, templateMatches)),
          player_1_user_id: p1?.user_id || '',
          player_1_contact: p1?.contact || '',
          player_2_name: p2?.name || (typeof tm.player_2 === 'number' ? PLAYER_LOADING : getWinnerPlaceholder(tm.player_2, templateMatches)),
          player_2_user_id: p2?.user_id || '',
          player_2_contact: p2?.contact || '',
          next_match_id: tm.next_match_id || '',
          next_slot: tm.next_slot || '',
          status: 'pending',
          bracket: null,
          started,
          created_at: new Date().toISOString(),
        },
        { merge: true },
      );
    });
    await batch.commit();
  };

  const updateMatchWithSubmission = async (match: TournamentMatch, submission: ScoreSubmission) => {
    const batch = writeBatch(db);
    batch.update(doc(db, 'tournament_matches', match.id), {
      winner_name: submission.claimed_winner_name,
      winner_user_id: submission.claimed_winner_user_id,
      set_1_player_1: submission.set_1_player_1, set_1_player_2: submission.set_1_player_2,
      set_2_player_1: submission.set_2_player_1, set_2_player_2: submission.set_2_player_2,
      set_3_player_1: submission.set_3_player_1, set_3_player_2: submission.set_3_player_2,
      status: 'complete',
      completed_at: new Date().toISOString(),
    });

    if (match.next_match_id && match.next_slot) {
      const nextMatch = matches.find(
        (m) => m.event_id === match.event_id &&
          m.tournament_choice === match.tournament_choice &&
          m.division === match.division &&
          m.skill_group === match.skill_group &&
          m.match_id === match.next_match_id,
      );
      if (nextMatch) {
        batch.update(doc(db, 'tournament_matches', nextMatch.id), {
          [`${match.next_slot}_name`]: submission.claimed_winner_name,
          [`${match.next_slot}_user_id`]: submission.claimed_winner_user_id,
          [`${match.next_slot}_contact`]:
            submission.claimed_winner_user_id === match.player_1_user_id
              ? match.player_1_contact
              : match.player_2_contact,
        });
      }
    }

    submissions
      .filter((s) => s.match_doc_id === match.id)
      .forEach((s) => batch.update(doc(db, 'score_submissions', s.id), { status: 'accepted' }));

    await batch.commit();
  };

  const advancePlayerByBye = async (match: TournamentMatch) => {
    const byeIsPlayer1 = match.player_1_name === BYE;
    const winnerName = byeIsPlayer1 ? match.player_2_name : match.player_1_name;
    const winnerUserId = byeIsPlayer1 ? match.player_2_user_id : match.player_1_user_id;
    const winnerContact = byeIsPlayer1 ? match.player_2_contact : match.player_1_contact;

    const batch = writeBatch(db);
    batch.update(doc(db, 'tournament_matches', match.id), {
      winner_name: winnerName,
      winner_user_id: winnerUserId,
      status: 'complete',
      completed_at: new Date().toISOString(),
    });
    if (match.next_match_id && match.next_slot) {
      const nextMatch = matches.find(
        (m) => m.event_id === match.event_id &&
          m.tournament_choice === match.tournament_choice &&
          m.division === match.division &&
          m.skill_group === match.skill_group &&
          m.match_id === match.next_match_id,
      );
      if (nextMatch) {
        batch.update(doc(db, 'tournament_matches', nextMatch.id), {
          [`${match.next_slot}_name`]: winnerName,
          [`${match.next_slot}_user_id`]: winnerUserId,
          [`${match.next_slot}_contact`]: winnerContact,
        });
      }
    }
    await batch.commit();
  };

  // ── Action handlers ───────────────────────────────────────────────────────

  const handleSetPreviewDrawSize = (drawLabel: string, size: number) => {
    setPreviewDrawSize((prev) => ({ ...prev, [drawLabel]: size }));
  };

  const handleMovePlayer = (userIds: string[], target: SkillGroup) => {
    setSkillOverrides((prev) => {
      const next = { ...prev };
      userIds.forEach((id) => { next[id] = target; });
      return next;
    });
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

  const handleCreatorUpdateDraw = async () => {
    if (!isCreator || !event) return;
    setUpdatingDraw(true);
    setMessage(null);
    try {
      const byeMatches = matches.filter((m) => {
        if (m.status === 'complete') return false;
        return (m.player_1_name === BYE && !!m.player_2_user_id) ||
          (m.player_2_name === BYE && !!m.player_1_user_id);
      });
      await Promise.all(byeMatches.map(advancePlayerByBye));

      const pendingByMatch = new Map<string, ScoreSubmission[]>();
      submissions
        .filter((s) => s.status === 'pending')
        .forEach((s) => pendingByMatch.set(s.match_doc_id, [...(pendingByMatch.get(s.match_doc_id) || []), s]));

      for (const [matchDocId, pending] of pendingByMatch) {
        const match = matches.find((m) => m.id === matchDocId);
        if (!match || match.status === 'complete') continue;
        if (pending.length === 1) {
          await updateMatchWithSubmission(match, pending[0]);
        } else if (pending.length >= 2) {
          if (scoresMatch(pending[0], pending[1])) {
            await updateMatchWithSubmission(match, pending[0]);
          } else {
            await Promise.all([
              updateDoc(doc(db, 'score_submissions', pending[0].id), { status: 'flagged' }),
              updateDoc(doc(db, 'score_submissions', pending[1].id), { status: 'flagged' }),
              updateDoc(doc(db, 'tournament_matches', match.id), { status: 'flagged' }),
            ]);
          }
        }
      }

      setMessage({ type: 'success', text: 'Draw updated: BYEs advanced and scores processed.' });
    } catch (err) {
      console.error('Draw update failed:', err);
      setMessage({ type: 'error', text: 'Could not update the draw.' });
    } finally {
      setUpdatingDraw(false);
    }
  };

  const handleResetDraw = async () => {
    if (!isCreator || started || !currentDraw || currentMatches.length === 0) return;
    if (!window.confirm(`Reset and regenerate ${currentDraw.label}? This rebuilds the draw with current players and settings.`)) return;
    setResettingDraw(true);
    setMessage(null);
    try {
      const batch = writeBatch(db);
      currentMatches.forEach((m) => batch.delete(doc(db, 'tournament_matches', m.id)));
      await batch.commit();
      await generateDraw(currentDraw);
      setEditMode(false);
      setPreviewSlotOverrides((prev) => deleteKey(prev, currentDraw.label));
      setPreviewDrawSize((prev) => deleteKey(prev, currentDraw.label));
      if (currentDraw.skillGroup === 'All' && currentDraw.tournamentChoice === 'Singles') setMergeWomensSingles(false);
      if (currentDraw.tournamentChoice === 'Doubles' && currentDraw.division === 'All') setConsolidateDoubles(false);
      setMessage({ type: 'success', text: `${currentDraw.label} rebuilt with current settings.` });
    } catch (err) {
      console.error('Draw reset failed:', err);
      setMessage({ type: 'error', text: 'Could not reset the draw.' });
    } finally {
      setResettingDraw(false);
    }
  };

  const handleResolveDispute = async (match: TournamentMatch, chosen: ScoreSubmission) => {
    setMessage(null);
    try {
      await updateMatchWithSubmission(match, chosen);
      setMessage({ type: 'success', text: 'Dispute resolved. Draw updated.' });
    } catch (err) {
      console.error('Resolve dispute failed:', err);
      setMessage({ type: 'error', text: 'Could not resolve the dispute.' });
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

  const handleSubmitScore = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!scoreForm || !user || !profile) return;

    const match = matches.find((m) => m.id === scoreForm.matchDocId);
    if (!match) return;

    const isPlayer1 = match.player_1_user_id === user.uid;
    const isPlayer2 = match.player_2_user_id === user.uid;
    const isCreatorSubmit = isCreator && !isPlayer1 && !isPlayer2;
    if (!isPlayer1 && !isPlayer2 && !isCreatorSubmit) return;

    const parsedSets = scoreForm.sets.map((s) => ({
      mine: Number(s.mine || 0),
      opponent: Number(s.opponent || 0),
    }));
    if (parsedSets.some((s) => !Number.isInteger(s.mine) || !Number.isInteger(s.opponent) || s.mine < 0 || s.opponent < 0)) {
      setMessage({ type: 'error', text: 'Scores must be non-negative whole numbers.' });
      return;
    }

    // Creator submits from player_1's perspective; player_2 submits from their own perspective
    const viewAsPlayer1 = isPlayer1 || isCreatorSubmit;
    const p1Scores = parsedSets.map((s) => (viewAsPlayer1 ? s.mine : s.opponent));
    const p2Scores = parsedSets.map((s) => (viewAsPlayer1 ? s.opponent : s.mine));
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
      status: 'pending',
      created_at: new Date().toISOString(),
    };

    // Creator override: auto-accept immediately, no need to wait for second submission
    if (isCreatorSubmit) {
      await setDoc(doc(db, 'score_submissions', submission.id), { ...submission, status: 'accepted' });
      await updateMatchWithSubmission(match, { ...submission, status: 'accepted' });
      setScoreForm(null);
      setMessage({ type: 'success', text: 'Score recorded and draw updated.' });
      return;
    }

    const existingOther = submissions.find(
      (s) => s.match_doc_id === match.id && s.submitted_by !== user.uid,
    );

    await setDoc(doc(db, 'score_submissions', submission.id), submission);

    if (existingOther) {
      if (scoresMatch(submission, existingOther)) {
        await updateMatchWithSubmission(match, submission);
        setMessage({ type: 'success', text: 'Scores matched. The draw has been updated.' });
      } else {
        await Promise.all([
          updateDoc(doc(db, 'score_submissions', submission.id), { status: 'flagged' }),
          updateDoc(doc(db, 'score_submissions', existingOther.id), { status: 'flagged' }),
          updateDoc(doc(db, 'tournament_matches', match.id), { status: 'flagged' }),
        ]);
        setMessage({ type: 'success', text: 'Score submitted.' });
      }
    } else {
      setMessage({ type: 'success', text: 'Score submitted. Waiting for your opponent to confirm.' });
    }

    setScoreForm(null);
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

  const handleOpenScoreForm = (matchOverride?: TournamentMatch) => {
    const targetMatch = matchOverride ?? myActiveMatch;
    if (!targetMatch || !user) return;
    const isTargetPlayer =
      targetMatch.player_1_user_id === user.uid || targetMatch.player_2_user_id === user.uid;
    setScoreForm({
      matchDocId: targetMatch.id,
      winnerUserId: isTargetPlayer ? user.uid : targetMatch.player_1_user_id,
      sets: [{ mine: '', opponent: '' }, { mine: '', opponent: '' }, { mine: '', opponent: '' }],
    });
  };

  const handleJoinReserves = async () => {
    if (!event || !user || !profile || !currentDraw) return;
    if (userParticipant || userReservesParticipant) return;
    try {
      await addDoc(collection(db, 'reserves_participants'), {
        user_id: user.uid,
        user_name: profile.user.name,
        event_id: event.id,
        division: currentDraw.division,
        tournament_choice: currentDraw.tournamentChoice,
        skill: profile.stats.skill_level,
        createdAt: new Date().toISOString(),
      });
      setMessage({ type: 'success', text: 'You have joined the reserves draw.' });
    } catch (err) {
      console.error('Join reserves failed:', err);
      setMessage({ type: 'error', text: 'Could not join reserves. Please try again.' });
    }
  };

  const handleLeaveReserves = async () => {
    if (!userReservesParticipant) return;
    try {
      await deleteDoc(doc(db, 'reserves_participants', userReservesParticipant.id));
      setMessage({ type: 'success', text: 'You have left the reserves draw.' });
    } catch (err) {
      console.error('Leave reserves failed:', err);
      setMessage({ type: 'error', text: 'Could not leave reserves. Please try again.' });
    }
  };

  const handleGenerateReservesDraw = async () => {
    if (!event || !isCreator || !currentDraw) return;
    if (currentReservesParticipants.length < 2) {
      setMessage({ type: 'error', text: 'Need at least 2 players to create a reserves draw.' });
      return;
    }
    setGeneratingReserves(true);
    setMessage(null);
    try {
      const players: TournamentPlayer[] = currentReservesParticipants.map((p) => ({
        user_id: p.user_id,
        name: p.user_name,
        contact: userMap[p.user_id]?.email || '',
        preferredContact: 'email',
        participantId: p.id,
      }));

      const drawsize = getReservesDrawSize(players.length);
      const template = templates.find((t) => Number(t.size || t.drawsize || t.draw_size) === drawsize);
      const templateMatches = normalizeTemplateMatches(
        template?.matches?.length ? template.matches : fallbackTemplate(drawsize),
      );

      const slotMap = new Map<number, TournamentPlayer>();
      players.slice(0, drawsize).forEach((p, i) => slotMap.set(i + 1, p));

      const drawKey = getDrawKey(currentDraw.tournamentChoice, currentDraw.division, currentDraw.skillGroup);
      const batch = writeBatch(db);

      templateMatches.forEach((tm, index) => {
        const p1 = typeof tm.player_1 === 'number' ? slotMap.get(tm.player_1) : null;
        const p2 = typeof tm.player_2 === 'number' ? slotMap.get(tm.player_2) : null;
        batch.set(
          doc(db, 'tournament_matches', `${event.id}_reserves_${drawKey}_${tm.match_id}`),
          {
            event_id: event.id,
            template_id: template?.id || `fallback_${drawsize}`,
            tournament_choice: currentDraw.tournamentChoice,
            division: currentDraw.division,
            skill_group: currentDraw.skillGroup,
            drawsize,
            match_id: tm.match_id,
            round: tm.round,
            position: index + 1,
            player_1_slot: tm.player_1,
            player_2_slot: tm.player_2,
            player_1_name: p1?.name || (typeof tm.player_1 === 'number' ? BYE : getWinnerPlaceholder(tm.player_1, templateMatches)),
            player_1_user_id: p1?.user_id || '',
            player_1_contact: p1?.contact || '',
            player_2_name: p2?.name || (typeof tm.player_2 === 'number' ? BYE : getWinnerPlaceholder(tm.player_2, templateMatches)),
            player_2_user_id: p2?.user_id || '',
            player_2_contact: p2?.contact || '',
            next_match_id: tm.next_match_id || '',
            next_slot: tm.next_slot || '',
            status: 'pending',
            bracket: 'reserves',
            started: false,
            created_at: new Date().toISOString(),
          },
          { merge: true },
        );
      });

      await batch.commit();
      setShowReserves(true);
      setMessage({ type: 'success', text: `Reserves draw created with ${Math.min(players.length, drawsize)} players.` });
    } catch (err) {
      console.error('Reserves draw generation failed:', err);
      setMessage({ type: 'error', text: 'Could not create the reserves draw.' });
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
    submissions,
    isCreator,
    started,
    userParticipant,
    currentDraw,
    currentMatches,
    displayMatches,
    visibleDraws,
    myActiveMatch,
    hasSubmittedScore,
    opponent,
    editPlayers,
    reservesPlayers,
    currentDrawSize,
    skillMismatchedCount,
    message,
    scoreForm,
    scoreFormMatch,
    setScoreForm,
    generating,
    updatingDraw,
    resettingDraw,
    editMode,
    setEditMode,
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
    moveablePlayers,
    availableUsers,
    handleSetPreviewDrawSize,
    handleMovePlayer,
    handleAddPlayer,
    handleGenerateAll,
    handleCreatorUpdateDraw,
    handleResetDraw,
    handleResolveDispute,
    handleEditPlayer,
    handleSubmitScore,
    handleOpenScoreForm,
    reservesParticipants,
    reserveDrawLabels,
    currentReservesMatches,
    currentReservesParticipants,
    userReservesParticipant,
    showReserves,
    setShowReserves,
    generatingReserves,
    handleJoinReserves,
    handleLeaveReserves,
    handleGenerateReservesDraw,
  };
};
