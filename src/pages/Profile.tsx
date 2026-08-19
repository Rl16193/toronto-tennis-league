import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Camera, ChevronDown, ChevronRight, ChevronUp, HistoryIcon, Mail, MapPin, Medal, Sparkles } from 'lucide-react';
import { ContactLink, InstagramLink } from '../components/FooterElements';
import { motion } from 'motion/react';
import { fadeUp, staggerDelay, tapScale } from '../lib/motion';
import { RacquetIcon } from '../components/RacquetIcon';
import { PlayerCard, RankMove, SourceLetter } from '../components/PlayerCard';
import { pgWinPct, useStandings } from '../features/leagues/useStandings';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { ContactData } from '../types';
import { TASKS, useTasks } from '../features/tasks/useTasks';
import { useAuth } from '../context/AuthContext';
import { useProfileData } from '../features/profile/hooks/useProfileData';
import { useProfileActions } from '../features/profile/hooks/useProfileActions';
import { ProfileInfo } from '../features/profile/components/ProfileInfo';
import { useUserMatches } from '../features/matches/useUserMatches';
import { CheckInModal } from '../features/tasks/CheckInModal';
import { PhotoSubmitModal } from '../features/tasks/PhotoSubmitModal';
import { Button } from '../components/Button';
import { formatPlayerName, skillBand } from './tournament/utils';
import { ContactOpponentButton, pillButtonCls } from '../components/ContactOpponentButton';
import { sharesCourt } from '../utils/courtOverlap';
import { NearbyPill } from '../components/NearbyPill';
import { AvailabilityPills } from '../components/AvailabilityPills';
import { Toast } from '../components/Toast';
import { useBadgeToast } from '../features/tasks/useBadgeToast';

// Marks that this browser has already been shown the Initiation checklist expanded once.
const TASKS_SEEN_KEY = 'rs-profile-tasks-seen';

export const Profile: React.FC = () => {
  const { user, profile, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { joinedEvents, loading: eventsLoading } = useProfileData();
  const { updateLoading, message, actions } = useProfileActions();
  const { matches, upcoming } = useUserMatches(user?.uid);
  const { points: rsPoints, progress, progressLoaded, counters } = useTasks();
  const [quickAction, setQuickAction] = useState<null | 'checkin' | 'photo'>(null);
  const [opponentContacts, setOpponentContacts] = useState<Record<string, ContactData>>({});
  const [opponentCourts, setOpponentCourts] = useState<Record<string, string[]>>({});
  const [opponentAvailability, setOpponentAvailability] = useState<Record<string, string[]>>({});
  const [opponentSkill, setOpponentSkill] = useState<Record<string, number>>({});
  const [showUpcoming, setShowUpcoming] = useState(true);
  const [showStats, setShowStats] = useState(false);
  // Which upcoming-match row is expanded (one at a time, like the leaderboard).
  const [expandedOpponent, setExpandedOpponent] = useState<string | null>(null);
  // Open on a first visit so a new member actually sees the checklist; collapsed thereafter,
  // since a returning visitor is here for their stats, not the onboarding list. The flag is
  // set on first render and never cleared — losing it (new device, cleared storage) just means
  // one more expanded visit, which is harmless.
  const [showTasks, setShowTasks] = useState(() => {
    try {
      return localStorage.getItem(TASKS_SEEN_KEY) !== '1';
    } catch {
      return true;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(TASKS_SEEN_KEY, '1');
    } catch {
      /* private mode — stays expanded */
    }
  }, []);

  const { toast: badgeToast, dismissToast } = useBadgeToast(progress, counters, progressLoaded);

  // `setupComplete` is only ever written by a Cloud Function trigger, so someone who finished the
  // checklist stays unflagged until a match/photo/event happens to fire one. Deriving it from the
  // ticks themselves means the section disappears the moment the last task lands.
  const initiationDone =
    !!progress?.setupComplete || TASKS.every((t) => !!(progress as unknown as Record<string, unknown> | null)?.[t.id]);

  const myCourts = useMemo(() => new Set(profile?.preferences.preferred_courts ?? []), [profile]);

  useEffect(() => {
    document.title = 'My Profile · Racquets & Strings';
  }, []);

  // Full contact info for upcoming-match opponents (phone/email/whatsapp) — the match doc only
  // carries one flat contact string, so this looks up each opponent's real users/{id} doc to show
  // every channel they've actually provided, not just a guess from that single string.
  useEffect(() => {
    const ids = [...new Set(upcoming.map((o) => o.opponentId).filter(Boolean))].filter((id) => !opponentContacts[id]);
    if (ids.length === 0) return;
    Promise.all(
      ids.map((id) => getDoc(doc(db, 'contacts', id)).then((s) => [id, s.data() as ContactData | undefined] as const)),
    )
      .then((entries) => {
        const found = entries.filter((e): e is [string, ContactData] => !!e[1]);
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
        setOpponentCourts((prev) => ({
          ...prev,
          ...Object.fromEntries(entries.map(([id, d]) => [id, (d?.preferred_courts as string[]) || []])),
        }));
        setOpponentAvailability((prev) => ({
          ...prev,
          ...Object.fromEntries(entries.map(([id, d]) => [id, (d?.availability_tags as string[]) || []])),
        }));
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
        setOpponentSkill((prev) => ({
          ...prev,
          ...Object.fromEntries(entries.map(([id, d]) => [id, (d?.skill_level as number) || 0])),
        }));
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

  // Points-won rate off the stats doc (the same pointswon/totalPointsPlayed pair the Leaderboard
  // uses), with a games-won fallback derived from played matches for anyone whose points columns
  // were never populated — otherwise long-time members with matches but no point totals read 0%.
  const wonPct = useMemo(() => {
    const played = profile?.stats.totalPointsPlayed ?? 0;
    if (played > 0) return Math.round(((profile?.stats.pointswon ?? 0) / played) * 100);
    const mine = matches.reduce((n, m) => n + m.myGames, 0);
    const theirs = matches.reduce((n, m) => n + m.oppGames, 0);
    return mine + theirs > 0 ? Math.round((mine / (mine + theirs)) * 100) : null;
  }, [profile, matches]);

  // Last weekly snapshot's move, e.g. "▲ 3". No snapshot yet -> nothing to report.
  const rankMove = profile?.stats.rankMove ?? 0;
  const rankTrend = profile?.stats.rankTrend;
  const rankLabel =
    !rankTrend || rankTrend === 'same' || rankMove === 0
      ? '—'
      : `${rankTrend === 'up' ? '▲' : '▼'} ${Math.abs(rankMove)}`;

  const recentMatches = useMemo(() => matches.slice(0, 5), [matches]);

  // Opponent stats for the upcoming rows, so they show the same tiles as the leaderboard. Same
  // single standings read the Leaderboard and Matches pages already use.
  const { rows: standingsRows } = useStandings();
  const statsByUid = useMemo(() => new Map(standingsRows.map((r) => [r.user_id, r])), [standingsRows]);

  useEffect(() => {
    if (!authLoading && !user) navigate('/login');
  }, [user, authLoading, navigate]);

  const incompleteFields = profile
    ? ([
        !profile.user.name.trim() ? 'name' : null,
        profile.preferences.preferred_courts.length === 0 ? 'preferred courts' : null,
        profile.preferences.favourite_players.length === 0 ? 'favourite players' : null,
      ].filter(Boolean) as string[])
    : [];

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
          <p className="text-sm text-clay font-bold mb-1">Profile incomplete</p>
          <p className="text-sm text-clay">Please add details for: {incompleteFields.join(', ')}.</p>
        </div>
      )}

      {/* Quick actions — at the very top of the page. They used to sit under the Stats and
          Upcoming panels, so expanding either one pushed the two things people open this page
          to do off the screen. */}
      <div className="flex items-center justify-center gap-2 flex-wrap">
        <Button variant="white" size="sm" onClick={() => setQuickAction('checkin')}>
          <MapPin className="w-4 h-4 mr-1.5" />
          Court
        </Button>
        <Button variant="clay" size="sm" onClick={() => setQuickAction('photo')}>
          <Camera className="w-4 h-4 mr-1.5" />
          Report
        </Button>
      </div>

      {/* ── Hub: streak / RS points / matches, opponents ── */}
      <div className="bg-tennis-surface/30 rounded-3xl p-5 space-y-4">
        {/* The "Unlock a reward" banner moved to the top of the Notifications page — it's an
            announcement, not a permanent fixture of the profile hub. */}
        {/* Three top-half buttons: Stats and Upcoming expand in place, Leaderboard navigates.
            The always-visible streak/points/matches strip folded into Stats so those numbers
            render once instead of twice. */}
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => setShowStats((v) => !v)}
            aria-expanded={showStats}
            className={`rounded-2xl border transition-colors py-3 flex flex-col items-center gap-1.5 ${showStats ? 'border-clay/40 bg-clay/10' : 'border-fg/10 bg-fg/5 hover:border-clay/40'}`}
          >
            <Sparkles className="w-4 h-4 text-clay" />
            <span className="text-[11px] font-bold text-fg flex items-center gap-1">
              Stats
              {showStats ? (
                <ChevronUp className="w-3 h-3 text-fg/70" />
              ) : (
                <ChevronDown className="w-3 h-3 text-fg/70" />
              )}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setShowUpcoming((v) => !v)}
            aria-expanded={showUpcoming}
            className={`rounded-2xl border transition-colors py-3 flex flex-col items-center gap-1.5 ${showUpcoming ? 'border-clay/40 bg-clay/10' : 'border-fg/10 bg-fg/5 hover:border-clay/40'}`}
          >
            <RacquetIcon className="w-4 h-4 text-clay" />
            <span className="text-[11px] font-bold text-fg flex items-center gap-1">
              Upcoming
              {showUpcoming ? (
                <ChevronUp className="w-3 h-3 text-fg/70" />
              ) : (
                <ChevronDown className="w-3 h-3 text-fg/70" />
              )}
            </span>
          </button>
          {/* Leaderboard rather than Matches: Matches has its own bottom-nav tab, and the
              leaderboard no longer does. */}
          <Link
            to="/leagues"
            className="rounded-2xl bg-fg/5 hover:border-clay/40 transition-colors py-3 flex flex-col items-center gap-1.5"
          >
            <Medal className="w-4 h-4 text-clay" />
            <span className="text-[11px] font-bold text-fg">Leaderboard</span>
          </Link>
        </div>

        {/* Stats panel */}
        {showStats && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-2xl bg-white/[0.04] py-3">
                <p className="text-lg font-black text-fg">{streak ?? '—'}</p>
                <p className="text-[9px] font-bold uppercase tracking-widest text-fg/70">Streak</p>
              </div>
              <Link
                to="/marketplace"
                className="rounded-2xl bg-white/[0.04] py-3 block hover:bg-white/[0.07] transition-colors"
              >
                <p className="text-lg font-black text-clay flex items-center justify-center gap-1">
                  <Sparkles className="w-3.5 h-3.5" />
                  {rsPoints}
                </p>
                <p className="text-[9px] font-bold uppercase tracking-widest text-fg/70">RS Points</p>
              </Link>
              <div className="rounded-2xl bg-white/[0.04] py-3">
                <p className="text-lg font-black text-fg">{wonPct === null ? '—' : `${wonPct}%`}</p>
                <p className="text-[9px] font-bold uppercase tracking-widest text-fg/70">P/G Won</p>
              </div>
              <div className="rounded-2xl bg-white/[0.04] py-3">
                <p className="text-lg font-black text-fg">{matches.length}</p>
                <p className="text-[9px] font-bold uppercase tracking-widest text-fg/70">Matches</p>
              </div>
              <div className="rounded-2xl bg-white/[0.04] py-3">
                <p
                  className={`text-lg font-black ${rankTrend === 'up' ? 'text-badge-win' : rankTrend === 'down' ? 'text-badge-loss' : 'text-fg'}`}
                >
                  {rankLabel}
                </p>
                <p className="text-[9px] font-bold uppercase tracking-widest text-fg/70">Rank Move</p>
              </div>
              <Link
                to="/history"
                className="rounded-2xl bg-white/[0.04] py-3 block hover:bg-white/[0.07] transition-colors"
              >
                {/* h-7 is text-lg's line-height. The other tiles get that height from their text;
                    this one holds only a 16px icon, so without it the row collapsed and pulled the
                    label 12px above the labels beside it. Any icon-only tile needs the same. */}
                <p className="text-lg font-black text-fg flex items-center justify-center h-7">
                  <HistoryIcon className="w-4 h-4 text-clay" />
                </p>
                {/* "History", not "Full History" — the longer label wrapped to two lines, so this
                    tile's title sat a line lower than the five beside it. */}
                <p className="text-[9px] font-bold uppercase tracking-widest text-fg/70">History</p>
              </Link>
            </div>

            {/* Last 5 completed matches with scores */}
            {recentMatches.length > 0 && (
              <div className="divide-y divide-white/5 rounded-2xl overflow-hidden">
                {recentMatches.map((m) => (
                  <div key={m.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                    <span
                      className={`shrink-0 w-5 text-[11px] font-black ${m.won ? 'text-badge-win' : 'text-badge-loss'}`}
                    >
                      {m.won ? 'W' : 'L'}
                    </span>
                    <span className="min-w-0 flex-1 text-sm font-semibold text-fg truncate">
                      {formatPlayerName(m.opponentName)}
                    </span>
                    <span className="shrink-0 text-[11px] font-bold text-fg/70 tabular-nums">{m.scoreLine}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Upcoming matches — not yet played / scores not submitted. Toggled by the "Upcoming"
            button above rather than its own header row. Sits above the quick actions so that
            expanding EITHER panel pushes Court/Report down the same way. */}
        {upcoming.length > 0 && (
          <div>
            {showUpcoming && (
              <div className="divide-y divide-white/5 rounded-2xl overflow-hidden">
                {upcoming.slice(0, 8).map((o, i) => {
                  const skill = o.opponentId ? opponentSkill[o.opponentId] : undefined;
                  // Same-page destination the row's own group (Matches.tsx / Tournament) uses for
                  // Schedule/Score — keeps this row a launch point into the real action instead of
                  // duplicating the scheduling/scoring logic here.
                  const scoreHref =
                    o.source === 'tournament'
                      ? `/matches?mode=tournament&event=${o.eventId}`
                      : `/matches?mode=${o.source === 'rally' ? 'friendlies' : 'challenges'}`;
                  const stat = o.opponentId ? statsByUid.get(o.opponentId) : undefined;
                  const contactFull = o.opponentId ? opponentContacts[o.opponentId] : undefined;
                  const phone = contactFull?.phone || (o.opponentContact.includes('@') ? undefined : o.opponentContact);
                  const email = contactFull?.email || (o.opponentContact.includes('@') ? o.opponentContact : undefined);
                  const hasContact = !!(phone || email || contactFull?.whatsapp_contact);
                  return (
                    <motion.div key={o.id} {...fadeUp} transition={{ ...fadeUp.transition, delay: staggerDelay(i) }}>
                      <PlayerCard
                        id={o.id}
                        name={formatPlayerName(o.opponentName)}
                        nameHref={o.opponentId ? `/players/${o.opponentId}` : undefined}
                        subtitle={skill ? `Skill ${skill} · ${skillBand(skill)}` : undefined}
                        // Source reads as one letter on the name line: T tournament, C challenge,
                        // R friendly (rally). It was a word-pill on its own row under the name, which
                        // cost a whole line per row to say something a letter says.
                        nameBadge={<SourceLetter source={o.source} />}
                        open={expandedOpponent === o.id}
                        onToggle={() => setExpandedOpponent((cur) => (cur === o.id ? null : o.id))}
                        // Exactly four cells: Schedule, Tags, P/G Won %, Rank Move. The volume figures
                        // (P/G Played, Matches Played, Matches Won) belong on the leaderboard, not on
                        // a row whose job is "how do I reach this person and what are they like".
                        // Schedule and Tags carry no title — their contents already say what they are.
                        stats={[
                          {
                            // Schedule sits in the tile Contact used to hold, and Contact moved into
                            // the action row — same pairing as the tournament rows.
                            label: '',
                            value:
                              o.source === 'tournament' ? (
                                <Link to={scoreHref} className={pillButtonCls('sm', 'clay')}>
                                  Schedule
                                </Link>
                              ) : (
                                <span className="text-[11px] text-fg/70">—</span>
                              ),
                          },
                          {
                            // Kept from the old row rather than dropped — court overlap and
                            // availability are the whole point of the nearby/availability signals.
                            label: '',
                            value: (
                              <div className="flex items-center justify-center gap-1.5 flex-wrap">
                                <NearbyPill show={sharesCourt(opponentCourts[o.opponentId], myCourts)} />
                                <AvailabilityPills tags={opponentAvailability[o.opponentId]} />
                              </div>
                            ),
                          },
                          { label: 'P/G Won %', value: stat ? pgWinPct(stat) : '—' },
                          {
                            label: 'Rank Move',
                            value: stat ? <RankMove t={stat.rankTrend} move={stat.rankMove} /> : '—',
                          },
                        ]}
                        actionClassName="w-auto"
                        action={
                          <div className="flex items-center gap-1.5 flex-nowrap overflow-x-auto no-scrollbar justify-end">
                            {/* Score is the same orange pill everywhere in the app. It used to render as
                          a white `Button` here for non-tournament rows and an orange pill for
                          tournament ones, so two rows in the same list looked like different
                          controls. */}
                            {hasContact && (
                              <ContactOpponentButton
                                name={o.opponentName}
                                phone={phone}
                                email={email}
                                whatsappContact={contactFull?.whatsapp_contact}
                                whatsappSameAsPhone={contactFull?.whatsapp_same_as_phone}
                                preferred={contactFull?.preferred_mode_of_contact}
                                variant="white"
                                size="sm"
                              />
                            )}
                            <Link to={scoreHref} className={pillButtonCls('sm', 'clay')}>
                              <RacquetIcon className="w-3.5 h-3.5" />
                              Score
                            </Link>
                          </div>
                        }
                      />
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Community Member Initiation checklist — hidden once finished.
            Gated on the read having completed, NOT on the document existing: a brand-new
            account has no tasks doc until something writes one, and `!!progress`
            therefore hid the checklist from exactly the people who still need it. A missing
            doc simply means nothing is ticked yet. */}
        {progressLoaded && !initiationDone && (
          <div>
            <button
              type="button"
              onClick={() => setShowTasks((v) => !v)}
              className="w-full flex items-center justify-between mb-2 group"
            >
              <span className="text-[11px] font-bold uppercase tracking-widest text-fg/70">Tasks</span>
              {showTasks ? (
                <ChevronUp className="w-3.5 h-3.5 text-fg/70 group-hover:text-fg/70 transition-colors" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 text-fg/70 group-hover:text-fg/70 transition-colors" />
              )}
            </button>
            {showTasks && (
              <div className="divide-y divide-white/5 rounded-2xl overflow-hidden px-3.5">
                {TASKS.map((t) => {
                  const done = !!(progress as unknown as Record<string, unknown> | null)?.[t.id];
                  return (
                    <div key={t.id} className="flex items-center gap-2.5 py-2.5">
                      <span
                        className={`w-4 h-4 shrink-0 rounded-full border ${done ? 'bg-clay border-clay' : 'border-fg/20'}`}
                      />
                      <span
                        className={`text-sm flex-1 min-w-0 truncate ${done ? 'text-fg/70 line-through' : 'text-fg'}`}
                      >
                        {t.title}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      <ProfileInfo
        actions={actions}
        updateLoading={updateLoading}
        message={message}
        progress={progress}
        counters={counters}
      />

      {quickAction === 'checkin' && <CheckInModal onClose={() => setQuickAction(null)} />}
      {quickAction === 'photo' && <PhotoSubmitModal onClose={() => setQuickAction(null)} />}

      <Toast message={badgeToast} onDismiss={dismissToast} />

      {eventsLoading ? (
        <div className="h-48 bg-tennis-surface/30 rounded-3xl md:rounded-[2.5rem] animate-pulse" />
      ) : (
        (() => {
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
            (e) => e.type === 'tournament' || (e.title ?? '').toLowerCase().includes('tournament'),
          );
          const matchdaysEvent = joinedEvents.find((e) => (e.title ?? '').toLowerCase().includes('weekend matchdays'));

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
            if (current.has(dateKey)) current.delete(dateKey);
            else current.add(dateKey);
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
                  <div key={d} className="text-fg/70 text-xs font-medium text-center py-1">
                    {d}
                  </div>
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
                        selected
                          ? 'bg-clay text-white font-bold'
                          : deflt
                            ? 'border border-clay/60 text-clay font-semibold hover:bg-clay/20 cursor-pointer'
                            : past
                              ? 'text-fg/70 bg-fg/5 opacity-50 cursor-not-allowed'
                              : participantId
                                ? 'text-fg bg-fg/5 hover:bg-fg/10 cursor-pointer'
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
        })()
      )}

      {/* Site links relocated here from the removed global footer. */}
      <div className="pt-6 mt-2 border-t border-fg/5">
        <div className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs text-fg/70">
          <Link to="/about" className="hover:text-clay transition-colors">
            About Us
          </Link>
          <Link to="/terms" className="hover:text-clay transition-colors">
            Terms of Service
          </Link>
          <Link to="/privacy" className="hover:text-clay transition-colors">
            Privacy Policy
          </Link>
          <ContactLink />
          <InstagramLink />
        </div>
      </div>
    </div>
  );
};
