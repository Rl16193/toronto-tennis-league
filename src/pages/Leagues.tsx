import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { AnimatePresence, motion } from 'motion/react';
import { useAuth } from '../context/AuthContext';
import { abbreviatePlayerName, byLeagueRank, pgWinPct, useStandings } from '../features/leagues/useStandings';
import { TOTAL_MILESTONES, TOTAL_TASKS, useCommunityStandings } from '../features/tasks/useTasks';
import { SegmentedControl } from '../components/SegmentedControl';
import { Button } from '../components/Button';
import { PlayerCard, RankMove } from '../components/PlayerCard';
import { CHALLENGE_BLOCK_LABEL, useChallengeRules } from '../features/leagues/useChallengeRules';
import { fadeUp, staggerDelay } from '../lib/motion';

// Two boards on the Leaderboard: Tournament (playing points — one flat list across all
// divisions) and Community (the "Community Member Starter" — completing it awards SETUP_POINTS).
type Board = 'tournament' | 'community';

// A member's own progress (rank move, form, head to head) lives in the Player Dash on /profile.
export const Leagues: React.FC = () => {
  const { user, loading: authLoading } = useAuth();
  const { rows, loading } = useStandings();
  const { rows: communityRows, loading: communityLoading } = useCommunityStandings();

  useEffect(() => { document.title = 'Leaderboard · Racquets & Strings'; }, []);
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

  // The "still in an active tournament" lookup that used to live here has been removed along with
  // the asterisk it fed. It read the whole `events` collection plus every participant and
  // completed match across up to 30 tournaments, purely to mark one character next to a number.

  // Single flat ranked list — all divisions, ordered by league points. Logged-out visitors see
  // the top 15; signed-in members see the full table.
  // Points filter lives here, not in useStandings: that hook now returns every member so the
  // Matches page can surface brand-new signups, but a leaderboard of people on 0 points isn't a
  // leaderboard.
  const flatRows = useMemo(
    () => rows.filter((r) => r.leaguePoints > 0)
      .sort(byLeagueRank),
    [rows],
  );
  const shownRows = user ? flatRows : flatRows.slice(0, 15);
  const communityVisible = user ? communityRows : communityRows.slice(0, 15);

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
      <h1 className="sr-only">Leaderboard</h1>

      {/* Compact header (wireframe 1h): one band — board toggle + division chips */}
      <div className="space-y-2.5 mb-5">
        <SegmentedControl<Board>
          options={[{ value: 'tournament', label: 'Tournament' }, { value: 'community', label: 'RS Points' }]}
          value={board}
          onChange={setBoard}
          className="max-w-xs"
        />
      </div>

      {board === 'tournament' && (<>
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-12 bg-tennis-surface/30 rounded-xl animate-pulse" />)}
        </div>
      ) : (
        <div className="rounded-3xl bg-tennis-surface/30 overflow-hidden divide-y divide-fg/5">
          {shownRows.length === 0 ? (
            <p className="text-sm text-fg/70 py-6 text-center">Standings appear once matches are played.</p>
          ) : shownRows.map((row, i) => {
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
                  name={abbreviatePlayerName(row.name)}
                  subtitle={`Skill ${row.skill_level}`}
                  rank={i + 1}
                  isYou={isUser}
                  primary={row.leaguePoints}
                  trailing={<RankMove t={row.rankTrend} move={row.rankMove} />}
                  open={isOpen}
                  onToggle={() => toggle(row.user_id)}
                  stats={[
                    { label: 'P/G Won %', value: pgWinPct(row) },
                    { label: 'P/G Played', value: `${row.totalPointsPlayed}` },
                    { label: 'Matches Won', value: `${row.wins}` },
                    { label: 'Rank Move', value: <RankMove t={row.rankTrend} move={row.rankMove} /> },
                  ]}
                  action={blocked !== 'self' && blocked !== 'unsupported' ? (
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
                          .catch(() => showChallengeMessage(row.user_id, 'Could not send that challenge. Try again.'))
                          .finally(() => setChallengeBusy(null));
                      }}
                    >
                      Challenge
                    </Button>
                  ) : null}
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
          })}
        </div>
      )}

      {/* Footnotes */}
      <div className="mt-4 space-y-1">
        <p className="text-xs text-fg/70">
          <span className="font-semibold text-fg/70">P/G</span> — Points or Games, depending on the match format chosen by the players.
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
            <p className="text-fg/70 mt-1 text-sm">
              Complete tasks in the <Link to="/tasks" className="text-clay font-semibold">Tasks</Link> tab to earn points.
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
                    name={abbreviatePlayerName(row.name || '')}
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
        )
      )}
    </div>
  );
};
