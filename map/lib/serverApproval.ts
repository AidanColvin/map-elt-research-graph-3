/**
 * serverApproval.ts
 * The server-side answer to "is this caller allowed to see named people?"
 *
 * The browser-side approval gate (lib/accountApproval.ts) decides what to
 * RENDER. It cannot decide what to SEND — a visitor who edits their own
 * localStorage walks straight past it, and any payload the server already wrote
 * is visible in the network tab regardless of what React does with it. This
 * module is the check that actually holds, because it runs before the response
 * is written and the caller cannot reach it.
 *
 * FAIL CLOSED, ALWAYS
 * `isApprovedCaller` returns true only when every step positively succeeds:
 * a Bearer token was present, Firebase Admin verified it, and that uid is
 * marked approved in Firestore. Missing token, missing service account,
 * Firestore unreachable, malformed record, thrown error — all return false.
 *
 * The consequence is deliberate: a deployment that has not configured
 * FIREBASE_SERVICE_ACCOUNT shows counts and grant numbers to everyone and names
 * to nobody, including the owner. That is the right failure. The alternative —
 * "we could not check, so allow" — is how this data leaked in the first place.
 *
 * TO TURN ON FULL ACCESS
 *   1. Set FIREBASE_SERVICE_ACCOUNT to the service-account JSON (server-side
 *      env var, never NEXT_PUBLIC_*).
 *   2. Store one document per approved user at `approvedUsers/{uid}` with
 *      `{ approved: true }`.
 *   3. Lock that collection with a Firestore rule allowing client reads of only
 *      one's own document and no client writes at all:
 *
 *        match /approvedUsers/{uid} {
 *          allow read: if request.auth != null && request.auth.uid == uid;
 *          allow write: if false;   // owner writes from the console/admin only
 *        }
 */
import 'server-only';

// takes: the result of verifyAuth — { uid } for a verified token, else null
// does: confirms the uid is marked approved, loading Firebase Admin lazily so
//       the keyless path never pays for it
// returns: true ONLY on a positive verification; false on any doubt
export async function isApprovedCaller(decoded: { uid: string } | null): Promise<boolean> {
  if (!decoded?.uid) return false;

  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!serviceAccount) return false;

  try {
    const { initializeApp, getApps, cert } = await import('firebase-admin/app');
    const { getFirestore } = await import('firebase-admin/firestore');
    if (getApps().length === 0) {
      initializeApp({ credential: cert(JSON.parse(serviceAccount)) });
    }
    const snapshot = await getFirestore().collection('approvedUsers').doc(decoded.uid).get();
    return snapshot.exists && snapshot.data()?.approved === true;
  } catch {
    // Never let an infrastructure problem widen access.
    return false;
  }
}
