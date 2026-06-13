import { NextRequest, NextResponse } from 'next/server';

// Never cache: every partnership lookup must hit the backend live so the
// verbatim source quotes are always current and verifiable.
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

// Same live FastAPI backend the sector/company proxies use. Only an explicit
// BACKEND_API_URL server var may override the public production domain.
const BACKEND_URL = process.env.BACKEND_API_URL || 'https://map-backend-iota.vercel.app';
const BYPASS_TOKEN = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || '';

// takes: the incoming Next.js request carrying {query, type},
// does: proxies the partnership lookup to the FastAPI /api/partnerships
//       endpoint with a generous timeout (sector fan-out is slow),
// returns: the resolver JSON, or a 502/504 error envelope on failure.
export async function POST(req: NextRequest) {
  const body = await req.json();

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
    return NextResponse.json(
      { error: isTimeout ? 'Backend timed out' : (err?.message ?? 'Upstream error') },
      { status: isTimeout ? 504 : 502 }
    );
  }
}
