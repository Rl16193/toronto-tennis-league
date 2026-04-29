import React, { useEffect, useMemo, useState } from 'react';
import {
  collection, doc, getDocs, onSnapshot, query, setDoc, updateDoc, where, writeBatch,
} from 'firebase/firestore';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { db } from '../services/firebase';
import { useAuth } from '../context/AuthContext';
import { EventParticipant, TennisEvent, UserData } from '../types';
import {
  DrawConfig, DrawTab, ScoreForm, ScoreSubmission, SkillGroup, TournamentMatch, TournamentPlayer, TournamentTemplate,
} from './tournament/types';
import {
  BYE, PLAYER_LOADING,
  fallbackTemplate, filterParticipantsForDraw, getContactValue,
  getDrawKey, getDrawSize, getEventDate, getWinnerPlaceholder,
  isTournamentStarted, mapParticipantsToPlayers, normalizeTemplateMatches, scoresMatch,
} from './tournament/utils';
import { downloadDrawAsPng } from './tournament/bracketImage';
import { BracketView } from './tournament/BracketView';
import { BracketErrorBoundary } from './tournament/BracketErrorBoundary';
import { TournamentHeader } from './tournament/TournamentHeader';
import { OpponentCard } from './tournament/OpponentCard';
import { DrawTabs } from './tournament/DrawTabs';
import { ScoreModal } from './tournament/ScoreModal';
import { FlaggedResults } from './tournament/FlaggedResults';

const VISIBLE_DRAWS: DrawConfig[] = [
  { tab: 'mens', label: "Men's Challengers", tournamentChoice: 'Singles', division: "Men's", skillGroup: 'Challengers' },
  { tab: 'mens', label: "Men's Masters", tournamentChoice: 'Singles', division: "Men's", skillGroup: 'Masters' },
  { tab: 'womens', label: "Women's Challengers", tournamentChoice: 'Singles', division: "Women's", skillGroup: 'Challengers' },
  { tab: 'womens', label: "Women's Masters", tournamentChoice: 'Singles', division: "Women's", skillGroup: 'Masters' },
  { tab: 'doubles', label: "Men's Doubles", tournamentChoice: 'Doubles', division: "Men's", skillGroup: 'All' },
  { tab: 'doubles', label: "Women's Doubles", tournamentChoice: 'Doubles', division: "Women's", skillGroup: 'All' },
  { tab: 'doubles', label: 'Mixed Doubles', tournamentChoice: 'Doubles', division: 'Mixed Doubles', skillGroup: 'All' },
];

export const Tournament: React.FC = () => {
  const { user, profile, loading: authLoading } = useAuth();

  const [event, setEvent] = useState<TennisEvent | null>(null);
  const [participants, setParticipants] = useState<EventParticipant[]>([]);
  const [matches, setMatches] = useState<TournamentMatch[]>([]);
  const [submissions, setSubmissions] = useState<ScoreSubmission[]>([]);
  const [templates, setTemplates] = useState<TournamentTemplate[]>([]);
  const [userMap, setUserMap] = useState<Record<string, UserData>>({});

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

  const isCreator = !!user && !!event?.creator_id && event.creator_id === user.uid;
  const started = isTournamentStarted(event);

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
        setEvent(tournamentEvents[0] || null);
        setTemplates(templatesSnap.docs.map((d) => ({ id: d.id, ...d.data() } as TournamentTemplate)));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  useEffect(() => {
    if (!event) return;
    const q = query(collection(db, 'event_participants'), where('event_id', '==', event.id));
    return onSnapshot(q, (snap) =>
      setParticipants(snap.docs.map((d) => ({ id: d.id, ...d.data() } as EventParticipant)))
    );
  }, [event]);

  useEffect(() => {
    if (!event) return;
    const q = query(collection(db, 'tournament_matches'), where('event_id', '==', event.id));
    return onSnapshot(q, (snap) =>
      setMatches(snap.docs.map((d) => ({ id: d.id, ...d.data() } as TournamentMatch)))
    );
  }, [event]);

  useEffect(() => {
    if (!event || !user) return;
    const q = query(collection(db, 'score_submissions'), where('event_id', '==', event.id));
    return onSnapshot(q, (snap) =>
      setSubmissions(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ScoreSubmission)))
    );
  }, [event, user]);

  useEffect(() => {
    if (!user) return;
    const missing = [...new Set(participants.map((p) => p.user_id).filter(Boolean))].filter((id) => !userMap[id]);
    if (missing.length === 0) return;
    Promise.all(
      missing.map(async (userId) => {
        const snap = await getDocs(query(collection(db, 'users'), where('__name__', '==', userId)));
        return snap.docs[0] ? ([userId, snap.docs[0].data() as UserData] as const) : null;
      })
    ).then((entries) => {
      setUserMap((prev) => ({
        ...prev,
        ...Object.fromEntries(entries.filter(Boolean) as [string, UserData][]),
      }));
    });
  }, [participants, user, userMap]);

  // ── Derived data ──────────────────────────────────────────────────────────

  const userParticipant = useMemo(
    () => participants.find((p) => p.user_id === user?.uid) ?? null,
    [participants, user],
  );

  const userDraw = useMemo<DrawConfig | undefined>(() => {
    if (!userParticipant) return undefined;
    const skillGroup: SkillGroup =
      userParticipant.tournament_choice === 'Doubles'
        ? 'All'
        : Number(userParticipant.skill || 0) >= 4
          ? 'Masters'
          : 'Challengers';
    return VISIBLE_DRAWS.find(
      (d) =>
        d.tournamentChoice === userParticipant.tournament_choice &&
        d.division === userParticipant.division &&
        d.skillGroup === skillGroup,
    );
  }, [userParticipant]);

  const visibleDraws = useMemo(
    () => (isCreator || !userDraw ? VISIBLE_DRAWS : [userDraw]),
    [isCreator, userDraw],
  );

  useEffect(() => {
    if (isCreator || !userDraw) return;
    setActiveTab(userDraw.tab);
    if (userDraw.tab === 'doubles') {
      setActiveDoubles(userDraw.division);
    } else {
      setActiveSkill(userDraw.skillGroup as SkillGroup);
    }
  }, [isCreator, userDraw]);

  const currentDraw = useMemo<DrawConfig | undefined>(() => {
    if (activeTab === 'doubles') {
      return VISIBLE_DRAWS.find((d) => d.tab === 'doubles' && d.division === activeDoubles)
        ?? VISIBLE_DRAWS.find((d) => d.tab === 'doubles');
    }
    return VISIBLE_DRAWS.find((d) => d.tab === activeTab && d.skillGroup === activeSkill)
      ?? VISIBLE_DRAWS.find((d) => d.tab === activeTab);
  }, [activeDoubles, activeSkill, activeTab]);

  const currentMatches = useMemo(() => {
    if (!currentDraw) return [];
    return matches
      .filter((m) =>
        m.tournament_choice === currentDraw.tournamentChoice &&
        m.division === currentDraw.division &&
        m.skill_group === currentDraw.skillGroup
      )
      .sort((a, b) => a.position - b.position);
  }, [currentDraw, matches]);

  const displayMatches = useMemo(() => {
    if (!currentDraw) return [];
    if (currentMatches.length > 0) return currentMatches;

    const drawParticipants = filterParticipantsForDraw(participants, currentDraw);
    const drawsize = getDrawSize(drawParticipants.length, currentDraw.tournamentChoice);
    const players = mapParticipantsToPlayers(drawParticipants, userMap)
      .filter((p) => p.name)
      .sort((a, b) => a.name.localeCompare(b.name));

    const template = templates.find((t) => Number(t.size || t.drawsize || t.draw_size) === drawsize);
    const templateMatches = normalizeTemplateMatches(
      template?.matches?.length ? template.matches : fallbackTemplate(drawsize)
    );
    const slotMap = new Map<number, (typeof players)[0]>();
    players.slice(0, drawsize).forEach((p, i) => slotMap.set(i + 1, p));

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
  }, [currentDraw, currentMatches, event?.id, participants, started, templates, userMap]);

  const myActiveMatch = useMemo(
    () =>
      user
        ? matches.find(
            (m) =>
              m.status !== 'complete' &&
              [m.player_1_user_id, m.player_2_user_id].includes(user.uid) &&
              m.player_1_name !== BYE &&
              m.player_2_name !== BYE &&
              m.player_1_name !== PLAYER_LOADING &&
              m.player_2_name !== PLAYER_LOADING
          ) ?? null
        : null,
    [matches, user]
  );

  const visibleUserMatch = useMemo(
    () =>
      user
        ? displayMatches.find(
            (m) =>
              [m.player_1_user_id, m.player_2_user_id].includes(user.uid) &&
              m.player_1_name !== BYE &&
              m.player_2_name !== BYE
          ) ?? null
        : null,
    [displayMatches, user]
  );

  const hasSubmittedScore = useMemo(
    () =>
      !!myActiveMatch &&
      submissions.some((s) => s.match_doc_id === myActiveMatch.id && s.submitted_by === user?.uid),
    [myActiveMatch, submissions, user]
  );

  // ── Actions ───────────────────────────────────────────────────────────────

  const generateDraw = async (draw: DrawConfig) => {
    if (!event) return;
    const drawParticipants = filterParticipantsForDraw(participants, draw);
    const drawsize = getDrawSize(drawParticipants.length, draw.tournamentChoice);
    const players = mapParticipantsToPlayers(drawParticipants, userMap)
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, drawsize);

    const template = templates.find((t) => Number(t.size || t.drawsize || t.draw_size) === drawsize);
    const templateMatches = normalizeTemplateMatches(
      template?.matches?.length ? template.matches : fallbackTemplate(drawsize)
    );
    const slotMap = new Map<number, (typeof players)[0]>();
    players.forEach((p, i) => slotMap.set(i + 1, p));

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
          player_1_name: p1?.name || (typeof tm.player_1 === 'number' ? (started ? BYE : PLAYER_LOADING) : getWinnerPlaceholder(tm.player_1, templateMatches)),
          player_1_user_id: p1?.user_id || '',
          player_1_contact: p1?.contact || '',
          player_2_name: p2?.name || (typeof tm.player_2 === 'number' ? (started ? BYE : PLAYER_LOADING) : getWinnerPlaceholder(tm.player_2, templateMatches)),
          player_2_user_id: p2?.user_id || '',
          player_2_contact: p2?.contact || '',
          next_match_id: tm.next_match_id || '',
          next_slot: tm.next_slot || '',
          status: 'pending',
          bracket: null,
          started,
          created_at: new Date().toISOString(),
        },
        { merge: true }
      );
    });

    await batch.commit();
  };

  const updateMatchWithSubmission = async (match: TournamentMatch, submission: ScoreSubmission) => {
    const batch = writeBatch(db);
    batch.update(doc(db, 'tournament_matches', match.id), {
      winner_name: submission.claimed_winner_name,
      winner_user_id: submission.claimed_winner_user_id,
      set_1_player_1: submission.set_1_player_1,
      set_1_player_2: submission.set_1_player_2,
      set_2_player_1: submission.set_2_player_1,
      set_2_player_2: submission.set_2_player_2,
      set_3_player_1: submission.set_3_player_1,
      set_3_player_2: submission.set_3_player_2,
      status: 'complete',
      completed_at: new Date().toISOString(),
    });

    if (match.next_match_id && match.next_slot) {
      const nextMatch = matches.find(
        (m) =>
          m.event_id === match.event_id &&
          m.tournament_choice === match.tournament_choice &&
          m.division === match.division &&
          m.skill_group === match.skill_group &&
          m.match_id === match.next_match_id
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

  const handleGenerateAll = async () => {
    if (!isCreator || !event) return;
    setGenerating(true);
    setMessage(null);
    try {
      for (const draw of VISIBLE_DRAWS) await generateDraw(draw);
      setMessage({ type: 'success', text: 'Tournament draws generated.' });
    } catch (err) {
      console.error('Draw generation failed:', err);
      setMessage({ type: 'error', text: 'Could not generate the draw. Check templates and permissions.' });
    } finally {
      setGenerating(false);
    }
  };

  const handleCreatorUpdateDraw = async () => {
    if (!isCreator) return;
    setUpdatingDraw(true);
    setMessage(null);
    try {
      const pendingByMatch = new Map<string, ScoreSubmission[]>();
      submissions
        .filter((s) => s.status === 'pending')
        .forEach((s) => {
          pendingByMatch.set(s.match_doc_id, [...(pendingByMatch.get(s.match_doc_id) || []), s]);
        });

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
      setMessage({ type: 'success', text: 'Draw update finished.' });
    } catch (err) {
      console.error('Draw update failed:', err);
      setMessage({ type: 'error', text: 'Could not update the draw.' });
    } finally {
      setUpdatingDraw(false);
    }
  };

  const handleResetDraw = async () => {
    if (!isCreator || started || !currentDraw || currentMatches.length === 0) return;
    if (!window.confirm(`Reset ${currentDraw.label}? This removes finalized matches and returns to the live preview.`)) return;
    setResettingDraw(true);
    setMessage(null);
    try {
      const batch = writeBatch(db);
      currentMatches.forEach((m) => batch.delete(doc(db, 'tournament_matches', m.id)));
      await batch.commit();
      setMessage({ type: 'success', text: `${currentDraw.label} reset to live preview.` });
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

  const editPlayers = useMemo(() => {
    if (!editMode || !currentDraw) return [];
    return mapParticipantsToPlayers(filterParticipantsForDraw(participants, currentDraw), userMap);
  }, [editMode, currentDraw, participants, userMap]);

  const handleEditPlayer = async (
    matchId: string,
    slot: 'player_1' | 'player_2',
    player: TournamentPlayer | null,
  ) => {
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

  const handleSubmitScore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scoreForm || !user || !profile) return;

    const match = matches.find((m) => m.id === scoreForm.matchDocId);
    if (!match) return;

    const isPlayer1 = match.player_1_user_id === user.uid;
    const isPlayer2 = match.player_2_user_id === user.uid;
    if (!isPlayer1 && !isPlayer2) return;

    const parsedSets = scoreForm.sets.map((s) => ({
      mine: Number(s.mine || 0),
      opponent: Number(s.opponent || 0),
    }));
    if (parsedSets.some((s) => !Number.isInteger(s.mine) || !Number.isInteger(s.opponent) || s.mine < 0 || s.opponent < 0)) {
      setMessage({ type: 'error', text: 'Scores must be non-negative whole numbers.' });
      return;
    }

    const p1Scores = parsedSets.map((s) => (isPlayer1 ? s.mine : s.opponent));
    const p2Scores = parsedSets.map((s) => (isPlayer1 ? s.opponent : s.mine));
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

    // Include previously-flagged submissions so re-submissions compare correctly
    const existingOther = submissions.find(
      (s) => s.match_doc_id === match.id && s.submitted_by !== user.uid
    );

    await setDoc(doc(db, 'score_submissions', submission.id), submission);

    if (existingOther) {
      if (scoresMatch(submission, existingOther)) {
        await updateMatchWithSubmission(match, submission);
        setMessage({ type: 'success', text: 'Scores matched. The draw has been updated.' });
      } else {
        // Flag internally for creator to resolve — player sees a plain success message
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

  // ── Derived opponent info ─────────────────────────────────────────────────

  const opponentMatch = myActiveMatch || visibleUserMatch;
  const opponent =
    opponentMatch && user
      ? opponentMatch.player_1_user_id === user.uid
        ? { name: opponentMatch.player_2_name, userId: opponentMatch.player_2_user_id, contact: opponentMatch.player_2_contact }
        : { name: opponentMatch.player_1_name, userId: opponentMatch.player_1_user_id, contact: opponentMatch.player_1_contact }
      : null;

  // ── Render ────────────────────────────────────────────────────────────────

  if (authLoading || loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="w-14 h-14 border-4 border-clay border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20 pt-6">
      <TournamentHeader
        title={event?.title || 'Tournament Draw'}
        isCreator={isCreator}
        generating={generating}
        updatingDraw={updatingDraw}
        resettingDraw={resettingDraw}
        canReset={!started && currentMatches.length > 0}
        editMode={editMode}
        onDownload={() => downloadDrawAsPng(displayMatches, currentDraw?.label || 'Draw')}
        onGenerateAll={handleGenerateAll}
        onUpdateDraw={handleCreatorUpdateDraw}
        onResetDraw={handleResetDraw}
        onToggleEdit={() => setEditMode((v) => !v)}
      />

      {message && (
        <div className={`mb-6 rounded-2xl border p-4 flex items-start gap-3 ${
          message.type === 'success'
            ? 'bg-green-500/10 border-green-500/20 text-green-300'
            : 'bg-red-500/10 border-red-500/20 text-red-300'
        }`}>
          {message.type === 'success'
            ? <CheckCircle2 className="w-5 h-5 mt-0.5" />
            : <AlertCircle className="w-5 h-5 mt-0.5" />}
          <p className="font-semibold">{message.text}</p>
        </div>
      )}

      {opponent && (
        <OpponentCard
          opponent={opponent}
          myActiveMatch={myActiveMatch}
          hasSubmittedScore={hasSubmittedScore}
          onSubmitScore={() =>
            setScoreForm({
              matchDocId: myActiveMatch!.id,
              winnerUserId: user!.uid,
              sets: [{ mine: '', opponent: '' }, { mine: '', opponent: '' }, { mine: '', opponent: '' }],
            })
          }
        />
      )}

      <DrawTabs
        activeTab={activeTab}
        activeSkill={activeSkill}
        activeDoubles={activeDoubles}
        currentDraw={currentDraw}
        visibleDraws={visibleDraws}
        onTabChange={setActiveTab}
        onSkillChange={setActiveSkill}
        onDoublesChange={setActiveDoubles}
      />

      <BracketErrorBoundary onDownload={() => downloadDrawAsPng(displayMatches, currentDraw?.label || 'Draw')}>
        <BracketView
          matches={displayMatches}
          drawTitle={currentDraw?.label || 'Draw'}
          editMode={editMode}
          editPlayers={editPlayers}
          onEditPlayer={handleEditPlayer}
        />
      </BracketErrorBoundary>

      {isCreator && (
        <FlaggedResults
          submissions={submissions}
          matches={matches}
          onResolve={handleResolveDispute}
        />
      )}

      {scoreForm && myActiveMatch && (
        <ScoreModal
          match={myActiveMatch}
          scoreForm={scoreForm}
          onChange={setScoreForm}
          onClose={() => setScoreForm(null)}
          onSubmit={handleSubmitScore}
        />
      )}
    </div>
  );
};
