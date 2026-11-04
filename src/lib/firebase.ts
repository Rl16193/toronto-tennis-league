import { initializeApp } from 'firebase/app';
import { initializeAnalytics, isSupported } from 'firebase/analytics';
import {
  browserLocalPersistence,
  browserSessionPersistence,
  connectAuthEmulator,
  getAuth,
  GoogleAuthProvider,
  OAuthProvider,
  setPersistence,
  signInWithCustomToken,
} from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions';
import { connectStorageEmulator, getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

if (!firebaseConfig.apiKey || !firebaseConfig.projectId || !firebaseConfig.appId) {
  throw new Error('Firebase configuration is incomplete. Check VITE_FIREBASE_* environment variables.');
}

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const setAuthPersistence = (stayLoggedIn: boolean) =>
  setPersistence(auth, stayLoggedIn ? browserLocalPersistence : browserSessionPersistence);
export const db = getFirestore(app);
/** `xs` in runs of `n`, for `in` queries (Firestore caps the list). */
export const chunk = <T,>(xs: T[], n: number): T[][] =>
  Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));
export const storage = getStorage(app);
// Region must match REGION in functions/lib/constants.js — the callables are deployed there.
export const functions = getFunctions(app, 'us-central1');
export const googleProvider = new GoogleAuthProvider();
export const appleProvider = new OAuthProvider('apple.com');

/**
 * Point the app at the local emulators. Off unless VITE_USE_EMULATORS=true, so production and
 * `npm run dev` are untouched — this exists only to walk a flow end to end without production
 * data (the booking lifecycle needs both a member and a provider signed in).
 */
if (import.meta.env.VITE_USE_EMULATORS === 'true') {
  connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, 'localhost', 8080);
  connectFunctionsEmulator(functions, 'localhost', 5001);
  connectStorageEmulator(storage, 'localhost', 9199);
  (window as unknown as { __emulatorAuth?: unknown }).__emulatorAuth = { auth, signInWithCustomToken };
}

export const analyticsPromise = isSupported().then((supported) =>
  supported
    ? initializeAnalytics(app, {
        // Manual page_view is fired per-route in App.tsx — disable gtag's
        // automatic page_view so first load isn't double-counted.
        config: { send_page_view: false, ...(import.meta.env.DEV ? { debug_mode: true } : {}) },
      })
    : null
);
