import { NextRequest, NextResponse } from 'next/server';
import { readJsonBody, validatePartnership } from '@/lib/proxyGuard';
import { verifyAuth, clientKey } from '@/lib/verifyAuth';
import { checkRateLimit, rateLimitResponse } from '@/lib/rateLimit';

// Never cache — every partnership lookup must hit the backend live.
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

// Same live FastAPI backend as the other proxies (see run-pipeline/route.ts).
if (!process.env.BACKEND_API_URL && process.env.NODE_ENV === 'production') {
  console.warn('[partnerships] BACKEND_API_URL is not set — falling back to hardcoded domain. Set this env var in production.');
}
const BACKEND_URL = process.env.BACKEND_API_URL || 'https://map-backend-iota.vercel.app';
const BYPASS_TOKEN = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || '';

// takes: a POST request with JSON { query, type }
// does: proxies the partnership lookup to the FastAPI /api/partnerships endpoint
//       and relays its JSON response (no caching)
// returns: the backend's partnership payload, or an error status on failure
export async function POST(req: NextRequest) {
  // Validate input FIRST — rejects don't spend rate-limit budget.
  const parsed = await readJsonBody(req);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  const valid = validatePartnership(parsed.value);
  if (!valid.ok) return NextResponse.json({ error: valid.error }, { status: valid.status });
  const body = valid.value;

  // Auth optional — keyless pipeline; verify a token if present, else anonymous.
  const decoded = await verifyAuth(req);
  const { allowed, retryAfterSeconds } = checkRateLimit(clientKey(req, decoded?.uid), 'partnerships', 20);
  if (!allowed) return rateLimitResponse(retryAfterSeconds);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 295_000);

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (BYPASS_TOKEN) headers['x-vercel-protection-bypass'] = BYPASS_TOKEN;

  try {
    const upstream = await fetch(`${BACKEND_URL}/api/partnerships`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: 'no-store',
    });
    clearTimeout(timeout);
    const data = await upstream.json();
    return NextResponse.json(data, {
      status: upstream.status,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (err: any) {
    clearTimeout(timeout);
    const isTimeout = err?.name === 'AbortError';
    console.error('[partnerships] upstream error:', err?.message ?? err);
    return NextResponse.json(
      { error: isTimeout ? 'Backend timed out' : 'Upstream error' },
      { status: isTimeout ? 504 : 502 },
    );
  }
}
