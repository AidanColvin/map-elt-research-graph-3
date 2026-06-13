"use client";

/**
 * Firestore helpers for the sticky workspace: project folders and the company
 * report snapshots saved inside them. Schema:
 *
 *   users/{uid}/projects/{projectId}          { name, createdAt }
 *   users/{uid}/saved_profiles/{profileId}    { projectId, companyName, ticker,
 *                                               reportMarkdown, lastUpdated, filingDate }
 *
 * The Firestore instance comes from the app's configured Firebase setup
 * (@/lib/firebase). Every call is best-effort and guarded: when Firestore is
 * unconfigured or locked down, reads return [] and writes return false rather
 * than throwing, so the UI degrades gracefully instead of breaking.
 */

import { getFirebaseDb } from "@/lib/firebase";

export interface Project {
  id: string;
  name: string;
  createdAt: number;
}

export interface SavedProfile {
  id: string;
  projectId: string;
  companyName: string;
  ticker: string;
  reportMarkdown: string;
  lastUpdated: number;
  filingDate: string;
}

export interface ProfileInput {
  companyName: string;
  ticker: string;
  reportMarkdown: string;
  filingDate: string;
}

// takes: a free-text string
// does: normalizes it into a stable, id-safe slug
// returns: the slug (e.g. "Apple Inc." -> "apple-inc")
function slug(s: string): string {
  return (s || "")
    .toString().toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "untitled";
}

// takes: uid (string), name (string)
// does: creates a new project folder under users/{uid}/projects in Firestore
// returns: a Promise resolving to the new projectId, or null on failure
export async function createProject(uid: string, name: string): Promise<string | null> {
  try {
    const db = getFirebaseDb();
    if (!db || !uid) return null;
    const { collection, doc, setDoc } = await import("firebase/firestore");
    const ref = doc(collection(db, "users", uid, "projects"));
    await setDoc(ref, { name: name.trim() || "Untitled project", createdAt: Date.now() });
    return ref.id;
  } catch {
    return null;
  }
}

// takes: uid (string)
// does: lists the user's project folders, newest first
// returns: a Promise resolving to an array of Project (empty on failure)
export async function listProjects(uid: string): Promise<Project[]> {
  try {
    const db = getFirebaseDb();
    if (!db || !uid) return [];
    const { collection, getDocs } = await import("firebase/firestore");
    const snap = await getDocs(collection(db, "users", uid, "projects"));
    const out = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Project, "id">) }));
    return out.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  } catch {
    return [];
  }
}

// takes: uid (string), projectId (string), profileData (ProfileInput)
// does: saves a static snapshot of the company report to the specified user
//       project in Firestore, stamping lastUpdated to now; re-saving the same
//       company within a project overwrites the prior snapshot
// returns: a Promise resolving to a boolean indicating success
export async function saveProfileToProject(
  uid: string,
  projectId: string,
  profileData: ProfileInput,
): Promise<boolean> {
  try {
    const db = getFirebaseDb();
    if (!db || !uid || !projectId) return false;
    const { doc, setDoc } = await import("firebase/firestore");
    const profileId = `${projectId}__${slug(profileData.companyName)}`;
    const record: SavedProfile = {
      id: profileId,
      projectId,
      companyName: profileData.companyName,
      ticker: profileData.ticker || "",
      reportMarkdown: profileData.reportMarkdown,
      lastUpdated: Date.now(),
      filingDate: profileData.filingDate || "",
    };
    await setDoc(doc(db, "users", uid, "saved_profiles", profileId), record);
    return true;
  } catch {
    return false;
  }
}

// takes: uid (string), projectId (optional string)
// does: lists saved profile snapshots for the user, optionally filtered to one
//       project, newest-updated first
// returns: a Promise resolving to an array of SavedProfile (empty on failure)
export async function listSavedProfiles(uid: string, projectId?: string): Promise<SavedProfile[]> {
  try {
    const db = getFirebaseDb();
    if (!db || !uid) return [];
    const { collection, getDocs } = await import("firebase/firestore");
    const snap = await getDocs(collection(db, "users", uid, "saved_profiles"));
    let out = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SavedProfile, "id">) }));
    if (projectId) out = out.filter((p) => p.projectId === projectId);
    return out.sort((a, b) => (b.lastUpdated || 0) - (a.lastUpdated || 0));
  } catch {
    return [];
  }
}

// takes: uid (string), profileId (string)
// does: deletes a saved profile snapshot from Firestore
// returns: a Promise resolving to a boolean indicating success
export async function deleteSavedProfile(uid: string, profileId: string): Promise<boolean> {
  try {
    const db = getFirebaseDb();
    if (!db || !uid || !profileId) return false;
    const { doc, deleteDoc } = await import("firebase/firestore");
    await deleteDoc(doc(db, "users", uid, "saved_profiles", profileId));
    return true;
  } catch {
    return false;
  }
}
