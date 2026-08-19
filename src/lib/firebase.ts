import { initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { initializeAnalytics, isSupported } from 'firebase/analytics';
import {
  browserLocalPersistence,
  browserSessionPersistence,
  connectAuthEmulator,
  getAuth,
  GoogleAuthProvider,
  OAuthProvider,
  setPersistence,
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
const useFirebaseEmulators = import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true';
const appCheckSiteKey = import.meta.env.VITE_FIREBASE_APP_CHECK_SITE_KEY;
export const appCheck =
  !useFirebaseEmulators && appCheckSiteKey
    ? initializeAppCheck(app, {
        provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey),
        isTokenAutoRefreshEnabled: true,
      })
    : null;
export const auth = getAuth(app);
export const setAuthPersistence = (stayLoggedIn: boolean) =>
  setPersistence(auth, stayLoggedIn ? browserLocalPersistence : browserSessionPersistence);
export const db = getFirestore(app);
export const storage = getStorage(app);
// Region must match REGION in functions/lib/constants.js — the callables are deployed there.
export const functions = getFunctions(app, 'us-central1');
export const googleProvider = new GoogleAuthProvider();
export const appleProvider = new OAuthProvider('apple.com');

if (useFirebaseEmulators) {
  const emulatorHost = import.meta.env.VITE_FIREBASE_EMULATOR_HOST || '127.0.0.1';
  const emulatorPort = (name: string, fallback: number) => {
    const parsed = Number(import.meta.env[name]);
    return Number.isInteger(parsed) && parsed > 0 && parsed <= 65535 ? parsed : fallback;
  };
  connectAuthEmulator(auth, `http://${emulatorHost}:${emulatorPort('VITE_FIREBASE_AUTH_EMULATOR_PORT', 9099)}`, {
    disableWarnings: true,
  });
  connectFirestoreEmulator(db, emulatorHost, emulatorPort('VITE_FIRESTORE_EMULATOR_PORT', 8080));
  connectFunctionsEmulator(functions, emulatorHost, emulatorPort('VITE_FUNCTIONS_EMULATOR_PORT', 5001));
  connectStorageEmulator(storage, emulatorHost, emulatorPort('VITE_FIREBASE_STORAGE_EMULATOR_PORT', 9199));
}

export const analyticsPromise = isSupported().then((supported) =>
  supported
    ? initializeAnalytics(app, {
        // Manual page_view is fired per-route in App.tsx — disable gtag's
        // automatic page_view so first load isn't double-counted.
        config: { send_page_view: false, ...(import.meta.env.DEV ? { debug_mode: true } : {}) },
      })
    : null,
);
