import { NextRequest, NextResponse } from 'next/server';
import { assembleTalkingPoints, type TalkingPointsRequest } from '@/lib/talkingPoints';
import { readJsonBody } from '@/lib/proxyGuard';
import { verifyAuth, clientKey } from '@/lib/verifyAuth';
import { checkRateLimit, rateLimitResponse } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

// takes: a POST request with the resolved partnership payload
// does: assembles deterministic, recency-ranked BD talking points (no LLM, no
//       network) via the pure lib/talkingPoints module
// returns: { talking_points }
export async function POST(req: NextRequest) {
  // Size-cap + parse first. This route is unauthenticated like the rest of the
  // keyless pipeline, so the guard is what bounds the cost of a hostile call.
  const parsed = await readJsonBody(req);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });

  // `null` and arrays are valid JSON but not valid bodies — reject them here so
  // a property read below can never throw a 500.
  const body = parsed.value;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Body must be a JSON object' }, { status: 400 });
  }

  const { company_name } = body as Record<string, unknown>;
  if (typeof company_name !== 'string' || company_name.trim().length === 0) {
    return NextResponse.json({ error: 'company_name is required' }, { status: 400 });
  }

  const decoded = await verifyAuth(req);
  const { allowed, retryAfterSeconds } = checkRateLimit(clientKey(req, decoded?.uid), 'talking-points', 20);
  if (!allowed) return rateLimitResponse(retryAfterSeconds);

  // Assembly is pure and total, but the payload it walks is attacker-shaped —
  // a malformed nested field must surface as a 400, never an unhandled 500.
  try {
    const talking_points = assembleTalkingPoints(body as TalkingPointsRequest, new Date().getFullYear());
    return NextResponse.json({ talking_points });
  } catch (err: any) {
    console.error('[talking-points] assembly failed:', err?.message ?? err);
    return NextResponse.json({ error: 'Could not assemble talking points from that payload' }, { status: 400 });
  }
}
