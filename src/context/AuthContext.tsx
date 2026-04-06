import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { ensureUserProfileDocuments } from '../lib/profileBootstrap';
import { UserProfile, UserData, UserStats, UserPreferences } from '../types';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  isAuthReady: boolean;
  profileError: string | null;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  isAuthReady: false,
  profileError: null,
  refreshProfile: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const refreshProfile = async (currentUserParam?: User | null) => {
    const activeUser = currentUserParam ?? auth.currentUser;

    if (!activeUser) {
      setProfile(null);
      setProfileError(null);
      return;
    }

    try {
      setProfileError(null);
      console.log('Fetching profile data for user:', activeUser.uid);
      await ensureUserProfileDocuments(activeUser);

      const userDataDoc = await getDoc(doc(db, 'users', activeUser.uid));
      const statsDoc = await getDoc(doc(db, 'stats', activeUser.uid));
      const preferencesDoc = await getDoc(doc(db, 'preferences', activeUser.uid));

      console.log('Users doc exists:', userDataDoc.exists());
      console.log('Stats doc exists:', statsDoc.exists());
      console.log('Preferences doc exists:', preferencesDoc.exists());

      if (!userDataDoc.exists()) {
        console.warn('User profile document does not exist:', activeUser.uid);
        setProfile(null);
        setProfileError('Your user profile document is missing from Firestore.');
      } else if (!statsDoc.exists()) {
        console.warn('Stats document does not exist:', activeUser.uid);
        setProfile(null);
        setProfileError('Your stats document is missing from Firestore.');
      } else if (!preferencesDoc.exists()) {
        console.warn('Preferences document does not exist:', activeUser.uid);
        setProfile(null);
        setProfileError('Your preferences document is missing from Firestore.');
      } else {
        console.log('All documents exist, setting profile');
        const userData = userDataDoc.data() as UserData;
        if (activeUser.email && userData.email !== activeUser.email) {
          await updateDoc(doc(db, 'users', activeUser.uid), {
            email: activeUser.email,
          });
          userData.email = activeUser.email;
        }

        setProfile({
          id: activeUser.uid,
          user: userData,
          stats: statsDoc.data() as UserStats,
          preferences: preferencesDoc.data() as UserPreferences,
        });
      }
    } catch (error) {
      console.error("Error fetching user profile:", error);
      setProfile(null);
      setProfileError(error instanceof Error ? error.message : 'Unable to read profile data from Firestore.');
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      console.log('Auth state changed:', currentUser ? currentUser.uid : 'null');
      setUser(currentUser);
      if (currentUser) {
        await refreshProfile(currentUser);
      } else {
        setProfile(null);
        setProfileError(null);
      }
      setLoading(false);
      setIsAuthReady(true);
    });

    return () => unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, profile, loading, isAuthReady, profileError, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
};
