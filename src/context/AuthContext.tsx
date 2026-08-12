import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { setAnalyticsUser, clearAnalyticsUser } from '../lib/analytics';
import { emptyContacts, ensureUserProfileDocuments } from '../lib/profileBootstrap';
import { ContactData, UserProfile, UserData, UserStats, UserPreferences } from '../types';

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

      const [userDataDoc, statsDoc, preferencesDoc, contactsDoc] = await Promise.all([
        getDoc(doc(db, 'users', activeUser.uid)),
        getDoc(doc(db, 'stats', activeUser.uid)),
        getDoc(doc(db, 'preferences', activeUser.uid)),
        getDoc(doc(db, 'contacts', activeUser.uid)),
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
        // Deliberately NOT part of the existence checks above: legacy accounts have no contacts
        // doc until the backfill runs, and treating that as fatal would lock them out entirely.
        const contacts: ContactData = contactsDoc.exists()
          ? { ...emptyContacts(), ...(contactsDoc.data() as ContactData) }
          : emptyContacts();

        // Keep the stored email in step with the auth record. Lives on contacts now, not users.
        if (activeUser.email && contacts.email !== activeUser.email) {
          await setDoc(
            doc(db, 'contacts', activeUser.uid),
            { email: activeUser.email, updated_at: new Date().toISOString() },
            { merge: true },
          ).catch(() => { /* non-fatal; the next sign-in retries */ });
          contacts.email = activeUser.email;
        }

        const stats = statsDoc.data() as UserStats;
        const preferences = preferencesDoc.data() as UserPreferences;
        setProfile({
          id: activeUser.uid,
          user: userData,
          stats,
          preferences,
          contacts,
        });
        // GA4 non-PII user properties for segmentation (User-ID set in onAuthStateChanged).
        setAnalyticsUser(activeUser.uid, {
          skill_level: stats.skill_level,
          membership_status: preferences.event_creator ? 'organizer' : 'member',
        });
        updateDoc(doc(db, 'users', activeUser.uid), { lastActive: serverTimestamp() }).catch(() => {});

        // Email verification was removed from signup, so any signed-in user is trusted: mark
        // them verified and trigger the one-shot welcome email (Cloud Function fires when
        // welcomeEmailSent flips false → true). Both flags are idempotent.
        const updates: Record<string, boolean> = {};
        if (!(userData as { isVerified?: boolean }).isVerified) updates.isVerified = true;
        if (!(userData as { welcomeEmailSent?: boolean }).welcomeEmailSent) updates.welcomeEmailSent = true;
        if (Object.keys(updates).length > 0) {
          updateDoc(doc(db, 'users', activeUser.uid), updates).catch(() => {});
        }
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
