/**
 * middleware.ts
 * Edge middleware — runs before every request.
 *
 * Page routes (/deep-dive, /sector-scan, /):
 *   AuthGate.tsx handles the client-side sign-in wall.
 *   Middleware cannot run Firebase Admin (no Node.js runtime in Edge),
 *   so page protection is enforced by AuthGate, not here.
 *
 * API routes (/api/*):
 *   If no Authorization header is present at all, reject immediately
 *   with 401 before the handler runs. Token validity is verified inside
 *   the handler by verifyAuth() — that is the authoritative check.
 *
 * Public assets (_next/*, favicon, robots):
 *   Always allowed through.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const ALWAYS_PUBLIC = [
  '/_next',
  '/favicon.ico',
  '/robots.txt',
  '/api/auth',        // Firebase auth callbacks if present
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (ALWAYS_PUBLIC.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  if (pathname.startsWith('/api/')) {
    const auth = request.headers.get('authorization');
    if (!auth?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
