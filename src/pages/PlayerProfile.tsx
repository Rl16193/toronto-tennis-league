import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { ArrowLeft, Award, Mail, MapPin, Phone, Star, Users } from 'lucide-react';
import { motion } from 'motion/react';
import { fadeUp, staggerDelay } from '../lib/motion';
import { db } from '../lib/firebase';
import { Button } from '../components/Button';
import { RacquetIcon } from '../components/RacquetIcon';
import { MemberInfo, UserPreferences, UserStats } from '../types';
import type { TournamentMatch } from './tournament/types';
import { BadgeRow } from '../features/tasks/BadgeRow';
import { useCommunityStandings } from '../features/tasks/useTasks';
import { leagueDivision, leagueAgeCategory } from '../utils/skillLevels';
import { skillBand } from '../features/tournament/domain/placement';
import { contactChannels, pillButtonCls } from '../components/ContactOpponentButton';
import {
  normalizeContactData,
  normalizeEvent,
  normalizeTournamentMatch,
  normalizeUserData,
  normalizeUserPreferences,
  normalizeUserStats,
} from '../lib/firestoreNormalization';

// Furthest-round derivation for Best Finish / Best Result from a player's tournament matches.
const ROUND_ORDER = ['R64', 'R32', 'R16', 'QF', 'SF', 'F'];
const ROUND_LABEL: Record<string, string> = {
  R64: 'Round of 64',
  R32: 'Round of 32',
  R16: 'Round of 16',
  QF: 'Quarterfinal',
  SF: 'Semifinal',
  F: 'Final',
};

const deriveResults = (mine: TournamentMatch[], uid: string) => {
  const completed = mine
    .filter((m) => m.status === 'complete' && m.winner_uid)
    .sort((a, b) => (Date.parse(b.completed_at || '') || 0) - (Date.parse(a.completed_at || '') || 0));

  let streak = '—';
  if (completed.length) {
    const firstWon = completed[0].winner_uid === uid;
    let n = 0;
    for (const m of completed) {
      if ((m.winner_uid === uid) !== firstWon) break;
      n += 1;
    }
    streak = `${n}${firstWon ? 'W' : 'L'}`;
  }

  let bestIdx = -1;
  let wonFinal = false;
  for (const m of mine) {
    const idx = ROUND_ORDER.indexOf(m.round);
    if (idx < 0) continue;
    if (idx > bestIdx) bestIdx = idx;
    if (m.round === 'F' && m.status === 'complete' && m.winner_uid === uid) wonFinal = true;
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
  <span className="text-xs font-bold text-fg/70 uppercase tracking-widest flex items-center gap-1.5">
    {icon}
    {label}
  </span>
);

const Pill: React.FC<{ label: string }> = ({ label }) => (
  <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-fg/5 text-fg/70">{label}</span>
);

// Read-only view of another player's profile — mirrors the user's own profile page
// (vertical, centred Profile Card + match stats + availability) with no edit controls.
export const PlayerProfile: React.FC = () => {
  const { userId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const eventId = searchParams.get('event') || null;

  const [player, setPlayer] = useState<MemberInfo | null>(null);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [organizer, setOrganizer] = useState<MemberInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [results, setResults] = useState({ streak: '—', bestFinish: '—', bestResult: '—' });
  const { rows: communityRows } = useCommunityStandings();
  const rsPoints = userId ? (communityRows.find((r) => r.uid === userId)?.points ?? 0) : 0;

  useEffect(() => {
    document.title = 'Player Profile · Racquets & Strings';
  }, []);

  useEffect(() => {
    const loadPlayer = async () => {
      setLoading(true);
      if (!userId) {
        setLoading(false);
        return;
      }
      try {
        // Contact details are a separate, sign-in-gated doc. A signed-out visitor still sees the
        // public card (name, badges, stats) — the contacts read just fails and resolves to null.
        const [userDoc, statsDoc, prefsDoc, contactsDoc] = await Promise.all([
          getDoc(doc(db, 'users', userId)),
          getDoc(doc(db, 'stats', userId)),
          getDoc(doc(db, 'preferences', userId)),
          getDoc(doc(db, 'contacts', userId)).catch(() => null),
        ]);

        const playerData = userDoc.exists()
          ? {
              ...normalizeUserData(userDoc.data()),
              ...(contactsDoc?.exists() ? normalizeContactData(contactsDoc.data()) : {}),
            }
          : null;
        setPlayer(playerData);
        if (playerData?.name) document.title = `${playerData.name} · Racquets & Strings`;
        setStats(statsDoc.exists() ? normalizeUserStats(statsDoc.data()) : null);
        setPreferences(prefsDoc.exists() ? normalizeUserPreferences(prefsDoc.data()) : null);

        // Derive Streak / Best Finish / Best Result from this player's tournament matches.
        try {
          const [m1, m2] = await Promise.all([
            getDocs(query(collection(db, 'matches'), where('player_1_uid', '==', userId))),
            getDocs(query(collection(db, 'matches'), where('player_2_uid', '==', userId))),
          ]);
          const byId = new Map<string, TournamentMatch>();
          [...m1.docs, ...m2.docs].forEach((d) => {
            const match = normalizeTournamentMatch(d.id, d.data());
            if (match) byId.set(d.id, match);
          });
          setResults(deriveResults([...byId.values()], userId));
        } catch {
          setResults({ streak: '—', bestFinish: '—', bestResult: '—' });
        }

        // Reset before resolving — otherwise a previous player's organizer can keep showing
        // if this player has no event/organizer to resolve (switching :userId doesn't remount).
        setOrganizer(null);
        if (eventId) {
          const eventDoc = await getDoc(doc(db, 'events', eventId));
          if (eventDoc.exists()) {
            const eventData = normalizeEvent(eventDoc.id, eventDoc.data());
            if (eventData.creator_id) {
              const [creatorDoc, creatorContacts] = await Promise.all([
                getDoc(doc(db, 'users', eventData.creator_id)),
                getDoc(doc(db, 'contacts', eventData.creator_id)).catch(() => null),
              ]);
              if (creatorDoc.exists()) {
                setOrganizer({
                  ...normalizeUserData(creatorDoc.data()),
                  ...(creatorContacts?.exists() ? normalizeContactData(creatorContacts.data()) : {}),
                });
              }
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
        <Button variant="outline" onClick={() => navigate('/matches?mode=tournament')}>
          Back to Tournament
        </Button>
      </div>
    );
  }

  const initial = (player.name || player.email || '?').trim().charAt(0).toUpperCase();
  // Empty unless the rules let this viewer read the player's `contacts` doc — i.e. unless they
  // are opponents. `player` merges users + contacts, so a refused read simply leaves these unset.
  const channels = contactChannels({
    phone: player.phone,
    email: player.email,
    whatsappContact: player.whatsapp_contact,
    preferred: player.preferred_mode_of_contact,
  });
  const courts = preferences?.preferred_courts ?? [];
  const favourites = preferences?.favourite_players ?? [];

  const s = stats as (UserStats & { matchesPlayed?: number; leaguePoints26?: number }) | null;
  const statTiles = [
    { label: 'Streak', value: results.streak, accent: 'text-clay-fg' },
    { label: 'RS Points', value: `${rsPoints}`, accent: 'text-fg' },
    { label: 'League Points', value: `${s?.leaguePoints26 ?? 0}`, accent: 'text-fg' },
    { label: 'Matches', value: `${s?.matchesPlayed ?? 0}`, accent: 'text-fg' },
    { label: 'Best Finish', value: results.bestFinish, accent: 'text-fg' },
    { label: 'Best Result', value: results.bestResult, accent: 'text-fg' },
  ];

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 pb-20 pt-8 space-y-4">
      <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="px-2">
        <ArrowLeft className="w-4 h-4 mr-1.5" />
        Back
      </Button>

      {/* Profile Card — read-only mirror of ProfileInfo */}
      <div className="rounded-[2.5rem] bg-tennis-surface/30 shadow-xl p-5 sm:p-7">
        <h2 className="text-xl font-bold text-fg mb-5">Profile Card</h2>

        <div className="flex flex-col items-center gap-4 pb-5 border-b border-fg/5">
          <div className="w-24 h-24 rounded-full bg-tennis-surface flex items-center justify-center overflow-hidden">
            {player.avatar ? (
              <img
                src={player.avatar}
                alt={player.name}
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <span className="text-4xl font-black text-fg">{initial}</span>
            )}
          </div>
        </div>

        <div className="divide-y divide-white/5">
          <div className="py-3">
            <SectionLabel label="Name" />
            <p className="text-lg font-bold text-fg mt-0.5">{player.name || '—'}</p>
          </div>

          {/* Three channel buttons rather than the raw number/address printed on screen. The app
              deliberately carries no messaging of its own, so contact details are shared — but
              only with someone you're actually arranging a game with. A non-opponent's `contacts`
              read is refused by the rules, so `channels` comes back empty and this row says so
              instead of leaking anything. */}
          <div className="py-3">
            <SectionLabel label="Contact" />
            {channels.length > 0 ? (
              <div className="mt-1.5 flex flex-wrap gap-2">
                {channels.map((c) => (
                  <a
                    key={c.key}
                    href={c.href}
                    target={c.key === 'whatsapp' ? '_blank' : undefined}
                    rel="noopener noreferrer"
                    className={pillButtonCls('md', 'clay')}
                  >
                    <c.icon className="w-3.5 h-3.5" />
                    {c.label}
                  </a>
                ))}
              </div>
            ) : (
              <p className="text-sm text-fg/70 mt-0.5">
                Contact details unlock once you have an accepted challenge or rally with this player, or you are drawn
                against each other.
              </p>
            )}
          </div>

          <div className="py-3">
            <SectionLabel label="Bio" />
            <p className="text-sm text-fg/70 mt-0.5">
              {player.bio?.trim() || <span className="text-fg/70">No bio yet.</span>}
            </p>
          </div>

          <div className="py-3">
            <SectionLabel icon={<RacquetIcon className="w-3.5 h-3.5 text-clay-fg" />} label="Skill Level" />
            {stats ? (
              <div className="mt-1 flex items-center gap-2">
                <span className="text-lg font-bold text-fg">NTRP {stats.skill_level}</span>
              </div>
            ) : (
              <p className="text-sm text-fg/70 mt-1">Not set.</p>
            )}
          </div>

          <div className="py-3">
            <SectionLabel icon={<Award className="w-3.5 h-3.5 text-clay-fg" />} label="Badges" />
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {stats && (
                <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-500/15 text-badge border border-amber-500/25">
                  {skillBand(stats.skill_level)}
                </span>
              )}
              <BadgeRow ids={player.display_badges} />
            </div>
          </div>

          {/* League — only when the player opted in ("Make visible to others"). */}
          {player.profile_details_visible && leagueDivision(stats?.league) && (
            <div className="py-3">
              <SectionLabel icon={<Users className="w-3.5 h-3.5 text-clay-fg" />} label="League" />
              <div className="mt-1 flex flex-wrap gap-1.5">
                <Pill label={`${leagueDivision(stats?.league)} League`} />
                {leagueAgeCategory(stats?.league) && <Pill label={leagueAgeCategory(stats?.league)} />}
              </div>
            </div>
          )}

          <div className="py-3">
            <SectionLabel icon={<MapPin className="w-3.5 h-3.5 text-clay-fg" />} label="Courts" />
            <div className="mt-1 flex flex-wrap gap-1.5">
              {courts.length > 0 ? (
                courts.map((c) => <Pill key={c} label={c} />)
              ) : (
                <span className="text-sm text-fg/70">None set.</span>
              )}
            </div>
          </div>

          <div className="py-3">
            <SectionLabel icon={<Star className="w-3.5 h-3.5 text-clay-fg" />} label="Favourites" />
            <div className="mt-1 flex flex-wrap gap-1.5">
              {favourites.length > 0 ? (
                favourites.map((p) => <Pill key={p} label={p} />)
              ) : (
                <span className="text-sm text-fg/70">None set.</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Match Stats — read-only mirror of ProfileStats */}
      <div className="bg-tennis-surface/30 rounded-[2.5rem] shadow-xl p-6">
        <h2 className="text-lg font-bold text-fg flex items-center mb-4">
          <Star className="w-5 h-5 mr-2 text-clay-fg" />
          Match Stats
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {statTiles.map((t, i) => (
            <motion.div
              key={t.label}
              {...fadeUp}
              transition={{ ...fadeUp.transition, delay: staggerDelay(i) }}
              className="rounded-2xl bg-white/[0.03] px-3 py-4 text-center"
            >
              <p className={`text-2xl font-black ${t.accent}`}>{t.value}</p>
              <p className="text-[10px] font-bold uppercase tracking-widest text-fg/70 mt-1">{t.label}</p>
            </motion.div>
          ))}
        </div>
      </div>

      {organizer && (
        <div className="rounded-[2.5rem] bg-tennis-surface/30 shadow-xl p-6">
          <h2 className="text-base font-black text-fg mb-3">Contact organizer if you require any assistance</h2>
          <div className="flex flex-wrap gap-6">
            {organizer.email && (
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-clay-fg shrink-0" />
                <span className="text-fg font-semibold break-all">{organizer.email}</span>
              </div>
            )}
            {organizer.phone && (
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-clay-fg shrink-0" />
                <span className="text-fg font-semibold">{organizer.phone}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
