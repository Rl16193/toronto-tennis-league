import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { Camera, ChevronDown, ChevronUp, MapPin } from 'lucide-react';
import { ContactLink, InstagramLink } from '../components/FooterElements';
import { motion } from 'motion/react';
import { tapScale } from '../lib/motion';
import { INITIATION_OPEN_UNTIL, TASKS, initiationDoneCount, useTasks } from '../features/tasks/useTasks';
import { useAuth } from '../context/AuthContext';
import { useProfileData } from '../features/profile/hooks/useProfileData';
import { useProfileActions } from '../features/profile/hooks/useProfileActions';
import { ProfileInfo } from '../features/profile/components/ProfileInfo';
import { CheckInModal } from '../features/tasks/CheckInModal';
import { PhotoSubmitModal } from '../features/tasks/PhotoSubmitModal';
import { Button } from '../components/Button';
import { Toast } from '../components/Toast';
import { useBadgeToast } from '../features/tasks/useBadgeToast';
import { ScoreModal } from '../features/matches/ScoreModal';
import { usePlayerDash } from './profile/usePlayerDash';
import { PlayerDash, PlayerDashSwitch, useWideLayout } from './profile/PlayerDashElements';
import { useProviderDash } from './profile/useProviderDash';
import { useOrganizerDash } from './profile/useOrganizerDash';
import { ProviderDash } from './profile/ProviderDashElements';
import { OrganizerDash } from './profile/OrganizerDashElements';
import { FloatingCtaStack, SubscribeSheet } from './home/HomeElements';
import { subscribeVisitorToNewsletter, useMemberNewsletter } from '../lib/newsletter';

export const Profile: React.FC = () => {
  const { user, profile, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { joinedEvents, loading: eventsLoading } = useProfileData();
  const { updateLoading, message, actions } = useProfileActions();
  const { points: rsPoints, progress, progressLoaded, counters } = useTasks();
  const [quickAction, setQuickAction] = useState<null | 'checkin' | 'photo'>(null);
  // Floating Subscribe, as on Home: shown until the member is on the list, never over a dash.
  const newsletter = useMemberNewsletter(user?.uid, user?.email, profile?.user.name ?? '');
  const [subscribeOpen, setSubscribeOpen] = useState(false);
  const [subscribeError, setSubscribeError] = useState<string | null>(null);
  const onSubscribeClick = async () => {
    if (!user?.email) { setSubscribeOpen(true); return; }
    try { await newsletter.subscribe(); } catch { setSubscribeError('Could not sign you up just now. Please try again.'); }
  };
  // Which dash replaces the profile card. Both start off, so Profile opens on the card, and only one
  // is on at a time. Their data is mounted either way, because each switch shows a count.
  const [openDash, setOpenDash] = useState<null | 'player' | 'provider' | 'organizer'>(null);
  const dashOn = openDash !== null;
  const wide = useWideLayout();
  const dash = usePlayerDash({ joinedEvents, progress, counters, rsPoints });
  const providerDash = useProviderDash();
  const organizerDash = useOrganizerDash();
  const [searchParams] = useSearchParams();
  const dashParam = searchParams.get('dash');
  // A notification link (`?dash=player|provider`) opens that dash. An effect rather than the initial
  // state, because the provider role arrives with the profile. The param stays in the URL: changing
  // it re-runs ScrollToTop.
  useEffect(() => {
    if (dashParam === 'player') setOpenDash('player');
    else if (dashParam === 'provider' && providerDash.providerId) setOpenDash('provider');
    else if (dashParam === 'organizer' && organizerDash.isOrganizer) setOpenDash('organizer');
  }, [dashParam, providerDash.providerId, organizerDash.isOrganizer]);
  // Open until INITIATION_OPEN_UNTIL tasks are done, collapsed after. Decided once, when the
  // progress read lands, so a tap to collapse isn't undone by a later update.
  const [showTasks, setShowTasks] = useState(false);
  const [tasksDefaultSet, setTasksDefaultSet] = useState(false);
  useEffect(() => {
    if (!progressLoaded || tasksDefaultSet) return;
    setShowTasks(initiationDoneCount(progress) < INITIATION_OPEN_UNTIL);
    setTasksDefaultSet(true);
  }, [progressLoaded, progress, tasksDefaultSet]);

  const { toast: badgeToast, dismissToast } = useBadgeToast(progress, counters, progressLoaded);

  // `setupComplete` is only ever written by a Cloud Function trigger, so someone who finished the
  // checklist stays unflagged until a match/photo/event happens to fire one. Deriving it from the
  // ticks themselves means the section disappears the moment the last task lands.
  const initiationDone = !!progress?.setupComplete
    || TASKS.every((t) => !!(progress as unknown as Record<string, unknown> | null)?.[t.id]);

  useEffect(() => { document.title = 'My Profile · Racquets & Strings'; }, []);

  useEffect(() => {
    if (!authLoading && !user) navigate('/login');
  }, [user, authLoading, navigate]);

  const incompleteFields = profile ? [
    !profile.user.name.trim() ? 'name' : null,
    (profile.preferences.preferred_courts?.length ?? 0) === 0 ? 'preferred courts' : null,
    (profile.preferences.favourite_players?.length ?? 0) === 0 ? 'favourite players' : null,
  ].filter(Boolean) as string[] : [];

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-clay border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-fg font-semibold">Profile loading, please wait...</p>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-clay border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-fg font-semibold">Preparing your profile...</p>
          <p className="text-fg text-sm mt-2">This can take a moment right after sign-in.</p>
        </div>
      </div>
    );
  }

  return (
    // Widens from `xl` only while the dash is on, so its three columns fit. The profile card keeps
    // the narrow column it always had.
    <div className={`max-w-2xl ${dashOn ? 'xl:max-w-6xl' : ''} mx-auto px-4 sm:px-6 pb-20 pt-8 space-y-4`}>
      {incompleteFields.length > 0 && (
        <div className="px-1">
          <p className="text-sm text-clay font-bold mb-1">Profile incomplete</p>
          <p className="text-sm text-clay">Please add details for: {incompleteFields.join(', ')}.</p>
        </div>
      )}

      {/* Dash switches, above the quick actions. Turning one off returns to the profile card. The
          Provider Dash only shows for members linked to a stringing or coaching provider. */}
      {/* Two per row from `sm`: with all three switches that reads as 2 + 1. Stacked on a phone,
          where two of these side by side would leave no room for the hint. */}
      <div className="max-w-2xl mx-auto grid gap-2 sm:grid-cols-2">
        <PlayerDashSwitch
          on={openDash === 'player'}
          count={dash.count}
          onChange={(on) => setOpenDash(on ? 'player' : null)}
        />
        {providerDash.providerId && (
          <PlayerDashSwitch
            label="Provider Dash"
            hint="Your bookings in one place."
            on={openDash === 'provider'}
            count={providerDash.count}
            onChange={(on) => setOpenDash(on ? 'provider' : null)}
          />
        )}
        {organizerDash.isOrganizer && (
          <PlayerDashSwitch
            label="Organizer Dash"
            hint="Your events in one place."
            on={openDash === 'organizer'}
            count={organizerDash.count}
            onChange={(on) => setOpenDash(on ? 'organizer' : null)}
          />
        )}
      </div>

      {/* Quick actions — at the very top of the page, so opening anything below never pushes the
          two things people come here to do off the screen. Hidden while the dash is on. */}
      {!dashOn && (
        <div className="flex items-center justify-center gap-2 flex-wrap">
          {/* `whitespace-nowrap` is load-bearing: without it the two-word label breaks at the space
              on a narrow phone and the button grows taller than the one beside it. The row wraps
              instead, which is what flex-wrap above is for. */}
          <Button variant="white" size="sm" className="whitespace-nowrap" onClick={() => setQuickAction('checkin')}>
            <MapPin className="w-4 h-4 mr-1.5" />Record Activity
          </Button>
          <Button variant="clay" size="sm" className="whitespace-nowrap" onClick={() => setQuickAction('photo')}>
            <Camera className="w-4 h-4 mr-1.5" />Submit a Report
          </Button>
        </div>
      )}

      {openDash === 'player' ? (
        <PlayerDash data={dash} profile={profile} actions={actions} saving={updateLoading} wide={wide} />
      ) : openDash === 'provider' ? (
        <ProviderDash data={providerDash} wide={wide} />
      ) : openDash === 'organizer' ? (
        <OrganizerDash data={organizerDash} wide={wide} />
      ) : (
        <>
          {/* Community Member Initiation checklist — hidden once finished, and its box with it.
              Gated on the read having completed, NOT on the document existing: a brand-new
              account has no tasks doc until something writes one, and `!!progress`
              therefore hid the checklist from exactly the people who still need it. A missing
              doc simply means nothing is ticked yet. */}
          {progressLoaded && !initiationDone && (
            <div className="bg-tennis-surface/30 rounded-3xl p-5">
              <button
                type="button"
                onClick={() => setShowTasks((v) => !v)}
                className="w-full flex items-center justify-between mb-2 group"
              >
                <span className="text-[11px] font-bold uppercase tracking-widest text-fg/70">Tasks</span>
                {showTasks
                  ? <ChevronUp className="w-3.5 h-3.5 text-fg/70 group-hover:text-fg/70 transition-colors" />
                  : <ChevronDown className="w-3.5 h-3.5 text-fg/70 group-hover:text-fg/70 transition-colors" />}
              </button>
              {showTasks && (
                <div className="divide-y divide-white/5 rounded-2xl overflow-hidden px-3.5">
                  {TASKS.map((t) => {
                    const done = !!(progress as unknown as Record<string, unknown> | null)?.[t.id];
                    return (
                      <div key={t.id} className="flex items-center gap-2.5 py-2.5">
                        <span className={`w-4 h-4 shrink-0 rounded-full border ${done ? 'bg-clay border-clay' : 'border-fg/20'}`} />
                        <span className={`text-sm flex-1 min-w-0 truncate ${done ? 'text-fg/70 line-through' : 'text-fg'}`}>{t.title}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <ProfileInfo actions={actions} updateLoading={updateLoading} message={message} progress={progress} counters={counters} />

          {eventsLoading ? (
            <div className="h-48 bg-tennis-surface/30 rounded-3xl md:rounded-[2.5rem] animate-pulse" />
          ) : (() => {
                const parseMayKey = (val: unknown): string | null => {
                  if (typeof val === 'string') return val.startsWith('May') ? val : null;
                  if (typeof val !== 'object' || val === null) return null;
                  let d: Date | null = null;
                  const obj = val as Record<string, unknown>;
                  if (typeof obj['toDate'] === 'function') d = (obj['toDate'] as () => Date)();
                  else if (typeof obj['seconds'] === 'number') d = new Date(obj['seconds'] * 1000);
                  if (!d) return null;
                  return d.getFullYear() === 2026 && d.getMonth() === 4 ? `May ${d.getDate()}, 2026` : null;
                };

                const tournamentEvent = joinedEvents.find(
                  (e) => !e.removal && (e.type === 'tournament' || e.title.toLowerCase().includes('tournament'))
                );
                const matchdaysEvent = joinedEvents.find(
                  (e) => !e.removal && e.title.toLowerCase().includes('weekend matchdays')
                );

                if (!tournamentEvent && !matchdaysEvent) return null;

                const participantId = tournamentEvent?.participantId ?? matchdaysEvent?.participantId;

                const savedDates = new Set<string>();
                joinedEvents.forEach((e) => {
                  const dateselected = (e as unknown as Record<string, unknown>)['dateselected'];
                  (Array.isArray(dateselected) ? dateselected : []).forEach((v: unknown) => {
                    const k = parseMayKey(v);
                    if (k) savedDates.add(k);
                  });
                });

                const tournamentStartKey = tournamentEvent?.start_date ? parseMayKey(tournamentEvent.start_date) : null;
                const isDateSelected = (day: number) => savedDates.has(`May ${day}, 2026`);
                const isDefaultDate = (day: number) =>
                  !!tournamentStartKey && tournamentStartKey === `May ${day}, 2026` && !savedDates.has(tournamentStartKey);
                const isPast = (day: number) => {
                  const now = new Date();
                  return new Date(2026, 4, day) < new Date(now.getFullYear(), now.getMonth(), now.getDate());
                };

                const handleToggleDate = async (day: number) => {
                  if (!participantId || isPast(day)) return;
                  const dateKey = `May ${day}, 2026`;
                  const current = new Set(savedDates);
                  if (current.has(dateKey)) current.delete(dateKey); else current.add(dateKey);
                  await actions.updateEventDates(participantId, [...current]);
                };

                const calendarDays: number[] = [];
                for (let day = 9; day <= 31; day++) calendarDays.push(day);

                return (
                  <div className="bg-tennis-surface/30 rounded-3xl md:rounded-[2.5rem] shadow-xl p-4 md:p-8">
                    <h2 className="text-xl md:text-2xl font-bold text-fg mb-1">Events Calendar</h2>
                    <p className="text-fg/70 text-sm mb-1">Mark availability during the tournament</p>
                    <p className="text-fg/70 text-xs mb-4">May 9 – May 31, 2026</p>
                    <div className="grid grid-cols-7 gap-2">
                      {['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((d) => (
                        <div key={d} className="text-fg/70 text-xs font-medium text-center py-1">{d}</div>
                      ))}
                      {calendarDays.map((day) => {
                        const selected = isDateSelected(day);
                        const deflt = isDefaultDate(day);
                        const past = isPast(day);
                        return (
                          <motion.button
                            key={day}
                            disabled={past || !participantId}
                            onClick={() => handleToggleDate(day)}
                            whileTap={past || !participantId ? undefined : tapScale.whileTap}
                            transition={tapScale.transition}
                            className={`p-2 text-xs rounded-lg transition-colors ${
                              // text-white, not text-fg: the fill is always clay, so in light theme
                              // text-fg would put dark green on orange. Same rule as a filled button.
                              selected ? 'bg-clay text-white font-bold'
                                : deflt ? 'border border-clay/60 text-clay font-semibold hover:bg-clay/20 cursor-pointer'
                                : past ? 'text-fg/70 bg-fg/5 opacity-50 cursor-not-allowed'
                                : participantId ? 'text-fg bg-fg/5 hover:bg-fg/10 cursor-pointer'
                                : 'text-fg/70 bg-fg/5'
                            }`}
                          >
                            {day}
                          </motion.button>
                        );
                      })}
                    </div>
                    {savedDates.size > 0 && (
                      <div className="mt-4 pt-4 border-t border-fg/5">
                        <p className="text-fg/70 text-xs">Selected: {[...savedDates].sort().join(', ')}</p>
                      </div>
                    )}
                  </div>
                );
          })()}
        </>
      )}

      {quickAction === 'checkin' && <CheckInModal onClose={() => setQuickAction(null)} />}
      {quickAction === 'photo' && <PhotoSubmitModal onClose={() => setQuickAction(null)} />}

      <Toast message={badgeToast} onDismiss={dismissToast} />
      <Toast message={subscribeError} onDismiss={() => setSubscribeError(null)} placement="top" />

      {!dashOn && newsletter.subscribed === false && createPortal(<FloatingCtaStack onSubscribe={onSubscribeClick} />, document.body)}
      {subscribeOpen && (
        <SubscribeSheet onClose={() => setSubscribeOpen(false)} onSubscribe={(email) => subscribeVisitorToNewsletter(email)} />
      )}

      {/* One score sheet for the dash: submitting, and correcting a recorded score. */}
      {dash.scoring.modalProps && <ScoreModal {...dash.scoring.modalProps} />}

      {/* Site links relocated here from the removed global footer. */}
      <div className="pt-6 mt-2 border-t border-fg/5">
        <div className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs text-fg/70">
          <Link to="/about" className="hover:text-clay transition-colors">About Us</Link>
          <Link to="/terms" className="hover:text-clay transition-colors">Terms of Service</Link>
          <Link to="/privacy" className="hover:text-clay transition-colors">Privacy Policy</Link>
          <ContactLink />
          <InstagramLink />
        </div>
      </div>
    </div>
  );
};
