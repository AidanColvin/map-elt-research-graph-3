import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "./config";

/**
 * takes: user (Firebase User object)
 * does: creates the user's Firestore profile document on first sign-in, or
 *       updates the lastLogin timestamp if the profile already exists
 * returns: a Promise resolving to the profile data that was written/merged
 */
export async function createUserProfile(user) {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  const base = {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName || "",
    photoURL: user.photoURL || "",
    lastLogin: serverTimestamp(),
  };
  if (!snap.exists()) {
    const profile = { ...base, createdAt: serverTimestamp() };
    await setDoc(ref, profile);
    return profile;
  }
  await setDoc(ref, { lastLogin: serverTimestamp() }, { merge: true });
  return snap.data();
}

/**
 * takes: uid (string)
 * does: reads a single user's profile document from Firestore
 * returns: a Promise resolving to the profile object, or null if none exists
 */
export async function getUserProfile(uid) {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : null;
}
