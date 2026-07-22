import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { UserPlus, CalendarPlus, MessageCircle, Handshake, Users, Trophy, MapPin } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import MapGL, { Marker, Popup, NavigationControl } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';

import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/Button';
import { useCourtData } from './courtmap/useCourtData';
import type { CourtWithCount } from './courtmap/courtMapUtils';
import { CourtPopup } from './courtmap/CourtPopup';

const WHATSAPP_URL = 'https://chat.whatsapp.com/Bh7OVww9e08GP4TuoFF5NX';

// Explicit files — Storage rules allow read but not list, so listAll() fails; getDownloadURL
// (public read) works per-file.
const GALLERY_FILES = [
  'Group Pic 1.jpg', 'Group Pic 2.webp', 'Group Pic 3.webp', 'Group Pic 4.jpg',
  'Courts.png', 'Winners.png', 'tourney_matches.jpg',
];

// Public download URLs built directly (no getDownloadURL round-trip) so the hero can start
// loading the first photo on the very first render instead of waiting on 7 metadata calls.
// Storage rules allow public read, so the token-less `?alt=media` URL serves the file.
const STORAGE_BUCKET = import.meta.env.VITE_FIREBASE_STORAGE_BUCKET;
const GALLERY_URLS = GALLERY_FILES.map(
  (f) => `https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}/o/${encodeURIComponent(`Gallery/${f}`)}?alt=media`,
);

const plus = (n: number) => `${Math.max(0, Math.floor(n / 10) * 10)}+`;

// Shown instantly so the hero never flashes "0+". The exact live figures come from the
// script-maintained site_stats/summary doc (scripts/snapshot-ranks.mjs) and override these
// once fetched; courtsCovered is refined from live court data once it loads.
const COMMUNITY_BASELINE = { activePlayers: 110, matchesOrganized: 175, courtsCovered: 40 };

// Landing map opens focused on downtown Toronto (not the whole GTA).
const DOWNTOWN_VIEW = { longitude: -79.385, latitude: 43.66, zoom: 11 };

// Landing map marker: a single green dot per active court (registered users) — no
// program/public-hours colours, so the map reads as one colour.
const greenMarkerHtml = (count: number) => {
  const big = count >= 10;
  const s = big ? 30 : 20;
  const r = s / 2;
  const fs = big ? 8 : 10;
  return `<svg width="${s}" height="${s}" xmlns="http://www.w3.org/2000/svg">
    <circle cx="${r}" cy="${r}" r="${r}" fill="#15803d" opacity="0.95"/>
    <text x="${r}" y="${r}" dominant-baseline="central" text-anchor="middle" fill="white" font-size="${fs}" font-family="sans-serif" font-weight="bold">${count}</text>
  </svg>`;
};

const HOW_IT_WORKS: { icon: React.ComponentType<{ className?: string }>; title: string; desc: string; href?: string }[] = [
  { icon: UserPlus, title: 'Create your profile', desc: 'Tell us your skill level, preferred courts and availability.' },
  { icon: CalendarPlus, title: 'Join an event', desc: 'Pick a league or event that fits your level and schedule.' },
  { icon: MessageCircle, title: 'Join the WhatsApp community', desc: 'Stay in the loop and find hitting partners.', href: WHATSAPP_URL },
  { icon: Handshake, title: 'Connect & schedule', desc: 'Meet other members and arrange your matches.' },
];

export const Home: React.FC = () => {
  const { user } = useAuth();

  const [slide, setSlide] = useState(0);
  // How many hero photos are mounted. Starts at 1 so the FIRST image downloads alone (full
  // bandwidth → fastest first paint); grows to keep the current + next image ready, never shrinks.
  const [mountCount, setMountCount] = useState(1);
  const [activePlayers, setActivePlayers] = useState(COMMUNITY_BASELINE.activePlayers);
  const [matchesOrganized, setMatchesOrganized] = useState(COMMUNITY_BASELINE.matchesOrganized);
  const [selectedCourt, setSelectedCourt] = useState<CourtWithCount | null>(null);

  const { courts } = useCourtData();

  useEffect(() => { document.title = 'Racquets & Strings'; }, []);

  useEffect(() => {
    const t = setInterval(() => setSlide((s) => (s + 1) % GALLERY_URLS.length), 5000);
    return () => clearInterval(t);
  }, []);

  // Mount the current + next photo (so the upcoming one is preloaded for a smooth crossfade),
  // and keep everything already mounted so the wrap-around from the last slide to the first
  // still crossfades instead of hard-cutting.
  useEffect(() => {
    setMountCount((c) => Math.min(GALLERY_URLS.length, Math.max(c, slide + 2)));
  }, [slide]);

  // Live community stats. Active Players = distinct users who joined an event OR played a match.
  // `event_participants`/`tournament_matches` aren't world-readable, so the exact figures are
  // precomputed into the public `site_stats/summary` doc (by scripts/snapshot-ranks.mjs). We seed
  // the counters with a sensible baseline (above) so the hero shows real numbers instantly and
  // never flashes 0; the fetched doc refines them. If the doc/rule isn't deployed the baseline stays.
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

  // Refined from live court data once it loads; falls back to the baseline so it never shows 0.
  const courtsCovered = useMemo(() => {
    const n = courts.filter((c) => c.count >= 1).length;
    return n > 0 ? n : COMMUNITY_BASELINE.courtsCovered;
  }, [courts]);

  // Courts with 5+ active players, for the landing map.
  const activeCourts = useMemo(
    () => courts.filter((c) => c.count >= 5 && Number.isFinite(c.lat) && Number.isFinite(c.lng)),
    [courts],
  );

  return (
    <div className="pb-4">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative min-h-[72vh] flex items-center overflow-hidden">
        {/* Background layer at z-0 (NOT negative z-index). A negative z-index escapes into
            ancestor stacking contexts — the page-transition transform on <main> plus the body's
            propagated background pushed the whole photo layer *behind* the page backdrop, so the
            hero rendered as flat green. z-0 here + z-10 on the content keeps ordering local. */}
        <div className="absolute inset-0 z-0">
          {/* Base layer shown before the first photo loads. */}
          <div className="absolute inset-0 bg-tennis-dark" />
          {/* Only mounted photos (current + next, growing) are downloaded — avoids all 7 huge
              images competing for bandwidth. Stacked; only the active one fades to opacity 1. A
              plain CSS crossfade (not AnimatePresence) so exactly one is ever visible. */}
          {GALLERY_URLS.slice(0, mountCount).map((src, i) => (
            <img
              key={src}
              src={src}
              alt=""
              referrerPolicy="no-referrer"
              loading="eager"
              decoding="async"
              fetchPriority={i === 0 ? 'high' : 'auto'}
              className="absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ease-in-out"
              style={{ opacity: i === slide ? 1 : 0 }}
            />
          ))}
          {/* Uniform darken across the whole photo (not just the left) so brightness reads
              consistently edge to edge, while still keeping the white headline text legible. */}
          <div className="absolute inset-0 bg-black/20" />
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full relative z-10">
          <motion.div
            initial={{ opacity: 0, x: -40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7, ease: 'easeOut' }}
            className="max-w-2xl"
          >
            <h1 className="text-xl sm:text-3xl md:text-4xl font-display font-black text-white leading-[1.35] mb-4">
              Master your <span className="text-clay">Serve</span><br /><span className="text-clay">Compete</span> Weekly<br />Climb the <span className="text-clay">Leaderboard</span>
            </h1>
            <p className="text-white/85 text-sm md:text-lg leading-relaxed max-w-lg mb-7 font-bold">
              Participate in events, complete tasks and help us make tennis accessible to everyone.
            </p>

            <div className="flex flex-row gap-2 sm:gap-3 mb-10">
              {!user && (
                <Link to="/signup?returnTo=%2Fevents&intent=join-league">
                  <Button size="sm" className="sm:px-8 sm:py-3.5 sm:text-lg">Join the Community</Button>
                </Link>
              )}
              <Link to="/events">
                <Button variant={user ? 'primary' : 'outline'} size="sm" className="sm:px-8 sm:py-3.5 sm:text-lg">
                  Explore Events
                </Button>
              </Link>
            </div>

            <div className="grid grid-cols-3 gap-3 sm:gap-6 max-w-lg">
              {[
                { icon: Users, value: plus(activePlayers), label: 'Active Players' },
                { icon: Trophy, value: plus(matchesOrganized), label: 'Matches Organized' },
                { icon: MapPin, value: plus(courtsCovered), label: 'Courts Covered' },
              ].map((s) => (
                <div key={s.label} className="flex flex-col">
                  <div className="flex items-center gap-1.5 text-clay mb-1">
                    <s.icon className="w-4 h-4 shrink-0" />
                    <span className="text-2xl sm:text-3xl font-black text-white">{s.value}</span>
                  </div>
                  <span className="text-[11px] sm:text-xs text-white/60 font-medium">{s.label}</span>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-16">
        <h2 className="text-2xl md:text-3xl font-display font-bold text-white text-center mb-8">How it works</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {HOW_IT_WORKS.map((step, i) => {
            const inner = (
              <>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-clay/15 border border-clay/30 flex items-center justify-center shrink-0">
                    <step.icon className="w-5 h-5 text-clay" />
                  </div>
                  <span className="text-white/30 font-black text-lg">{i + 1}</span>
                </div>
                <h3 className="text-white font-bold mb-1.5">{step.title}</h3>
                <p className="text-white/60 text-sm leading-relaxed">{step.desc}</p>
              </>
            );
            const cls = 'p-5 rounded-2xl bg-tennis-surface/30 border border-white/5 h-full block';
            // Members-only links (e.g. WhatsApp community) render as a plain, non-clickable
            // card for logged-out visitors — no link is exposed until they're signed in.
            return step.href && user ? (
              <a key={i} href={step.href} target="_blank" rel="noopener noreferrer" className={`${cls} hover:border-clay/30 transition-colors`}>
                {inner}
              </a>
            ) : (
              <div key={i} className={cls}>{inner}</div>
            );
          })}
        </div>
      </section>

      {/* ── Active courts ────────────────────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-16">
        <div className="flex items-center justify-between mb-4 gap-4">
          <h2 className="text-2xl md:text-3xl font-display font-bold text-white">Active Tennis Courts in Our Community</h2>
          <Link to="/courts" className="shrink-0">
            <Button variant="outline" size="sm">View All Courts</Button>
          </Link>
        </div>

        <div className="h-[380px] md:h-[440px] rounded-3xl overflow-hidden border border-white/10 relative">
          <MapGL
            initialViewState={{ longitude: DOWNTOWN_VIEW.longitude, latitude: DOWNTOWN_VIEW.latitude, zoom: DOWNTOWN_VIEW.zoom }}
            style={{ width: '100%', height: '100%' }}
            mapStyle="https://tiles.openfreemap.org/styles/liberty"
            onClick={() => setSelectedCourt(null)}
          >
            <NavigationControl position="top-right" />
            {activeCourts.map((court, i) => (
              <Marker key={i} longitude={court.lng} latitude={court.lat} anchor="center">
                <div
                  dangerouslySetInnerHTML={{ __html: greenMarkerHtml(court.count) }}
                  onClick={(e) => { e.stopPropagation(); setSelectedCourt(court); }}
                  style={{ cursor: 'pointer' }}
                />
              </Marker>
            ))}
            {selectedCourt && (
              <Popup
                longitude={selectedCourt.lng}
                latitude={selectedCourt.lat}
                onClose={() => setSelectedCourt(null)}
                closeButton anchor="bottom" maxWidth="280px"
              >
                <CourtPopup court={selectedCourt} />
              </Popup>
            )}
          </MapGL>
        </div>
      </section>
    </div>
  );
};
