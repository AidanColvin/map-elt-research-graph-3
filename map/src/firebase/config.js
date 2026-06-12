import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

/**
 * Firebase web config. These are public client identifiers (not secrets) and
 * are read from environment variables so the same code runs across
 * environments. Copy .env.example to .env and fill in your project's values
 * from the Firebase console (Project settings → Your apps → Web app).
 */
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
};

/**
 * takes: nothing
 * does: initializes the Firebase app once (reuses the existing instance on
 *       hot reloads so initializeApp is never called twice)
 * returns: the initialized FirebaseApp
 */
function createFirebaseApp() {
  return getApps().length ? getApp() : initializeApp(firebaseConfig);
}

const app = createFirebaseApp();

export const auth = getAuth(app);
export const db = getFirestore(app);
export default app;
