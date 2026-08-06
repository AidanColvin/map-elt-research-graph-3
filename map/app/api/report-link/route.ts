import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/verifyAuth';
import { isApprovedCaller } from '@/lib/serverApproval';
import { reportUrlFor } from '@/lib/reportLinks';

// Never cache — the answer depends on who is asking.
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

// takes: GET /api/report-link?r=<opaque id>, called via authFetch (Bearer token)
// does: resolves the id to the internal SharePoint report URL and returns it —
//       but ONLY for a verified, approved caller. The URL and its share token
//       never ship in bundle data; they exist only here, server-side, and are
//       handed out one at a time. Returns JSON (not a redirect) because the
//       client fetches this with a token and then opens the URL itself; a 302
//       would be chased by fetch straight into a cross-origin wall.
// returns: { url } for an approved caller; 403/404 otherwise — fail closed
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('r') ?? '';

  // Approval is the gate. No token, no service account, any error → refuse.
  // A deployment that has not configured auth serves NO report links, which is
  // the correct failure: better a dead link than a leaked internal URL.
  const decoded = await verifyAuth(req);
  const approved = await isApprovedCaller(decoded);
  if (!approved) {
    return NextResponse.json(
      { error: 'This report is available to approved accounts only.' },
      { status: 403, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const url = reportUrlFor(id);
  if (!url) {
    return NextResponse.json(
      { error: 'Unknown report.' },
      { status: 404, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  return NextResponse.json({ url }, { headers: { 'Cache-Control': 'no-store' } });
}
