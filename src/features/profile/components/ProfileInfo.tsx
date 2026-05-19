import React from 'react';
import { useAuth } from '../../../context/AuthContext';
import { Button } from '../../../components/Button';
import { User, Edit2, Save, X } from 'lucide-react';
import type { ProfileEditData } from '../types';
import { ProfileContactView } from './ProfileContactView';
import { ProfileContactEdit } from './ProfileContactEdit';

type EmailChangeData = { newEmail: string; password: string };

interface ProfileInfoProps {
  isEditing: boolean;
  setIsEditing: (v: boolean) => void;
  editData: ProfileEditData;
  setEditData: (data: ProfileEditData) => void;
  onSave: () => void;
  updateLoading: boolean;
  message?: { text: string; type: 'success' | 'error' } | null;
  hasGoogleProvider: boolean | undefined;
  onLinkGoogle: () => void;
  linkingGoogle: boolean;
  showEmailForm: boolean;
  setShowEmailForm: (v: boolean) => void;
  emailChangeData: EmailChangeData;
  setEmailChangeData: (data: EmailChangeData) => void;
  emailChangeLoading: boolean;
  emailVerificationPending: boolean;
  onStartEmailChange: () => void;
  onRefreshEmailChange: () => void;
  onCancelEmailChange: () => void;
}

export const ProfileInfo: React.FC<ProfileInfoProps> = ({
  isEditing, setIsEditing,
  editData, setEditData,
  onSave, updateLoading, message,
  hasGoogleProvider, onLinkGoogle, linkingGoogle,
  showEmailForm, setShowEmailForm,
  emailChangeData, setEmailChangeData,
  emailChangeLoading, emailVerificationPending,
  onStartEmailChange, onRefreshEmailChange, onCancelEmailChange,
}) => {
  const { profile } = useAuth();
  if (!profile) return null;

  const name = (editData.user?.name ?? profile.user.name).trim();
  const phoneDigits = (editData.user?.phone ?? '').replace(/\D/g, '');

  const nameError = isEditing && name.length > 0
    ? /\d/.test(name) ? 'Name cannot contain numbers'
      : name.length < 2 ? 'Name must be at least 2 characters'
      : undefined
    : undefined;

  const phoneError = phoneDigits.length > 0 && phoneDigits.length !== 10
    ? 'Please enter a valid 10-digit phone number'
    : undefined;

  const canSave = !nameError && !phoneError;

  const handleEditStart = () => {
    setEditData({
      ...editData,
      user: { ...editData.user, name: profile.user.name, phone: profile.user.phone },
      stats: { ...editData.stats, skill_level: profile.stats.skill_level },
    });
    setIsEditing(true);
  };

  return (
    <div className={`rounded-[2.5rem] border transition-all duration-300 ${
      isEditing ? 'bg-gray-800/50 border-white/10' : 'bg-tennis-surface/30 border-white/5 shadow-xl'
    }`}>
      <div className="p-5 sm:p-7 md:p-10">

        <div className="flex justify-between items-center mb-6 md:mb-8">
          <h2 className="text-xl md:text-2xl font-bold text-white flex items-center gap-2.5">
            <User className="w-5 h-5 text-clay" />
            Contact Card
          </h2>
          {!isEditing ? (
            <Button variant="ghost" size="sm" onClick={handleEditStart}>
              <Edit2 className="w-4 h-4 mr-2" />Edit
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setIsEditing(false)}>
                <X className="w-4 h-4 mr-1" />Cancel
              </Button>
              <Button size="sm" onClick={canSave ? onSave : undefined} disabled={!canSave} isLoading={updateLoading}>
                <Save className="w-4 h-4 mr-1" />Save
              </Button>
            </div>
          )}
        </div>

        <div className="flex flex-col md:flex-row items-center md:items-start gap-6 md:gap-8">
          <div className="w-28 h-28 md:w-36 md:h-36 rounded-[2rem] border-4 border-tennis-dark bg-tennis-surface overflow-hidden shadow-2xl shrink-0">
            <img
              src={profile.user.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.user.name || 'U')}&background=FF6B35&color=fff`}
              alt={profile.user.name}
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
          </div>

          <div className="flex-1 w-full min-w-0">
            {isEditing ? (
              <ProfileContactEdit
                editData={editData}
                setEditData={setEditData}
                profile={profile}
                nameError={nameError}
                phoneError={phoneError}
                showEmailForm={showEmailForm}
                setShowEmailForm={setShowEmailForm}
                emailChangeData={emailChangeData}
                setEmailChangeData={setEmailChangeData}
                emailChangeLoading={emailChangeLoading}
                emailVerificationPending={emailVerificationPending}
                onStartEmailChange={onStartEmailChange}
                onRefreshEmailChange={onRefreshEmailChange}
                onCancelEmailChange={onCancelEmailChange}
              />
            ) : (
              <ProfileContactView
                profile={profile}
                hasGoogleProvider={hasGoogleProvider}
                onLinkGoogle={onLinkGoogle}
                linkingGoogle={linkingGoogle}
              />
            )}
          </div>
        </div>

        {isEditing && (
          <div className="mt-6 border-t border-white/10 pt-5 space-y-2">
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="ghost" onClick={() => setIsEditing(false)}>
                <X className="w-4 h-4 mr-2" />Cancel
              </Button>
              <Button onClick={canSave ? onSave : undefined} disabled={!canSave} isLoading={updateLoading}>
                <Save className="w-4 h-4 mr-2" />Save
              </Button>
            </div>
            {message && (
              <p className={`text-sm font-semibold text-right ${message.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
                {message.text}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
