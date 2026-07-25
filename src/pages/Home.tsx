import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, animate } from 'motion/react';
import { MapPin, Camera, Medal, Trophy } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';

import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/Button';
import { CheckInModal } from '../features/tasks/CheckInModal';
import { PhotoSubmitModal } from '../features/tasks/PhotoSubmitModal';
import { resolveStorageUrl } from '../features/events/services/eventService';
import { useCourtData } from './courtmap/useCourtData';

// Landing-page hero slideshow (Firebase Storage). Resolved to download URLs at runtime.
const SLIDESHOW_PATHS = [
  'gs://toronto-tennis-league.firebasestorage.app/LandingPage/1.png',
  'gs://toronto-tennis-league.firebasestorage.app/LandingPage/2.png',
  'gs://toronto-tennis-league.firebasestorage.app/LandingPage/3.png',
  'gs://toronto-tennis-league.firebasestorage.app/LandingPage/4.png',
];

const MotionLink = motion.create(Link);

// Animates a stat number up to its target whenever the target changes, carrying over the
// last displayed value (via ref) so a later Firestore update counts up from there instead of
// resetting to 0.
function useCountUp(target: number) {
  const [display, setDisplay] = useState(0);
  const lastRef = useRef(0);
  useEffect(() => {
    console.log('useCountUp effect', { from: lastRef.current, target });
    const controls = animate(lastRef.current, target, {
      duration: 0.8,
      ease: 'easeOut',
      onUpdate: (v) => { lastRef.current = v; setDisplay(v); console.log('onUpdate', v); },
    });
    return () => controls.stop();
  }, [target]);
  return Math.round(display);
}

// Cache resolved slideshow download URLs so repeat visits/refreshes skip the Storage round-trip
// entirely and never show the /Logo.png fallback — only a first-ever visit pays that latency.
const SLIDESHOW_CACHE_KEY = 'rs-home-slides-v1';
const SLIDESHOW_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const readCachedSlides = (): string[] => {
  try {
    const raw = localStorage.getItem(SLIDESHOW_CACHE_KEY);
    if (!raw) return [];
    const { urls, savedAt } = JSON.parse(raw);
    if (!Array.isArray(urls) || Date.now() - savedAt > SLIDESHOW_CACHE_TTL_MS) return [];
    return urls;
  } catch { return []; }
};

// Live figures come from the public site_stats/summary doc; these seed the strip so it never
// flashes 0 and stays populated if the doc/rule isn't deployed. Courts comes from the court
// list itself (useCourtData), not site_stats — it's always the live unique-court count.
const COMMUNITY_BASELINE = { activePlayers: 100, matchesOrganized: 170 };

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

  const [activePlayers, setActivePlayers] = useState(COMMUNITY_BASELINE.activePlayers);
  const [matchesOrganized, setMatchesOrganized] = useState(COMMUNITY_BASELINE.matchesOrganized);
  const [checkinStep, setCheckinStep] = useState<null | 'regular' | 'report'>(null);
  const [slides, setSlides] = useState<string[]>(readCachedSlides);
  const [slideIndex, setSlideIndex] = useState(0);

  useEffect(() => { document.title = 'Racquets & Strings'; }, []);

  // Resolve the gs:// slideshow images to download URLs; keep only the ones that resolve, and
  // cache them for next time so a refresh/repeat visit never shows the Logo.png fallback.
  useEffect(() => {
    let cancelled = false;
    Promise.all(SLIDESHOW_PATHS.map((p) => resolveStorageUrl(p).catch(() => '')))
      .then((urls) => {
        const resolved = urls.filter(Boolean);
        if (cancelled || resolved.length === 0) return;
        setSlides(resolved);
        try { localStorage.setItem(SLIDESHOW_CACHE_KEY, JSON.stringify({ urls: resolved, savedAt: Date.now() })); } catch {}
      });
    return () => { cancelled = true; };
  }, []);

  // Rotate slides every 5s (only once more than one resolved).
  useEffect(() => {
    if (slides.length < 2) return;
    const t = setInterval(() => setSlideIndex((i) => (i + 1) % slides.length), 5000);
    return () => clearInterval(t);
  }, [slides.length]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const summary = await getDoc(doc(db, 'site_stats', 'summary'));
        if (cancelled || !summary.exists()) return;
        const d = summary.data();
        if (typeof d.activePlayers === 'number') setActivePlayers(d.activePlayers);
        if (typeof d.matchesOrganized === 'number') setMatchesOrganized(d.matchesOrganized);
      } catch { /* site_stats rule/doc not deployed yet — the baseline seed stays shown */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // Check-In needs an account; logged-out visitors are sent to sign in first (like the auth tabs).
  const onCheckIn = () => (user ? setCheckinStep('regular') : navigate('/login'));
  // Report is open to everyone — logged-out reporters submit anonymously.
  const onReport = () => setCheckinStep('report');

  // Each stat tile is a shortcut: number + label + destination. Values count up to their
  // target rather than just appearing.
  const activePlayersDisplay = useCountUp(activePlayers);
  const matchesOrganizedDisplay = useCountUp(matchesOrganized);
  const courtsCoveredDisplay = useCountUp(courts.length);
  const stats = [
    { value: `${activePlayersDisplay}`, label: 'Players', to: '/leagues'},
    { value: `${matchesOrganizedDisplay}`, label: 'Matches', to: '/events'},
    { value: `${courtsCoveredDisplay}`, label: 'Courts', to: '/courts'},
  ];

  return (
    <div className="max-w-xl mx-auto px-4 sm:px-6 pb-8">
      {/* ── Hero — full-bleed within the page's own column (breaks out of the horizontal
          padding only), starting below the header rather than behind it. ~70% viewport height,
          tagline + description overlaid near the bottom. ── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0 }}
        className="relative -mx-4 sm:-mx-6 h-[70vh] overflow-hidden"
      >
        <div className="absolute inset-0 dark-gradient" />
        {slides.length > 0 ? (
          slides.map((url, i) => (
            <img
              key={url}
              src={url}
              alt=""
              className={`absolute inset-0 w-full h-full object-cover object-center transition-opacity duration-1000 ${
                i === slideIndex ? 'opacity-100' : 'opacity-0'
              }`}
            />
          ))
        ) : (
          <img src="/Logo.png" alt="" className="absolute inset-0 w-full h-full object-contain object-center p-10 opacity-25" />
        )}
        {/* Bottom-weighted gradient — keeps the overlaid tagline/description legible against any photo. */}
        <div className="absolute inset-0 bg-gradient-to-t from-tennis-dark/90 via-tennis-dark/20 to-transparent" />

        {/* Tagline stays clay/orange regardless of theme (matches the fixed brand accent);
            the description sits on the gradient, which itself flips per theme, so it uses the
            theme-aware fg token (white in dark, dark green in light). */}
        <div className="absolute inset-x-0 bottom-0 px-4 sm:px-6 pb-6 text-center">
          <h1 className="text-2xl sm:text-3xl font-black text-clay tracking-tight">L&apos;ŒUF FOR THE GAME</h1>
          <p className="mt-2 text-sm text-fg/80 max-w-md mx-auto">
            Toronto&apos;s home for free tennis events, public court and wait time insights. Join our movement to make tennis more accessible.
          </p>
        </div>
      </motion.div>

      {/* ── Buttons — below the hero, alternating clay/white, all the same size regardless of
          label length. Join or Log In only when logged out; Check-In/Submit a Photo keep the
          same alternation whichever slot they land in. ── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        className={`grid gap-2.5 mt-5 mb-5 ${!user ? 'grid-cols-3' : 'grid-cols-2'}`}
      >
        {!user && (
          <Link to="/login" className="block">
            <Button size="md" variant="clay" className="w-full whitespace-nowrap text-[11px] sm:text-sm px-1.5 sm:px-2">Join or Log In</Button>
          </Link>
        )}
        <Button size="md" variant={!user ? 'white' : 'clay'} className="w-full whitespace-nowrap text-[11px] sm:text-sm px-1.5 sm:px-2" onClick={onCheckIn}>
          <MapPin className="w-3.5 h-3.5 mr-1 shrink-0" />Check-In
        </Button>
        <Button size="md" variant={!user ? 'clay' : 'white'} className="w-full whitespace-nowrap text-[11px] sm:text-sm px-1.5 sm:px-2" onClick={onReport}>
          <Camera className="w-3.5 h-3.5 mr-1 shrink-0" />Submit a Photo
        </Button>
      </motion.div>

      {/* ── Stats strip — plain icon/number/label groups blended into the page (no card
          background/border); hover/tap gives a slight zoom as the only interactive cue. ── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2 }}
        className="grid grid-cols-3 gap-2.5"
      >
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
            <span className="text-[10px] font-bold uppercase tracking-widest text-fg/50">{s.label}</span>
          </MotionLink>
        ))}
      </motion.div>

      {/* ── Check-In / Report modals ── */}
      {checkinStep === 'regular' && <CheckInModal onClose={() => setCheckinStep(null)} />}
      {checkinStep === 'report' && <PhotoSubmitModal onClose={() => setCheckinStep(null)} />}
    </div>
  );
};
