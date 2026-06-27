import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/Button';
import { useProfileData } from '../features/profile/hooks/useProfileData';
import { useProfileActions } from '../features/profile/hooks/useProfileActions';
import { ProfileInfo } from '../features/profile/components/ProfileInfo';
import { ProfileStats } from '../features/profile/components/ProfileStats';
import { ProfileAvailability } from '../features/profile/components/ProfileAvailability';
import { ProfileEvents } from '../features/profile/components/ProfileEvents';
import { ProfileEditData } from '../features/profile/types';

export const Profile: React.FC = () => {
  const { user, profile, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { joinedEvents, loading: eventsLoading } = useProfileData();
  const { updateLoading, message, actions } = useProfileActions();

  const [isEditingInfo, setIsEditingInfo] = useState(false);
  const [isEditingAvailability, setIsEditingAvailability] = useState(false);

  const [editData, setEditData] = useState<ProfileEditData>({});
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [emailChangeData, setEmailChangeData] = useState({ newEmail: '', password: '' });
  const [emailVerificationPending, setEmailVerificationPending] = useState(false);
  const [emailChangeLoading, setEmailChangeLoading] = useState(false);

  useEffect(() => { document.title = 'My Profile — Racquets & Strings'; }, []);

  useEffect(() => {
    if (!authLoading && !user) navigate('/login');
  }, [user, authLoading, navigate]);

  const incompleteFields = profile ? [
    !profile.user.name.trim() ? 'name' : null,
    profile.preferences.availability_day.length === 0 ? 'availability day' : null,
    profile.preferences.availability_time.length === 0 ? 'availability time' : null,
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
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20 pt-8">
      {incompleteFields.length > 0 && (
        <div className="mb-8 px-1">
          <p className="text-sm text-orange-500 font-bold mb-1">Profile incomplete</p>
          <p className="text-sm text-orange-500">Please add details for: {incompleteFields.join(', ')}.</p>
        </div>
      )}

      {/* Contact Card — full width */}
      <div className="mb-6">
        <ProfileInfo
          isEditing={isEditingInfo}
          setIsEditing={setIsEditingInfo}
          editData={editData}
          setEditData={setEditData}
          message={message}
          onSave={async () => {
            const [savedInfo, savedSkills] = await Promise.all([
              actions.updateInfo(editData.user?.name || profile.user.name, editData.user?.phone || profile.user.phone),
              actions.updateSkills(editData.stats?.skill_level || profile.stats.skill_level, profile.stats.tournament_preference),
            ]);
            if (savedInfo && savedSkills) setIsEditingInfo(false);
          }}
          updateLoading={updateLoading}
          showEmailForm={showEmailForm}
          setShowEmailForm={setShowEmailForm}
          emailChangeData={emailChangeData}
          setEmailChangeData={setEmailChangeData}
          emailChangeLoading={emailChangeLoading}
          emailVerificationPending={emailVerificationPending}
          onStartEmailChange={async () => {
            setEmailChangeLoading(true);
            try {
              const success = await actions.changeEmail(emailChangeData.newEmail, emailChangeData.password);
              if (success) setEmailVerificationPending(true);
            } finally {
              setEmailChangeLoading(false);
            }
          }}
          onRefreshEmailChange={actions.refreshEmailChange}
          onCancelEmailChange={() => {
            setShowEmailForm(false);
            setEmailVerificationPending(false);
            setEmailChangeData({ newEmail: '', password: '' });
          }}
        />
      </div>

      {/* Two-column grid: Availability | Stats + Events + Calendar */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] gap-6 lg:gap-8">
        <ProfileAvailability
          isEditing={isEditingAvailability}
          setIsEditing={setIsEditingAvailability}
          editData={editData}
          setEditData={setEditData}
          message={message}
          onSave={async () => {
            const saved = await actions.updateAvailability(
              editData.preferences?.availability_day || profile.preferences.availability_day,
              editData.preferences?.availability_time || profile.preferences.availability_time,
              editData.preferences?.preferred_courts || profile.preferences.preferred_courts,
              editData.preferences?.favourite_players || profile.preferences.favourite_players,
              editData.preferences?.preferred_zone ?? profile.preferences.preferred_zone ?? '',
            );
            if (saved) setIsEditingAvailability(false);
          }}
          updateLoading={updateLoading}
        />

        <div className="space-y-6">
          <ProfileStats />

          <ProfileEvents
            joinedEvents={joinedEvents}
            loading={eventsLoading}
            onRemoveEvent={(event) => actions.removeEvent(event.participantId, event.id)}
          />

          {(() => {
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
              <div className="bg-tennis-surface/30 border border-white/5 rounded-[2.5rem] shadow-xl p-8">
                <h2 className="text-2xl font-bold text-white mb-1">Events Calendar</h2>
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
        </div>
      </div>
    </div>
  );
};
