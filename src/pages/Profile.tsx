import React, { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Instagram, Mail } from 'lucide-react';
import { INSTAGRAM_URL } from '../features/tasks/useTasks';
import { useAuth } from '../context/AuthContext';
import { useProfileData } from '../features/profile/hooks/useProfileData';
import { useProfileActions } from '../features/profile/hooks/useProfileActions';
import { ProfileInfo } from '../features/profile/components/ProfileInfo';
import { RecentMatches } from '../features/profile/components/RecentMatches';
import { ProfileAvailability } from '../features/profile/components/ProfileAvailability';
import { getAvailabilityGrid } from '../utils/availability';

export const Profile: React.FC = () => {
  const { user, profile, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { joinedEvents, loading: eventsLoading } = useProfileData();
  const { updateLoading, message, actions } = useProfileActions();

  useEffect(() => { document.title = 'My Profile — Racquets & Strings'; }, []);

  useEffect(() => {
    if (!authLoading && !user) navigate('/login');
  }, [user, authLoading, navigate]);

  const incompleteFields = profile ? [
    !profile.user.name.trim() ? 'name' : null,
    Object.keys(getAvailabilityGrid(profile.preferences)).length === 0 ? 'availability' : null,
    profile.preferences.preferred_courts.length === 0 ? 'preferred courts' : null,
    profile.preferences.favourite_players.length === 0 ? 'favourite players' : null,
  ].filter(Boolean) as string[] : [];

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-clay border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-white font-semibold">Profile loading, please wait...</p>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-clay border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-white font-semibold">Preparing your profile...</p>
          <p className="text-white text-sm mt-2">This can take a moment right after sign-in.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 pb-20 pt-8 space-y-4">
      {incompleteFields.length > 0 && (
        <div className="px-1">
          <p className="text-sm text-orange-500 font-bold mb-1">Profile incomplete</p>
          <p className="text-sm text-orange-500">Please add details for: {incompleteFields.join(', ')}.</p>
        </div>
      )}

      <ProfileInfo actions={actions} updateLoading={updateLoading} message={message} />

      <RecentMatches />

      <ProfileAvailability updateAvailabilityGrid={actions.updateAvailabilityGrid} updateLoading={updateLoading} />

      {eventsLoading ? (
        <div className="h-48 bg-tennis-surface/30 rounded-3xl md:rounded-[2.5rem] animate-pulse" />
      ) : (() => {
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
              (e) => e.type === 'tournament' || e.title.toLowerCase().includes('tournament')
            );
            const matchdaysEvent = joinedEvents.find(
              (e) => e.title.toLowerCase().includes('weekend matchdays')
            );

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
              if (current.has(dateKey)) current.delete(dateKey); else current.add(dateKey);
              await actions.updateEventDates(participantId, [...current]);
            };

            const calendarDays: number[] = [];
            for (let day = 9; day <= 31; day++) calendarDays.push(day);

            return (
              <div className="bg-tennis-surface/30 border border-white/5 rounded-3xl md:rounded-[2.5rem] shadow-xl p-4 md:p-8">
                <h2 className="text-xl md:text-2xl font-bold text-white mb-1">Events Calendar</h2>
                <p className="text-white/60 text-sm mb-1">Mark availability during the tournament</p>
                <p className="text-white/40 text-xs mb-4">May 9 – May 31, 2026</p>
                <div className="grid grid-cols-7 gap-2">
                  {['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((d) => (
                    <div key={d} className="text-white/40 text-xs font-medium text-center py-1">{d}</div>
                  ))}
                  {calendarDays.map((day) => {
                    const selected = isDateSelected(day);
                    const deflt = isDefaultDate(day);
                    const past = isPast(day);
                    return (
                      <button
                        key={day}
                        disabled={past || !participantId}
                        onClick={() => handleToggleDate(day)}
                        className={`p-2 text-xs rounded-lg transition-colors ${
                          selected ? 'bg-orange-500 text-white font-bold'
                            : deflt ? 'border border-orange-500/60 text-orange-300 font-semibold hover:bg-orange-500/20 cursor-pointer'
                            : past ? 'text-white/20 bg-gray-800/30 cursor-not-allowed'
                            : participantId ? 'text-white bg-gray-800/30 hover:bg-white/10 cursor-pointer'
                            : 'text-white/20 bg-gray-800/30'
                        }`}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>
                {savedDates.size > 0 && (
                  <div className="mt-4 pt-4 border-t border-white/5">
                    <p className="text-white/40 text-xs">Selected: {[...savedDates].sort().join(', ')}</p>
                  </div>
                )}
              </div>
            );
      })()}

      {/* Site links relocated here from the removed global footer. */}
      <div className="pt-6 mt-2 border-t border-white/5">
        <div className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs text-white/50">
          <Link to="/rules" className="hover:text-clay transition-colors">League Rules</Link>
          <Link to="/terms" className="hover:text-clay transition-colors">Terms of Service</Link>
          <Link to="/privacy" className="hover:text-clay transition-colors">Privacy Policy</Link>
          <a href="mailto:tenniscommunity.tbtc@gmail.com" className="inline-flex items-center gap-1 hover:text-clay transition-colors">
            <Mail className="w-3.5 h-3.5" /> Contact
          </a>
          <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-clay transition-colors">
            <Instagram className="w-3.5 h-3.5" /> Instagram
          </a>
        </div>
      </div>
    </div>
  );
};
