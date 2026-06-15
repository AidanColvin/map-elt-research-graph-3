/**
 * verifyAuth.ts
 * Optional server-side Firebase token verification.
 *
 * Map's data pipeline is free and keyless by design (SEC EDGAR / PubMed /
 * NIH RePORTER / ClinicalTrials.gov — no API keys), and works for guests. So
 * auth here is OPTIONAL: when a valid Bearer token is present AND a service
 * account is configured, it is verified and the uid returned; otherwise this
 * returns null and the caller proceeds anonymously. It NEVER throws and never
 * blocks a request — callers use `clientKey()` to rate-limit anonymous traffic.
 *
 * firebase-admin is imported LAZILY (dynamic import inside the token branch) so
 * the common keyless path never loads it — importing it at module top crashes
 * the serverless function ("require() of ES Module"). Never logs the raw token.
 */
import type { NextRequest } from 'next/server';

// takes: the incoming request
// does: verifies the Bearer token if one is present AND a service account is
//       configured; loads firebase-admin only on that path
// returns: { uid } on a valid token, or null for anonymous / unverifiable —
//          never throws, never blocks
export async function verifyAuth(request: NextRequest): Promise<{ uid: string } | null> {
  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;

  const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!sa) return null; // keyless deployment — no admin, treat as anonymous

  try {
    const { initializeApp, getApps, cert } = await import('firebase-admin/app');
    const { getAuth } = await import('firebase-admin/auth');
    if (getApps().length === 0) {
      initializeApp({ credential: cert(JSON.parse(sa)) });
    }
    const decoded = await getAuth().verifyIdToken(token);
    return { uid: decoded.uid };
  } catch {
    return null;
  }
}

// takes: the incoming request and an optional verified uid
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
