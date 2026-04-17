import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../services/firebase';
import { ensureUserProfileDocuments } from '../services/profileBootstrap';
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
      await ensureUserProfileDocuments(activeUser);

      const [userDataDoc, statsDoc, preferencesDoc] = await Promise.all([
        getDoc(doc(db, 'users', activeUser.uid)),
        getDoc(doc(db, 'stats', activeUser.uid)),
        getDoc(doc(db, 'preferences', activeUser.uid)),
      ]);

      if (!userDataDoc.exists()) {
        setProfile(null);
        setProfileError('Your user profile document is missing from Firestore.');
      } else if (!statsDoc.exists()) {
        setProfile(null);
        setProfileError('Your stats document is missing from Firestore.');
      } else if (!preferencesDoc.exists()) {
        setProfile(null);
        setProfileError('Your preferences document is missing from Firestore.');
      } else {
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
