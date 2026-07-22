import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Camera, ChevronDown, ChevronRight, ExternalLink, Instagram, ListChecks, Mail, MapPin, MessageCircle, Sparkles } from 'lucide-react';
import { Button } from '../components/Button';
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
  const [openSection, setOpenSection] = useState<string | null>('initiation');
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => { document.title = 'Tasks — Racquets & Strings'; }, []);

  const isOrganizer = profile?.preferences.event_creator === true;
  const clearParams = () => setSearchParams({}, { replace: true });

  const checkinOpen = searchParams.get('checkin') === '1';
  const photoOpen = searchParams.get('photo') === '1';
  const claimType = searchParams.get('claim') as ClaimType | null;
  const reviewOpen = searchParams.get('review') as 'photos' | 'claims' | null;

  if (!user) return null; // route is private; auth redirect handles this

  if (!progressLoaded) {
    return (
      <div className="max-w-xl mx-auto px-4 sm:px-6 lg:px-8 pb-20 pt-4 md:pt-6">
        <div className="flex items-center gap-2 mb-5">
          <ListChecks className="w-6 h-6 text-clay" />
          <h1 className="text-2xl md:text-3xl font-display font-bold text-white">Tasks</h1>
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

  const Section: React.FC<{
    id: string; title: string; right: React.ReactNode; locked?: boolean; children: React.ReactNode;
  }> = ({ id, title, right, locked, children }) => {
    const open = openSection === id;
    return (
      <div className={`rounded-3xl border p-5 ${locked ? 'bg-tennis-surface/15 border-white/5' : 'bg-tennis-surface/30 border-white/5'}`}>
        <button
          type="button"
          onClick={() => toggleSection(id)}
          className="w-full flex items-center justify-between gap-3 text-left"
          aria-expanded={open}
        >
          <h2 className={`font-bold ${locked ? 'text-white/40' : 'text-white'}`}>{title}</h2>
          <span className="flex items-center gap-2 shrink-0">
            {right}
            <ChevronDown className={`w-4 h-4 text-white/40 transition-transform ${open ? 'rotate-180' : ''}`} />
          </span>
        </button>
        {open && <div className="divide-y divide-white/5 mt-2">{children}</div>}
      </div>
    );
  };

  const CategorySection: React.FC<{ c: CategoryDef }> = ({ c }) => {
    const earned = c.tiers.filter((t) => rec[t.id]).length;
    const earnedPoints = c.tiers.reduce((n, t) => n + (rec[t.id] ? t.points : 0), 0);
    return (
      <Section
        id={c.id}
        title={c.title}
        locked={c.locked}
        right={
          c.locked ? (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide text-white/30 border border-white/10">Soon</span>
          ) : (
            <span className="text-xs font-bold text-white/40">
              {earnedPoints}<span className="text-white/25">/{categoryTotal(c)} pts</span>
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
              <span className={`text-sm flex-1 min-w-0 ${c.locked ? 'text-white/30' : done ? 'text-white/50' : 'text-white'}`}>
                {t.title}
              </span>
              {!done && !c.locked && have > 0 && (
                <span className="text-[11px] text-white/40 shrink-0">{have}/{t.need}</span>
              )}
              <span className={`text-xs font-bold shrink-0 ${done ? 'text-clay' : 'text-white/30'}`}>{t.points}</span>
              {!done && !c.locked && c.to && (
                <Link to={c.to} className="text-white/30 hover:text-clay transition-colors shrink-0" aria-label={`Go to ${t.title}`}>
                  <ChevronRight className="w-4 h-4" />
                </Link>
              )}
            </div>
          );
        })}
      </Section>
    );
  };

  // Group / community bonuses — descriptive cards (name + wrapped trigger + points). Unlike the
  // tiers, these unlock from collective activity and are paid server-side into bonusPoints.
  const GroupSection: React.FC<{ id: string; title: string; tasks: GroupTaskDef[] }> = ({ id, title, tasks }) => (
    <Section
      id={id}
      title={title}
      right={<span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide text-clay/70 border border-clay/25">Bonus</span>}
    >
      {tasks.map((g) => (
        <div key={g.id} className="py-3">
          <div className="flex items-start justify-between gap-3">
            <span className="text-sm font-bold text-white">{g.name}</span>
            <span className="text-xs font-bold text-clay shrink-0">{g.points}</span>
          </div>
          <p className="text-xs text-white/50 mt-1 leading-relaxed">{g.trigger}</p>
        </div>
      ))}
    </Section>
  );

  return (
    <div className="max-w-xl mx-auto px-4 sm:px-6 lg:px-8 pb-20 pt-4 md:pt-6">
      <div className="flex items-center gap-2 mb-5">
        <ListChecks className="w-6 h-6 text-clay" />
        <h1 className="text-2xl md:text-3xl font-display font-bold text-white">Tasks</h1>
      </div>

      {isOrganizer && <ReviewQueue defaultOpen={reviewOpen} />}

      {/* Points summary */}
      <div className="rounded-3xl bg-tennis-surface/30 border border-white/5 p-5 mb-6 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-clay/15 border border-clay/30 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-clay" />
          </div>
          <div>
            <p className="text-2xl font-black text-clay leading-none">
              {points}<span className="text-sm text-white/30 font-bold"> / {TOTAL_AVAILABLE}</span>
            </p>
            <p className="text-[11px] font-bold uppercase tracking-widest text-white/40 mt-1">Community Points</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link to="/tasks?checkin=1">
            <Button variant="outline" size="sm"><MapPin className="w-4 h-4 mr-1.5" />Check In</Button>
          </Link>
          <Link to="/tasks?photo=1">
            <Button variant="clay" size="sm"><Camera className="w-4 h-4 mr-1.5" />Submit a Photo</Button>
          </Link>
        </div>
      </div>

      <div className="space-y-3">
        {/* Community Member Initiation — flat award for the whole checklist */}
        <Section
          id="initiation"
          title="Community Member Initiation"
          right={initiationComplete ? (
            <span className="px-2 py-0.5 rounded-lg text-[11px] font-black bg-clay/15 text-clay border border-clay/25">
              +{SETUP_POINTS} pts
            </span>
          ) : (
            <span className="text-xs font-bold text-white/40">{doneUnlocked}/{UNLOCKED_TASK_IDS.length}</span>
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
                <span className={`text-sm flex-1 min-w-0 ${t.locked ? 'text-white/30' : done ? 'text-white/50' : 'text-white'}`}>
                  {t.title}
                </span>
                {t.locked ? (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide text-white/30 border border-white/10 shrink-0">
                    Soon
                  </span>
                ) : t.link ? (
                  <a href={t.link} target="_blank" rel="noopener noreferrer"
                    className="text-clay/70 hover:text-clay transition-colors shrink-0" aria-label={`Open link for ${t.title}`}>
                    <ExternalLink className="w-4 h-4" />
                  </a>
                ) : t.to && !done ? (
                  <Link to={t.to} className="text-white/30 hover:text-clay transition-colors shrink-0" aria-label={`Go to ${t.title}`}>
                    <ChevronRight className="w-4 h-4" />
                  </Link>
                ) : null}
              </div>
            );
          })}
        </Section>

        {CATEGORIES.map((c) => <CategorySection key={c.id} c={c} />)}

        <GroupSection id="dailyGroup" title="Daily Group Tasks" tasks={DAILY_GROUP_TASKS} />
        <GroupSection id="communityGroup" title="Community Tasks" tasks={COMMUNITY_GROUP_TASKS} />
      </div>

      {/* Socials, WhatsApp and contact links. */}
      <div className="pt-6 mt-2">
        <div className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs text-white/50">
          <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-clay transition-colors">
            <Instagram className="w-3.5 h-3.5" /> Instagram
          </a>
          <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-clay transition-colors">
            <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
          </a>
          <a href="mailto:tenniscommunity.tbtc@gmail.com" className="inline-flex items-center gap-1 hover:text-clay transition-colors">
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
