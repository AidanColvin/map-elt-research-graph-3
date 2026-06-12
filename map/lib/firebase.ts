"use client";

import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";

/**
 * Firebase web config, read from public NEXT_PUBLIC_* env vars. These are
 * public client identifiers (not secrets). When the apiKey/appId/projectId
 * are present the app uses real Firebase Auth; otherwise it falls back to the
 * keyless browser-local gate so the site keeps working with no config.
 */
const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

/** True when enough config is present to use real Firebase authentication. */
export const firebaseEnabled = Boolean(config.apiKey && config.appId && config.projectId);

// takes: nothing
// does: lazily initializes the Firebase app once (reusing it on hot reloads)
//       and returns its Auth instance, or null when Firebase isn't configured
// returns: a Firebase Auth instance, or null
export function getFirebaseAuth(): Auth | null {
  if (!firebaseEnabled) return null;
  const app = getApps().length ? getApp() : initializeApp(config);
  return getAuth(app);
}
