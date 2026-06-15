"use client";

/**
 * Project folders and the company report snapshots saved inside them.
 *
 * Storage model (mirrors lib/savedReports.ts):
 *   - A device-local mirror in localStorage is the source of truth for the UI,
 *     so saving is INSTANT and never blocks on the network, and saved projects
 *     survive logging out and back in on the same device.
 *   - Firestore (users/{uid}/projects, users/{uid}/saved_profiles) is written
 *     best-effort and fire-and-forget with a hard timeout, so an unconfigured,
 *     locked-down, or unreachable Firestore can never hang the "Save to Project"
 *     flow. When it works it adds cross-device sync.
 */

import { getFirebaseDb } from "@/lib/firebase";

export interface Project {
  id: string;
  name: string;
  createdAt: number;
  visibility: "public" | "private";
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

const FIRESTORE_TIMEOUT_MS = 4000;
const MAX_LOCAL = 200; // cap the local mirror so it can't exhaust localStorage

// takes: a free-text string
// does: normalizes it into a stable, id-safe slug
// returns: the slug (e.g. "Apple Inc." -> "apple-inc")
function slug(s: string): string {
  return (s || "").toString().toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "untitled";
}

// takes: a uid (may be empty for keyless/guest accounts)
// does: resolves the per-user storage namespace
// returns: the uid, or "local" when none
function scope(uid: string): string {
  return uid && uid.trim() ? uid.trim() : "local";
}

function projectsKey(uid: string): string {
  return `map:projects:${scope(uid)}`;
}
function profilesKey(uid: string): string {
  return `map:saved_profiles:${scope(uid)}`;
}
// Tombstones: ids of projects the user deleted. listProjects always filters
// these out, so a deleted project can't be resurrected by the Firestore merge
// (the remote delete is best-effort and may lag or be blocked by rules).
function deletedProjectsKey(uid: string): string {
  return `map:projects_deleted:${scope(uid)}`;
}

// takes: a localStorage key
// does: reads and parses the stored array, tolerating any corruption
// returns: the array (empty on any problem)
function readLocal<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    const arr = raw ? (JSON.parse(raw) as T[]) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

// takes: a localStorage key and an array
// does: persists the array (capped), best-effort
// returns: nothing
function writeLocal<T>(key: string, arr: T[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(arr.slice(0, MAX_LOCAL)));
  } catch {
    /* quota / unavailable — local mirror is best-effort */
  }
}

// takes: a promise and a millisecond budget
// does: resolves to undefined if the promise hasn't settled in time, so a
//       hung Firestore call can never block the caller
// returns: the promise's value, or undefined on timeout/error
function withTimeout<T>(p: Promise<T>, ms = FIRESTORE_TIMEOUT_MS): Promise<T | undefined> {
  return Promise.race([
    p.catch(() => undefined),
    new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), ms)),
  ]);
}

// takes: a unique id seed string
// does: builds a collision-resistant local id
// returns: the id
function makeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// ── Firestore (best-effort, never awaited by the UI path) ──────────────────

async function fsSetProject(uid: string, p: Project): Promise<void> {
  const db = getFirebaseDb();
  if (!db || !uid) return;
  const { doc, setDoc } = await import("firebase/firestore");
  await withTimeout(setDoc(doc(db, "users", uid, "projects", p.id), { name: p.name, createdAt: p.createdAt, visibility: p.visibility }));
}

async function fsSetProfile(uid: string, r: SavedProfile): Promise<void> {
  const db = getFirebaseDb();
  if (!db || !uid) return;
  const { doc, setDoc } = await import("firebase/firestore");
  await withTimeout(setDoc(doc(db, "users", uid, "saved_profiles", r.id), r));
}

async function fsDeleteProfile(uid: string, profileId: string): Promise<void> {
  const db = getFirebaseDb();
  if (!db || !uid) return;
  const { doc, deleteDoc } = await import("firebase/firestore");
  await withTimeout(deleteDoc(doc(db, "users", uid, "saved_profiles", profileId)));
}

async function fsDeleteProject(uid: string, projectId: string): Promise<void> {
  const db = getFirebaseDb();
  if (!db || !uid) return;
  const { doc, deleteDoc } = await import("firebase/firestore");
  await withTimeout(deleteDoc(doc(db, "users", uid, "projects", projectId)));
}

async function fsListProjects(uid: string): Promise<Project[]> {
  const db = getFirebaseDb();
  if (!db || !uid) return [];
  const { collection, getDocs } = await import("firebase/firestore");
  const snap = await withTimeout(getDocs(collection(db, "users", uid, "projects")));
  if (!snap) return [];
  return snap.docs.map((d) => {
    const data = d.data() as Omit<Project, "id">;
    return { id: d.id, ...data, visibility: data.visibility ?? "private" };
  });
}

async function fsListProfiles(uid: string): Promise<SavedProfile[]> {
  const db = getFirebaseDb();
  if (!db || !uid) return [];
  const { collection, getDocs } = await import("firebase/firestore");
  const snap = await withTimeout(getDocs(collection(db, "users", uid, "saved_profiles")));
  if (!snap) return [];
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SavedProfile, "id">) }));
}

// takes: arrays a and b of items with an `id`
// does: merges them, de-duplicating by id (first occurrence wins)
// returns: the merged array
function mergeById<T extends { id: string }>(a: T[], b: T[]): T[] {
  const map = new Map<string, T>();
  for (const x of [...a, ...b]) if (x?.id && !map.has(x.id)) map.set(x.id, x);
  return [...map.values()];
}

// ── Public API ─────────────────────────────────────────────────────────────

// takes: uid (string; may be empty), name (string)
// does: creates a project — written to the local mirror immediately and synced
//       to Firestore in the background — so the call returns instantly and never
//       hangs on the network
// returns: a Promise resolving to the new projectId (never null)
export async function createProject(uid: string, name: string, visibility: "public" | "private" = "private"): Promise<string> {
  const project: Project = { id: makeId("proj"), name: name.trim() || "Untitled project", createdAt: Date.now(), visibility };
  const key = projectsKey(uid);
  writeLocal(key, [project, ...readLocal<Project>(key)]);
  void fsSetProject(uid, project).catch(() => {}); // best-effort, not awaited
  return project.id;
}

// takes: uid (string)
// does: lists the user's project folders, newest first, merging the instant
//       local mirror with any Firestore records (best-effort, time-bounded)
// returns: a Promise resolving to Project[]
export async function listProjects(uid: string): Promise<Project[]> {
  const key = projectsKey(uid);
  const local = readLocal<Project>(key).map((p) => ({ ...p, visibility: p.visibility ?? "private" }));
  const remote = uid ? await fsListProjects(uid) : [];
  const tombstoned = new Set(readLocal<string>(deletedProjectsKey(uid)));
  const merged = mergeById(local, remote)
    .filter((p) => !tombstoned.has(p.id))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  if (remote.length) writeLocal(key, merged); // refresh the mirror with cross-device items
  return merged;
}

// takes: uid (string; may be empty), projectId (string), profileData (ProfileInput)
// does: saves a static report snapshot to a project — local mirror immediately,
//       Firestore in the background; re-saving the same company in a project
//       overwrites the prior snapshot
// returns: a Promise resolving to true (the local save always succeeds)
export async function saveProfileToProject(
  uid: string,
  projectId: string,
  profileData: ProfileInput,
): Promise<boolean> {
  if (!projectId) return false;
  const record: SavedProfile = {
    id: `${projectId}__${slug(profileData.companyName)}`,
    projectId,
    companyName: profileData.companyName,
    ticker: profileData.ticker || "",
    reportMarkdown: profileData.reportMarkdown,
    lastUpdated: Date.now(),
    filingDate: profileData.filingDate || "",
  };
  const key = profilesKey(uid);
  const next = [record, ...readLocal<SavedProfile>(key).filter((p) => p.id !== record.id)];
  writeLocal(key, next);
  void fsSetProfile(uid, record).catch(() => {}); // best-effort, not awaited
  return true;
}

// takes: uid (string), projectId (optional string)
// does: lists saved snapshots (local mirror merged with Firestore), optionally
//       filtered to one project, newest-updated first
// returns: a Promise resolving to SavedProfile[]
export async function listSavedProfiles(uid: string, projectId?: string): Promise<SavedProfile[]> {
  const key = profilesKey(uid);
  const local = readLocal<SavedProfile>(key);
  const remote = uid ? await fsListProfiles(uid) : [];
  let merged = mergeById(local, remote).sort((a, b) => (b.lastUpdated || 0) - (a.lastUpdated || 0));
  if (remote.length) writeLocal(key, merged);
  if (projectId) merged = merged.filter((p) => p.projectId === projectId);
  return merged;
}

// takes: uid (string; may be empty), projectId (string)
// does: deletes a project and every saved snapshot inside it — local mirror
//       updated immediately, Firestore cleaned up best-effort in the background
// returns: a Promise resolving to true (the local delete always succeeds)
export async function deleteProject(uid: string, projectId: string): Promise<boolean> {
  if (!projectId) return false;
  // Remember the deletion so the Firestore merge in listProjects can't bring it
  // back (the remote delete below is best-effort and may lag or be blocked).
  const dKey = deletedProjectsKey(uid);
  const tombstones = readLocal<string>(dKey);
  if (!tombstones.includes(projectId)) writeLocal(dKey, [projectId, ...tombstones]);
  // Remove the project itself from the local mirror.
  const pKey = projectsKey(uid);
  writeLocal(pKey, readLocal<Project>(pKey).filter((p) => p.id !== projectId));
  // Remove its saved snapshots from the local mirror, and remember their ids
  // so we can delete the matching Firestore docs.
  const sKey = profilesKey(uid);
  const profiles = readLocal<SavedProfile>(sKey);
  const owned = profiles.filter((p) => p.projectId === projectId);
  writeLocal(sKey, profiles.filter((p) => p.projectId !== projectId));
  // Firestore cleanup — awaited (time-bounded) so a signed-in user's delete is
  // pushed to the server before the list refreshes. Failures are swallowed; the
  // tombstone above guarantees the project stays gone in this browser regardless.
  await fsDeleteProject(uid, projectId).catch(() => {});
  await Promise.all(owned.map((p) => fsDeleteProfile(uid, p.id).catch(() => {})));
  return true;
}

// takes: uid (string), profileId (string)
// does: removes a saved snapshot from the local mirror and Firestore
// returns: a Promise resolving to true
export async function deleteSavedProfile(uid: string, profileId: string): Promise<boolean> {
  const key = profilesKey(uid);
  writeLocal(key, readLocal<SavedProfile>(key).filter((p) => p.id !== profileId));
  void fsDeleteProfile(uid, profileId).catch(() => {});
  return true;
}
