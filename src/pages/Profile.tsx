import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { auth } from '../services/firebase';
import { Button } from '../components/Button';
import { LogOut, CheckCircle2, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useProfileData } from '../features/profile/hooks/useProfileData';
import { useProfileActions } from '../features/profile/hooks/useProfileActions';
import { ProfileInfo } from '../features/profile/components/ProfileInfo';
import { ProfileSkills } from '../features/profile/components/ProfileSkills';
import { ProfileStats } from '../features/profile/components/ProfileStats';
import { ProfileAvailability } from '../features/profile/components/ProfileAvailability';
import { ProfileEvents } from '../features/profile/components/ProfileEvents';
import { ProfileEditData } from '../features/profile/types';

export const Profile: React.FC = () => {
  const { user, profile, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { joinedEvents, loading: eventsLoading } = useProfileData();
  const { updateLoading, message, actions } = useProfileActions();

  // Edit States
  const [isEditingInfo, setIsEditingInfo] = useState(false);
  const [isEditingSkills, setIsEditingSkills] = useState(false);
  const [isEditingAvailability, setIsEditingAvailability] = useState(false);

  const [editData, setEditData] = useState<ProfileEditData>({});
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [emailChangeData, setEmailChangeData] = useState({ newEmail: '', password: '' });
  const [emailVerificationPending, setEmailVerificationPending] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/login');
    }
  }, [user, authLoading, navigate]);

  const hasGoogleProvider = user?.providerData?.some((provider) => provider.providerId === 'google.com');

  const incompleteFields = profile ? [
    !profile.user.name.trim() ? 'name' : null,
    !profile.user.phone.trim() ? 'phone number' : null,
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
          <p className="text-gray-400 text-sm mt-2">This can take a moment right after sign-in.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20 pt-8">
      {/* Toast Message */}
      <AnimatePresence>
        {message.text && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={`fixed top-24 right-8 z-50 p-4 rounded-2xl shadow-2xl flex items-center space-x-3 border ${
              message.type === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-500' : 'bg-red-500/10 border-red-500/20 text-red-500'
            }`}
          >
            {message.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
            <span className="font-bold text-sm">{message.text}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {incompleteFields.length > 0 && (
        <div className="mb-8 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-300">
          <p className="font-bold mb-1">Profile incomplete</p>
          <p className="text-sm">
            Please add details for: {incompleteFields.join(', ')}.
          </p>
        </div>
      )}

      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl md:text-4xl font-display font-black text-white tracking-tight">My Profile</h1>
        <Button variant="danger" size="sm" onClick={() => auth.signOut()}>
          <LogOut className="w-4 h-4 mr-2" />
          Logout
        </Button>
      </div>

      {joinedEvents.length === 0 && (
        <div className="mb-8 p-6 rounded-2xl bg-clay/10 border border-clay/20 text-center">
          <p className="text-white font-semibold mb-4">Ready to play? Join some events to get started!</p>
          <Button onClick={() => navigate('/events')}>
            Register for Events Here
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] gap-6 lg:gap-8">
        <div className="space-y-6">
          <ProfileInfo
            isEditing={isEditingInfo}
            setIsEditing={setIsEditingInfo}
            editData={editData}
            setEditData={setEditData}
            onSave={async () => {
              const saved = await actions.updateInfo(editData.user?.name || profile.user.name, editData.user?.phone || profile.user.phone);
              if (saved) {
                setIsEditingInfo(false);
              }
            }}
            updateLoading={updateLoading}
            hasGoogleProvider={hasGoogleProvider}
            onLinkGoogle={actions.linkGoogle}
            linkingGoogle={false} // TODO: add loading state
            showEmailForm={showEmailForm}
            setShowEmailForm={setShowEmailForm}
            emailChangeData={emailChangeData}
            setEmailChangeData={setEmailChangeData}
            emailChangeLoading={false} // TODO: add loading state
            emailVerificationPending={emailVerificationPending}
            onStartEmailChange={async () => {
              const success = await actions.changeEmail(emailChangeData.newEmail, emailChangeData.password);
              if (success) setEmailVerificationPending(true);
            }}
            onRefreshEmailChange={actions.refreshEmailChange}
            onCancelEmailChange={() => {
              setShowEmailForm(false);
              setEmailVerificationPending(false);
              setEmailChangeData({ newEmail: '', password: '' });
            }}
          />

          <ProfileEvents
            joinedEvents={joinedEvents}
            loading={eventsLoading}
            onRemoveEvent={(event) => actions.removeEvent(event.participantId)}
          />
        </div>

        <div className="space-y-6">
          <ProfileSkills
            isEditing={isEditingSkills}
            setIsEditing={setIsEditingSkills}
            editData={editData}
            setEditData={setEditData}
            onSave={async () => {
              const saved = await actions.updateSkills(
                editData.stats?.skill_level || profile.stats.skill_level,
                editData.stats?.tournament_preference || profile.stats.tournament_preference
              );
              if (saved) {
                setIsEditingSkills(false);
              }
            }}
            updateLoading={updateLoading}
          />

          <ProfileStats />

          <ProfileAvailability
            isEditing={isEditingAvailability}
            setIsEditing={setIsEditingAvailability}
            editData={editData}
            setEditData={setEditData}
            onSave={async () => {
              const saved = await actions.updateAvailability(
                editData.preferences?.availability_day || profile.preferences.availability_day,
                editData.preferences?.availability_time || profile.preferences.availability_time,
                editData.preferences?.preferred_courts || profile.preferences.preferred_courts,
                editData.preferences?.favourite_players || profile.preferences.favourite_players
              );
              if (saved) {
                setIsEditingAvailability(false);
              }
            }}
            updateLoading={updateLoading}
          />
        </div>
      </div>
    </div>
  );
};
