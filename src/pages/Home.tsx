import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { doc, getDoc } from 'firebase/firestore';

import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { CheckInModal } from '../features/tasks/CheckInModal';
import { PhotoSubmitModal } from '../features/tasks/PhotoSubmitModal';
import { DisplayEvent, fetchEvents, resolveStorageUrl } from '../features/events/services/eventService';
import { SiteFooterLine } from '../components/FooterElements';
import { Toast } from '../components/Toast';
import { subscribeVisitorToNewsletter, useMemberNewsletter } from '../lib/newsletter';
import { VolunteerSignup, submitVolunteerSignup } from '../lib/volunteer';
import { CourtImprovement, submitCourtImprovement } from '../lib/courtImprovements';
import { isCurrentEvent, sortEventsByEndDate } from '../utils/eventDates';
import { isTopspinMeetupEvent, isWeekendMatchdaysEvent } from '../utils/eventTypes';
import { useCourtData } from './courtmap/useCourtData';
import {
  FloatingCtaStack,
  HomeHero,
  StatsStrip,
  SubscribeSheet,
  SupportBand,
  UpcomingEventsStrip,
  VolunteerSheet,
  CourtNoteSheet,
} from './home/HomeElements';

// Animates a stat number up to its target whenever the target changes, carrying over the
// last displayed value (via ref) so a later Firestore update counts up from there instead of
// resetting to 0. Plain requestAnimationFrame — motion/react's imperative `animate()` doesn't
// drive plain number-to-number tweens (it expects a DOM/element subject), so this is hand-rolled.
function useCountUp(target: number, duration = 800) {
  const [display, setDisplay] = useState(0);
  const fromRef = useRef(0);
  useEffect(() => {
    // Browsers pause rAF in a hidden tab, so animating there would leave the number stuck at 0
    // until the tab is focused. Nothing is on screen to animate anyway — just land on the value.
    if (document.hidden) {
      fromRef.current = target;
      setDisplay(target);
      return;
    }
    const from = fromRef.current;
    const start = performance.now();
    let frame: number;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      const value = from + (target - from) * eased;
      fromRef.current = value;
      setDisplay(value);
      if (t < 1) frame = requestAnimationFrame(tick);
      else fromRef.current = target;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);
  return Math.round(display);
}

// Live figures come from the public site_stats/summary doc; these seed the strip so it never
// flashes 0 and stays populated if the doc/rule isn't deployed. Courts matches the Court Map's
// "Members Only" filter exactly — courts with a live count > 0 (via useCourtData).
const COMMUNITY_BASELINE = { activePlayers: 100, matchesOrganized: 170, courts: 42 };

const UPCOMING_EVENT_COUNT = 6;

/**
 * Landing page. Owns the data and the modals; every piece of markup lives in
 * ./home/HomeElements.tsx.
 *
 * Nothing in the shell is specific to this route: the tab bar and the header render here exactly
 * as on every other page (owner ruling 2026-09-17). "How it works" lives on /about — see
 * src/pages/StaticPages.tsx.
 */
export const Home: React.FC = () => {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const { courts } = useCourtData();

  const [activePlayers, setActivePlayers] = useState(COMMUNITY_BASELINE.activePlayers);
  const [matchesOrganized, setMatchesOrganized] = useState(COMMUNITY_BASELINE.matchesOrganized);
  const [checkinStep, setCheckinStep] = useState<null | 'regular' | 'report'>(null);
  const [upcoming, setUpcoming] = useState<DisplayEvent[]>([]);
  const [subscribeOpen, setSubscribeOpen] = useState(false);
  const [volunteerOpen, setVolunteerOpen] = useState(false);
  const [courtNoteOpen, setCourtNoteOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => { document.title = 'Racquets & Strings'; }, []);

  useEffect(() => {
    let cancelled = false;
    // A transient failure (cold connection, brief network blip on first load) used to leave the
    // hardcoded COMMUNITY_BASELINE seed stuck on screen forever with no retry — visitors would
    // see stale placeholder numbers until they happened to reload at the right moment. Retry with
    // backoff instead of giving up after one attempt.
    const load = async (attempt = 0) => {
      try {
        const summary = await getDoc(doc(db, 'site_stats', 'summary'));
        if (cancelled) return;
        if (!summary.exists()) return; // doc genuinely doesn't exist — not a transient failure
        const d = summary.data();
        if (typeof d.active_players === 'number') setActivePlayers(d.active_players);
        if (typeof d.matches_organized === 'number') setMatchesOrganized(d.matches_organized);
      } catch {
        if (cancelled || attempt >= 4) return; // site_stats rule/doc not deployed — give up quietly
        setTimeout(() => { if (!cancelled) load(attempt + 1); }, 1000 * 2 ** attempt);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  // Events strip. `events` is world-readable, so this works signed out. The two exclusions and
  // `isCurrentEvent` mirror the Events page (useEvents.ts) so the homepage can't advertise an
  // event that page hides; `isCurrentEvent` is shared code for exactly that reason.
  useEffect(() => {
    let cancelled = false;
    fetchEvents()
      .then(async (all) => {
        if (cancelled) return;
        const now = Date.now();
        // fetchEvents sorts by start date; the strip wants soonest-to-finish, so it re-sorts
        // before taking the first six.
        const shortlist = sortEventsByEndDate(
          all
            .filter((e) => !isTopspinMeetupEvent(e) && !isWeekendMatchdaysEvent(e))
            .filter((e) => isCurrentEvent(e, now)),
        ).slice(0, UPCOMING_EVENT_COUNT);
        // Paint the text immediately, then swap in posters as they resolve — a Storage round-trip
        // per image must not hold up the whole strip.
        setUpcoming(shortlist);

        // A `gs://` path is not a URL a browser can load; only these few on-screen events pay for
        // the lookup, unlike the Events page which resolves every event it has fetched.
        const withPosters = await Promise.all(
          shortlist.map(async (event) => {
            if (!event.imagePath) return event;
            try {
              return { ...event, image: await resolveStorageUrl(event.imagePath), imagePath: undefined };
            } catch {
              return event; // card renders without a banner rather than breaking the strip
            }
          }),
        );
        if (!cancelled) setUpcoming(withPosters);
      })
      .catch(() => { /* the strip renders nothing when the list is empty */ });
    return () => { cancelled = true; };
  }, []);

  // Check-In needs an account; logged-out visitors are sent to sign in first (like the auth tabs).
  const onCheckIn = () => (user ? setCheckinStep('regular') : navigate('/login'));
  // Report is open to everyone — logged-out reporters submit anonymously.
  const onReport = () => setCheckinStep('report');

  // Two paths, because a member and a stranger are not the same subscriber (see lib/newsletter.ts).
  // A signed-in member with an email on file is already telling us everything the row needs, so
  // tapping Subscribe just does it — no form to fill in twice. Everyone else gets the modal, and so
  // does a member whose account carries no email (some OAuth providers withhold it), since without
  // one there is nothing to subscribe.
  const newsletter = useMemberNewsletter(user?.uid, user?.email, profile?.user.name ?? '');
  const onSubscribeClick = async () => {
    if (!user?.email) { setSubscribeOpen(true); return; }
    try {
      await newsletter.subscribe();
    } catch {
      setToast('Could not sign you up just now. Please try again.');
    }
  };
  // Visitors always see Subscribe; a member only until their row exists (hidden while checking).
  const showSubscribe = !user || newsletter.subscribed === false;

  const handleVisitorSubscribe = (email: string) => subscribeVisitorToNewsletter(email);

  // The form always runs, member or not — only the uid and name ride along for a member.
  // Visitors only: a member's Submit a Report opens PhotoSubmitModal, which pays points.
  const handleCourtNote = (note: Omit<CourtImprovement, 'uid' | 'userName'>) =>
    submitCourtImprovement({ ...note, uid: user?.uid, userName: profile?.user.name ?? '' });

  const handleVolunteer = (signup: Omit<VolunteerSignup, 'uid' | 'userName'>) =>
    submitVolunteerSignup({ ...signup, uid: user?.uid, userName: profile?.user.name ?? '' });

  // Each stat tile is a shortcut: number + label + destination. Values count up to their
  // target rather than just appearing.
  const activePlayersDisplay = useCountUp(activePlayers);
  const matchesOrganizedDisplay = useCountUp(matchesOrganized);
  const courtsWithMembers = courts.filter((c) => c.count > 0).length;
  const courtsCoveredDisplay = useCountUp(courtsWithMembers || COMMUNITY_BASELINE.courts);
  const stats = [
    { value: `${activePlayersDisplay}`, label: 'Players', to: '/leagues' },
    { value: `${matchesOrganizedDisplay}`, label: 'Matches', to: '/events' },
    { value: `${courtsCoveredDisplay}`, label: 'Courts', to: '/courts' },
  ];

  return (
    <div className="max-w-xl mx-auto px-4 sm:px-6 pb-20">
      <HomeHero signedIn={!!user} onCheckIn={onCheckIn} onReport={onReport} />

      <div className="mt-5">
        <StatsStrip stats={stats} />
      </div>

      <UpcomingEventsStrip events={upcoming} />
      <SupportBand onVolunteer={() => setVolunteerOpen(true)} />

      <SiteFooterLine className="mt-8" />

      {/* Portalled: Layout's animated <main> transforms on route change, and a transformed
          ancestor re-bases `position: fixed` — the same reason Sheet and Toast portal. */}
      {createPortal(
        <FloatingCtaStack onSubscribe={showSubscribe ? onSubscribeClick : undefined} onCourtNote={user ? undefined : () => setCourtNoteOpen(true)} />,
        document.body,
      )}

      {subscribeOpen && (
        <SubscribeSheet
          onClose={() => setSubscribeOpen(false)}
          onSubscribe={handleVisitorSubscribe}
          defaultEmail={user?.email ?? ''}
        />
      )}

      {courtNoteOpen && (
        <CourtNoteSheet
          onClose={() => setCourtNoteOpen(false)}
          onSubmit={handleCourtNote}
        />
      )}

      {volunteerOpen && (
        <VolunteerSheet
          onClose={() => setVolunteerOpen(false)}
          onSubmit={handleVolunteer}
          defaultEmail={user?.email ?? ''}
        />
      )}

      {/* Mounted unconditionally with a null message — Toast needs to stay mounted to animate out. */}
      <Toast message={toast} onDismiss={() => setToast(null)} placement="top" />

      {/* ── Check-In / Report modals ── */}
      {checkinStep === 'regular' && <CheckInModal onClose={() => setCheckinStep(null)} />}
      {checkinStep === 'report' && <PhotoSubmitModal onClose={() => setCheckinStep(null)} />}
    </div>
  );
};
