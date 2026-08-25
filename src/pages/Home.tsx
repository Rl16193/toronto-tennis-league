import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { MapPin, Camera } from 'lucide-react';
import { InstagramLink } from '../components/FooterElements';
import { doc, getDoc } from 'firebase/firestore';

import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/Button';
import { CheckInModal } from '../features/tasks/CheckInModal';
import { PhotoSubmitModal } from '../features/tasks/PhotoSubmitModal';
import { resolveStorageUrl } from '../features/events/services/eventService';
import { useCourtData } from './courtmap/useCourtData';
import { fadeUp } from '../lib/motion';

// Landing-page hero slideshow (Firebase Storage). Resolved to download URLs at runtime.
const SLIDESHOW_PATHS = [
  'gs://toronto-tennis-league.firebasestorage.app/LandingPage/1.png',
  'gs://toronto-tennis-league.firebasestorage.app/LandingPage/2.png',
  'gs://toronto-tennis-league.firebasestorage.app/LandingPage/3.png',
  'gs://toronto-tennis-league.firebasestorage.app/LandingPage/26.png',
];

const MotionLink = motion.create(Link);

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

// Cache resolved slideshow download URLs so repeat visits/refreshes skip the Storage round-trip
// entirely and never show the /Logo.png fallback — only a first-ever visit pays that latency.
const SLIDESHOW_CACHE_KEY = 'rs-home-slides-v2';
const SLIDESHOW_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const readCachedSlides = (): string[] => {
  try {
    const raw = localStorage.getItem(SLIDESHOW_CACHE_KEY);
    if (!raw) return [];
    const { urls, savedAt } = JSON.parse(raw);
    if (!Array.isArray(urls) || Date.now() - savedAt > SLIDESHOW_CACHE_TTL_MS) return [];
    return urls;
  } catch {
    return [];
  }
};

// Live figures come from the public site_stats/summary doc. A missing document is represented as
// zero; a failed read remains unknown rather than displaying invented community totals.

// Landing page: the hero photo is its OWN contained card (not a page-wide background) with
// Check-In / Submit a Photo / Join-or-Log-In overlaid on the image itself. The card is
// portrait-cropped by default (sized down naturally on small screens via aspect-ratio) and
// switches to a wider landscape crop when the device is rotated to landscape. Stats sit in a
// plain horizontal strip below the image. "How it works" now lives on its own page
// (/how-it-works, linked from Profile) — see src/pages/StaticPages.tsx.
export const Home: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { courts } = useCourtData();

  const [activePlayers, setActivePlayers] = useState<number | null>(null);
  const [matchesOrganized, setMatchesOrganized] = useState<number | null>(null);
  const [checkinStep, setCheckinStep] = useState<null | 'regular' | 'report'>(null);
  const [slides, setSlides] = useState<string[]>(readCachedSlides);
  const [slideIndex, setSlideIndex] = useState(0);

  useEffect(() => {
    document.title = 'Racquets & Strings';
  }, []);

  const handleSlideError = (url: string) => {
    setSlides((current) => current.filter((candidate) => candidate !== url));
    setSlideIndex((index) => Math.max(0, index - 1));
  };

  // Resolve the gs:// slideshow images to download URLs; keep only the ones that resolve, and
  // cache them for next time so a refresh/repeat visit never shows the Logo.png fallback.
  useEffect(() => {
    let cancelled = false;
    Promise.all(SLIDESHOW_PATHS.map((p) => resolveStorageUrl(p).catch(() => ''))).then((urls) => {
      const resolved = urls.filter(Boolean);
      if (cancelled || resolved.length === 0) return;
      setSlides(resolved);
      try {
        localStorage.setItem(SLIDESHOW_CACHE_KEY, JSON.stringify({ urls: resolved, savedAt: Date.now() }));
      } catch {
        // A full or restricted local cache should not prevent the slideshow from rendering.
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Rotate slides every 5s (only once more than one resolved).
  useEffect(() => {
    if (slides.length < 2) return;
    const t = setInterval(() => setSlideIndex((i) => (i + 1) % slides.length), 5000);
    return () => clearInterval(t);
  }, [slides.length]);

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
        if (!summary.exists()) {
          setActivePlayers(0);
          setMatchesOrganized(0);
          return;
        }
        const d = summary.data();
        setActivePlayers(typeof d.active_players === 'number' ? d.active_players : 0);
        setMatchesOrganized(typeof d.matches_organized === 'number' ? d.matches_organized : 0);
      } catch {
        if (cancelled || attempt >= 4) {
          setActivePlayers(null);
          setMatchesOrganized(null);
          return;
        }
        setTimeout(
          () => {
            if (!cancelled) load(attempt + 1);
          },
          1000 * 2 ** attempt,
        );
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Check-In needs an account; logged-out visitors are sent to sign in first (like the auth tabs).
  const onCheckIn = () => (user ? setCheckinStep('regular') : navigate('/login'));
  // Report is open to everyone — logged-out reporters submit anonymously.
  const onReport = () => setCheckinStep('report');

  // Each stat tile is a shortcut: number + label + destination. Values count up to their
  // target rather than just appearing.
  const activePlayersDisplay = useCountUp(activePlayers ?? 0);
  const matchesOrganizedDisplay = useCountUp(matchesOrganized ?? 0);
  const courtsWithMembers = courts.filter((c) => c.count > 0).length;
  const courtsCoveredDisplay = useCountUp(courtsWithMembers);
  const stats = [
    { value: activePlayers === null ? '—' : `${activePlayersDisplay}`, label: 'Players', to: '/leagues' },
    { value: matchesOrganized === null ? '—' : `${matchesOrganizedDisplay}`, label: 'Matches', to: '/events' },
    { value: `${courtsCoveredDisplay}`, label: 'Courts', to: '/courts' },
  ];

  return (
    <div className="max-w-xl mx-auto px-4 sm:px-6 pb-8">
      {/* ── Hero — full-bleed to the viewport width (not just the page's own max-w-xl column),
          so it has no side gaps in landscape/wide viewports, starting below the header rather
          than behind it. ~70% viewport height, tagline + description overlaid near the bottom. ── */}
      <motion.div {...fadeUp} className="relative left-1/2 -ml-[50vw] w-screen h-[70vh] overflow-hidden">
        <div className="absolute inset-0 dark-gradient" />
        {slides.map((url, i) => (
          <img
            key={url}
            src={url}
            alt=""
            className={`absolute inset-0 w-full h-full object-cover object-center transition-opacity duration-1000 ${
              i === slideIndex ? 'opacity-100' : 'opacity-0'
            }`}
            onError={() => handleSlideError(url)}
          />
        ))}
        {/* Bottom-weighted gradient — keeps the overlaid tagline/description legible against any photo. */}
        <div className="absolute inset-0 bg-gradient-to-t from-tennis-dark/90 via-tennis-dark/20 to-transparent" />

        {/* Tagline stays clay/orange regardless of theme (matches the fixed brand accent);
            the description sits on the gradient, which itself flips per theme, so it uses the
            theme-aware fg token (white in dark, dark green in light). */}
        <div className="absolute inset-x-0 bottom-0 px-4 sm:px-6 pb-6 text-center">
          <h1 className="text-2xl sm:text-3xl font-black text-clay-fg tracking-tight">L&apos;ŒUF FOR THE GAME</h1>
          <p className="mt-2 text-sm text-fg max-w-md mx-auto">
            Toronto&apos;s home for free tennis events, public court and wait time insights. Join our movement to make
            tennis more accessible.
          </p>
        </div>
      </motion.div>

      {/* ── Buttons — below the hero. Logged-out visitors see only Join or Log In (Court / Report
          would be confusing before they have an account); signed-in users get both, alternating
          clay/white. ── */}
      <motion.div
        {...fadeUp}
        transition={{ ...fadeUp.transition, delay: 0.1 }}
        className={`grid gap-2.5 mt-5 mb-5 ${!user ? 'grid-cols-1' : 'grid-cols-2'}`}
      >
        {!user ? (
          <Link to="/login" className="block">
            <Button size="md" variant="clay" className="w-full whitespace-nowrap text-[11px] sm:text-sm px-1.5 sm:px-2">
              Join or Log In
            </Button>
          </Link>
        ) : (
          <>
            <Button
              size="md"
              variant="clay"
              className="w-full whitespace-nowrap text-[11px] sm:text-sm px-1.5 sm:px-2"
              onClick={onCheckIn}
            >
              <MapPin className="w-3.5 h-3.5 mr-1 shrink-0" />
              Court
            </Button>
            <Button
              size="md"
              variant="white"
              className="w-full whitespace-nowrap text-[11px] sm:text-sm px-1.5 sm:px-2"
              onClick={onReport}
            >
              <Camera className="w-3.5 h-3.5 mr-1 shrink-0" />
              Report
            </Button>
          </>
        )}
      </motion.div>

      {/* ── Stats strip — plain icon/number/label groups blended into the page (no card
          background/border); hover/tap gives a slight zoom as the only interactive cue. ── */}
      <motion.div {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.2 }} className="grid grid-cols-3 gap-2.5">
        {stats.map((s) => (
          <MotionLink
            key={s.label}
            to={s.to}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 400, damping: 22 }}
            className="p-3 flex flex-col items-center text-center gap-1"
          >
            <span className="text-2xl font-black text-fg leading-none">{s.value}</span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-fg/70">{s.label}</span>
          </MotionLink>
        ))}
      </motion.div>

      <div className="flex justify-center mt-5">
        <InstagramLink className="text-xs font-bold text-fg/70" />
      </div>
      <nav
        className="flex justify-center items-center gap-3 mt-3 text-[11px] font-semibold text-fg/60"
        aria-label="Legal"
      >
        <Link to="/terms" className="hover:text-clay-fg transition-colors">
          Terms
        </Link>
        <span aria-hidden="true">·</span>
        <Link to="/privacy" className="hover:text-clay-fg transition-colors">
          Privacy
        </Link>
        <span aria-hidden="true">·</span>
        <Link to="/contact" className="hover:text-clay-fg transition-colors">
          Contact
        </Link>
      </nav>

      {/* ── Check-In / Report modals ── */}
      {checkinStep === 'regular' && <CheckInModal onClose={() => setCheckinStep(null)} />}
      {checkinStep === 'report' && <PhotoSubmitModal onClose={() => setCheckinStep(null)} />}
    </div>
  );
};
