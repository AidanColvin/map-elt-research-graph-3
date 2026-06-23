import { NextRequest, NextResponse } from 'next/server';
import { assembleTalkingPoints, type TalkingPointsRequest } from '@/lib/talkingPoints';

export const dynamic = 'force-dynamic';

// takes: a POST request with the resolved partnership payload
// does: assembles deterministic, recency-ranked BD talking points (no LLM, no
//       network) via the pure lib/talkingPoints module
// returns: { talking_points }
export async function POST(req: NextRequest) {
  let body: TalkingPointsRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.company_name || typeof body.company_name !== 'string') {
    return NextResponse.json({ error: 'company_name is required' }, { status: 400 });
  }

  const talking_points = assembleTalkingPoints(body, new Date().getFullYear());
  return NextResponse.json({ talking_points });
}
