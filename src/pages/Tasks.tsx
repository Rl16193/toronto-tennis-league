import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Camera, ChevronRight, ExternalLink, Instagram, ListChecks, Mail, MapPin, MessageCircle, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';
import { fadeUp, staggerDelay } from '../lib/motion';
import { Button } from '../components/Button';
import { Accordion } from '../components/Accordion';
import { useAuth } from '../context/AuthContext';
import {
  CATEGORIES, COMMUNITY_GROUP_TASKS, DAILY_GROUP_TASKS, INSTAGRAM_URL, SETUP_POINTS, TASKS,
  TOTAL_AVAILABLE, UNLOCKED_TASK_IDS, WHATSAPP_URL,
  categoryTotal, type CategoryDef, type GroupTaskDef, type TaskId, setTaskDone, useTasks,
} from '../features/tasks/useTasks';
import { CheckInModal } from '../features/tasks/CheckInModal';
import { PhotoSubmitModal } from '../features/tasks/PhotoSubmitModal';
import { ClaimModal } from '../features/tasks/ClaimModal';
import { ReviewQueue } from '../features/tasks/ReviewQueue';
import type { ClaimType } from '../features/tasks/claimService';

// Tasks tab — the Community Member Initiation checklist plus every task category.
// Each section is a dropdown; tasks award themselves as the underlying counters grow.
// (Completing every task in a category is a "milestone" on the Leaderboard.)
export const Tasks: React.FC = () => {
  const { profile } = useAuth();
  const { user, progress, progressLoaded, counters, points } = useTasks();
  const [saving, setSaving] = useState<TaskId | null>(null);
  const [openSection, setOpenSection] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => { document.title = 'Tasks — Racquets & Strings'; }, []);

  const isOrganizer = profile?.preferences.event_creator === true;
  const clearParams = () => setSearchParams({}, { replace: true });

  const checkinOpen = searchParams.get('checkin') === '1';
  const photoOpen = searchParams.get('photo') === '1';
  const claimType = searchParams.get('claim') as ClaimType | null;
  // 'photos' is a stale deep-link value from before photo reports stopped needing review.
  const reviewOpen = searchParams.get('review') === 'claims' ? 'claims' : null;

  if (!user) return null; // route is private; auth redirect handles this

  if (!progressLoaded) {
    return (
      <div className="max-w-xl mx-auto px-4 sm:px-6 lg:px-8 pb-20 pt-4 md:pt-6">
        <div className="flex items-center gap-2 mb-5">
          <ListChecks className="w-6 h-6 text-clay" />
          <h1 className="text-2xl md:text-3xl font-display font-bold text-fg">Tasks</h1>
        </div>
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

  const CategorySection: React.FC<{ c: CategoryDef }> = ({ c }) => {
    const earned = c.tiers.filter((t) => rec[t.id]).length;
    const earnedPoints = c.tiers.reduce((n, t) => n + (rec[t.id] ? t.points : 0), 0);
    return (
      <Accordion
        id={c.id}
        title={c.title}
        locked={c.locked}
        {...sectionProps(c.id)}
        right={
          c.locked ? (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide text-fg/30 border border-fg/10">Soon</span>
          ) : (
            <span className="text-xs font-bold text-fg/40">
              {earnedPoints}<span className="text-fg/25">/{categoryTotal(c)} pts</span>
            </span>
          )
        }
      >
        {c.tiers.map((t) => {
          const done = !!rec[t.id];
          const have = counters[t.counter] ?? 0;
          return (
            <div key={t.id} className="flex items-center gap-3 py-2.5">
              <input
                type="checkbox"
                checked={done}
                disabled
                className={`w-4 h-4 shrink-0 accent-clay ${c.locked ? 'opacity-25' : done ? '' : 'opacity-60'}`}
                aria-label={t.title}
              />
              <span className={`text-sm flex-1 min-w-0 ${c.locked ? 'text-fg/30' : done ? 'text-fg/50' : 'text-fg'}`}>
                {t.title}
              </span>
              {!done && !c.locked && have > 0 && (
                <span className="text-[11px] text-fg/40 shrink-0">{have}/{t.need}</span>
              )}
              <span className={`text-xs font-bold shrink-0 ${done ? 'text-clay' : 'text-fg/30'}`}>{t.points}</span>
              {!done && !c.locked && c.to && (
                <Link to={c.to} className="text-fg/30 hover:text-clay transition-colors shrink-0" aria-label={`Go to ${t.title}`}>
                  <ChevronRight className="w-4 h-4" />
                </Link>
              )}
            </div>
          );
        })}
      </Accordion>
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
          <p className="text-xs text-fg/50 mt-1 leading-relaxed">{g.trigger}</p>
        </div>
      ))}
    </Accordion>
  );

  return (
    <div className="max-w-xl mx-auto px-4 sm:px-6 lg:px-8 pb-20 pt-4 md:pt-6">
      <div className="flex items-center gap-2 mb-5">
        <ListChecks className="w-6 h-6 text-clay" />
        <h1 className="text-2xl md:text-3xl font-display font-bold text-fg">Tasks</h1>
      </div>

      {isOrganizer && <ReviewQueue defaultOpen={reviewOpen} />}

      {/* Completion bar — at-a-glance progress (wireframe 1k) */}
      <div className="mb-4">
        <div className="flex items-center justify-between text-[11px] font-bold text-fg/40 mb-1.5">
          <span>{points} / {TOTAL_AVAILABLE} pts</span>
          <span>{Math.round((points / TOTAL_AVAILABLE) * 100)}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-fg/10 overflow-hidden">
          <div
            className="h-full rounded-full bg-clay transition-all duration-500"
            style={{ width: `${Math.min(100, (points / TOTAL_AVAILABLE) * 100)}%` }}
          />
        </div>
      </div>

      {/* Points summary */}
      <motion.div {...fadeUp} className="rounded-3xl bg-tennis-surface/30 border border-fg/5 p-5 mb-6 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-clay/15 border border-clay/30 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-clay" />
          </div>
          <div>
            <p className="text-2xl font-black text-clay leading-none">
              {points}<span className="text-sm text-fg/30 font-bold"> / {TOTAL_AVAILABLE}</span>
            </p>
            <p className="text-[11px] font-bold uppercase tracking-widest text-fg/40 mt-1">RS Points</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link to="/tasks?checkin=1">
            <Button variant="outline" size="sm"><MapPin className="w-4 h-4 mr-1.5" />Check In</Button>
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
            <span className="text-xs font-bold text-fg/40">{doneUnlocked}/{UNLOCKED_TASK_IDS.length}</span>
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
                <span className={`text-sm flex-1 min-w-0 ${t.locked ? 'text-fg/30' : done ? 'text-fg/50' : 'text-fg'}`}>
                  {t.title}
                </span>
                {t.locked ? (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide text-fg/30 border border-fg/10 shrink-0">
                    Soon
                  </span>
                ) : t.link ? (
                  <a href={t.link} target="_blank" rel="noopener noreferrer"
                    className="text-clay/70 hover:text-clay transition-colors shrink-0" aria-label={`Open link for ${t.title}`}>
                    <ExternalLink className="w-4 h-4" />
                  </a>
                ) : t.to && !done ? (
                  <Link to={t.to} className="text-fg/30 hover:text-clay transition-colors shrink-0" aria-label={`Go to ${t.title}`}>
                    <ChevronRight className="w-4 h-4" />
                  </Link>
                ) : null}
              </div>
            );
          })}
        </Accordion>

        {CATEGORIES.map((c, i) => (
          <motion.div key={c.id} {...fadeUp} transition={{ ...fadeUp.transition, delay: staggerDelay(i) }}>
            <CategorySection c={c} />
          </motion.div>
        ))}
      </div>

      {/* Socials, WhatsApp and contact links. */}
      <div className="pt-6 mt-2">
        <div className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs text-fg/50">
          <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-clay transition-colors">
            <Instagram className="w-3.5 h-3.5" /> Instagram
          </a>
          <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-clay transition-colors">
            <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
          </a>
          <a href="mailto:events.racquetsandstrings@gmail.com" className="inline-flex items-center gap-1 hover:text-clay transition-colors">
            <Mail className="w-3.5 h-3.5" /> Contact
          </a>
        </div>
      </div>

      {checkinOpen && <CheckInModal onClose={clearParams} />}
      {photoOpen && <PhotoSubmitModal onClose={clearParams} />}
      {claimType && <ClaimModal type={claimType} onClose={clearParams} />}
    </div>
  );
};
