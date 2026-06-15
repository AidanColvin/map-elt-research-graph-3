"use client";

import { getFirebaseAuth, getFirebaseDb } from "./firebase";
import type { MapUser } from "@/components/AuthGate";

/**
 * Per-user saved reports — company deep dives and sector scans a user has
 * chosen to keep. Privacy model:
 *
 *   - Signed-in Firebase users: stored under their own Firestore document tree
 *     `users/{uid}/savedReports/{id}`, isolated per account (a user can only
 *     ever read/write their own — see firestore.rules at the repo root). A
 *     device-local mirror is also kept so reads are instant and survive being
 *     offline or Firestore being unconfigured.
 *   - Guests / no Firebase: stored only in this browser's localStorage,
 *     namespaced by identity. Nothing leaves the device.
 *
 * Every Firestore call is best-effort and wrapped so a missing/locked-down
 * Firestore can never break saving or the site — it silently falls back to the
 * local mirror.
 */

export type SavedKind = "company" | "sector" | "partnership";

export interface SavedReport {
  id: string; // `${kind}:${normalizedQuery}` — re-saving the same subject updates in place
  kind: SavedKind;
  query: string; // the company/sector the user searched
  title: string; // display title
  content: string; // company: markdown; sector: JSON.stringify(ReportData)
  sig: string; // freshness signature captured when saved (see /api/freshness)
  savedAt: number; // epoch ms first saved
  verifiedAt: number; // epoch ms the content was last confirmed current
}

const MAX_SAVED = 40; // cap the local mirror so it can't exhaust localStorage

// takes: a company/sector query string
// does: normalizes it to a stable key (lowercased, single-spaced)
// returns: the normalized key
export function normalizeQuery(q: string): string {
  return q.trim().toLowerCase().replace(/\s+/g, " ");
}

// takes: a kind and query
// does: builds the stable id used to dedupe a subject across re-saves
// returns: the saved-report id
export function savedId(kind: SavedKind, query: string): string {
  return `${kind}:${normalizeQuery(query)}`;
}

// takes: the current MapUser (or null)
// does: resolves the storage scope — the Firebase uid (when a real account is
//       signed in) and the localStorage namespace key
// returns: { uid, localKey }
function scopeOf(user: MapUser | null): { uid: string | null; localKey: string } {
  const uid = !user?.guest ? getFirebaseAuth()?.currentUser?.uid ?? null : null;
  const localKey = uid ?? (user && !user.guest ? `email:${user.email}` : "guest");
  return { uid, localKey };
}

function lsKey(localKey: string): string {
  return `map:saved:${localKey}`;
}

// ----------------------------- local mirror ------------------------------

function readLocal(localKey: string): SavedReport[] {
  try {
    const raw = localStorage.getItem(lsKey(localKey));
    const arr = raw ? (JSON.parse(raw) as SavedReport[]) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeLocal(localKey: string, reports: SavedReport[]): void {
  try {
    const trimmed = [...reports]
      .sort((a, b) => b.verifiedAt - a.verifiedAt)
      .slice(0, MAX_SAVED);
    localStorage.setItem(lsKey(localKey), JSON.stringify(trimmed));
  } catch {
    /* quota or unavailable — saving is best-effort */
  }
}

// ------------------------------ firestore --------------------------------
// All Firestore work is dynamically imported and fully guarded so an
// unconfigured/locked Firestore degrades to the local mirror instead of erroring.

async function readRemote(uid: string): Promise<SavedReport[] | null> {
  try {
    const db = getFirebaseDb();
    if (!db) return null;
    const { collection, getDocs } = await import("firebase/firestore");
    const snap = await getDocs(collection(db, "users", uid, "savedReports"));
    return snap.docs.map((d) => d.data() as SavedReport);
  } catch {
    return null;
  }
}

async function writeRemote(uid: string, r: SavedReport): Promise<void> {
  try {
    const db = getFirebaseDb();
    if (!db) return;
    const { doc, setDoc } = await import("firebase/firestore");
    await setDoc(doc(db, "users", uid, "savedReports", r.id), r);
  } catch {
    /* best-effort */
  }
}

async function deleteRemote(uid: string, id: string): Promise<void> {
  try {
    const db = getFirebaseDb();
    if (!db) return;
    const { doc, deleteDoc } = await import("firebase/firestore");
    await deleteDoc(doc(db, "users", uid, "savedReports", id));
  } catch {
    /* best-effort */
  }
}

// ------------------------------- public api ------------------------------

function mergeById(a: SavedReport[], b: SavedReport[]): SavedReport[] {
  const map = new Map<string, SavedReport>();
  for (const r of [...a, ...b]) {
    const prev = map.get(r.id);
    if (!prev || r.verifiedAt > prev.verifiedAt) map.set(r.id, r);
  }
  return [...map.values()].sort((x, y) => y.verifiedAt - x.verifiedAt);
}

// takes: the current user
// does: lists the user's saved reports, preferring Firestore (cross-device)
//       merged with the device-local mirror; falls back to local-only on any
//       Firestore problem
// returns: saved reports, newest-verified first
export async function listSaved(user: MapUser | null): Promise<SavedReport[]> {
  const { uid, localKey } = scopeOf(user);
  const local = readLocal(localKey);
  if (!uid) return local;
  const remote = await readRemote(uid);
  if (!remote) return local;
  const merged = mergeById(remote, local);
  writeLocal(localKey, merged); // refresh the mirror
  return merged;
}

// takes: the current user and a report to persist
// does: upserts it into the local mirror immediately and (best-effort) Firestore
// returns: the full updated list
export async function saveReport(user: MapUser | null, r: SavedReport): Promise<SavedReport[]> {
  const { uid, localKey } = scopeOf(user);
  const next = mergeById([r], readLocal(localKey));
  writeLocal(localKey, next);
  if (uid) await writeRemote(uid, r);
  return next;
}

// takes: the current user and a saved-report id
// does: removes it from the local mirror and (best-effort) Firestore
// returns: the remaining list
export async function removeSaved(user: MapUser | null, id: string): Promise<SavedReport[]> {
  const { uid, localKey } = scopeOf(user);
  const next = readLocal(localKey).filter((r) => r.id !== id);
  writeLocal(localKey, next);
  if (uid) await deleteRemote(uid, id);
  return next;
}

// takes: a saved kind and the subject query
// does: asks /api/freshness for the subject's current freshness signature
// returns: the signature, or "" when it couldn't be determined
export async function fetchSignature(kind: SavedKind, query: string): Promise<string> {
  try {
    const res = await fetch(
      `/api/freshness?kind=${encodeURIComponent(kind)}&q=${encodeURIComponent(query)}`,
    );
    if (!res.ok) return "";
    const json = (await res.json()) as { sig?: string };
    return json.sig ?? "";
  } catch {
    return "";
  }
}
