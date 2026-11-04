import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Calendar, Camera, ChevronDown, Heart, HeartHandshake, Mail, MapPin } from 'lucide-react';

import { Button, buttonCls } from '../../components/Button';
import { Sheet } from '../../components/Sheet';
import { Input, fieldLabelCls } from '../../components/Input';
import { SelectField } from '../../components/SelectField';
import { DONATE_URL } from '../../components/FooterElements';
import { VOLUNTEER_ACTIVITIES, VolunteerSignup } from '../../lib/volunteer';
import { AlertMessage } from '../../components/AlertMessage';
import { TennisEvent } from '../../types';
import { getEventEndDate, parseValidDate } from '../../utils/eventDates';
import { isLadderEvent, isRecurringWeekly } from '../../utils/eventTypes';
import { eventTypeLabel, nextOccurrence } from '../../features/events/EventsElements';
import { fadeUp } from '../../lib/motion';

/**
 * Presentation for the landing page. Props in, callbacks out — every Firestore read and write
 * lives in Home.tsx (see CLAUDE.md, "*Elements.tsx — one presentational module per page").
 *
 * This page is the REFERENCE IMPLEMENTATION of the design spec the rest of the app has not been
 * swept to yet, so the rules below are followed strictly here even where neighbouring pages still
 * break them: 44px controls, one control radius (rounded-2xl), a visible focus ring on everything
 * focusable, nothing below 12px, and only the two sanctioned text tiers (text-fg, text-fg/70).
 */

/**
 * Hero backdrop — the "Tennis Hero Loop" animation exported from Claude Design as video.
 *
 * All four are EMPTY until the files land, and an empty value is a supported state, not a bug: the
 * dark gradient underneath is the intended placeholder, so nothing renders broken while we wait.
 * Drop the exports in `public/hero/` and fill these in. The poster alone is enough to go live —
 * video is an enhancement layered over it, never a requirement.
 *
 * Wide files are 16:9, portrait files 9:16. The portrait pair exists because the hero is a tall
 * narrow box on a phone, and cropping the wide board to it loses about three quarters of its width,
 * which is most of the animation.
 */
export const HERO_POSTER = '/hero/hero-wide.jpg';
export const HERO_POSTER_MOBILE = '/hero/hero-portrait.jpg';
export const HERO_VIDEO = '/hero/hero-wide.mp4';
export const HERO_VIDEO_MOBILE = '/hero/hero-portrait.mp4';

const MOBILE_QUERY = '(max-width: 767px)';

/**
 * Picks the backdrop for this viewport, and drops the video entirely when the visitor has asked
 * their system to reduce motion. A fifteen-second loop of thirty-six photos flying about is exactly
 * what that setting exists to suppress, so those visitors get the still and nothing else.
 *
 * Both queries are watched, not just read once: a phone rotating to landscape should switch file,
 * and the motion preference can be changed while the page is open.
 */
const useHeroBackdrop = () => {
  const [{ poster, video }, setPick] = useState({ poster: HERO_POSTER, video: '' });

  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const mobile = window.matchMedia(MOBILE_QUERY);
    const pick = () => {
      const small = mobile.matches;
      const stillFirst = small && HERO_POSTER_MOBILE ? HERO_POSTER_MOBILE : HERO_POSTER;
      const clip = small && HERO_VIDEO_MOBILE ? HERO_VIDEO_MOBILE : HERO_VIDEO;
      setPick({ poster: stillFirst, video: motion.matches ? '' : clip });
    };
    pick();
    motion.addEventListener('change', pick);
    mobile.addEventListener('change', pick);
    return () => {
      motion.removeEventListener('change', pick);
      mobile.removeEventListener('change', pick);
    };
  }, []);

  return { poster, video };
};

/**
 * The still, with the loop fading in over it once it can actually play.
 *
 * Two things keep this from costing the landing page its first paint: the poster carries the visual
 * on its own, and the video only becomes visible on `canplay`, so a slow connection shows a clean
 * still rather than a black rectangle. It also stops playing once scrolled out of view — a loop
 * running under three screens of content is pure battery drain on a phone.
 */
const HeroBackdrop: React.FC = () => {
  const { poster, video } = useHeroBackdrop();
  const [ready, setReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => { setReady(false); }, [video]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !video) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        // play() rejects when autoplay is refused; the poster stays up, which is the right outcome.
        if (entry.isIntersecting) el.play().catch(() => {});
        else el.pause();
      },
      { threshold: 0.05 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [video]);

  return (
    <>
      {poster && (
        <img src={poster} alt="" className="absolute inset-0 w-full h-full object-cover object-center" />
      )}
      {video && (
        <video
          ref={videoRef}
          src={video}
          poster={poster || undefined}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          aria-hidden="true"
          onCanPlay={() => setReady(true)}
          className={`absolute inset-0 w-full h-full object-cover object-center transition-opacity duration-700 ${
            ready ? 'opacity-100' : 'opacity-0'
          }`}
        />
      )}
    </>
  );
};

const sectionHeadingCls = 'text-2xl font-black text-fg tracking-tight';

// ── Hero ─────────────────────────────────────────────────────────────────────
// Full-bleed to the viewport (not the page's max-w-xl column) so it has no side gaps on wide
// screens, and it sits behind the transparent header — Layout.tsx skips the top pad on Home.
export const HomeHero: React.FC<{
  signedIn: boolean;
  onCheckIn: () => void;
  onReport: () => void;
}> = ({ signedIn, onCheckIn, onReport }) => (
  <motion.div {...fadeUp} className="relative left-1/2 -ml-[50vw] w-screen h-[70vh] overflow-hidden">
    <div className="absolute inset-0 dark-gradient" />
    <HeroBackdrop />
    {/* Bottom-weighted scrim — keeps the tagline and CTA legible against any photo. */}
    <div className="absolute inset-0 bg-gradient-to-t from-tennis-dark/90 via-tennis-dark/20 to-transparent" />

    <div className="absolute inset-x-0 bottom-0 px-4 sm:px-6 pb-6 text-center">
      {/* The one display-size exception on the site: a marketing headline at 24px reads as an
          undersized page. Everything else obeys the two-size scale. */}
      <h1 className="text-3xl font-black text-clay tracking-tight">L&apos;&OElig;UF FOR THE GAME</h1>

      <div className="mt-5 max-w-md mx-auto">
        {signedIn ? (
          <div className="grid grid-cols-2 gap-2.5">
            <Button variant="white" className="w-full" onClick={onCheckIn}>
              <MapPin className="w-4 h-4 shrink-0" />Record Activity
            </Button>
            <Button variant="clay" className="w-full" onClick={onReport}>
              <Camera className="w-4 h-4 shrink-0" />Submit a Report
            </Button>
          </div>
        ) : (
          <Link to="/login" className={`${buttonCls('clay')} w-full`}>
            Join or Log In
          </Link>
        )}
      </div>
    </div>
  </motion.div>
);

// ── Stats strip ──────────────────────────────────────────────────────────────
// Deliberately boxless: it blends into the page rather than sitting in a card. Hover/tap zoom is
// the only interactive cue.
const MotionLink = motion.create(Link);

export const StatsStrip: React.FC<{ stats: { value: string; label: string; to: string }[] }> = ({ stats }) => (
  <motion.div
    {...fadeUp}
    transition={{ ...fadeUp.transition, delay: 0.1 }}
    className="grid grid-cols-3 gap-2.5"
  >
    {stats.map((s) => (
      <MotionLink
        key={s.label}
        to={s.to}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        transition={{ type: 'spring', stiffness: 400, damping: 22 }}
        className="min-h-11 p-3 flex flex-col items-center text-center gap-1 rounded-2xl
                   focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clay"
      >
        <span className="text-2xl font-black text-fg leading-none">{s.value}</span>
        <span className="text-xs font-bold uppercase tracking-widest text-fg/70">{s.label}</span>
      </MotionLink>
    ))}
  </motion.div>
);

// ── Upcoming events ──────────────────────────────────────────────────────────
// Kept intentionally plain: the owner is restyling this strip, so the card is one small component
// with no shared dependencies to unpick.
/**
 * The END date, not the start. What a visitor needs to know about an event already under way is
 * how long is left to join it, and a start date in the past reads as stale.
 *
 * The ladder is the exception: it runs the whole season and has no meaningful finishing date, so
 * printing one would suggest a deadline that isn't real.
 */
const eventDateChip = (event: TennisEvent) => {
  if (isLadderEvent(event)) return 'ALL SEASON';
  // A weekly meetup shows its next occurrence instead ("Recurring meetups" in CLAUDE.md).
  const date = isRecurringWeekly(event) ? nextOccurrence(event) : parseValidDate(getEventEndDate(event));
  if (!date) return 'Date TBC';
  return date.toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase();
};

const typeChipCls = 'px-2 py-0.5 rounded-2xl text-xs font-bold uppercase tracking-widest';

/**
 * The same card as the Events page, minus the two things a 240px column in a sideways scroll has
 * no room for: the description and the Join button. Tapping anywhere opens the Events page, where
 * the full card and the real Join control live.
 */
const UpcomingEventCard: React.FC<{ event: TennisEvent }> = ({ event }) => {
  const typeLabel = eventTypeLabel(event);
  return (
    <Link
      to="/events"
      className="shrink-0 w-60 rounded-2xl bg-fg/5 overflow-hidden flex flex-col transition-colors
                 hover:bg-fg/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clay"
    >
      {/* The banner runs to the card's top edge with the type chip sitting ON it. Putting the chip
          above the picture instead cost a whole dead band across the top of every card.
          The posters are portrait with the event name printed across the middle, so a 16:9 crop
          taken from the CENTRE keeps the name and loses the tagline and division lines.
          No banner at all when an event has no picture — an empty grey box reads as a broken
          image, and a shorter card does not. */}
      {event.image ? (
        <div className="relative">
          <img
            src={event.image}
            alt=""
            loading="lazy"
            decoding="async"
            className="w-full aspect-video object-cover object-center"
          />
          {/* Opaque backing, because a poster is busy and a chip with no fill vanishes into it. */}
          <span className={`absolute top-2 left-2 ${typeChipCls} bg-tennis-dark/85 text-clay backdrop-blur-sm`}>
            {typeLabel}
          </span>
          <span className="absolute top-2 right-2 rounded-full bg-clay px-2.5 py-1 text-xs font-bold text-white">
            Free
          </span>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2 mt-3 mx-3">
          <span className={`${typeChipCls} bg-clay/10 border border-clay/20 text-clay`}>{typeLabel}</span>
          <span className="rounded-full bg-clay px-2.5 py-1 text-xs font-bold text-white">Free</span>
        </div>
      )}

      {/* flex-1 lets the pill row take mt-auto below, which pins it to the card's foot so the rows
          line up across cards whose titles wrap to different heights. */}
      <div className="flex-1 flex flex-col gap-2 p-3">
        {/* Small enough to show a full tournament name rather than truncating it. */}
        <span className="text-sm font-bold text-fg leading-snug">{event.title}</span>

        {/* One row, never wrapping: the location truncates instead, so the date is always beside it. */}
        <div className="mt-auto flex items-center gap-1.5 min-w-0">
          <span className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-full bg-fg/5 text-xs text-fg/70">
            <Calendar className="w-3.5 h-3.5 text-clay shrink-0" />
            {eventDateChip(event)}
          </span>
          {event.location && (
            <span className="min-w-0 flex items-center gap-1 px-2 py-1 rounded-full bg-fg/5 text-xs text-fg/70">
              <MapPin className="w-3.5 h-3.5 text-clay shrink-0" />
              <span className="truncate">{event.location}</span>
            </span>
          )}
        </div>
      </div>
    </Link>
  );
};

export const UpcomingEventsStrip: React.FC<{ events: TennisEvent[] }> = ({ events }) => {
  if (events.length === 0) return null;
  return (
    <motion.section
      {...fadeUp}
      transition={{ ...fadeUp.transition, delay: 0.2 }}
      className="mt-8"
      aria-labelledby="upcoming-events-heading"
    >
      <h2 id="upcoming-events-heading" className={`${sectionHeadingCls} text-center mb-3`}>Ongoing Events</h2>

      {/* Full-bleed so the row can scroll edge to edge, with the page gutter restored as padding.
          `w-max mx-auto` is what centres it: the inner row is exactly as wide as its cards, so the
          auto margins centre it while it fits and collapse to zero once it overflows and scrolls.
          A plain `justify-center` would instead clip the first card off the scroll origin. */}
      <div className="relative left-1/2 -ml-[50vw] w-screen overflow-x-auto no-scrollbar">
        <div className="flex w-max mx-auto gap-3 px-4 sm:px-6 pb-1">
          {events.map((event) => <UpcomingEventCard key={event.id} event={event} />)}
        </div>
      </div>

      <div className="flex justify-center mt-3">
        <Link
          to="/events"
          className="text-xs font-bold uppercase tracking-widest text-fg/70 hover:text-clay transition-colors
                     rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clay"
        >
          See all events
        </Link>
      </div>
    </motion.section>
  );
};

// ── Support band ─────────────────────────────────────────────────────────────

/**
 * The concentric rings behind the support card.
 *
 * Every circle carries the SAME translucent fill, so the bands are the overlaps rather than four
 * different colours — the tone builds up toward the centre on its own. The fill is `fg`, so the
 * rings are white over the dark page and dark green over the light one without a second rule.
 *
 * The centre sits outside the card on a phone and moves inside it from `sm` up. At the page's
 * max-w-xl there isn't room for both the copy and a bright ring core, so on a narrow screen only
 * the faint outer arcs cross the text. Decorative, so aria-hidden; the card clips the rest.
 */
const SupportRings: React.FC = () => (
  <div
    aria-hidden="true"
    className="pointer-events-none absolute top-1/2 -translate-y-1/2 -right-28 h-64 w-64
               sm:-right-24 sm:h-[380px] sm:w-[380px]"
  >
    {[100, 72, 47, 26].map((pct) => (
      <span
        key={pct}
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-fg/5"
        style={{ width: `${pct}%`, height: `${pct}%` }}
      />
    ))}
  </div>
);

export const SupportBand: React.FC<{ onVolunteer: () => void }> = ({ onVolunteer }) => (
  <motion.section
    {...fadeUp}
    transition={{ ...fadeUp.transition, delay: 0.3 }}
    className="relative mt-8 overflow-hidden rounded-2xl bg-fg/5 p-6 sm:p-8"
    aria-labelledby="support-heading"
  >
    <SupportRings />

    {/* Centred, and `relative` so it paints over the rings. The heading is clay at the hero
        tagline's weight, so the two read as one voice. It is the one heading on this page that
        isn't text-fg. `text-balance` decides only how it breaks on a phone, where it has to. */}
    <div className="relative max-w-md mx-auto text-center">
      <h2 id="support-heading" className="text-2xl font-black text-clay tracking-tight text-balance">
        Join our movement to make tennis more accessible.
      </h2>
      <p className="mt-3 text-sm text-fg/70">
        Contributions cover new tennis balls, prizes for tournaments, group coaching classes for and more. Volunteering involves organizing matchdays or regular meetups on different courts and more.
      </p>

      {/* Side by side wherever they fit, stacked and full width on a phone, where two pills need
          about 310px and the card has under 300. Donate always shows, but while DONATE_URL is
          empty there is no payment gateway behind it, so it renders disabled rather than as a
          link that goes nowhere. It becomes a live link the moment the URL is filled in. */}
      <div className="mt-5 flex flex-col sm:flex-row justify-center gap-3">
        {DONATE_URL ? (
          <a
            href={DONATE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={`${buttonCls('lime')} w-full sm:w-auto`}
          >
            <Heart className="w-4 h-4 shrink-0" />Contribute
          </a>
        ) : (
          <button
            type="button"
            disabled
            aria-disabled="true"
            title="Contributions open soon"
            className={`${buttonCls('lime')} w-full sm:w-auto opacity-50 cursor-not-allowed pointer-events-none select-none`}
          >
            <Heart className="w-4 h-4 shrink-0" />Contribute
          </button>
        )}
        <button
          type="button"
          onClick={onVolunteer}
          className={`${buttonCls('lime')} w-full sm:w-auto`}
        >
          <HeartHandshake className="w-4 h-4 shrink-0" />Volunteer with Us
        </button>
      </div>
    </div>
  </motion.section>
);

// ── FAQ ──────────────────────────────────────────────────────────────────────
// The player-facing rules. This list is their source of truth; the old Google Doc is out of date.
const FAQ: { q: string; a: string }[] = [
  { q: "What's the match format?", a: 'Warm up for 5–10 minutes. Players choose between one set, 2 sets plus a 10-point match tiebreak, best of 3 tiebreaks, or a pro set. If court time runs short, play a quick 7-point tiebreak.' },
  { q: 'Who serves first?', a: 'Toss a coin, or spin a racquet and call the logo. The winner chooses to serve, receive or pick an end.' },
  { q: 'How is the draw made?', a: "Knockouts: your first-round opponent is chosen by skill level, then zone, then preferred courts. If you've collected enough points to be in the top 8 of an event's entrants, you get a seed. A seed doesn't guarantee an easier opponent. Round robins: players are grouped by skill level, zone and preferred courts." },
  { q: 'How will I know when my next opponent is ready?', a: "We send you a WhatsApp message (or a text) with your opponent's name and number: straight away if they're decided between 8am and 4pm, otherwise at 8am the next morning. Add your WhatsApp or text number to your profile if you'd like these timely updates." },
  { q: 'When should I contact my opponent?', a: "Within 48 hours of the draw being published. If they haven't replied in 5 days, tell the organizer." },
  { q: 'Who brings the balls?', a: 'First round: both players bring a new can. The winner keeps the unopened can for their next match, and the loser keeps the opened one.' },
  { q: 'What if my opponent is late?', a: "Wait 30 minutes from the agreed time. Tap Check In when you get to the court, which records that you were there. If they still haven't shown, tell the organizer. Cancelling with less than 3 hours' notice counts as a no-show." },
  { q: "What if we can't play before the deadline?", a: "Ask the organizer for a one-week extension at least 4 days before the deadline. If a match still isn't played, the organizer may schedule it on a weekend matchday. A player who can't make it is replaced by a Lucky Loser." },
  { q: "What's a Lucky Loser?", a: 'We get no-shows. Play your match before the deadline, even if you lose, and the organizer may bring you back into the draw to fill an empty spot.' },
  { q: "What's a wildcard?", a: 'A player chosen to fill an empty slot and keep the draw moving. If an opponent is unavailable in a later round (QF, SF), the organizer can bring in a replacement.' },
  { q: 'How do line calls work?', a: 'You call the lines on your side. Call right away and loudly enough for your opponent to hear. If a ball is too close to call, replay the point if you both agree; otherwise it counts as good and the point goes to the player who hit it.' },
  { q: 'What if it rains?', a: "Don't play on wet public courts. Rearrange the match before the deadline, or ask the organizer for an extension." },
  { q: "Someone's waiting for our court.", a: "Public courts rotate every 30 minutes when there's a queue. Ask for 5 more minutes to finish a game, then rejoin the queue. Locations with 4 or more courts make it easier to finish a match." },
  { q: "What if we run out of time and can't finish?", a: "The score when your time runs out or the court changes over is the result. If it's level (e.g. 3–3) with 5–10 minutes left and people waiting, play a tiebreak to 7. Please try not to spread a match over several days." },
  { q: 'How do I report a score?', a: 'Either player taps Enter Score, picks the winner and the court, and enters the sets. It counts straight away.' },
  { q: 'How are points awarded?', a: 'Round robin: 3 for a win, 1 for a loss. Knockout: R32 1, R16 2, QF 3, SF 5, final 10, champion 20. Challenges: +3 / −3. Rallies: +2 / +1. Half your points carry into next season.' },
];

// One answer open at a time. Not the shared Accordion: it has no focus ring and a bordered card.
export const FaqSection: React.FC = () => {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <motion.section
      {...fadeUp}
      transition={{ ...fadeUp.transition, delay: 0.4 }}
      className="mt-8"
      aria-labelledby="faq-heading"
    >
      <h2 id="faq-heading" className={`${sectionHeadingCls} text-center mb-3`}>FAQ</h2>
      <div className="space-y-2">
        {FAQ.map((item, i) => {
          const isOpen = open === i;
          return (
            <div key={item.q} className="rounded-2xl bg-fg/5">
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : i)}
                aria-expanded={isOpen}
                aria-controls={`faq-${i}`}
                className="w-full min-h-11 flex items-center justify-between gap-3 px-4 py-3 text-left rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clay"
              >
                <span className="text-sm font-bold text-fg">{item.q}</span>
                <ChevronDown className={`w-4 h-4 shrink-0 text-fg/70 transition-transform ${isOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
              </button>
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    id={`faq-${i}`}
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25, ease: 'easeInOut' }}
                    className="overflow-hidden"
                  >
                    <p className="px-4 pb-4 text-sm text-fg/70">{item.a}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </motion.section>
  );
};

// ── Floating CTAs ────────────────────────────────────────────────────────────
// Sits ABOVE the bottom tab bar, which shows on the homepage like every other route below `lg`.
// `bottom-20` clears the bar's ~63px (`lg:bottom-8` once the bar is gone), and the safe-area inset is added on top so it lifts clear of the home
// indicator on a notched phone rather than sitting under it. z-40 keeps it under the bar (z-50)
// and under sheets (z-100).
//
// It is a COLUMN on purpose. Donate is coming and layers in above Subscribe — add it as the first
// child here and the spacing, safe-area inset and stacking all still hold. Portalled to <body> by
// Home.tsx: Layout's animated <main> transforms on route change, and a transformed ancestor
// re-bases `position: fixed` — the same reason Sheet and Toast portal.
// Both buttons share one width so they read as a pair.
const FLOAT_W = 'w-48 sm:w-72 !px-4 text-sm sm:text-base';

export const FloatingCtaStack: React.FC<{
  /** Hidden once a member is on the list. */
  onSubscribe?: () => void;
  /** Visitors only — members report from the hero's Submit a Report. */
  onCourtNote?: () => void;
}> = ({ onSubscribe, onCourtNote }) => (
  <div
    className="fixed right-4 bottom-20 lg:bottom-8 z-40 flex flex-col items-end gap-3"
    style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
  >
    {/* Report a court sits above Subscribe. It needs no account on purpose — a passer-by who
        spots a broken net should be able to say so. Donate lives in the support card on this
        page; the profile page is where it appears as a floating button. */}
    {onCourtNote && (
      <button
        type="button"
        onClick={onCourtNote}
        className={`${buttonCls('clay')} ${FLOAT_W} shadow-xl`}
      >
        <MapPin className="w-4 h-4 shrink-0" />
        <span>Submit a Report</span>
      </button>
    )}
    {onSubscribe && (
      <button
        type="button"
        onClick={onSubscribe}
        className={`${buttonCls('lime')} ${FLOAT_W} shadow-xl`}
      >
        <Mail className="w-4 h-4 shrink-0" />
        <span className="sm:hidden">Subscribe</span>
        <span className="hidden sm:inline">Subscribe to Newsletter</span>
      </button>
    )}
  </div>
);

// ── Newsletter sheet ─────────────────────────────────────────────────────────
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const SubscribeSheet: React.FC<{
  onClose: () => void;
  onSubscribe: (email: string) => Promise<void>;
  defaultEmail?: string;
}> = ({ onClose, onSubscribe, defaultEmail = '' }) => {
  const [email, setEmail] = useState(defaultEmail);
  const [status, setStatus] = useState<'idle' | 'saving' | 'done'>('idle');
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const address = email.trim();
    if (!EMAIL_RE.test(address)) { setError('Please enter a valid email address.'); return; }
    setError('');
    setStatus('saving');
    try {
      await onSubscribe(address);
      setStatus('done');
    } catch {
      setStatus('idle');
      setError('Could not sign you up just now. Please try again.');
    }
  };

  return (
    <Sheet onClose={onClose} title="Newsletter" maxWidthClassName="max-w-md">
      <div className="p-6 pt-3 space-y-4">
        {status === 'done' ? (
          <>
            <AlertMessage tone="success">You&apos;re on the list. See you on court.</AlertMessage>
            <Button variant="clay" className="w-full" onClick={onClose}>Done</Button>
          </>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <p className="text-sm text-fg/70">
              Stay updated with the latest tennis news, trends and learn more about the public courts of Toronto.
            </p>
            <Input
              label="Email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            {error && <AlertMessage tone="error">{error}</AlertMessage>}
            <Button
              type="submit"
              variant="lime"
              className="w-full"
              isLoading={status === 'saving'}
            >
              Subscribe
            </Button>
          </form>
        )}
      </div>
    </Sheet>
  );
};


// ── Volunteer sheet ──────────────────────────────────────────────────────────
// Always shown, member or not: unlike the newsletter, an account cannot answer which activity you
// want or what your note says. A member's email is prefilled and their uid rides along.
export const VolunteerSheet: React.FC<{
  onClose: () => void;
  onSubmit: (signup: Omit<VolunteerSignup, 'uid' | 'userName'>) => Promise<void>;
  defaultEmail?: string;
}> = ({ onClose, onSubmit, defaultEmail = '' }) => {
  const [email, setEmail] = useState(defaultEmail);
  const [activity, setActivity] = useState('');
  const [note, setNote] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'done'>('idle');
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const address = email.trim();
    if (!EMAIL_RE.test(address)) { setError('Please enter a valid email address.'); return; }
    if (!activity) { setError('Please choose an activity.'); return; }
    setError('');
    setStatus('saving');
    try {
      await onSubmit({ email: address, activity, note });
      setStatus('done');
    } catch {
      setStatus('idle');
      setError('Could not send that just now. Please try again.');
    }
  };

  return (
    <Sheet onClose={onClose} title="Volunteer with Us" maxWidthClassName="max-w-md">
      <div className="p-6 pt-3 space-y-4">
        {status === 'done' ? (
          <>
            <AlertMessage tone="success">Thank you. We&apos;ll be in touch about helping out.</AlertMessage>
            <Button variant="clay" className="w-full" onClick={onClose}>Done</Button>
          </>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <p className="text-sm text-fg/70">
              Tell us where you&apos;d like to help and we&apos;ll find you something to do.
            </p>
            <Input
              label="Email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <SelectField
              label="Activity"
              title="Where would you like to help?"
              placeholder="Choose an activity"
              options={VOLUNTEER_ACTIVITIES}
              value={activity}
              onChange={setActivity}
              required
            />
            <div className="w-full space-y-1.5">
              <label htmlFor="volunteer-note" className={fieldLabelCls}>Note</label>
              <textarea
                id="volunteer-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                maxLength={2000}
                placeholder="e.g. I'd like to help organize events, socials, etc."
                className="w-full rounded-2xl bg-tennis-surface/50 border border-fg/25 px-4 py-3 text-fg
                           placeholder-fg/70 transition-all duration-200 resize-y
                           focus:border-clay focus:ring-2 focus:ring-clay/20 outline-none"
              />
            </div>
            {error && <AlertMessage tone="error">{error}</AlertMessage>}
            <Button
              type="submit"
              variant="lime"
              className="w-full"
              isLoading={status === 'saving'}
            >
              Sign me up
            </Button>
          </form>
        )}
      </div>
    </Sheet>
  );
};
