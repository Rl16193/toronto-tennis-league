import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, Timestamp } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { setAnalyticsUser, clearAnalyticsUser } from '../lib/analytics';
import { emptyContacts, ensureUserProfileDocuments } from '../lib/profileBootstrap';
import { ContactData, ProviderDoc, UserProfile, UserData, UserStats, UserPreferences } from '../types';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  isAuthReady: boolean;
  profileError: string | null;
  refreshProfile: (user?: User | null) => Promise<void>;
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

      const [userDataDoc, statsDoc, preferencesDoc, contactsDoc, providerDoc] = await Promise.all([
        getDoc(doc(db, 'users', activeUser.uid)),
        getDoc(doc(db, 'stats', activeUser.uid)),
        getDoc(doc(db, 'preferences', activeUser.uid)),
        getDoc(doc(db, 'contacts', activeUser.uid)),
        getDoc(doc(db, 'providers', activeUser.uid)),
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
        // Not part of the existence checks: a missing contacts doc must never lock a member out.
        const contacts: ContactData = contactsDoc.exists()
          ? { ...emptyContacts(), ...(contactsDoc.data() as ContactData) }
          : emptyContacts();

        // Keep the stored email in step with the auth record. Lives on contacts now, not users.
        if (activeUser.email && contacts.email !== activeUser.email) {
          await setDoc(
            doc(db, 'contacts', activeUser.uid),
            { email: activeUser.email, updated_at: Timestamp.now() },
            { merge: true },
          ).catch(() => { /* non-fatal; the next sign-in retries */ });
          contacts.email = activeUser.email;
        }

        const stats = statsDoc.data() as UserStats;
        const preferences = preferencesDoc.data() as UserPreferences;
        // Roles (stringer | coach | organizer) live on providers/{uid}; most members have none.
        const roles = providerDoc.exists() ? ((providerDoc.data() as ProviderDoc).roles ?? []) : [];
        setProfile({
          id: activeUser.uid,
          user: userData,
          stats,
          preferences,
          contacts,
          roles,
        });
        // GA4 non-PII user properties for segmentation (User-ID set in onAuthStateChanged).
        setAnalyticsUser(activeUser.uid, {
          skill_level: stats.skill_level,
          membership_status: roles.includes('organizer') ? 'organizer' : 'member',
        });
        // The welcome email is sent server-side when the users doc is created (sendWelcomeEmail).
        updateDoc(doc(db, 'users', activeUser.uid), { lastActive: Timestamp.now() }).catch(() => {});
      }
    } catch (error) {
      console.error("Error fetching user profile:", error);
      setProfile(null);
      setProfileError(error instanceof Error ? error.message : 'Unable to read profile data from Firestore.');
    }
  };

  // Tracks the last-seen uid so `loading` only re-arms when the signed-in identity actually
  // changes (login/logout/account switch) — not on every onAuthStateChanged firing, which also
  // happens on routine token refreshes for the SAME user and would otherwise flash a spinner
  // for idle logged-in users. Pages that trust `loading === false` as "profile is ready" would
  // otherwise briefly pair a new `user` with the previous identity's stale `profile`.
  const lastUidRef = useRef<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      const uidChanged = (currentUser?.uid ?? null) !== lastUidRef.current;
      lastUidRef.current = currentUser?.uid ?? null;
      if (uidChanged) setLoading(true);

      setUser(currentUser);
      if (currentUser) {
        setAnalyticsUser(currentUser.uid);
        await refreshProfile(currentUser);
      } else {
        clearAnalyticsUser();
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
