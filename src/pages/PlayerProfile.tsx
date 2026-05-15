import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { Mail, Phone, Trophy, User } from 'lucide-react';
import { db } from '../lib/firebase';
import { Button } from '../components/Button';
import { TennisEvent, UserData, UserPreferences, UserStats } from '../types';

const parseMayKey = (val: unknown): string | null => {
  if (typeof val === 'string') return val.startsWith('May') ? val : null;
  if (typeof val !== 'object' || val === null) return null;
  let d: Date | null = null;
  const obj = val as Record<string, unknown>;
  if (typeof obj['toDate'] === 'function') d = (obj['toDate'] as () => Date)();
  else if (typeof obj['seconds'] === 'number') d = new Date(obj['seconds'] * 1000);
  if (!d) return null;

  return d.getFullYear() === 2026 && d.getMonth() === 4
    ? `May ${d.getDate()}, 2026`
    : null;
};

const Chip: React.FC<{ label: string }> = ({ label }) => (
  <span className="px-3 py-1 rounded-full bg-clay/20 border border-clay/30 text-clay text-sm font-semibold">
    {label}
  </span>
);

export const PlayerProfile: React.FC = () => {
  const { userId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const eventId = searchParams.get('event') || null;

  const [player, setPlayer] = useState<UserData | null>(null);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [markedDates, setMarkedDates] = useState<Set<string>>(new Set());
  const [organizer, setOrganizer] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { document.title = 'Player Profile — Racquets & Strings'; }, []);

  useEffect(() => {
    const loadPlayer = async () => {
      if (!userId) return;

      setLoading(true);

      try {
        const [userDoc, statsDoc, prefsDoc, participantSnap] = await Promise.all([
          getDoc(doc(db, 'users', userId)),
          getDoc(doc(db, 'stats', userId)),
          getDoc(doc(db, 'preferences', userId)),
          getDocs(
            query(
              collection(db, 'event_participants'),
              where('user_id', '==', userId)
            )
          ),
        ]);

        const playerData = userDoc.exists() ? (userDoc.data() as UserData) : null;
        setPlayer(playerData);
        if (playerData?.name) {
          document.title = `${playerData.name} — Racquets & Strings`;
        }
        setStats(statsDoc.exists() ? (statsDoc.data() as UserStats) : null);
        setPreferences(
          prefsDoc.exists() ? (prefsDoc.data() as UserPreferences) : null
        );

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

        const dates = new Set<string>();

        participantSnap.docs.forEach((d) => {
          const dateselected = (d.data() as Record<string, unknown>)['dateselected'];
          (Array.isArray(dateselected) ? dateselected : []).forEach((v: unknown) => {
            const k = parseMayKey(v);
            if (k) dates.add(k);
          });
        });

        setMarkedDates(dates);
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
        <h1 className="text-3xl font-black text-white mb-3">
          Player Not Found
        </h1>

        <p className="text-gray-400 mb-6">
          This player profile is not available.
        </p>

        <Button
          variant="outline"
          onClick={() => navigate('/tournament')}
        >
          Back to Tournament
        </Button>
      </div>
    );
  }

  const contactItems = [
    player.email && {
      label: 'Email',
      value: player.email,
      icon: Mail
    },

    player.phone && {
      label: 'Phone',
      value: player.phone,
      icon: Phone
    }
  ].filter(Boolean);

  const hasAvailability =
    markedDates.size > 0 ||
    (preferences?.availability_day?.length ?? 0) > 0 ||
    (preferences?.availability_time?.length ?? 0) > 0;

  const calendarDays: number[] = [];

  for (let day = 9; day <= 31; day++) {
    calendarDays.push(day);
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">

      <div className="rounded-[2rem] bg-tennis-surface/40 border border-white/10 p-6 md:p-8">

        <div className="flex flex-col md:flex-row md:items-center gap-6">

          <div className="w-24 h-24 rounded-full bg-clay/20 border border-clay/30 flex items-center justify-center">
            <User className="w-12 h-12 text-clay" />
          </div>

          <div className="flex-1">
            <p className="text-xs uppercase tracking-widest text-clay font-black mb-2">
              Player Profile
            </p>

            <h1 className="text-3xl md:text-4xl font-black text-white">
              {player.name}
            </h1>

            {stats && (
              <p className="text-gray-400 mt-2">
                NTRP {stats.skill_level} · {stats.tournament_preference}
              </p>
            )}
          </div>

          <Button
            variant="ghost"
            onClick={() => navigate('/tournament')}
          >
            Back to Tournament
          </Button>

        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">

          {/* Contact Information */}
          <div className="rounded-2xl bg-tennis-dark/40 border border-white/10 p-5">

            <p className="text-xs uppercase tracking-widest text-gray-500 font-bold mb-4">
              Contact Information
            </p>

            <div className="space-y-4">

              {contactItems.length > 0 ? (
                contactItems.map((item: any) => {
                  const Icon = item.icon;

                  return (
                    <div
                      key={item.label}
                      className="flex items-start gap-3"
                    >
                      <div className="mt-0.5">
                        <Icon className="w-4 h-4 text-clay" />
                      </div>

                      <div className="min-w-0">
                        <p className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">
                          {item.label}
                        </p>

                        <p className="text-white font-semibold break-all mt-1">
                          {item.value}
                        </p>
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-white font-semibold">
                  Not provided
                </p>
              )}

            </div>
          </div>

          {/* Preferred Contact Mode */}
          <div className="rounded-2xl bg-tennis-dark/40 border border-white/10 p-5">
            <Phone className="w-5 h-5 text-clay mb-3" />

            <p className="text-xs uppercase tracking-widest text-gray-500 font-bold">
              Contact Mode
            </p>

            <p className="text-white font-semibold capitalize mt-1">
              {player.preferred_mode_of_contact}
            </p>
          </div>

          {/* Record */}
          <div className="rounded-2xl bg-tennis-dark/40 border border-white/10 p-5">
            <Trophy className="w-5 h-5 text-clay mb-3" />

            <p className="text-xs uppercase tracking-widest text-gray-500 font-bold">
              Record
            </p>

            <p className="text-white font-semibold mt-1">
              {stats
                ? `${stats.matches_won}-${Math.max(
                    0,
                    stats.matches_played - stats.matches_won
                  )}`
                : 'Not available'}
            </p>
          </div>

        </div>
      </div>

      {organizer && (
        <div className="rounded-[2rem] bg-tennis-surface/40 border border-white/10 p-6 md:p-8 mt-6">
          <h2 className="text-base font-black text-white mb-3">Contact organizer if you require any assistance</h2>
          <div className="flex flex-wrap gap-6">
            {organizer.email && (
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-clay shrink-0" />
                <span className="text-gray-300 font-semibold">{organizer.email}</span>
              </div>
            )}
            {organizer.phone && (
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-clay shrink-0" />
                <span className="text-gray-300 font-semibold">{organizer.phone}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {hasAvailability && (
        <div className="rounded-[2rem] bg-tennis-surface/40 border border-white/10 p-6 md:p-8 mt-6">

          <h2 className="text-xl font-black text-white mb-5">
            Availability
          </h2>

          {(preferences?.availability_day?.length ?? 0) > 0 && (
            <div className="mb-4">

              <p className="text-xs uppercase tracking-widest text-gray-500 font-bold mb-2">
                Preferred Days
              </p>

              <div className="flex flex-wrap gap-2">
                {preferences!.availability_day.map((d) => (
                  <Chip key={d} label={d} />
                ))}
              </div>

            </div>
          )}

          {(preferences?.availability_time?.length ?? 0) > 0 && (
            <div className="mb-5">

              <p className="text-xs uppercase tracking-widest text-gray-500 font-bold mb-2">
                Preferred Times
              </p>

              <div className="flex flex-wrap gap-2">
                {preferences!.availability_time.map((t) => (
                  <Chip key={t} label={t} />
                ))}
              </div>

            </div>
          )}

          {markedDates.size > 0 && (
            <>
              <p className="text-xs uppercase tracking-widest text-gray-500 font-bold mb-3">
                Player Availability (May 2026)
              </p>

              <div className="grid grid-cols-7 gap-1.5">

                {['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((d) => (
                  <div
                    key={d}
                    className="text-gray-500 text-xs font-medium text-center py-1"
                  >
                    {d}
                  </div>
                ))}

                {calendarDays.map((day) => {
                  const selected = markedDates.has(`May ${day}, 2026`);

                  return (
                    <div
                      key={day}
                      className={`p-2 text-xs rounded-lg text-center ${
                        selected
                          ? 'bg-orange-500 text-white font-bold'
                          : 'text-gray-600 bg-gray-800/30'
                      }`}
                    >
                      {day}
                    </div>
                  );
                })}

              </div>
            </>
          )}

        </div>
      )}
    </div>
  );
};
