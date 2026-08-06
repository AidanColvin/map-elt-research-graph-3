/**
 * relayGuard.ts
 * The ONE chokepoint every backend-relaying proxy must pass a response through.
 *
 * The name redaction first lived only in the partnerships route, and the sector
 * route (/api/run-pipeline) relayed the identical backend JSON verbatim — the
 * same NIH principal investigators the partnerships route hid as
 * "[name hidden]" shipped in cleartext to any unauthenticated caller. A
 * per-route opt-in leaks the moment a new route forgets to opt in.
 *
 * So redaction is not a thing each route remembers to do; it is the only way to
 * turn an upstream response into a client response. Both proxy routes call
 * `relayJson`, and `relayJson` is the single place the approval check and the
 * name stripping happen.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "./verifyAuth";
import { isApprovedCaller } from "./serverApproval";
import { redactPeople } from "./redactPeople";

// takes: the incoming request and the upstream Response
// does: verifies the caller, reads the upstream JSON, and strips every personal
//       name unless the caller is a positively-approved account (fail closed)
// returns: a NextResponse safe to send to THIS caller
export async function relayJson(req: NextRequest, upstream: Response): Promise<NextResponse> {
  const data = await upstream.json();
  const decoded = await verifyAuth(req);
  const approved = await isApprovedCaller(decoded);
  return NextResponse.json(redactPeople(data, approved), {
    status: upstream.status,
    headers: { "Cache-Control": "no-store" },
  });
}
