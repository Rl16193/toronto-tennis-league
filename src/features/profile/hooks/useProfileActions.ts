import { useState } from 'react';
import { reload } from 'firebase/auth';
import { useAuth } from '../../../context/AuthContext';
import {
  updateName, updatePhone, updateWhatsappContact, updateBio, updateAvatar, updateSkills,
  updateLeagueAndAge, updateDisplayBadges, updatePreferredCourts, updateFavouritePlayers, updateAvailabilityGrid,
  changeEmail, updateEventParticipantDates,
} from '../services/profileService';
import type { AvailabilityGrid } from '../../../utils/availability';

export const useProfileActions = () => {
  const { user, refreshProfile } = useAuth();
  const [updateLoading, setUpdateLoading] = useState(false);
  const [message, setMessage] = useState({ text: '', type: 'success' as 'success' | 'error' });

  const showMessage = (text: string, type: 'success' | 'error') => {
    setMessage({ text, type });
    setTimeout(() => setMessage({ text: '', type: 'success' }), type === 'success' ? 3000 : 4000);
  };

  const withProfileUpdate = async (fn: () => Promise<void>): Promise<boolean> => {
    if (!user) return false;
    setUpdateLoading(true);
    try {
      await fn();
      await refreshProfile();
      showMessage('Profile updated successfully!', 'success');
      return true;
    } catch (error: any) {
      showMessage(error.message || 'Could not update your profile. Please try again.', 'error');
      return false;
    } finally {
      setUpdateLoading(false);
    }
  };

  const handleChangeEmail = async (newEmail: string, password: string) => {
    if (!user) return;
    try {
      await changeEmail(user, newEmail, password);
      showMessage('Verification email sent to your new address. Please confirm it, then click refresh below.', 'success');
      return true;
    } catch (error: any) {
      const code = (error?.code || error?.message || '').toString().toLowerCase();
      if (code.includes('invalid-email')) showMessage('Please enter a valid email address.', 'error');
      else if (code.includes('wrong-password') || code.includes('invalid-credential') || code.includes('invalid-password')) showMessage('Incorrect password. Please try again.', 'error');
      else if (code.includes('requires-recent-login')) showMessage('Please sign out and sign in again to continue.', 'error');
      else if (code.includes('email-already-in-use')) showMessage('That email is already registered.', 'error');
      else showMessage('Unable to change your email. Please try again.', 'error');
      return false;
    }
  };

  const handleRefreshEmailChange = async () => {
    if (!user) return;
    try {
      await reload(user);
      await refreshProfile();
      showMessage('Email updated successfully.', 'success');
    } catch (error: any) {
      const code = (error?.code || error?.message || '').toString().toLowerCase();
      if (code.includes('email-not-verified') || code.includes('verification')) showMessage('Your email is not verified yet. Please complete verification and try again.', 'error');
      else showMessage('Unable to refresh your email verification. Please try again.', 'error');
    }
  };

  const handleUpdateEventDates = async (participantId: string, dateselected: string[]) => {
    try {
      await updateEventParticipantDates(participantId, dateselected);
      showMessage('Matchday dates updated!', 'success');
    } catch (error) {
      console.error('Error updating dates:', error);
      showMessage('Could not update dates right now.', 'error');
    }
  };

  return {
    updateLoading,
    message,
    actions: {
      updateName: (name: string) => withProfileUpdate(() => updateName(user!.uid, name)),
      updatePhone: (phone: string) => withProfileUpdate(() => updatePhone(user!.uid, phone)),
      updateWhatsappContact: (whatsappContact: string, sameAsPhone: boolean) =>
        withProfileUpdate(() => updateWhatsappContact(user!.uid, whatsappContact, sameAsPhone)),
      updateBio: (bio: string) => withProfileUpdate(() => updateBio(user!.uid, bio)),
      updateAvatar: (url: string) => withProfileUpdate(() => updateAvatar(user!.uid, url)),
      updateSkills: (skillLevel: number, tournamentPreference: string) => withProfileUpdate(() => updateSkills(user!.uid, skillLevel, tournamentPreference)),
      updateLeagueAge: (league: "Men's" | "Women's" | '', ageBracket: string, visible: boolean) =>
        withProfileUpdate(() => updateLeagueAndAge(user!.uid, league, ageBracket, visible)),
      updateDisplayBadges: (badgeIds: string[]) => withProfileUpdate(() => updateDisplayBadges(user!.uid, badgeIds)),
      updatePreferredCourts: (courts: string[], zone: string) => withProfileUpdate(() => updatePreferredCourts(user!.uid, courts, zone)),
      updateFavouritePlayers: (players: string[]) => withProfileUpdate(() => updateFavouritePlayers(user!.uid, players)),
      updateAvailabilityGrid: (grid: AvailabilityGrid) => withProfileUpdate(() => updateAvailabilityGrid(user!.uid, grid)),
      changeEmail: handleChangeEmail,
      refreshEmailChange: handleRefreshEmailChange,
      updateEventDates: handleUpdateEventDates,
    },
  };
};
