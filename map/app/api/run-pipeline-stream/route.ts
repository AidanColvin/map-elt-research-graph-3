import { NextRequest } from 'next/server';
import { readJsonBody, validatePipeline } from '@/lib/proxyGuard';
import { verifyAuth, clientKey } from '@/lib/verifyAuth';
import { checkRateLimit, rateLimitResponse } from '@/lib/rateLimit';
import { isApprovedCaller } from '@/lib/serverApproval';
import { redactSseFrame } from '@/lib/redactSse';

// takes: a status and message
// does: builds a JSON error Response (this route otherwise streams SSE)
// returns: the Response
function jsonError(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// takes: nothing
// does: builds a TransformStream that redacts investigator names from each SSE
//       `data:` frame, buffering across chunk boundaries so a frame split mid-JSON
//       is still parsed whole
// returns: the TransformStream<Uint8Array, Uint8Array>
function redactStream(): TransformStream<Uint8Array, Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = '';
  return new TransformStream({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true });
      // SSE frames are separated by a blank line. Process every complete frame
      // and keep the trailing partial in the buffer.
      const frames = buffer.split('\n\n');
      buffer = frames.pop() ?? '';
      for (const frame of frames) {
        controller.enqueue(encoder.encode(redactSseFrame(frame) + '\n\n'));
      }
    },
    flush(controller) {
      if (buffer) controller.enqueue(encoder.encode(redactSseFrame(buffer)));
    },
  });
}

// Streaming proxy: forwards the backend's Server-Sent Events progress stream
// straight through to the browser so the progress UI reflects real backend
// work. Never cached — every search is a fresh, live stream.
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

// See app/api/run-pipeline/route.ts for why this is the "map-backend" domain
// and not the stale "aria-pi-api" project.
if (!process.env.BACKEND_API_URL && process.env.NODE_ENV === 'production') {
  console.warn('[run-pipeline-stream] BACKEND_API_URL is not set — falling back to hardcoded domain. Set this env var in production.');
}
const BACKEND_URL = process.env.BACKEND_API_URL || 'https://map-backend-iota.vercel.app';
const BYPASS_TOKEN = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || '';

export async function POST(req: NextRequest) {
  // Validate input FIRST — abusive/malformed requests get a clean 4xx without
  // spending rate-limit budget (they never reach the expensive backend).
  const parsed = await readJsonBody(req);
  if (!parsed.ok) return jsonError(parsed.status, parsed.error);
  const valid = validatePipeline(parsed.value);
  if (!valid.ok) return jsonError(valid.status, valid.error);
  const body = valid.value;

  // Auth optional — keyless pipeline; verify a token if present, else anonymous.
  // Rate-limit only valid requests, per client.
  const decoded = await verifyAuth(req);
  const { allowed, retryAfterSeconds } = checkRateLimit(clientKey(req, decoded?.uid), 'pipeline', 10);
  if (!allowed) return rateLimitResponse(retryAfterSeconds);

  // Whether this caller may see named investigators. Resolved once, up front, so
  // the transform stream below can strip names from the final SSE data frame the
  // same way the non-streaming route does. Fail closed: anonymous → redact.
  const approved = await isApprovedCaller(decoded);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 295_000);

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (BYPASS_TOKEN) headers['x-vercel-protection-bypass'] = BYPASS_TOKEN;

  try {
    const upstream = await fetch(`${BACKEND_URL}/run-pipeline-stream`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: 'no-store',
    });

    clearTimeout(timeout);

    if (!upstream.ok || !upstream.body) {
      return new Response(
        JSON.stringify({ error: `Upstream stream failed (${upstream.status})` }),
        { status: upstream.status || 502, headers: { 'Content-Type': 'application/json' } },
      );
    }

    // Pipe the upstream SSE stream through a redactor. An approved caller passes
    // through untouched; for everyone else each `data:` frame is parsed and any
    // investigator names in it are stripped before the frame reaches the client,
    // so the final report frame cannot leak the names the non-streaming route
    // already protects.
    const safeBody = approved ? upstream.body : upstream.body.pipeThrough(redactStream());

    return new Response(safeBody, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (err: any) {
    clearTimeout(timeout);
    const isTimeout = err?.name === 'AbortError';
    console.error('[run-pipeline-stream] upstream error:', err?.message ?? err);
    return new Response(
      JSON.stringify({ error: isTimeout ? 'Backend timed out' : 'Upstream error' }),
      { status: isTimeout ? 504 : 502, headers: { 'Content-Type': 'application/json' } },
    );
  }
}
