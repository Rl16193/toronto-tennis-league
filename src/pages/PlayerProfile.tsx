import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { ArrowLeft, Calendar, Mail, MapPin, Phone, Star } from 'lucide-react';
import { db } from '../lib/firebase';
import { Button } from '../components/Button';
import { TennisEvent, UserData, UserPreferences, UserStats } from '../types';
import { DAY_CODES, DAY_LABELS, getAvailabilityGrid, type TimeSlot } from '../utils/availability';

const skillTier = (skill: number) => (skill < 3 ? 'Beginner' : skill < 4 ? 'Challenger' : 'Masters');

// lucide has no racquet — small inline glyph (matches the own Profile Card).
const RacquetIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <ellipse cx="9" cy="9" rx="6" ry="7" />
    <path d="M13.5 14 20 20.5" />
    <path d="M6 9h6M9 5v8" />
  </svg>
);

const SectionLabel: React.FC<{ icon?: React.ReactNode; label: string }> = ({ icon, label }) => (
  <span className="text-xs font-bold text-white/50 uppercase tracking-widest flex items-center gap-1.5">{icon}{label}</span>
);

const Pill: React.FC<{ label: string }> = ({ label }) => (
  <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-white/5 text-white/70 border border-white/10">{label}</span>
);

// Read-only view of another player's profile — mirrors the user's own profile page
// (vertical, centred Profile Card + match stats + availability) with no edit controls.
export const PlayerProfile: React.FC = () => {
  const { userId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const eventId = searchParams.get('event') || null;

  const [player, setPlayer] = useState<UserData | null>(null);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [organizer, setOrganizer] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { document.title = 'Player Profile — Racquets & Strings'; }, []);

  useEffect(() => {
    const loadPlayer = async () => {
      if (!userId) return;
      setLoading(true);
      try {
        const [userDoc, statsDoc, prefsDoc] = await Promise.all([
          getDoc(doc(db, 'users', userId)),
          getDoc(doc(db, 'stats', userId)),
          getDoc(doc(db, 'preferences', userId)),
        ]);

        const playerData = userDoc.exists() ? (userDoc.data() as UserData) : null;
        setPlayer(playerData);
        if (playerData?.name) document.title = `${playerData.name} — Racquets & Strings`;
        setStats(statsDoc.exists() ? (statsDoc.data() as UserStats) : null);
        setPreferences(prefsDoc.exists() ? (prefsDoc.data() as UserPreferences) : null);

        // Load organizer from the event's creator_id
        if (eventId) {
          const eventDoc = await getDoc(doc(db, 'events', eventId));
          if (eventDoc.exists()) {
            const eventData = eventDoc.data() as TennisEvent;
            if (eventData.creator_id) {
              const creatorDoc = await getDoc(doc(db, 'users', eventData.creator_id));
              if (creatorDoc.exists()) setOrganizer(creatorDoc.data() as UserData);
            }
          }
        }
      } finally {
        setLoading(false);
      }
    };

    loadPlayer();
  }, [userId]);

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="w-14 h-14 border-4 border-clay border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!player) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
        <h1 className="text-3xl font-black text-white mb-3">Player Not Found</h1>
        <p className="text-white mb-6">This player profile is not available.</p>
        <Button variant="outline" onClick={() => navigate('/tournament')}>Back to Tournament</Button>
      </div>
    );
  }

  const initial = (player.name || player.email || '?').trim().charAt(0).toUpperCase();
  const contact = player.phone || player.email || '';
  const courts = preferences?.preferred_courts ?? [];
  const favourites = preferences?.favourite_players ?? [];
  const availGrid = getAvailabilityGrid(preferences);
  const hasAvailability = Object.keys(availGrid).length > 0;

  const s = stats as (UserStats & { matchesPlayed?: number; wins?: number; loses?: number; pointswon?: number; totalPointsPlayed?: number }) | null;
  const pwPct = s && (s.totalPointsPlayed ?? 0) > 0 ? `${Math.round((s.pointswon! / s.totalPointsPlayed!) * 100)}%` : '—';
  const statTiles = [
    { label: 'Streak (W–L)', value: `${s?.wins ?? 0}–${s?.loses ?? 0}`, accent: 'text-white' },
    { label: 'PW %', value: pwPct, accent: 'text-clay' },
    { label: 'MP', value: `${s?.matchesPlayed ?? 0}`, accent: 'text-white' },
  ];

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 pb-20 pt-8 space-y-4">
      <Button variant="ghost" size="sm" onClick={() => navigate('/tournament')} className="px-2">
        <ArrowLeft className="w-4 h-4 mr-1.5" />Back to Tournament
      </Button>

      {/* Profile Card — read-only mirror of ProfileInfo */}
      <div className="rounded-[2.5rem] border border-white/5 bg-tennis-surface/30 shadow-xl p-5 sm:p-7">
        <h2 className="text-xl font-bold text-white mb-5">Profile Card</h2>

        <div className="flex flex-col items-center gap-4 pb-5 border-b border-white/5">
          <div className="w-24 h-24 rounded-full bg-tennis-surface flex items-center justify-center overflow-hidden border border-white/10">
            {player.avatar
              ? <img src={player.avatar} alt={player.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              : <span className="text-4xl font-black text-white/80">{initial}</span>}
          </div>
        </div>

        <div className="divide-y divide-white/5">
          <div className="py-3">
            <SectionLabel label="Name" />
            <p className="text-lg font-bold text-white mt-0.5">{player.name || '—'}</p>
          </div>

          <div className="py-3">
            <SectionLabel label="Contact" />
            <p className="text-lg font-bold text-white mt-0.5 break-all">{contact || '—'}</p>
          </div>

          <div className="py-3">
            <SectionLabel label="Bio" />
            <p className="text-sm text-white/70 mt-0.5">
              {player.bio?.trim() || <span className="text-white/40">No bio yet.</span>}
            </p>
          </div>

          <div className="py-3">
            <SectionLabel icon={<RacquetIcon className="w-3.5 h-3.5 text-clay" />} label="Skill Level" />
            {stats ? (
              <div className="mt-1 flex items-center gap-2">
                <span className="text-lg font-bold text-white">NTRP {stats.skill_level}</span>
                <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-500/15 text-amber-300 border border-amber-500/25">
                  {skillTier(stats.skill_level)}
                </span>
              </div>
            ) : <p className="text-sm text-white/40 mt-1">Not set.</p>}
          </div>

          <div className="py-3">
            <SectionLabel icon={<MapPin className="w-3.5 h-3.5 text-clay" />} label="Preferred Courts" />
            <div className="mt-1 flex flex-wrap gap-1.5">
              {courts.length > 0 ? courts.map((c) => <Pill key={c} label={c} />) : <span className="text-sm text-white/40">None set.</span>}
            </div>
          </div>

          <div className="py-3">
            <SectionLabel icon={<Star className="w-3.5 h-3.5 text-clay" />} label="Favourite Players" />
            <div className="mt-1 flex flex-wrap gap-1.5">
              {favourites.length > 0 ? favourites.map((p) => <Pill key={p} label={p} />) : <span className="text-sm text-white/40">None set.</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Match Stats — read-only mirror of ProfileStats */}
      <div className="bg-tennis-surface/30 border border-white/5 rounded-[2.5rem] shadow-xl p-6">
        <h2 className="text-lg font-bold text-white flex items-center mb-4">
          <Star className="w-5 h-5 mr-2 text-clay" />Match Stats
        </h2>
        <div className="grid grid-cols-3 gap-3">
          {statTiles.map((t) => (
            <div key={t.label} className="rounded-2xl bg-white/[0.03] border border-white/5 px-3 py-4 text-center">
              <p className={`text-2xl font-black ${t.accent}`}>{t.value}</p>
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/40 mt-1">{t.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Availability — read-only mirror of ProfileAvailability */}
      {hasAvailability && (
        <div className="rounded-[2.5rem] border border-white/5 bg-tennis-surface/30 shadow-xl p-6">
          <h2 className="text-lg font-bold text-white flex items-center gap-2 mb-4">
            <Calendar className="w-5 h-5 text-clay" />Availability
          </h2>
          <div className="grid grid-cols-[1fr_auto_auto] gap-x-6 gap-y-1 items-center">
            <span />
            <span className="text-[10px] font-bold uppercase tracking-widest text-white/40 text-center w-10">AM</span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-white/40 text-center w-10">PM</span>
            {DAY_CODES.map((d) => (
              <React.Fragment key={d}>
                <span className="text-sm text-white/80 py-1.5">{DAY_LABELS[d]}</span>
                {(['AM', 'PM'] as TimeSlot[]).map((slot) => {
                  const on = (availGrid[d] ?? []).includes(slot);
                  return (
                    <div key={slot} className="flex justify-center">
                      <div className={`w-5 h-5 rounded flex items-center justify-center border ${on ? 'bg-clay border-clay' : 'bg-white/5 border-white/15'}`}>
                        {on && <span className="text-white text-[10px]">✓</span>}
                      </div>
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        </div>
      )}

      {organizer && (
        <div className="rounded-[2.5rem] bg-tennis-surface/30 border border-white/5 shadow-xl p-6">
          <h2 className="text-base font-black text-white mb-3">Contact organizer if you require any assistance</h2>
          <div className="flex flex-wrap gap-6">
            {organizer.email && (
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-clay shrink-0" />
                <span className="text-white font-semibold break-all">{organizer.email}</span>
              </div>
            )}
            {organizer.phone && (
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-clay shrink-0" />
                <span className="text-white font-semibold">{organizer.phone}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
