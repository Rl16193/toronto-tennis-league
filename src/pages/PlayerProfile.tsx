import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { ArrowLeft, Award, Mail, MapPin, Phone, Star, Users } from 'lucide-react';
import { motion } from 'motion/react';
import { fadeUp, staggerDelay } from '../lib/motion';
import { db } from '../lib/firebase';
import { Button } from '../components/Button';
import { RacquetIcon } from '../components/RacquetIcon';
import { TennisEvent, UserData, UserPreferences, UserStats } from '../types';
import type { TournamentMatch } from './tournament/types';
import { BadgeRow } from '../features/tasks/BadgeRow';
import { useCommunityStandings } from '../features/tasks/useTasks';
import { skillTier, leagueDivision, leagueAgeCategory } from '../utils/skillLevels';

// Furthest-round derivation for Best Finish / Best Result from a player's tournament matches.
const ROUND_ORDER = ['R64', 'R32', 'R16', 'QF', 'SF', 'F'];
const ROUND_LABEL: Record<string, string> = {
  R64: 'Round of 64', R32: 'Round of 32', R16: 'Round of 16', QF: 'Quarterfinal', SF: 'Semifinal', F: 'Final',
};

const deriveResults = (mine: TournamentMatch[], uid: string) => {
  const completed = mine
    .filter((m) => m.status === 'complete' && m.winner_user_id)
    .sort((a, b) => (Date.parse(b.completed_at || '') || 0) - (Date.parse(a.completed_at || '') || 0));

  let streak = '—';
  if (completed.length) {
    const firstWon = completed[0].winner_user_id === uid;
    let n = 0;
    for (const m of completed) { if ((m.winner_user_id === uid) !== firstWon) break; n += 1; }
    streak = `${n}${firstWon ? 'W' : 'L'}`;
  }

  let bestIdx = -1;
  let wonFinal = false;
  for (const m of mine) {
    const idx = ROUND_ORDER.indexOf(m.round);
    if (idx < 0) continue;
    if (idx > bestIdx) bestIdx = idx;
    if (m.round === 'F' && m.status === 'complete' && m.winner_user_id === uid) wonFinal = true;
  }
  const bestFinish = bestIdx >= 0 ? ROUND_LABEL[ROUND_ORDER[bestIdx]] : '—';
  let bestResult = '—';
  if (wonFinal) bestResult = 'Champion';
  else if (bestIdx >= 0) {
    const r = ROUND_ORDER[bestIdx];
    bestResult = r === 'F' ? 'Finalist' : r === 'SF' ? 'Semifinalist' : r === 'QF' ? 'Quarterfinalist' : ROUND_LABEL[r];
  }
  return { streak, bestFinish, bestResult };
};

const SectionLabel: React.FC<{ icon?: React.ReactNode; label: string }> = ({ icon, label }) => (
  <span className="text-xs font-bold text-fg/50 uppercase tracking-widest flex items-center gap-1.5">{icon}{label}</span>
);

const Pill: React.FC<{ label: string }> = ({ label }) => (
  <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-fg/5 text-fg/70 border border-fg/10">{label}</span>
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
  const [results, setResults] = useState({ streak: '—', bestFinish: '—', bestResult: '—' });
  const { rows: communityRows } = useCommunityStandings();
  const rsPoints = userId ? (communityRows.find((r) => r.user_id === userId)?.points ?? 0) : 0;

  useEffect(() => { document.title = 'Player Profile — Racquets & Strings'; }, []);

  useEffect(() => {
    const loadPlayer = async () => {
      setLoading(true);
      if (!userId) { setLoading(false); return; }
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

        // Derive Streak / Best Finish / Best Result from this player's tournament matches.
        try {
          const [m1, m2] = await Promise.all([
            getDocs(query(collection(db, 'tournament_matches'), where('player_1_user_id', '==', userId))),
            getDocs(query(collection(db, 'tournament_matches'), where('player_2_user_id', '==', userId))),
          ]);
          const byId = new Map<string, TournamentMatch>();
          [...m1.docs, ...m2.docs].forEach((d) => byId.set(d.id, { id: d.id, ...d.data() } as TournamentMatch));
          setResults(deriveResults([...byId.values()], userId));
        } catch { setResults({ streak: '—', bestFinish: '—', bestResult: '—' }); }

        // Reset before resolving — otherwise a previous player's organizer can keep showing
        // if this player has no event/organizer to resolve (switching :userId doesn't remount).
        setOrganizer(null);
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
  }, [userId, eventId]);

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
        <h1 className="text-3xl font-black text-fg mb-3">Player Not Found</h1>
        <p className="text-fg mb-6">This player profile is not available.</p>
        <Button variant="outline" onClick={() => navigate('/matches?mode=tournament')}>Back to Tournament</Button>
      </div>
    );
  }

  const initial = (player.name || player.email || '?').trim().charAt(0).toUpperCase();
  const contact = player.phone || player.email || '';
  const courts = preferences?.preferred_courts ?? [];
  const favourites = preferences?.favourite_players ?? [];

  const s = stats as (UserStats & { matchesPlayed?: number; leaguePoints26?: number }) | null;
  const statTiles = [
    { label: 'Streak', value: results.streak, accent: 'text-clay' },
    { label: 'RS Points', value: `${rsPoints}`, accent: 'text-fg' },
    { label: 'League Points', value: `${s?.leaguePoints26 ?? 0}`, accent: 'text-fg' },
    { label: 'Matches', value: `${s?.matchesPlayed ?? 0}`, accent: 'text-fg' },
    { label: 'Best Finish', value: results.bestFinish, accent: 'text-fg' },
    { label: 'Best Result', value: results.bestResult, accent: 'text-fg' },
  ];

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 pb-20 pt-8 space-y-4">
      <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="px-2">
        <ArrowLeft className="w-4 h-4 mr-1.5" />Back
      </Button>

      {/* Profile Card — read-only mirror of ProfileInfo */}
      <div className="rounded-[2.5rem] border border-fg/5 bg-tennis-surface/30 shadow-xl p-5 sm:p-7">
        <h2 className="text-xl font-bold text-fg mb-5">Profile Card</h2>

        <div className="flex flex-col items-center gap-4 pb-5 border-b border-fg/5">
          <div className="w-24 h-24 rounded-full bg-tennis-surface flex items-center justify-center overflow-hidden border border-fg/10">
            {player.avatar
              ? <img src={player.avatar} alt={player.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              : <span className="text-4xl font-black text-fg/80">{initial}</span>}
          </div>
        </div>

        <div className="divide-y divide-white/5">
          <div className="py-3">
            <SectionLabel label="Name" />
            <p className="text-lg font-bold text-fg mt-0.5">
              {player.name || '—'}
            </p>
          </div>

          <div className="py-3">
            <SectionLabel label="Contact" />
            <p className="text-lg font-bold text-fg mt-0.5 break-all">{contact || '—'}</p>
          </div>

          <div className="py-3">
            <SectionLabel label="Bio" />
            <p className="text-sm text-fg/70 mt-0.5">
              {player.bio?.trim() || <span className="text-fg/40">No bio yet.</span>}
            </p>
          </div>

          <div className="py-3">
            <SectionLabel icon={<RacquetIcon className="w-3.5 h-3.5 text-clay" />} label="Skill Level" />
            {stats ? (
              <div className="mt-1 flex items-center gap-2">
                <span className="text-lg font-bold text-fg">NTRP {stats.skill_level}</span>
              </div>
            ) : <p className="text-sm text-fg/40 mt-1">Not set.</p>}
          </div>

          <div className="py-3">
            <SectionLabel icon={<Award className="w-3.5 h-3.5 text-clay" />} label="Badges" />
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {stats && (
                <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-500/15 text-badge border border-amber-500/25">
                  {skillTier(stats.skill_level)}
                </span>
              )}
              <BadgeRow ids={player.display_badges} />
            </div>
          </div>

          {/* League — only when the player opted in ("Make visible to others"). */}
          {player.profile_details_visible && leagueDivision(stats?.league) && (
            <div className="py-3">
              <SectionLabel icon={<Users className="w-3.5 h-3.5 text-clay" />} label="League" />
              <div className="mt-1 flex flex-wrap gap-1.5">
                <Pill label={`${leagueDivision(stats?.league)} League`} />
                {leagueAgeCategory(stats?.league) && <Pill label={leagueAgeCategory(stats?.league)} />}
              </div>
            </div>
          )}

          <div className="py-3">
            <SectionLabel icon={<MapPin className="w-3.5 h-3.5 text-clay" />} label="Preferred Courts" />
            <div className="mt-1 flex flex-wrap gap-1.5">
              {courts.length > 0 ? courts.map((c) => <Pill key={c} label={c} />) : <span className="text-sm text-fg/40">None set.</span>}
            </div>
          </div>

          <div className="py-3">
            <SectionLabel icon={<Star className="w-3.5 h-3.5 text-clay" />} label="Favourite Players" />
            <div className="mt-1 flex flex-wrap gap-1.5">
              {favourites.length > 0 ? favourites.map((p) => <Pill key={p} label={p} />) : <span className="text-sm text-fg/40">None set.</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Match Stats — read-only mirror of ProfileStats */}
      <div className="bg-tennis-surface/30 border border-fg/5 rounded-[2.5rem] shadow-xl p-6">
        <h2 className="text-lg font-bold text-fg flex items-center mb-4">
          <Star className="w-5 h-5 mr-2 text-clay" />Match Stats
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {statTiles.map((t, i) => (
            <motion.div key={t.label} {...fadeUp} transition={{ ...fadeUp.transition, delay: staggerDelay(i) }} className="rounded-2xl bg-white/[0.03] border border-fg/5 px-3 py-4 text-center">
              <p className={`text-2xl font-black ${t.accent}`}>{t.value}</p>
              <p className="text-[10px] font-bold uppercase tracking-widest text-fg/40 mt-1">{t.label}</p>
            </motion.div>
          ))}
        </div>
      </div>

      {organizer && (
        <div className="rounded-[2.5rem] bg-tennis-surface/30 border border-fg/5 shadow-xl p-6">
          <h2 className="text-base font-black text-fg mb-3">Contact organizer if you require any assistance</h2>
          <div className="flex flex-wrap gap-6">
            {organizer.email && (
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-clay shrink-0" />
                <span className="text-fg font-semibold break-all">{organizer.email}</span>
              </div>
            )}
            {organizer.phone && (
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-clay shrink-0" />
                <span className="text-fg font-semibold">{organizer.phone}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
