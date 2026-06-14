"use client";

import { getFirebaseAuth, getFirebaseDb, firebaseEnabled } from "./firebase";
import type { SavedKind } from "./savedReports";

/**
 * Shareable public report links.
 *
 * Saving a report to the user's account keeps it private (see savedReports.ts).
 * "Share" is the opposite intent: it publishes an immutable, read-only copy to
 * the public `sharedReports/{shareId}` Firestore collection and hands back a URL
 * anyone can open — no sign-in, no account needed to view.
 *
 *   - Anyone can READ a shared doc (firestore.rules makes the collection world-
 *     readable). The id is an unguessable random token, so a link is only known
 *     to whoever it's handed to.
 *   - Only a signed-in user can CREATE one, and shared docs are never updated or
 *     deleted by clients — a published link is a frozen snapshot.
 *
 * Every Firestore call is best-effort: when Firebase isn't configured, or the
 * user isn't signed in, publishing returns null and the UI degrades gracefully
 * (it just won't offer a link) instead of breaking.
 */

export interface SharedReport {
  kind: SavedKind;
  title: string; // display title (company or sector name)
  query: string; // the original company/sector query
  content: string; // company: markdown; sector: JSON.stringify(ReportData)
  createdAt: number; // epoch ms published
  ownerUid?: string; // publisher's uid, for their own bookkeeping
}

// takes: nothing
// does: mints a short, URL-safe, unguessable id for a shared link
// returns: a ~16-char token
function makeShareId(): string {
  const buf = new Uint8Array(12);
  (globalThis.crypto || (window as any).crypto).getRandomValues(buf);
  let s = "";
  for (const b of buf) s += b.toString(36).padStart(2, "0");
  return s.slice(0, 16);
}

// takes: a share id
// does: builds the absolute public URL for that shared report, rooted at the
//       current origin (works on the prod domain, previews, and localhost)
// returns: the full https URL, e.g. https://map-omega-azure.vercel.app/r/abc123
export function shareUrl(id: string): string {
  const origin =
    typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/r/${id}`;
}

// takes: the report to publish (kind, title, query, frozen content)
// does: writes an immutable public copy to Firestore under a random id
// returns: { id, url } on success, or null when sharing isn't available
//          (Firebase unconfigured, signed out, or the write failed)
export async function publishShare(input: {
  kind: SavedKind;
  title: string;
  query: string;
  content: string;
}): Promise<{ id: string; url: string } | null> {
  if (!firebaseEnabled) return null;
  try {
    const db = getFirebaseDb();
    if (!db) return null;
    const uid = getFirebaseAuth()?.currentUser?.uid ?? null;
    if (!uid) return null; // creating a share requires a signed-in account

    const id = makeShareId();
    const payload: SharedReport = {
      kind: input.kind,
      title: input.title,
      query: input.query,
      content: input.content,
      createdAt: Date.now(),
      ownerUid: uid,
    };
    const { doc, setDoc } = await import("firebase/firestore");
    await setDoc(doc(db, "sharedReports", id), payload);
    return { id, url: shareUrl(id) };
  } catch {
    return null;
  }
}

// takes: a share id from the public /r/[id] route
// does: reads the immutable shared report (public read; no auth required)
// returns: the SharedReport, or null when missing / Firebase unconfigured
export async function loadShare(id: string): Promise<SharedReport | null> {
  if (!firebaseEnabled) return null;
  try {
    const db = getFirebaseDb();
    if (!db) return null;
    const { doc, getDoc } = await import("firebase/firestore");
    const snap = await getDoc(doc(db, "sharedReports", id));
    if (!snap.exists()) return null;
    return snap.data() as SharedReport;
  } catch {
    return null;
  }
}
