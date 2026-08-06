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

// On Vercel, `x-vercel-forwarded-for` is stamped by the platform edge, which
// strips any client-supplied copy — so it is trustworthy THERE and only there.
// Off Vercel (local dev, a self-hosted node with no trusted proxy in front)
// every forwarded-for header is caller-controlled: a previous version trusted
// `x-vercel-forwarded-for`/`x-real-ip` unconditionally, and an attacker rotated
// `x-real-ip` to mint a fresh rate-limit bucket per request, defeating the
// limiter. So the header is trusted ONLY when we can confirm we are running on
// the platform that sets it.
const ON_VERCEL = !!process.env.VERCEL;
const TRUSTED_IP_HEADER = 'x-vercel-forwarded-for';

// takes: the incoming request and an optional verified uid
// does: derives a stable rate-limit key — the verified uid when available; else
//       the platform-attested client IP, but ONLY where the platform is known to
//       stamp it; otherwise a single shared bucket that cannot be escaped by
//       forging a header
// returns: a rate-limit key string
export function clientKey(request: NextRequest, uid?: string | null): string {
  if (uid) return uid;
  if (ON_VERCEL) {
    const ip = (request.headers.get(TRUSTED_IP_HEADER) ?? '').split(',')[0].trim();
    if (ip) return `ip:${ip}`;
  }
  // Not on a platform whose IP header we can trust. A single shared bucket still
  // throttles abuse; trusting a spoofable header would instead REMOVE the limit,
  // which is strictly worse. The trade-off is that all anonymous callers share
  // one bucket off-Vercel — acceptable for a low-traffic tool, and the honest
  // failure direction.
  return 'anon';
}
