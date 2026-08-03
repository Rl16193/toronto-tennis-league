import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Camera, ChevronDown, ChevronUp, HistoryIcon, Instagram, Mail, MapPin, Sparkles, Trophy } from 'lucide-react';
import { motion } from 'motion/react';
import { fadeUp, staggerDelay, tapScale } from '../lib/motion';
import { RacquetIcon } from '../components/RacquetIcon';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { UserData } from '../types';
import { INSTAGRAM_URL, TASKS, useTasks } from '../features/tasks/useTasks';
import { useAuth } from '../context/AuthContext';
import { useProfileData } from '../features/profile/hooks/useProfileData';
import { useProfileActions } from '../features/profile/hooks/useProfileActions';
import { ProfileInfo } from '../features/profile/components/ProfileInfo';
import { useUserMatches } from '../features/matches/useUserMatches';
import { CheckInModal } from '../features/tasks/CheckInModal';
import { PhotoSubmitModal } from '../features/tasks/PhotoSubmitModal';
import { Button } from '../components/Button';
import { formatPlayerName, skillBand } from './tournament/utils';
import { ContactOpponentButton, pillButtonCls } from './tournament/ContactOpponentButton';
import { sharesCourt } from '../utils/courtOverlap';
import { NearbyPill } from '../components/NearbyPill';
import { AvailabilityPills } from '../components/AvailabilityPills';

export const Profile: React.FC = () => {
  const { user, profile, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { joinedEvents, loading: eventsLoading } = useProfileData();
  const { updateLoading, message, actions } = useProfileActions();
  const { matches, upcoming } = useUserMatches(user?.uid);
  const { points: rsPoints, progress } = useTasks();
  const [quickAction, setQuickAction] = useState<null | 'checkin' | 'photo'>(null);
  const [opponentContacts, setOpponentContacts] = useState<Record<string, UserData>>({});
  const [opponentCourts, setOpponentCourts] = useState<Record<string, string[]>>({});
  const [opponentAvailability, setOpponentAvailability] = useState<Record<string, string[]>>({});
  const [opponentSkill, setOpponentSkill] = useState<Record<string, number>>({});
  const [showUpcoming, setShowUpcoming] = useState(true);
  const [showTasks, setShowTasks] = useState(true);

  const myCourts = useMemo(() => new Set(profile?.preferences.preferred_courts ?? []), [profile]);

  useEffect(() => { document.title = 'My Profile — Racquets & Strings'; }, []);

  // Full contact info for upcoming-match opponents (phone/email/whatsapp) — the match doc only
  // carries one flat contact string, so this looks up each opponent's real users/{id} doc to show
  // every channel they've actually provided, not just a guess from that single string.
  useEffect(() => {
    const ids = [...new Set(upcoming.map((o) => o.opponentId).filter(Boolean))].filter((id) => !opponentContacts[id]);
    if (ids.length === 0) return;
    Promise.all(ids.map((id) => getDoc(doc(db, 'users', id)).then((s) => [id, s.data() as UserData | undefined] as const)))
      .then((entries) => {
        const found = entries.filter((e): e is [string, UserData] => !!e[1]);
        if (found.length) setOpponentContacts((prev) => ({ ...prev, ...Object.fromEntries(found) }));
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [upcoming]);

  // Each upcoming opponent's preferred courts + availability, for the "Nearby" pill and
  // availability pills — same lazy per-id lookup pattern as the contact fetch above, just
  // against `preferences` instead of `users`.
  useEffect(() => {
    const ids = [...new Set(upcoming.map((o) => o.opponentId).filter(Boolean))].filter((id) => !(id in opponentCourts));
    if (ids.length === 0) return;
    Promise.all(ids.map((id) => getDoc(doc(db, 'preferences', id)).then((s) => [id, s.data()] as const)))
      .then((entries) => {
        setOpponentCourts((prev) => ({ ...prev, ...Object.fromEntries(entries.map(([id, d]) => [id, (d?.preferred_courts as string[]) || []])) }));
        setOpponentAvailability((prev) => ({ ...prev, ...Object.fromEntries(entries.map(([id, d]) => [id, (d?.availability_tags as string[]) || []])) }));
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [upcoming]);

  // Each upcoming opponent's skill level, for the skill/tier line — same lazy per-id lookup
  // pattern as above, against `stats` this time.
  useEffect(() => {
    const ids = [...new Set(upcoming.map((o) => o.opponentId).filter(Boolean))].filter((id) => !(id in opponentSkill));
    if (ids.length === 0) return;
    Promise.all(ids.map((id) => getDoc(doc(db, 'stats', id)).then((s) => [id, s.data()] as const)))
      .then((entries) => {
        setOpponentSkill((prev) => ({ ...prev, ...Object.fromEntries(entries.map(([id, d]) => [id, (d?.skill_level as number) || 0])) }));
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [upcoming]);

  // Current streak, most recent first: consecutive Ws (or Ls) until the run breaks.
  const streak = useMemo(() => {
    if (matches.length === 0) return null;
    const first = matches[0].won;
    let n = 0;
    for (const m of matches) {
      if (m.won !== first) break;
      n += 1;
    }
    return `${n}${first ? 'W' : 'L'}`;
  }, [matches]);


  useEffect(() => {
    if (!authLoading && !user) navigate('/login');
  }, [user, authLoading, navigate]);

  const incompleteFields = profile ? [
    !profile.user.name.trim() ? 'name' : null,
    profile.preferences.preferred_courts.length === 0 ? 'preferred courts' : null,
    profile.preferences.favourite_players.length === 0 ? 'favourite players' : null,
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
    <div className="max-w-2xl mx-auto px-4 sm:px-6 pb-20 pt-8 space-y-4">
      {incompleteFields.length > 0 && (
        <div className="px-1">
          <p className="text-sm text-orange-500 font-bold mb-1">Profile incomplete</p>
          <p className="text-sm text-orange-500">Please add details for: {incompleteFields.join(', ')}.</p>
        </div>
      )}

      {/* ── Hub: streak / RS points / matches, quick actions, opponents ── */}
      <div className="bg-tennis-surface/30 border border-fg/5 rounded-3xl p-5 space-y-4">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-2xl bg-white/[0.04] py-3">
            <p className="text-lg font-black text-fg">{streak ?? '—'}</p>
            <p className="text-[9px] font-bold uppercase tracking-widest text-fg/40">Streak</p>
          </div>
          <div className="rounded-2xl bg-white/[0.04] py-3">
            <p className="text-lg font-black text-clay flex items-center justify-center gap-1">
              <Sparkles className="w-3.5 h-3.5" />{rsPoints}
            </p>
            <p className="text-[9px] font-bold uppercase tracking-widest text-fg/40">RS Points</p>
          </div>
          <div className="rounded-2xl bg-white/[0.04] py-3">
            <p className="text-lg font-black text-fg">{matches.length}</p>
            <p className="text-[9px] font-bold uppercase tracking-widest text-fg/40">Matches</p>
          </div>
        </div>

        {/* Feature buttons */}
        <div className="grid grid-cols-2 gap-2">
          <Link to="/history" className="rounded-2xl border border-fg/10 bg-fg/5 hover:border-clay/40 transition-colors py-3 flex flex-col items-center gap-1.5">
            <HistoryIcon className="w-4 h-4 text-clay" />
            <span className="text-[11px] font-bold text-fg">Match History</span>
          </Link>
          <Link to="/matches" className="rounded-2xl border border-fg/10 bg-fg/5 hover:border-clay/40 transition-colors py-3 flex flex-col items-center gap-1.5">
            <RacquetIcon className="w-4 h-4 text-clay" />
            <span className="text-[11px] font-bold text-fg">Matches</span>
          </Link>
        </div>

        {/* Quick actions */}
        <div className="flex items-center justify-center gap-2 flex-wrap">
          <Button variant="white" size="sm" onClick={() => setQuickAction('checkin')}>
            <MapPin className="w-4 h-4 mr-1.5" />Check-In
          </Button>
          <Button variant="clay" size="sm" onClick={() => setQuickAction('photo')}>
            <Camera className="w-4 h-4 mr-1.5" />Submit a Report
          </Button>
          <Link to="/tasks">
            <Button variant="white" size="sm">Tasks</Button>
          </Link>
        </div>

        {/* Upcoming matches — not yet played / scores not submitted */}
        {upcoming.length > 0 && (
          <div>
            <button
              type="button"
              onClick={() => setShowUpcoming((v) => !v)}
              className="w-full flex items-center justify-between mb-2 group"
            >
              <span className="text-[11px] font-bold uppercase tracking-widest text-fg/40">Upcoming Matches</span>
              {showUpcoming
                ? <ChevronUp className="w-3.5 h-3.5 text-fg/40 group-hover:text-fg/70 transition-colors" />
                : <ChevronDown className="w-3.5 h-3.5 text-fg/40 group-hover:text-fg/70 transition-colors" />}
            </button>
            {showUpcoming && (
            <div className="divide-y divide-white/5 rounded-2xl border border-fg/5 overflow-hidden">
              {upcoming.slice(0, 8).map((o, i) => {
                const skill = o.opponentId ? opponentSkill[o.opponentId] : undefined;
                // Same-page destination the row's own group (Matches.tsx / Tournament) uses for
                // Schedule/Score — keeps this row a launch point into the real action instead of
                // duplicating the scheduling/scoring logic here.
                const scoreHref = o.source === 'tournament'
                  ? `/matches?mode=tournament&event=${o.eventId}`
                  : `/matches?mode=${o.source === 'rally' ? 'friendlies' : 'challenges'}`;
                return (
                  <motion.div key={o.id} {...fadeUp} transition={{ ...fadeUp.transition, delay: staggerDelay(i) }} className="flex items-start justify-between gap-3 px-3.5 py-3">
                    <div className="min-w-0 flex-1 space-y-1">
                      {o.opponentId ? (
                        <Link to={`/players/${o.opponentId}`} className="block text-sm font-semibold text-fg truncate hover:text-clay transition-colors">
                          {formatPlayerName(o.opponentName)}
                        </Link>
                      ) : (
                        <span className="block text-sm font-semibold text-fg truncate">{formatPlayerName(o.opponentName)}</span>
                      )}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {!!skill && <span className="text-[11px] text-fg/70">Skill {skill} · {skillBand(skill)}</span>}
                        <NearbyPill show={sharesCourt(opponentCourts[o.opponentId], myCourts)} />
                      </div>
                      <AvailabilityPills tags={opponentAvailability[o.opponentId]} />
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <div className="flex items-center gap-1.5 flex-wrap justify-end">
                        {o.source === 'tournament' && (
                          <span className="shrink-0 rounded-full border border-clay/40 text-clay text-[9px] font-bold px-2 py-0.5 inline-flex items-center gap-1">
                            <Trophy className="w-2.5 h-2.5 shrink-0" />Tournament
                          </span>
                        )}
                        {o.source === 'rally' && (
                          <span className="shrink-0 rounded-full border border-fg/10 text-fg/50 text-[9px] font-bold px-2 py-0.5">Friendly</span>
                        )}
                        {o.source === 'challenge' && (
                          <span className="shrink-0 rounded-full border border-fg/10 text-fg/50 text-[9px] font-bold px-2 py-0.5">Challenge</span>
                        )}
                        {o.source === 'tournament' ? (
                          <>
                            <Link to={scoreHref} className={pillButtonCls('sm', 'clay')}>Schedule</Link>
                            <Link to={scoreHref} className={pillButtonCls('sm', 'clay')}>Score</Link>
                          </>
                        ) : (
                          <Link to={scoreHref}>
                            <Button size="sm" variant="white"><RacquetIcon className="w-3.5 h-3.5 mr-1.5" />Score</Button>
                          </Link>
                        )}
                      </div>
                      {(() => {
                        const full = o.opponentId ? opponentContacts[o.opponentId] : undefined;
                        // Full users/{id} lookup once it resolves; the match-snapshot string covers
                        // the gap before it does (better than nothing, but only one channel).
                        const phone = full?.phone || (o.opponentContact.includes('@') ? undefined : o.opponentContact);
                        const email = full?.email || (o.opponentContact.includes('@') ? o.opponentContact : undefined);
                        if (!phone && !email && !full?.whatsapp_contact) return null;
                        return (
                          <ContactOpponentButton
                            name={o.opponentName}
                            phone={phone}
                            email={email}
                            whatsappContact={full?.whatsapp_contact}
                            whatsappSameAsPhone={full?.whatsapp_same_as_phone}
                            variant="white"
                            size="sm"
                          />
                        );
                      })()}
                    </div>
                  </motion.div>
                );
              })}
            </div>
            )}
          </div>
        )}

        {/* Community Member Initiation checklist — hidden once finished */}
        {!!progress && !progress.setupComplete && (
          <div>
            <button
              type="button"
              onClick={() => setShowTasks((v) => !v)}
              className="w-full flex items-center justify-between mb-2 group"
            >
              <span className="text-[11px] font-bold uppercase tracking-widest text-fg/40">Tasks</span>
              {showTasks
                ? <ChevronUp className="w-3.5 h-3.5 text-fg/40 group-hover:text-fg/70 transition-colors" />
                : <ChevronDown className="w-3.5 h-3.5 text-fg/40 group-hover:text-fg/70 transition-colors" />}
            </button>
            {showTasks && (
              <div className="divide-y divide-white/5 rounded-2xl border border-fg/5 overflow-hidden px-3.5">
                {TASKS.map((t) => {
                  const done = !!(progress as unknown as Record<string, unknown>)[t.id];
                  return (
                    <div key={t.id} className="flex items-center gap-2.5 py-2.5">
                      <span className={`w-4 h-4 shrink-0 rounded-full border ${done ? 'bg-clay border-clay' : 'border-fg/20'}`} />
                      <span className={`text-sm flex-1 min-w-0 truncate ${done ? 'text-fg/40 line-through' : 'text-fg'}`}>{t.title}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      <ProfileInfo actions={actions} updateLoading={updateLoading} message={message} />

      {quickAction === 'checkin' && <CheckInModal onClose={() => setQuickAction(null)} />}
      {quickAction === 'photo' && <PhotoSubmitModal onClose={() => setQuickAction(null)} />}

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
              (e) => e.type === 'tournament' || e.title.toLowerCase().includes('tournament')
            );
            const matchdaysEvent = joinedEvents.find(
              (e) => e.title.toLowerCase().includes('weekend matchdays')
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
              <div className="bg-tennis-surface/30 border border-fg/5 rounded-3xl md:rounded-[2.5rem] shadow-xl p-4 md:p-8">
                <h2 className="text-xl md:text-2xl font-bold text-fg mb-1">Events Calendar</h2>
                <p className="text-fg/60 text-sm mb-1">Mark availability during the tournament</p>
                <p className="text-fg/40 text-xs mb-4">May 9 – May 31, 2026</p>
                <div className="grid grid-cols-7 gap-2">
                  {['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((d) => (
                    <div key={d} className="text-fg/40 text-xs font-medium text-center py-1">{d}</div>
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
                          selected ? 'bg-orange-500 text-fg font-bold'
                            : deflt ? 'border border-orange-500/60 text-orange-300 font-semibold hover:bg-orange-500/20 cursor-pointer'
                            : past ? 'text-fg/20 bg-gray-800/30 cursor-not-allowed'
                            : participantId ? 'text-fg bg-gray-800/30 hover:bg-fg/10 cursor-pointer'
                            : 'text-fg/20 bg-gray-800/30'
                        }`}
                      >
                        {day}
                      </motion.button>
                    );
                  })}
                </div>
                {savedDates.size > 0 && (
                  <div className="mt-4 pt-4 border-t border-fg/5">
                    <p className="text-fg/40 text-xs">Selected: {[...savedDates].sort().join(', ')}</p>
                  </div>
                )}
              </div>
            );
      })()}

      {/* Site links relocated here from the removed global footer. */}
      <div className="pt-6 mt-2 border-t border-fg/5">
        <div className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs text-fg/50">
          <Link to="/about" className="hover:text-clay transition-colors">About Us</Link>
          <Link to="/terms" className="hover:text-clay transition-colors">Terms of Service</Link>
          <Link to="/privacy" className="hover:text-clay transition-colors">Privacy Policy</Link>
          <a href="mailto:events.racquetsandstrings@gmail.com" className="inline-flex items-center gap-1 hover:text-clay transition-colors">
            <Mail className="w-3.5 h-3.5" /> Contact
          </a>
          <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-clay transition-colors">
            <Instagram className="w-3.5 h-3.5" /> Instagram
          </a>
        </div>
      </div>
    </div>
  );
};
