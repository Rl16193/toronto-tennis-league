import { useState } from 'react';
import { reload } from 'firebase/auth';
import { collection, query, where, getDocs, updateDoc, doc } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { useAuth } from '../../../context/AuthContext';
import { updateUserInfo, updateSkills, updateAvailability, changeEmail, removeEventParticipant, updateEventParticipantDates } from '../services/profileService';

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

  const handleUpdateInfo = async (name: string, phone: string) => {
    if (name.trim().length < 3 || name.length > 80) { showMessage('Name must be 3–80 characters.', 'error'); return false; }
    if (/\d/.test(name)) { showMessage('Name cannot contain numbers.', 'error'); return false; }
    return withProfileUpdate(() => updateUserInfo(user!.uid, name, phone));
  };

  const handleUpdateSkills = (skillLevel: number, tournamentPreference: string) =>
    withProfileUpdate(() => updateSkills(user!.uid, skillLevel, tournamentPreference));

  const handleUpdateAvailability = (availabilityDay: string[], availabilityTime: string[], preferredCourts: string[], favouritePlayers: string[], preferredZone?: string) =>
    withProfileUpdate(() => updateAvailability(user!.uid, availabilityDay, availabilityTime, preferredCourts, favouritePlayers, preferredZone));

  const handleChangeEmail = async (newEmail: string, password: string) => {
    if (!user) return;
    try {
      await changeEmail(user, newEmail, password);
      showMessage('Verification email sent to your new address. Please confirm it, then click refresh below.', 'success');
      return true;
    } catch (error: any) {
      const code = (error?.code || error?.message || '').toString().toLowerCase();
      if (code.includes('invalid-email')) {
        showMessage('Please enter a valid email address.', 'error');
      } else if (code.includes('wrong-password') || code.includes('invalid-credential') || code.includes('invalid-password')) {
        showMessage('Incorrect password. Please try again.', 'error');
      } else if (code.includes('requires-recent-login')) {
        showMessage('Please sign out and sign in again to continue.', 'error');
      } else if (code.includes('email-already-in-use')) {
        showMessage('That email is already registered.', 'error');
      } else {
        showMessage('Unable to change your email. Please try again.', 'error');
      }
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
      if (code.includes('email-not-verified') || code.includes('verification')) {
        showMessage('Your email is not verified yet. Please complete verification and try again.', 'error');
      } else {
        showMessage('Unable to refresh your email verification. Please try again.', 'error');
      }
    }
  };

  const handleRemoveEvent = async (participantId: string, eventId: string) => {
    try {
      await removeEventParticipant(participantId);
      // Best-effort: clearing match slots is organizer-only (Firestore rules). The
      // participant doc is already removed above; if the player can't edit the
      // bracket, the organizer reconciles the empty slot via the draw.
      try {
        if (user && eventId) {
          const matchesSnap = await getDocs(
            query(collection(db, 'tournament_matches'), where('event_id', '==', eventId))
          );
          const updates: Promise<void>[] = [];
          matchesSnap.docs.forEach((matchDoc) => {
            const data = matchDoc.data();
            const hasScores = data.set_1_player_1 != null || data.set_1_player_2 != null;
            if (hasScores) return;
            if (data.player_1_user_id === user.uid) {
              updates.push(updateDoc(doc(db, 'tournament_matches', matchDoc.id), {
                player_1_name: 'Player Loading', player_1_user_id: '', player_1_contact: '',
              }));
            }
            if (data.player_2_user_id === user.uid) {
              updates.push(updateDoc(doc(db, 'tournament_matches', matchDoc.id), {
                player_2_name: 'Player Loading', player_2_user_id: '', player_2_contact: '',
              }));
            }
          });
          await Promise.all(updates);
        }
      } catch {
        /* player not permitted to edit the bracket; organizer will clear the slot */
      }
      showMessage('You have been removed from the event.', 'success');
    } catch (error) {
      console.error("Error removing event:", error);
      showMessage('Could not remove you from the event right now.', 'error');
    }
  };

  const handleUpdateEventDates = async (participantId: string, dateselected: string[]) => {
    try {
      await updateEventParticipantDates(participantId, dateselected);
      showMessage('Matchday dates updated!', 'success');
    } catch (error) {
      console.error("Error updating dates:", error);
      showMessage('Could not update dates right now.', 'error');
    }
  };

  return {
    updateLoading,
    message,
    actions: {
      updateInfo: handleUpdateInfo,
      updateSkills: handleUpdateSkills,
      updateAvailability: handleUpdateAvailability,
      changeEmail: handleChangeEmail,
      refreshEmailChange: handleRefreshEmailChange,
      removeEvent: (participantId: string, eventId: string) => handleRemoveEvent(participantId, eventId),
      updateEventDates: handleUpdateEventDates,
    },
  };
};
