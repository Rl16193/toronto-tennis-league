import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { ArrowUp, ArrowDown, Minus, ChevronDown } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { LeagueRow, inDivision, toTitleCase, useStandings } from '../features/leagues/useStandings';
import { isSeniorsLeague } from '../utils/skillLevels';
import { useUserMatches } from '../features/matches/useUserMatches';
import { AreaChart } from './home/AreaChart';
import { TOTAL_MILESTONES, TOTAL_TASKS, useCommunityStandings } from '../features/tasks/useTasks';
import { BadgeRow } from '../features/tasks/BadgeRow';
import { SegmentedControl } from '../components/SegmentedControl';
import { ChipRow } from '../components/ChipRow';
import { fadeUp, staggerDelay } from '../lib/motion';

// Two boards on the Leaderboard: Tournament (playing points, per division) and Community
// (the "Community Member Starter" — completing it awards SETUP_POINTS).
type Board = 'tournament' | 'community';

// Leaderboard-only grouping — Singles (Men's + Women's combined, no gender split), Doubles,
// and Retired Pro (added ahead of that league actually starting). This is separate from the
// gender-based divisions `useStandings`' inDivision() still serves elsewhere (ladder challenge
// routing, Matches.tsx) — those stay gender-scoped for match-making; only how standings are
// displayed here changes.
type LBTab = 'singles' | 'doubles' | 'seniors';
const LB_TABS: { id: LBTab; label: string }[] = [
  { id: 'singles', label: 'Singles' },
  { id: 'doubles', label: 'Doubles' },
  { id: 'seniors', label: 'Retired Pro' },
];
const inLBTab = (league: string, tab: LBTab): boolean => {
  if (tab === 'doubles') return inDivision(league, 'doubles');
  if (tab === 'seniors') return isSeniorsLeague(league);
  return !inDivision(league, 'doubles') && !isSeniorsLeague(league);
};

const pgWinPct = (r: LeagueRow) =>
  r.totalPointsPlayed > 0 ? `${Math.round((r.pointswon / r.totalPointsPlayed) * 100)}%` : '—';

const Trend: React.FC<{ t: 'up' | 'down' | 'flat'; move?: number }> = ({ t, move }) =>
  t === 'up' ? (
    <span className="inline-flex items-center gap-0.5 text-green-400" aria-label={`rising${move ? ` ${move}` : ''}`}>
      <ArrowUp className="w-4 h-4" />{!!move && <span className="text-[11px] font-bold">{move}</span>}
    </span>
  ) : t === 'down' ? (
    <span className="inline-flex items-center gap-0.5 text-red-400" aria-label={`falling${move ? ` ${move}` : ''}`}>
      <ArrowDown className="w-4 h-4" />{!!move && <span className="text-[11px] font-bold">{move}</span>}
    </span>
  ) : (
    <Minus className="w-4 h-4 text-fg/30 inline" aria-label="no change" />
  );

export const Leagues: React.FC = () => {
  const { user, profile, loading: authLoading } = useAuth();
  const { rows, loading } = useStandings();
  const { matches: userMatches } = useUserMatches(user?.uid);
  const { rows: communityRows, loading: communityLoading, reload: reloadCommunity } = useCommunityStandings();

  useEffect(() => { document.title = 'Leaderboard — Racquets & Strings'; }, []);
  const [board, setBoard] = useState<Board>('tournament');
  const [activeDiv, setActiveDiv] = useState<LBTab>('singles');
  const [stillActiveUids, setStillActiveUids] = useState<Set<string>>(new Set());
  // uid → the badges each player chose to display (users is world-readable).
  const [badgeMap, setBadgeMap] = useState<Record<string, string[]>>({});
  const [hasActiveTournament, setHasActiveTournament] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [progressOpen, setProgressOpen] = useState(true);

  // Detect active tournaments and find players still in (not yet eliminated)
  useEffect(() => {
    if (!user) return;
    const fetchActive = async () => {
      const eventsSnap = await getDocs(collection(db, 'events'));
      const now = Date.now();
      const activeIds = eventsSnap.docs
        .filter((d) => {
          const e = d.data();
          if (!e.type?.toLowerCase().includes('tournament')) return false;
          const start = e.startDate || e.start_date || e.date;
          if (!start) return false;
          const startMs = typeof start === 'object' && start.toDate ? start.toDate().getTime() : new Date(start).getTime();
          return startMs <= now;
        })
        .map((d) => d.id);

      if (activeIds.length === 0) return;
      setHasActiveTournament(true);

      const ids = activeIds.slice(0, 30);
      const [participantsSnap, matchesSnap] = await Promise.all([
        getDocs(query(collection(db, 'event_participants'), where('event_id', 'in', ids))),
        getDocs(query(collection(db, 'tournament_matches'), where('event_id', 'in', ids), where('status', '==', 'complete'))),
      ]);

      const allParticipantUids = new Set(participantsSnap.docs.map((d) => d.data().user_id));
      const eliminatedUids = new Set<string>();
      matchesSnap.docs.forEach((d) => {
        const m = d.data();
        const loserUid = m.winner_user_id === m.player_1_user_id ? m.player_2_user_id : m.player_1_user_id;
        if (loserUid) eliminatedUids.add(loserUid);
      });

      setStillActiveUids(new Set([...allParticipantUids].filter((uid) => !eliminatedUids.has(uid))));
    };
    fetchActive();
  }, [user]);

  useEffect(() => { setExpanded(new Set()); }, [activeDiv]);

  // Displayed badges for everyone on the boards — one read, works logged out.
  useEffect(() => {
    getDocs(collection(db, 'users'))
      .then((snap) => {
        const map: Record<string, string[]> = {};
        snap.docs.forEach((d) => {
          const b = d.data().display_badges;
          if (Array.isArray(b) && b.length) map[d.id] = b;
        });
        setBadgeMap(map);
      })
      .catch(() => { /* badges are decorative — the boards work without them */ });
  }, []);

  const sorted = useMemo(
    () => rows.filter((r) => inLBTab(r.league, activeDiv)).sort((a, b) => b.leaguePoints26 - a.leaguePoints26),
    [rows, activeDiv],
  );

  // Logged-out visitors see only the top 15 of each league; signed-in members see the full table.
  const visible = user ? sorted : sorted.slice(0, 15);
  const communityVisible = user ? communityRows : communityRows.slice(0, 15);

  // Your Progress (signed-in): rank within the division + own stats + trend chart.
  const userRankIdx = user ? sorted.findIndex((r) => r.user_id === user.uid) : -1;
  const userStats = profile?.stats;
  // Only show Your Progress on the division the player actually belongs to (not every tab).
  const userInThisDiv = !!userStats?.league && inLBTab(userStats.league, activeDiv);
  // Running (cumulative) versions of the same P/G Win % stat shown in the cards above — walked
  // match-by-match instead of only totaled at the end, to plot how it's changed over time.
  const { pgWonSeries, winPctSeries } = useMemo(() => {
    const asc = [...userMatches].sort((a, b) => a.completedAt - b.completedAt);
    let gamesWon = 0, gamesTotal = 0, wins = 0;
    const pg: number[] = [];
    const wp: number[] = [];
    asc.forEach((m, i) => {
      gamesWon += m.myGames;
      gamesTotal += m.myGames + m.oppGames;
      if (m.won) wins += 1;
      pg.push(gamesTotal > 0 ? (gamesWon / gamesTotal) * 100 : 0);
      wp.push((wins / (i + 1)) * 100);
    });
    return { pgWonSeries: pg, winPctSeries: wp };
  }, [userMatches]);

  const toggle = (uid: string) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(uid)) next.delete(uid); else next.add(uid);
    return next;
  });

  if (authLoading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="w-14 h-14 border-4 border-clay border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto px-4 pb-20 pt-4">
      <h1 className="text-2xl font-display font-bold text-fg mb-4">Leaderboard</h1>

      {/* Compact header (wireframe 1h): one band — board toggle + division chips */}
      <div className="space-y-2.5 mb-5">
        <SegmentedControl<Board>
          options={[{ value: 'tournament', label: 'Tournament' }, { value: 'community', label: 'RS Points' }]}
          value={board}
          onChange={setBoard}
          className="max-w-xs"
        />
        {board === 'tournament' && (
          <ChipRow
            options={LB_TABS.map((t) => ({ value: t.id, label: t.label }))}
            value={activeDiv}
            onChange={(v) => setActiveDiv(v)}
          />
        )}
      </div>

      {board === 'tournament' && (<>
      {/* Your Progress — collapsible so the list sits higher up */}
      {user && userStats && userInThisDiv && (
        <div className="bg-tennis-surface/30 border border-fg/5 rounded-3xl p-5 mb-6">
          <button
            type="button"
            onClick={() => setProgressOpen((v) => !v)}
            className="w-full flex items-center justify-between text-left"
            aria-expanded={progressOpen}
          >
            <h2 className="text-lg font-bold text-fg">Progress</h2>
            <span className="text-xs font-bold text-fg/40">{progressOpen ? 'hide ▴' : 'show ▾'}</span>
          </button>
          <AnimatePresence initial={false}>
            {progressOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25, ease: 'easeInOut' }}
                className="overflow-hidden"
              >
                <div className="mt-4">
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    {[
                      { label: 'Rank', value: userRankIdx >= 0 ? `#${userRankIdx + 1}` : '—' },
                      { label: 'Matches', value: `${userStats.matchesPlayed ?? 0}` },
                      { label: 'P/G Win %', value: (userStats.totalPointsPlayed ?? 0) > 0
                          ? `${Math.round(((userStats.pointswon ?? 0) / (userStats.totalPointsPlayed ?? 1)) * 100)}%` : '—' },
                    ].map((t) => (
                      <div key={t.label} className="rounded-2xl bg-fg/[0.03] border border-fg/5 px-3 py-3 text-center">
                        <p className="text-2xl font-black text-fg">{t.value}</p>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-fg/40 mt-1">{t.label}</p>
                      </div>
                    ))}
                  </div>
                  <AreaChart
                    series={[
                      { label: 'P/G Won %', color: '#3b82f6', data: pgWonSeries },
                      { label: 'Win %', color: '#FF6B35', data: winPctSeries },
                    ]}
                    className="w-full h-24"
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-12 bg-tennis-surface/30 rounded-xl animate-pulse" />)}
        </div>
      ) : sorted.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-xl font-bold text-fg">No standings yet</p>
          <p className="text-fg/60 mt-1 text-sm">Standings will appear once matches are played.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((row, i) => {
            const isUser = user?.uid === row.user_id;
            const active = stillActiveUids.has(row.user_id);
            const isOpen = expanded.has(row.user_id);
            return (
              <motion.div
                key={row.user_id}
                {...fadeUp}
                transition={{ ...fadeUp.transition, delay: staggerDelay(i) }}
                className={`rounded-2xl border ${isUser ? 'bg-clay/10 border-clay/20' : 'bg-tennis-surface/30 border-fg/5'}`}
              >
                <button type="button" onClick={() => toggle(row.user_id)} className="w-full flex items-center gap-3 px-3 py-2.5 text-left">
                  <span className="text-fg/40 font-mono text-xs w-6 shrink-0">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-fg font-semibold text-sm truncate">
                      {toTitleCase(row.name)}
                      <BadgeRow ids={badgeMap[row.user_id]} size="sm" className="ml-1.5 align-middle" />
                      {isUser ? <span className="ml-1 text-clay text-[10px]">(you)</span> : null}
                    </p>
                    <p className="text-fg/40 text-[11px]">Skill {row.skill_level}</p>
                  </div>
                  <span className="font-black text-fg text-base shrink-0">{row.leaguePoints26}</span>
                  <span className="shrink-0"><Trend t={row.rankTrend} move={row.rankMove} /></span>
                  <ChevronDown className={`w-4 h-4 text-fg/30 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25, ease: 'easeInOut' }}
                      className="overflow-hidden"
                    >
                      <div className="grid grid-cols-2 gap-2 px-3 pb-3 pt-1 border-t border-fg/5">
                        {[
                          { label: 'P/G Win %', value: pgWinPct(row) },
                          { label: 'P/G Played', value: `${row.totalPointsPlayed}` },
                          { label: 'Matches Played', value: `${row.matchesPlayed}${active ? '*' : ''}` },
                          { label: 'Matches Won', value: `${row.wins}` },
                        ].map((s) => (
                          <div key={s.label} className="rounded-xl bg-fg/[0.03] px-2 py-2 text-center">
                            <p className="text-fg font-bold text-sm">{s.value}</p>
                            <p className="text-fg/40 text-[9px] uppercase tracking-wide mt-0.5">{s.label}</p>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Footnotes */}
      <div className="mt-4 space-y-1">
        {hasActiveTournament && (
          <p className="text-xs text-fg/40">
            <span className="text-clay font-black">*</span> points to be updated after event ends
          </p>
        )}
        <p className="text-xs text-fg/40">
          <span className="font-semibold text-fg/60">P/G</span> — Points or Games, depending on the match format chosen by the players.
        </p>
      </div>
      </>)}

      {/* ── Community board: points from completing tasks (Tasks tab) ── */}
      {board === 'community' && (
        communityLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-12 bg-tennis-surface/30 rounded-xl animate-pulse" />)}
          </div>
        ) : communityVisible.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-xl font-bold text-fg">No RS Points yet</p>
            <p className="text-fg/60 mt-1 text-sm">
              Complete tasks in the <Link to="/tasks" className="text-clay font-semibold">Tasks</Link> tab to earn points.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {communityVisible.map((row, i) => {
              const isUser = user?.uid === row.user_id;
              const isOpen = expanded.has(row.user_id);
              return (
                <motion.div
                  key={row.user_id}
                  {...fadeUp}
                  transition={{ ...fadeUp.transition, delay: staggerDelay(i) }}
                  className={`rounded-2xl border ${isUser ? 'bg-clay/10 border-clay/20' : 'bg-tennis-surface/30 border-fg/5'}`}
                >
                  <button type="button" onClick={() => toggle(row.user_id)} className="w-full flex items-center gap-3 px-3 py-2.5 text-left">
                    <span className="text-fg/40 font-mono text-xs w-6 shrink-0">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-fg font-semibold text-sm truncate">
                        {toTitleCase(row.name || '')}
                        <BadgeRow ids={badgeMap[row.user_id]} size="sm" className="ml-1.5 align-middle" />
                        {isUser ? <span className="ml-1 text-clay text-[10px]">(you)</span> : null}
                      </p>
                      <p className="text-fg/40 text-[11px]">{row.tasksCompleted} tasks · {row.milestones} milestones</p>
                    </div>
                    <span className="font-black text-fg text-base shrink-0">{row.points}</span>
                    <ChevronDown className={`w-4 h-4 text-fg/30 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </button>
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25, ease: 'easeInOut' }}
                        className="overflow-hidden"
                      >
                        <div className="grid grid-cols-2 gap-2 px-3 pb-3 pt-1 border-t border-fg/5">
                          {[
                            { label: 'Tasks Completed', value: `${row.tasksCompleted}/${TOTAL_TASKS}` },
                            { label: 'Milestones', value: `${row.milestones}/${TOTAL_MILESTONES}` },
                          ].map((s) => (
                            <div key={s.label} className="rounded-xl bg-fg/[0.03] px-2 py-2 text-center">
                              <p className="text-fg font-bold text-sm">{s.value}</p>
                              <p className="text-fg/40 text-[9px] uppercase tracking-wide mt-0.5">{s.label}</p>
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>
        )
      )}
    </div>
  );
};
