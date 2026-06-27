import React from 'react';
import { Mail } from 'lucide-react';
import { Input } from '../../../components/Input';
import { Button } from '../../../components/Button';
import { SKILL_LEVELS, SKILL_DESCRIPTIONS } from '../../../utils/skillLevels';
import type { ProfileEditData } from '../types';

type EmailChangeData = { newEmail: string; password: string };

interface Profile {
  user: { name: string; phone: string; email: string };
  stats: { skill_level: number };
}

interface Props {
  editData: ProfileEditData;
  setEditData: (data: ProfileEditData) => void;
  profile: Profile;
  nameError?: string;
  phoneError?: string;
  showEmailForm: boolean;
  setShowEmailForm: (show: boolean) => void;
  emailChangeData: EmailChangeData;
  setEmailChangeData: (data: EmailChangeData) => void;
  emailChangeLoading: boolean;
  emailVerificationPending: boolean;
  onStartEmailChange: () => void;
  onRefreshEmailChange: () => void;
  onCancelEmailChange: () => void;
}

const formatPhone = (value: string) => {
  const n = value.replace(/\D/g, '');
  if (n.length <= 3) return n;
  if (n.length <= 6) return `(${n.slice(0, 3)})-${n.slice(3)}`;
  return `(${n.slice(0, 3)})-${n.slice(3, 6)}-${n.slice(6, 10)}`;
};

export const ProfileContactEdit: React.FC<Props> = ({
  editData, setEditData, profile,
  nameError, phoneError,
  showEmailForm, setShowEmailForm,
  emailChangeData, setEmailChangeData,
  emailChangeLoading, emailVerificationPending,
  onStartEmailChange, onRefreshEmailChange, onCancelEmailChange,
}) => {
  const setUser = (patch: Partial<typeof editData.user>) =>
    setEditData({ ...editData, user: { ...editData.user, ...patch } });

  const currentName = editData.user?.name ?? profile.user.name;
  const currentPhone = editData.user?.phone ?? profile.user.phone;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      <Input
        label="Full Name"
        value={currentName}
        error={nameError}
        onChange={(e) => setUser({ name: e.target.value, phone: currentPhone })}
      />
      <Input
        label="Phone Number"
        value={currentPhone}
        error={phoneError}
        onChange={(e) => setUser({ name: currentName, phone: formatPhone(e.target.value) })}
      />

      <div className="space-y-3 md:col-span-2">
        <label className="block text-sm font-bold text-white uppercase tracking-wider">
          NTRP Level: {editData.stats?.skill_level ?? profile.stats.skill_level}
        </label>
        <input
          type="range"
          min="0"
          max={SKILL_LEVELS.length - 1}
          step="1"
          value={Math.max(0, SKILL_LEVELS.indexOf((editData.stats?.skill_level ?? profile.stats.skill_level) as typeof SKILL_LEVELS[number]))}
          onChange={(e) => setEditData({ ...editData, stats: { ...editData.stats, skill_level: SKILL_LEVELS[Number(e.target.value)] } })}
          className="w-full h-2 rounded-full"
        />
        <div className="flex justify-between">
          {SKILL_LEVELS.map((level) => (
            <span key={level} className={`text-[10px] font-black tracking-widest ${(editData.stats?.skill_level ?? profile.stats.skill_level) === level ? 'text-clay' : 'text-white/40'}`}>
              {level.toFixed(1)}
            </span>
          ))}
        </div>
        <p className="text-sm text-white/50 italic">
          "{SKILL_DESCRIPTIONS[(editData.stats?.skill_level ?? profile.stats.skill_level) as number]}"
        </p>
      </div>

      <div className="space-y-2 md:col-span-2">
        <label className="block text-sm font-medium text-white">Email Address</label>
        <div className="flex items-center gap-3 p-3 bg-white/5 border border-white/5 rounded-2xl">
          <Mail className="w-4 h-4 text-white/40 shrink-0" />
          <span className="text-white text-sm min-w-0 break-all">{profile.user.email}</span>
        </div>
        {!showEmailForm ? (
          <Button variant="clay" size="sm" className="mt-1" onClick={() => setShowEmailForm(true)}>
            Change email
          </Button>
        ) : (
          <div className="space-y-3 mt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="New Email"
                type="email"
                value={emailChangeData.newEmail}
                onChange={(e) => setEmailChangeData({ ...emailChangeData, newEmail: e.target.value })}
              />
              <Input
                label="Current Password"
                type="password"
                value={emailChangeData.password}
                onChange={(e) => setEmailChangeData({ ...emailChangeData, password: e.target.value })}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="clay" size="sm" onClick={onStartEmailChange} isLoading={emailChangeLoading}>
                Send Verification
              </Button>
              {emailVerificationPending && (
                <Button variant="outline" size="sm" onClick={onRefreshEmailChange} isLoading={emailChangeLoading}>
                  I've Verified My New Email
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={onCancelEmailChange}>Cancel</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
