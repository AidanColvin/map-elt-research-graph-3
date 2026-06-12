import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  OAuthProvider,
  signOut as firebaseSignOut,
  onAuthStateChanged,
} from "firebase/auth";
import { auth } from "./config";
import { createUserProfile } from "./db";

const googleProvider = new GoogleAuthProvider();
const microsoftProvider = new OAuthProvider("microsoft.com");

/**
 * takes: email (string), password (string)
 * does: signs an existing user in with their email and password
 * returns: a Promise resolving to the signed-in Firebase User
 */
export async function signIn(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

/**
 * takes: email (string), password (string)
 * does: creates a new account and writes its initial Firestore profile
 * returns: a Promise resolving to the newly created Firebase User
 */
export async function signUp(email, password) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await createUserProfile(cred.user);
  return cred.user;
}

/**
 * takes: nothing
 * does: opens the Google OAuth popup and ensures a Firestore profile exists
 * returns: a Promise resolving to the signed-in Firebase User
 */
export async function signInWithGoogle() {
  const cred = await signInWithPopup(auth, googleProvider);
  await createUserProfile(cred.user);
  return cred.user;
}

/**
 * takes: nothing
 * does: opens the Microsoft OAuth popup and ensures a Firestore profile exists
 * returns: a Promise resolving to the signed-in Firebase User
 */
export async function signInWithMicrosoft() {
  const cred = await signInWithPopup(auth, microsoftProvider);
  await createUserProfile(cred.user);
  return cred.user;
}

/**
 * takes: nothing
 * does: signs the current user out of Firebase Auth
 * returns: a Promise that resolves once sign-out is complete
 */
export function signOut() {
  return firebaseSignOut(auth);
}

/**
 * takes: callback (function receiving the User or null)
 * does: subscribes to auth state changes and invokes the callback on each one
 * returns: an unsubscribe function
 */
export function subscribeToAuth(callback) {
  return onAuthStateChanged(auth, callback);
}
