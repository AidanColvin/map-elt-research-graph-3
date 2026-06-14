import { NextRequest, NextResponse } from 'next/server';

// Per-IP rate limiting for expensive proxy routes.
// Each serverless instance tracks its own window — this is a best-effort
// defence (not a global counter), but it blocks trivial flooding per instance.
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 10;           // requests per IP per window per instance

// Map<ip, { count, windowStart }>
const hits = new Map<string, { count: number; windowStart: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    hits.set(ip, { count: 1, windowStart: now });
    return false;
  }
  entry.count += 1;
  if (entry.count > RATE_LIMIT_MAX) return true;
  return false;
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isProxyRoute =
    pathname.startsWith('/api/run-pipeline') ||
    pathname.startsWith('/api/partnerships');

  if (isProxyRoute) {
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      req.headers.get('x-real-ip') ??
      'unknown';

    if (isRateLimited(ip)) {
      return NextResponse.json(
        { error: 'Too many requests. Please wait a minute and try again.' },
        { status: 429, headers: { 'Retry-After': '60' } },
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/run-pipeline', '/api/run-pipeline-stream', '/api/partnerships'],
};
