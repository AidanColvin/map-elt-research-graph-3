import { NextRequest, NextResponse } from 'next/server';

// Classify a typed subject as a recognized sector or not, by proxying the
// backend's canonical_sector resolver. The home-page search and the Projects
// "auto" mode call this so a sector name (incl. the 24 NAICS supersectors,
// abbreviations, and misspellings) routes to a multi-company sector scan rather
// than a single-company lookup. Pure classification — cheap, no data fetch.
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

// Same backend the pipeline proxies use. We deliberately do NOT read
// NEXT_PUBLIC_API_URL (a stale value once pointed the proxy at an old backend);
// only an explicit server BACKEND_API_URL may override the live domain.
const BACKEND_URL = process.env.BACKEND_API_URL || 'https://map-backend-iota.vercel.app';
const BYPASS_TOKEN = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || '';

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get('q') || '').slice(0, 200);
  if (!q.trim()) {
    return NextResponse.json({ query: '', canonical: null, is_sector: false });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  const headers: Record<string, string> = {};
  if (BYPASS_TOKEN) headers['x-vercel-protection-bypass'] = BYPASS_TOKEN;

  try {
    const upstream = await fetch(
      `${BACKEND_URL}/resolve-kind?q=${encodeURIComponent(q)}`,
      { method: 'GET', headers, signal: controller.signal, cache: 'no-store' },
    );
    clearTimeout(timeout);
    const data = await upstream.json();
    return NextResponse.json(data, {
      status: upstream.status,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (err: any) {
    clearTimeout(timeout);
    // Soft-fail: the caller falls back to its client-side heuristic when the
    // backend is unreachable, so a classification outage never blocks a run.
    console.error('[resolve-kind] upstream error:', err?.message ?? err);
    return NextResponse.json(
      { query: q, canonical: null, is_sector: false, error: 'Upstream error' },
      { status: 200 },
    );
  }
}
