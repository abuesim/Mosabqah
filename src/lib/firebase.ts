import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

/**
 * Firebase initialization.
 * Reads config from NEXT_PUBLIC_FIREBASE_* env vars (set in .env.local / Vercel).
 * Falls back to safe placeholders so `next build` doesn't crash when vars
 * are missing — same pattern as the old Supabase client.
 */

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || 'placeholder-api-key',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || 'placeholder.firebaseapp.com',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'placeholder-project',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'placeholder.appspot.com',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '0000000000',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || 'placeholder-app-id',
};

if (
  !process.env.NEXT_PUBLIC_FIREBASE_API_KEY ||
  !process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
) {
  // eslint-disable-next-line no-console
  console.warn(
    '\n⚠️  Firebase env vars missing (NEXT_PUBLIC_FIREBASE_*).\n' +
    '   Add them in Vercel → Settings → Environment Variables.\n'
  );
}

// initializeApp is idempotent if called with the same config, but Next.js
// hot-reloading can re-run module scope — guard with getApps().
export const app: FirebaseApp = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
export const auth: Auth = getAuth(app);
export const db: Firestore = getFirestore(app);

// NOTE: Analytics is intentionally omitted — it requires a browser-only
// environment and breaks SSR / static prerendering in Next.js.
