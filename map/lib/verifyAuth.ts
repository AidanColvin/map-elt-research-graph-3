/**
 * verifyAuth.ts
 * Optional server-side Firebase token verification.
 *
 * Map's data pipeline is free and keyless by design (SEC EDGAR / PubMed /
 * NIH RePORTER / ClinicalTrials.gov — no API keys), and works for guests. So
 * auth here is OPTIONAL: when a valid Bearer token is present (and a service
 * account is configured) it is verified and the uid returned; otherwise this
 * returns null and the caller proceeds anonymously. It NEVER throws and never
 * blocks a request — callers use `clientKey()` to rate-limit anonymous traffic.
 * Never logs the raw token.
 */
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import type { NextRequest } from 'next/server';

// takes: nothing
// does: lazily initializes the Firebase Admin app from the service-account env
// returns: true if admin is available, false if not configured
function initAdmin(): boolean {
  if (getApps().length > 0) return true;
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!sa) return false;
  try {
    initializeApp({ credential: cert(JSON.parse(sa)) });
    return true;
  } catch {
    return false;
  }
}

// takes: the incoming request
// does: verifies the Bearer token if one is present AND admin is configured
// returns: { uid } on a valid token, or null for anonymous / unverifiable —
//          never throws, never blocks
export async function verifyAuth(request: NextRequest): Promise<{ uid: string } | null> {
  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;
  if (!initAdmin()) return null;
  try {
    const decoded = await getAuth().verifyIdToken(token);
    return { uid: decoded.uid };
  } catch {
    return null;
  }
}

// takes: the incoming request
// does: derives a stable rate-limit key — the verified uid when available, else
//       the client IP (so anonymous callers are throttled per-client, not as one
//       shared bucket)
// returns: a rate-limit key string
export function clientKey(request: NextRequest, uid?: string | null): string {
  if (uid) return uid;
  const xff = request.headers.get('x-forwarded-for') ?? '';
  const ip = xff.split(',')[0].trim();
  return ip ? `ip:${ip}` : 'anon';
}
