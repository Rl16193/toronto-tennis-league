import { initializeApp } from 'firebase/app';
import { initializeAnalytics, isSupported } from 'firebase/analytics';
import {
  browserLocalPersistence,
  browserSessionPersistence,
  getAuth,
  GoogleAuthProvider,
  setPersistence,
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

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
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();

export const analyticsPromise = isSupported().then((supported) =>
  supported
    ? initializeAnalytics(app, {
        // Manual page_view is fired per-route in App.tsx — disable gtag's
        // automatic page_view so first load isn't double-counted.
        config: { send_page_view: false, ...(import.meta.env.DEV ? { debug_mode: true } : {}) },
      })
    : null
);
