import { initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  browserSessionPersistence,
  getAuth,
  GoogleAuthProvider,
  OAuthProvider,
  setPersistence,
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const fallbackFirebaseConfig = {
  apiKey: 'AIzaSyA362zakGeFqMBTZpM7brUd83psK5lbzWE',
  authDomain: 'toronto-tennis-league.firebaseapp.com',
  projectId: 'toronto-tennis-league',
  storageBucket: 'toronto-tennis-league.firebasestorage.app',
  messagingSenderId: '42115754868',
  appId: '1:42115754868:web:2a15f00c2e4eba13605a21',
};

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || fallbackFirebaseConfig.apiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || fallbackFirebaseConfig.authDomain,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || fallbackFirebaseConfig.projectId,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || fallbackFirebaseConfig.storageBucket,
  messagingSenderId:
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || fallbackFirebaseConfig.messagingSenderId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID || fallbackFirebaseConfig.appId,
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
export const appleProvider = new OAuthProvider('apple.com');