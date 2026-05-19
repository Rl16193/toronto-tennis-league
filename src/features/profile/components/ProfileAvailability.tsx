import React, { useEffect, useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { Button } from '../../../components/Button';
import { Input } from '../../../components/Input';
import { Calendar, Edit2, Save, X } from 'lucide-react';
import { defaultCourtOptions, extractDropdownCourts, getCourtSuggestions, mergeCourtOptions } from '../../signup/utils/courtSearch';

const FAVOURITE_PLAYERS = [
  "Jannik Sinner",
  "Carlos Alcaraz",
  "Rafael Nadal",
  "Roger Federer",
  "Novak Djokovic"
];

import type { ProfileEditData } from '../types';

interface ProfileAvailabilityProps {
  isEditing: boolean;
  setIsEditing: (editing: boolean) => void;
  editData: ProfileEditData;
  setEditData: (data: ProfileEditData) => void;
  onSave: () => void;
  updateLoading: boolean;
  message?: { text: string; type: 'success' | 'error' } | null;
}

export const ProfileAvailability: React.FC<ProfileAvailabilityProps> = ({
  isEditing,
  setIsEditing,
  editData,
  setEditData,
  onSave,
  updateLoading,
  message,
}) => {
  const { profile } = useAuth();
  const [courtOptions, setCourtOptions] = useState<string[]>(defaultCourtOptions);

  useEffect(() => {
    let isMounted = true;
    fetch('/Tennis Courts Facilities - 4326.csv')
      .then((r) => r.ok ? r.text() : '')
      .then((csv) => { if (isMounted && csv) setCourtOptions(mergeCourtOptions(extractDropdownCourts(csv))); })
      .catch(() => {});
    return () => { isMounted = false; };
  }, []);

  const selectedCourts = editData.preferences?.preferred_courts || [];
  const courtSuggestions = getCourtSuggestions(courtOptions, selectedCourts, editData.customCourtInput || '');

  const addCourt = (court: string) => {
    if (!court.trim() || selectedCourts.includes(court.trim())) return;
    setEditData({
      ...editData,
      preferences: {
        ...editData.preferences,
        availability_day: editData.preferences?.availability_day || profile!.preferences.availability_day,
        availability_time: editData.preferences?.availability_time || profile!.preferences.availability_time,
        preferred_courts: [...selectedCourts, court.trim()],
        favourite_players: editData.preferences?.favourite_players || profile!.preferences.favourite_players,
      },
      customCourtInput: '',
    });
  };

  const removeCourt = (court: string) => {
    setEditData({
      ...editData,
      preferences: {
        ...editData.preferences,
        availability_day: editData.preferences?.availability_day || profile!.preferences.availability_day,
        availability_time: editData.preferences?.availability_time || profile!.preferences.availability_time,
        preferred_courts: selectedCourts.filter((c) => c !== court),
        favourite_players: editData.preferences?.favourite_players || profile!.preferences.favourite_players,
      },
    });
  };

  if (!profile) return null;

  return (
    <div className={`rounded-[2.5rem] border transition-all duration-500 ${
      isEditing ? 'bg-gray-800/50 border-white/10' : 'bg-tennis-surface/30 border-white/5 shadow-xl'
    }`}>
      <div className="p-8">
        <div className="flex justify-between items-start mb-8">
          <h2 className="text-2xl font-bold text-white flex items-center">
            <Calendar className="w-6 h-6 mr-3 text-clay" />
            Availability and Choices
          </h2>
          {!isEditing ? (
            <Button variant="ghost" size="sm" onClick={() => {
              setEditData({
                ...editData,
                preferences: {
                  ...editData.preferences,
                  availability_day: profile.preferences.availability_day,
                  availability_time: profile.preferences.availability_time,
                  preferred_courts: profile.preferences.preferred_courts,
                  favourite_players: profile.preferences.favourite_players,
                },
                customCourtInput: '',
                customFavouritePlayerInput: '',
              });
              setIsEditing(true);
            }}>
              <Edit2 className="w-4 h-4 mr-2" />
              Edit
            </Button>
          ) : (
            <div className="flex flex-col items-end gap-2">
              <div className="flex space-x-2">
                <Button variant="ghost" size="sm" onClick={() => setIsEditing(false)}>
                  <X className="w-4 h-4" />
                </Button>
                <Button size="sm" onClick={onSave} isLoading={updateLoading}>
                  <Save className="w-4 h-4" />
                </Button>
              </div>
              {message && (
                <p className={`text-xs font-semibold ${message.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
                  {message.text}
                </p>
              )}
            </div>
          )}
        </div>

        {isEditing ? (
          <div className="space-y-6">
            <div className="space-y-3">
              <label className="block text-xs font-bold text-white uppercase tracking-widest">Days</label>
              <div className="flex flex-wrap gap-2">
                {['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map(day => (
                  <button
                    key={day}
                    onClick={() => {
                      const current = editData.preferences?.availability_day || [];
                      setEditData({
                        ...editData,
                        preferences: {
                          ...editData.preferences,
                          availability_day: current.includes(day) ? current.filter(d => d !== day) : [...current, day],
                          availability_time: editData.preferences?.availability_time || profile.preferences.availability_time,
                          preferred_courts: editData.preferences?.preferred_courts || profile.preferences.preferred_courts,
                          favourite_players: editData.preferences?.favourite_players || profile.preferences.favourite_players,
                        },
                      });
                    }}
                    className={`w-10 h-10 flex items-center justify-center rounded-lg text-[10px] font-black border transition-all ${
                      (editData.preferences?.availability_day || []).includes(day) ? 'bg-clay border-clay text-white' : 'bg-white/5 border-white/5 text-white'
                    }`}
                  >
                    {day}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-3">
              <label className="block text-xs font-bold text-white uppercase tracking-widest">Time</label>
              <div className="flex gap-2">
                {['AM', 'PM'].map(time => (
                  <button
                    key={time}
                    onClick={() => {
                      const current = editData.preferences?.availability_time || [];
                      setEditData({
                        ...editData,
                        preferences: {
                          ...editData.preferences,
                          availability_day: editData.preferences?.availability_day || profile.preferences.availability_day,
                          availability_time: current.includes(time) ? current.filter(t => t !== time) : [...current, time],
                          preferred_courts: editData.preferences?.preferred_courts || profile.preferences.preferred_courts,
                          favourite_players: editData.preferences?.favourite_players || profile.preferences.favourite_players,
                        },
                      });
                    }}
                    className={`flex-1 p-3 rounded-xl text-xs font-black border transition-all ${
                      (editData.preferences?.availability_time || []).includes(time) ? 'bg-clay border-clay text-white' : 'bg-white/5 border-white/5 text-white'
                    }`}
                  >
                    {time}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-3">
              <label className="block text-xs font-bold text-white uppercase tracking-widest">Courts</label>

              {/* Selected courts as dismissible chips */}
              {selectedCourts.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {selectedCourts.map((court) => (
                    <button
                      key={court}
                      type="button"
                      onClick={() => removeCourt(court)}
                      className="px-3 py-1 rounded-xl text-xs font-bold bg-clay text-white flex items-center gap-1.5 shadow-lg shadow-clay/20"
                    >
                      {court} <span className="opacity-70">✕</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Search input + suggestions */}
              <div className="relative space-y-2">
                <Input
                  placeholder="Search courts by name..."
                  value={editData.customCourtInput || ''}
                  onChange={(e) => setEditData({ ...editData, customCourtInput: e.target.value })}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCourt(editData.customCourtInput || ''); } }}
                />
                {courtSuggestions.length > 0 && (
                  <div className="max-h-48 overflow-y-auto rounded-2xl border border-white/10 bg-tennis-dark/95 p-2 shadow-2xl">
                    {courtSuggestions.map((court) => (
                      <button
                        key={court}
                        type="button"
                        onClick={() => addCourt(court)}
                        className="w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-white transition-colors hover:bg-clay/20 hover:text-white"
                      >
                        {court}
                      </button>
                    ))}
                  </div>
                )}
                <Button
                  size="sm"
                  type="button"
                  variant="clay"
                  onClick={() => addCourt(editData.customCourtInput || '')}
                  disabled={!(editData.customCourtInput || '').trim()}
                >
                  Add
                </Button>
              </div>
            </div>
            <div className="space-y-3">
              <label className="block text-xs font-bold text-white uppercase tracking-widest">Favourite Players</label>
              <div className="flex flex-wrap gap-2">
                {FAVOURITE_PLAYERS.map(player => (
                  <button
                    key={player}
                    onClick={() => {
                      const current = editData.preferences?.favourite_players || [];
                      setEditData({
                        ...editData,
                        preferences: {
                          ...editData.preferences,
                          availability_day: editData.preferences?.availability_day || profile.preferences.availability_day,
                          availability_time: editData.preferences?.availability_time || profile.preferences.availability_time,
                          preferred_courts: editData.preferences?.preferred_courts || profile.preferences.preferred_courts,
                          favourite_players: current.includes(player) ? current.filter(p => p !== player) : [...current, player],
                        },
                      });
                    }}
                    className={`px-3 py-1 rounded-lg text-[10px] font-bold border transition-all ${
                      (editData.preferences?.favourite_players || []).includes(player) ? 'bg-clay/20 border-clay text-clay' : 'bg-white/5 border-white/5 text-white'
                    }`}
                  >
                    {player}
                  </button>
                ))}
              </div>
              <div className="flex gap-2 items-start">
                <div className="flex-1">
                  <Input
                    placeholder="Add your own player..."
                    value={editData.customFavouritePlayerInput || ''}
                    onChange={(e) => setEditData({ ...editData, customFavouritePlayerInput: e.target.value })}
                  />
                </div>
                <Button
                  size="sm"
                  type="button"
                  onClick={() => {
                    const value = (editData.customFavouritePlayerInput || '').trim();
                    if (!value) return;
                    const selected = editData.preferences?.favourite_players || [];
                    if (selected.includes(value)) return;
                    setEditData({
                      ...editData,
                      preferences: {
                        ...editData.preferences,
                        availability_day: editData.preferences?.availability_day || profile.preferences.availability_day,
                        availability_time: editData.preferences?.availability_time || profile.preferences.availability_time,
                        preferred_courts: editData.preferences?.preferred_courts || profile.preferences.preferred_courts,
                        favourite_players: [...selected, value],
                      },
                      customFavouritePlayerInput: '',
                    });
                  }}
                >
                  Add
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="space-y-2">
              <p className="text-xs font-bold text-white uppercase tracking-widest">Selected Days</p>
              <div className="flex flex-wrap gap-2">
                {profile.preferences.availability_day.map(day => (
                  <span key={day} className="px-3 py-1 bg-clay/10 border border-clay/20 rounded-lg text-xs font-bold text-clay">{day}</span>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-bold text-white uppercase tracking-widest">Time</p>
              <div className="flex flex-wrap gap-2">
                {profile.preferences.availability_time.map(time => (
                  <span key={time} className="px-3 py-1 bg-clay/10 border border-clay/20 rounded-lg text-xs font-bold text-clay">{time}</span>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-bold text-white uppercase tracking-widest">Courts</p>
              <div className="flex flex-wrap gap-2">
                {profile.preferences.preferred_courts.map(court => (
                  <span key={court} className="px-3 py-1 bg-clay/10 border border-clay/20 rounded-lg text-xs font-bold text-clay">{court}</span>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-bold text-white uppercase tracking-widest">Favourite Players</p>
              <div className="flex flex-wrap gap-2">
                {profile.preferences.favourite_players.map(player => (
                  <span key={player} className="px-3 py-1 bg-clay/10 border border-clay/20 rounded-lg text-xs font-bold text-clay">{player}</span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
