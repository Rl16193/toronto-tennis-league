import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { AnimatePresence, motion } from 'motion/react';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { LeagueRow, pgWinPct, toTitleCase, useStandings } from '../features/leagues/useStandings';
import { useUserMatches } from '../features/matches/useUserMatches';
import { TOTAL_MILESTONES, TOTAL_TASKS, useCommunityStandings } from '../features/tasks/useTasks';
import { SegmentedControl } from '../components/SegmentedControl';
import { Button } from '../components/Button';
import { PlayerCard, RankMove } from '../components/PlayerCard';
import { CHALLENGE_BLOCK_LABEL, useChallengeRules } from '../features/leagues/useChallengeRules';
import { fadeUp, staggerDelay } from '../lib/motion';

// Two boards on the Leaderboard: Tournament (playing points — one flat list across all
// divisions) and Community (the "Community Member Starter" — completing it awards SETUP_POINTS).
type Board = 'tournament' | 'community';

export type TrendSeries = { label: string; color: string; data: number[] };

// Small dependency-free multi-line trend chart with a colored legend row below it. Lived in a
// pages/home/ folder that Home.tsx never imported from — this page is its only consumer.
const AreaChart: React.FC<{ series: TrendSeries[]; className?: string }> = ({ series, className }) => {
  const longest = Math.max(0, ...series.map((s) => s.data.length));
  if (longest < 2) {
    return (
      <div className={`flex items-center justify-center text-fg/70 text-xs ${className ?? ''}`}>
        Not enough matches yet
      </div>
    );
  }

  const W = 300,
    H = 80,
    PAD = 6;
  const allValues = series.flatMap((s) => s.data);
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const range = max - min || 1;

  const lineFor = (data: number[]) => {
    const pts = data.map((v, i) => {
      const x = PAD + (i / (longest - 1)) * (W - 2 * PAD);
      const y = PAD + (1 - (v - min) / range) * (H - 2 * PAD);
      return [x, y] as const;
    });
    return pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  };

  return (
    <div className={`flex flex-col ${className ?? ''}`}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full flex-1 min-h-0"
        preserveAspectRatio="none"
        role="img"
        aria-label="Progress trend"
      >
        {series.map((s) => (
          <path
            key={s.label}
            d={lineFor(s.data)}
            fill="none"
            stroke={s.color}
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      <div className="flex items-center justify-center gap-4 pt-1.5 shrink-0">
        {series.map((s) => (
          <span key={s.label} className="flex items-center gap-1.5 text-[10px] text-fg/70">
            <span className="w-2 h-2 rounded-full inline-block shrink-0" style={{ backgroundColor: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
};

export const Leagues: React.FC = () => {
  const { user, profile, loading: authLoading } = useAuth();
  const { rows, loading } = useStandings();
  const { matches: userMatches } = useUserMatches(user?.uid);
  const { rows: communityRows, loading: communityLoading, reload: reloadCommunity } = useCommunityStandings();

  useEffect(() => {
    document.title = 'Leaderboard · Racquets & Strings';
  }, []);
  const [board, setBoard] = useState<Board>('tournament');
  const [challengeBusy, setChallengeBusy] = useState<string | null>(null);
  // Keyed by user_id so the message renders inline under the exact row that was tapped, instead
  // of a banner up top a mobile user would have to scroll to see. Auto-dismisses after a few
  // seconds.
  const [challengeMessage, setChallengeMessage] = useState<{ userId: string; text: string } | null>(null);
  const showChallengeMessage = (userId: string, text: string) => {
    setChallengeMessage({ userId, text });
    setTimeout(() => setChallengeMessage((cur) => (cur?.userId === userId ? null : cur)), 5000);
  };
  const { blockReason, challenge } = useChallengeRules();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [progressOpen, setProgressOpen] = useState(true);

  // The "still in an active tournament" lookup that used to live here has been removed along with
  // the asterisk it fed. It read the whole `events` collection plus every participant and
  // completed match across up to 30 tournaments, purely to mark one character next to a number.

  // Single flat ranked list — all divisions, ordered by league points. Logged-out visitors see
  // the top 15; signed-in members see the full table.
  // Points filter lives here, not in useStandings: that hook now returns every member so the
  // Matches page can surface brand-new signups, but a leaderboard of people on 0 points isn't a
  // leaderboard.
  const flatRows = useMemo(
    () =>
      rows
        .filter((r) => r.leaguePoints26 > 0)
        .sort(
          (a, b) =>
            b.leaguePoints26 - a.leaguePoints26 || b.matchesPlayed - a.matchesPlayed || a.name.localeCompare(b.name),
        ),
    [rows],
  );
  const shownRows = user ? flatRows : flatRows.slice(0, 15);
  const communityVisible = user ? communityRows : communityRows.slice(0, 15);

  // Your Progress (signed-in): rank in the flat board + own stats + trend chart.
  const userRankIdx = user ? flatRows.findIndex((r) => r.user_id === user.uid) : -1;
  const userStats = profile?.stats;
  // Running (cumulative) versions of the same P/G Win % stat shown in the cards above — walked
  // match-by-match instead of only totaled at the end, to plot how it's changed over time.
  const { pgWonSeries, winPctSeries } = useMemo(() => {
    const asc = [...userMatches].sort((a, b) => a.completedAt - b.completedAt);
    let gamesWon = 0,
      gamesTotal = 0,
      wins = 0;
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

  const toggle = (uid: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
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
      <h1 className="sr-only">Leaderboard</h1>

      {/* Compact header (wireframe 1h): one band — board toggle + division chips */}
      <div className="space-y-2.5 mb-5">
        <SegmentedControl<Board>
          options={[
            { value: 'tournament', label: 'Tournament' },
            { value: 'community', label: 'RS Points' },
          ]}
          value={board}
          onChange={setBoard}
          className="max-w-xs"
        />
      </div>

      {board === 'tournament' && (
        <>
          {/* Your Progress — collapsible so the list sits higher up */}
          {user && userStats && userRankIdx >= 0 && (
            <div className="bg-tennis-surface/30 rounded-3xl p-5 mb-6">
              <button
                type="button"
                onClick={() => setProgressOpen((v) => !v)}
                className="w-full flex items-center justify-between text-left"
                aria-expanded={progressOpen}
              >
                <h2 className="text-lg font-bold text-fg">Progress</h2>
                <span className="text-xs font-bold text-fg/70">{progressOpen ? 'hide ▴' : 'show ▾'}</span>
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
                          {
                            label: 'P/G Win %',
                            value:
                              (userStats.totalPointsPlayed ?? 0) > 0
                                ? `${Math.round(((userStats.pointswon ?? 0) / (userStats.totalPointsPlayed ?? 1)) * 100)}%`
                                : '—',
                          },
                        ].map((t) => (
                          <div key={t.label} className="rounded-2xl bg-fg/[0.03] px-3 py-3 text-center">
                            <p className="text-2xl font-black text-fg">{t.value}</p>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-fg/70 mt-1">{t.label}</p>
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
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-12 bg-tennis-surface/30 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="rounded-3xl bg-tennis-surface/30 overflow-hidden divide-y divide-fg/5">
              {shownRows.length === 0 ? (
                <p className="text-sm text-fg/70 py-6 text-center">Standings appear once matches are played.</p>
              ) : (
                shownRows.map((row, i) => {
                  const isUser = user?.uid === row.user_id;
                  const isOpen = expanded.has(row.user_id);
                  const blocked = blockReason(row);
                  return (
                    <motion.div
                      key={row.user_id}
                      {...fadeUp}
                      transition={{ ...fadeUp.transition, delay: staggerDelay(i) }}
                    >
                      <PlayerCard
                        id={row.user_id}
                        name={toTitleCase(row.name)}
                        subtitle={`Skill ${row.skill_level}`}
                        rank={i + 1}
                        isYou={isUser}
                        primary={row.leaguePoints26}
                        trailing={<RankMove t={row.rankTrend} move={row.rankMove} />}
                        open={isOpen}
                        onToggle={() => toggle(row.user_id)}
                        stats={[
                          { label: 'P/G Won %', value: pgWinPct(row) },
                          { label: 'P/G Played', value: `${row.totalPointsPlayed}` },
                          { label: 'Matches Won', value: `${row.wins}` },
                          { label: 'Rank Move', value: <RankMove t={row.rankTrend} move={row.rankMove} /> },
                        ]}
                        action={
                          blocked !== 'self' && blocked !== 'unsupported' ? (
                            <Button
                              size="sm"
                              variant="clay"
                              className="w-full justify-center !px-2 !py-1 !text-[11px] !rounded-lg whitespace-nowrap"
                              disabled={(!!blocked && blocked !== 'active-limit') || challengeBusy === row.user_id}
                              isLoading={challengeBusy === row.user_id}
                              title={blocked && blocked !== 'active-limit' ? CHALLENGE_BLOCK_LABEL[blocked] : undefined}
                              onClick={() => {
                                if (blocked === 'active-limit') {
                                  showChallengeMessage(row.user_id, CHALLENGE_BLOCK_LABEL['active-limit']);
                                  return;
                                }
                                setChallengeBusy(row.user_id);
                                challenge(row)
                                  .catch(() =>
                                    showChallengeMessage(row.user_id, 'Could not send that challenge. Try again.'),
                                  )
                                  .finally(() => setChallengeBusy(null));
                              }}
                            >
                              Challenge
                            </Button>
                          ) : null
                        }
                      />
                      <AnimatePresence initial={false}>
                        {challengeMessage?.userId === row.user_id && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2, ease: 'easeInOut' }}
                            className="overflow-hidden"
                          >
                            <p className="pl-9 pr-3 pb-2 pt-1 text-[11px] text-clay">{challengeMessage.text}</p>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })
              )}
            </div>
          )}

          {/* Footnotes */}
          <div className="mt-4 space-y-1">
            <p className="text-xs text-fg/70">
              <span className="font-semibold text-fg/70">P/G</span> — Points or Games, depending on the match format
              chosen by the players.
            </p>
          </div>
        </>
      )}

      {/* ── Community board: points from completing tasks (Tasks tab) ── */}
      {board === 'community' &&
        (communityLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-12 bg-tennis-surface/30 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : communityVisible.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-xl font-bold text-fg">No RS Points yet</p>
            <p className="text-fg/70 mt-1 text-sm">
              Complete tasks in the{' '}
              <Link to="/tasks" className="text-clay font-semibold">
                Tasks
              </Link>{' '}
              tab to earn points.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {communityVisible.map((row, i) => {
              const isUser = user?.uid === row.uid;
              const isOpen = expanded.has(row.uid);
              return (
                <motion.div
                  key={row.uid}
                  {...fadeUp}
                  transition={{ ...fadeUp.transition, delay: staggerDelay(i) }}
                  className={`rounded-2xl border ${isUser ? 'bg-clay/10 border-clay/20' : 'bg-tennis-surface/30 border-fg/5'}`}
                >
                  <PlayerCard
                    id={row.uid}
                    name={toTitleCase(row.name || '')}
                    subtitle={`${row.tasksCompleted} tasks · ${row.milestones} milestones`}
                    rank={i + 1}
                    isYou={isUser}
                    primary={row.points}
                    open={isOpen}
                    onToggle={() => toggle(row.uid)}
                    stats={[
                      { label: 'Tasks Completed', value: `${row.tasksCompleted}/${TOTAL_TASKS}` },
                      { label: 'Milestones', value: `${row.milestones}/${TOTAL_MILESTONES}` },
                    ]}
                  />
                </motion.div>
              );
            })}
          </div>
        ))}
    </div>
  );
};
