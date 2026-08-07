/**
 * POST /api/inventory/unlock
 * Exchanges the shared access password for a signed, expiring inventory
 * token. The password comparison happens only here, server-side — the client
 * bundle never contains it. Rate-limited per caller so the code cannot be
 * brute-forced at meaningful speed.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { passwordMatches, mintToken } from '@/lib/inventory/gate';
import { clientKey } from '@/lib/verifyAuth';
import { checkRateLimit, rateLimitResponse } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const limit = checkRateLimit(clientKey(request), 'inventory-unlock', 10);
  if (!limit.allowed) return rateLimitResponse(limit.retryAfterSeconds);

  let attempt = '';
  try {
    const body = await request.json();
    attempt = typeof body?.password === 'string' ? body.password.trim() : '';
  } catch {
    // malformed body — falls through to the failed check below
  }

  if (!attempt || !passwordMatches(attempt)) {
    return NextResponse.json({ error: 'Wrong password' }, { status: 401 });
  }
  return NextResponse.json({ token: mintToken() });
}
