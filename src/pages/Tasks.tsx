import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Camera, ChevronRight, ExternalLink, Gift, MapPin } from 'lucide-react';
import { ContactLink, InstagramLink, WhatsAppLink } from '../components/FooterElements';
import { motion } from 'motion/react';
import { fadeUp, staggerDelay } from '../lib/motion';
import { MIN_REWARD_COST, useRedeemablePoints } from '../features/services/useServices';
import { Button } from '../components/Button';
import { Accordion } from '../components/Accordion';
import { useAuth } from '../context/AuthContext';
import {
  CATEGORIES, COMMUNITY_GROUP_TASKS, COUNTER_NOUN, DAILY_GROUP_TASKS, SETUP_POINTS, TASKS,
  INITIATION_OPEN_UNTIL, UNLOCKED_TASK_IDS, initiationDoneCount,
  type CategoryDef, type GroupTaskDef, type TaskId, setTaskDone, useTasks,
} from '../features/tasks/useTasks';
import { CheckInModal } from '../features/tasks/CheckInModal';
import { PhotoSubmitModal } from '../features/tasks/PhotoSubmitModal';
import { ClaimModal } from '../features/tasks/ClaimModal';
import type { ClaimType } from '../features/tasks/claimService';
import { Toast } from '../components/Toast';
import { useBadgeToast } from '../features/tasks/useBadgeToast';

// Tasks tab — the Community Member Initiation checklist plus every task category.
// Each section is a dropdown; tasks award themselves as the underlying counters grow.
// (Completing every task in a category is a "milestone" on the Leaderboard.)
export const Tasks: React.FC = () => {
  const { profile } = useAuth();
  const { user, progress, progressLoaded, counters, points } = useTasks();
  const [saving, setSaving] = useState<TaskId | null>(null);
  const [openSection, setOpenSection] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  // Called before the early returns below — hooks can't sit behind a conditional.
  const { balance: redeemable } = useRedeemablePoints({ points, progressLoaded });
  const { toast: badgeToast, dismissToast } = useBadgeToast(progress, counters, progressLoaded);

  useEffect(() => { document.title = 'Tasks · Racquets & Strings'; }, []);

  // Only the initiation section opens by default, and only until INITIATION_OPEN_UNTIL are done.
  // Decided once, when progress lands, so a tap to collapse isn't undone by a later update.
  const [sectionDefaultSet, setSectionDefaultSet] = useState(false);
  useEffect(() => {
    if (!progressLoaded || sectionDefaultSet) return;
    if (initiationDoneCount(progress) < INITIATION_OPEN_UNTIL) setOpenSection('initiation');
    setSectionDefaultSet(true);
  }, [progressLoaded, progress, sectionDefaultSet]);

  const claimableRewards = Math.floor(Math.max(0, redeemable) / MIN_REWARD_COST);
  // Tournament points live on the stats doc as leaguePoints26 — the same field the Leaderboard
  // ranks on (see features/leagues/useStandings.ts), so the two surfaces can't disagree.
  const tournamentPoints = profile?.stats?.leaguePoints26 ?? 0;
  const clearParams = () => setSearchParams({}, { replace: true });

  const checkinOpen = searchParams.get('checkin') === '1';
  // `?photo=1` opens the report form on its default pill; `?photo=<report type>` opens it on that
  // pill, so a Tasks card lands on the form it is about.
  const photoParam = searchParams.get('photo');
  const photoType = (['condition', 'queue', 'waiting_board'] as const).find((p) => p === photoParam);
  const photoOpen = photoParam === '1' || !!photoType;
  const claimType = searchParams.get('claim') as ClaimType | null;
  // 'photos' is a stale deep-link value from before photo reports stopped needing review.

  if (!user) return null; // route is private; auth redirect handles this

  if (!progressLoaded) {
    return (
      <div className="max-w-xl mx-auto px-4 sm:px-6 lg:px-8 pb-20 pt-4 md:pt-6">
        <h1 className="sr-only">Tasks</h1>
        <div className="h-24 bg-tennis-surface/30 rounded-3xl animate-pulse mb-6" />
        <div className="h-64 bg-tennis-surface/30 rounded-3xl animate-pulse" />
      </div>
    );
  }

  const rec = (progress || {}) as Record<string, unknown>;
  const displayName = profile?.user.name || '';
  const doneUnlocked = UNLOCKED_TASK_IDS.filter((id) => rec[id]).length;
  const initiationComplete = !!progress?.setupComplete;

  const toggleTask = async (id: TaskId, done: boolean) => {
    setSaving(id);
    try {
      await setTaskDone(user.uid, displayName, id, done);
    } finally {
      setSaving(null);
    }
  };

  const toggleSection = (id: string) => setOpenSection((cur) => (cur === id ? null : id));

  // Matches the local `Section` this page used before it was merged into the shared Accordion
  // component — same rounded-card/checklist look, just via the shared implementation now.
  const sectionProps = (id: string) => ({
    open: openSection === id,
    onToggle: toggleSection,
    titleClassName: 'font-bold',
    bodyClassName: 'divide-y divide-white/5 mt-2',
  });

  /**
   * One card per category, never a list of every tier. The ring fills toward the NEXT reward alone
   * (7 of the 10 matches it needs), not toward the category total. Two lines: the reward just
   * earned, and what the next one needs and pays. Every point value is the reward table's own
   * (taskCatalog.ts, mirrored by functions/lib/points.js) — the chip is the earned reward's points,
   * the "(+N)" is the next reward's points. Nothing is summed or derived.
   */
  const CategoryCard: React.FC<{ c: CategoryDef }> = ({ c }) => {
    const next = c.tiers.find((t) => !rec[t.id]);
    const earnedTiers = c.tiers.filter((t) => rec[t.id]);
    const last = earnedTiers[earnedTiers.length - 1];
    const have = next ? (counters[next.counter] ?? 0) : 0;
    const remaining = next ? Math.max(0, next.need - have) : 0;
    const pct = next ? Math.min(100, Math.round((have / Math.max(1, next.need)) * 100)) : 100;
    const noun = next ? (remaining === 1 ? COUNTER_NOUN[next.counter].one : COUNTER_NOUN[next.counter].many) : '';

    const earnedLine = !c.locked && last ? `${last.title} earned` : '';
    const nextLine = c.locked ? 'Coming soon'
      : !next ? 'All rewards earned'
      : remaining === 0 ? `Next reward (+${next.points}) ready: ${next.title}`
      : `${remaining} more ${noun} for the next reward (+${next.points}): ${next.title}`;

    // 44px ring drawn as a stroked circle: circumference minus the filled part is the dash gap.
    const R = 20;
    const CIRC = 2 * Math.PI * R;
    const body = (
      <div className={`flex items-center gap-3.5 rounded-2xl bg-fg/5 px-4 py-3 min-h-11 ${c.locked ? 'opacity-50' : ''}`}>
        <span className="relative shrink-0 w-11 h-11">
          <svg viewBox="0 0 44 44" className="w-11 h-11 -rotate-90" aria-hidden="true">
            <circle cx="22" cy="22" r={R} fill="none" stroke="currentColor" strokeWidth="4" className="text-fg/10" />
            <circle
              cx="22" cy="22" r={R} fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round"
              strokeDasharray={`${(CIRC * pct) / 100} ${CIRC}`} className="text-clay"
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-[10px] font-black text-fg tabular-nums">
            {pct}%
          </span>
        </span>

        <span className="min-w-0 flex-1">
          {/* The category keeps its own name: Tournament, Traveller, League Ladder, Streaks. */}
          <span className="block text-[10px] font-bold uppercase tracking-widest text-fg/70 truncate">{c.title}</span>
          {/* Always present, blank until a reward is earned, so every card has the same shape. Only
              this line is bold; the next reward never is. */}
          <span className="flex items-center gap-2 min-h-5">
            <span className="min-w-0 flex-1 text-sm font-bold text-fg truncate">{earnedLine}</span>
            {earnedLine && last && <span className="shrink-0 text-sm font-black text-clay">+{last.points}</span>}
          </span>
          {/* Wraps rather than truncating: the reward name and its points are the point of the line. */}
          <span className="block text-xs text-fg/70">{nextLine}</span>
        </span>
      </div>
    );

    if (c.locked || !c.to) return body;
    return (
      <Link
        to={c.to}
        aria-label={`${c.title}: ${[earnedLine, nextLine].filter(Boolean).join('. ')}`}
        className="block rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clay"
      >
        {body}
      </Link>
    );
  };

  // Group / community bonuses — descriptive cards (name + wrapped trigger + points). Unlike the
  // tiers, these unlock from collective activity and are paid server-side into bonusPoints.
  const GroupSection: React.FC<{ id: string; title: string; tasks: GroupTaskDef[] }> = ({ id, title, tasks }) => (
    <Accordion
      id={id}
      title={title}
      {...sectionProps(id)}
      right={<span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide text-clay/70 border border-clay/25">Bonus</span>}
    >
      {tasks.map((g) => (
        <div key={g.id} className="py-3">
          <div className="flex items-start justify-between gap-3">
            <span className="text-sm font-bold text-fg">{g.name}</span>
            <span className="text-xs font-bold text-clay shrink-0">{g.points}</span>
          </div>
          <p className="text-xs text-fg/70 mt-1 leading-relaxed">{g.trigger}</p>
        </div>
      ))}
    </Accordion>
  );

  return (
    <div className="max-w-xl mx-auto px-4 sm:px-6 lg:px-8 pb-20 pt-4 md:pt-6">
      <h1 className="sr-only">Tasks</h1>


      {/* Points summary — three headline metrics replacing the old progress bar. The bar tracked
          one number toward a moving threshold; these state where you actually stand. Buttons are
          unconditional now, since the "Rewards Available" count already conveys whether there's
          anything to redeem. */}
      <motion.div {...fadeUp} className="rounded-3xl bg-tennis-surface/30 p-5 mb-6">
        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="text-center">
            <p className="text-2xl font-black text-clay leading-none">
              {points}
            </p>
            <p className="text-[11px] font-bold uppercase tracking-widest text-fg/70 mt-1">RS Points</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-black text-fg leading-none">{tournamentPoints}</p>
            <p className="text-[11px] font-bold uppercase tracking-widest text-fg/70 mt-1">League Points</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-black text-fg leading-none">{claimableRewards}</p>
            <p className="text-[11px] font-bold uppercase tracking-widest text-fg/70 mt-1">Rewards</p>
          </div>
        </div>
        <div className="flex items-center justify-center gap-2 flex-wrap">
          <Link to="/tasks?checkin=1">
            <Button variant="white" size="sm"><MapPin className="w-4 h-4 mr-1.5" />Record Activity</Button>
          </Link>
          <Link to="/marketplace">
            <Button variant="lime" size="sm"><Gift className="w-4 h-4 mr-1.5" />Redeem</Button>
          </Link>
          <Link to="/tasks?photo=1">
            <Button variant="clay" size="sm"><Camera className="w-4 h-4 mr-1.5" />Submit a Report</Button>
          </Link>
        </div>
      </motion.div>

      <div className="space-y-3">
        <GroupSection id="dailyGroup" title="Daily Group Tasks" tasks={DAILY_GROUP_TASKS} />
        <GroupSection id="communityGroup" title="Community Tasks" tasks={COMMUNITY_GROUP_TASKS} />

        {/* Community Member Initiation — flat award for the whole checklist */}
        <Accordion
          id="initiation"
          title="Community Member Initiation"
          {...sectionProps('initiation')}
          right={initiationComplete ? (
            <span className="px-2 py-0.5 rounded-lg text-[11px] font-black bg-clay/15 text-clay border border-clay/25">
              +{SETUP_POINTS} pts
            </span>
          ) : (
            <span className="text-xs font-bold text-fg/70">{doneUnlocked}/{UNLOCKED_TASK_IDS.length}</span>
          )}
        >
          {TASKS.map((t) => {
            const done = !!rec[t.id];
            const trust = t.kind === 'trust' && !t.locked;
            return (
              <div key={t.id} className="flex items-center gap-3 py-2.5">
                <input
                  type="checkbox"
                  checked={done}
                  disabled={!trust || saving === t.id}
                  onChange={trust ? (e) => toggleTask(t.id, e.target.checked) : undefined}
                  className={`w-4 h-4 shrink-0 accent-clay ${trust ? 'cursor-pointer' : ''} ${t.locked ? 'opacity-25' : done ? '' : 'opacity-60'}`}
                  aria-label={t.title}
                />
                <span className={`text-sm flex-1 min-w-0 ${t.locked ? 'text-fg/70' : done ? 'text-fg/70' : 'text-fg'}`}>
                  {t.title}
                </span>
                {t.locked ? (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide text-fg/70 shrink-0">
                    Soon
                  </span>
                ) : t.link ? (
                  <a href={t.link} target="_blank" rel="noopener noreferrer"
                    className="text-clay/70 hover:text-clay transition-colors shrink-0" aria-label={`Open link for ${t.title}`}>
                    <ExternalLink className="w-4 h-4" />
                  </a>
                ) : t.to && !done ? (
                  <Link to={t.to} className="text-fg/70 hover:text-clay transition-colors shrink-0" aria-label={`Go to ${t.title}`}>
                    <ChevronRight className="w-4 h-4" />
                  </Link>
                ) : null}
              </div>
            );
          })}
        </Accordion>

        {CATEGORIES.map((c, i) => (
          <motion.div key={c.id} {...fadeUp} transition={{ ...fadeUp.transition, delay: staggerDelay(i) }}>
            <CategoryCard c={c} />
          </motion.div>
        ))}
      </div>

      {/* Socials, WhatsApp and contact links. */}
      <div className="pt-6 mt-2">
        <div className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs text-fg/70">
          <InstagramLink />
          <WhatsAppLink />
          <ContactLink />
        </div>
      </div>

      {checkinOpen && <CheckInModal onClose={clearParams} />}
      {photoOpen && <PhotoSubmitModal onClose={clearParams} initialType={photoType} />}
      {claimType && <ClaimModal type={claimType} onClose={clearParams} />}

      <Toast message={badgeToast} onDismiss={dismissToast} />
    </div>
  );
};
