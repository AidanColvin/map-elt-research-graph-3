/**
 * rateLimit.ts — simple in-memory token bucket per uid.
 * Not distributed — resets on cold start. Sufficient for a low-traffic
 * internal tool. Upgrade to Vercel KV if traffic grows.
 *
 * Limits:
 *   /api/generate         — 10 requests per minute per uid
 *   /api/run-pipeline*    — 3 requests per minute per uid
 *   /api/partnerships     — 20 requests per minute per uid
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const store = new Map<string, Bucket>();

export function checkRateLimit(
  uid: string,
  route: string,
  limitPerMinute: number,
): { allowed: boolean; retryAfterSeconds: number } {
  const key = `${uid}:${route}`;
  const now = Date.now();
  const bucket = store.get(key);

  if (!bucket || now > bucket.resetAt) {
    store.set(key, { count: 1, resetAt: now + 60_000 });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (bucket.count >= limitPerMinute) {
    const retryAfterSeconds = Math.ceil((bucket.resetAt - now) / 1000);
    return { allowed: false, retryAfterSeconds };
  }

  bucket.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

export function rateLimitResponse(retryAfterSeconds: number): Response {
  return new Response(
    JSON.stringify({ error: 'Too many requests', retryAfter: retryAfterSeconds }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(retryAfterSeconds),
      },
    },
  );
}
