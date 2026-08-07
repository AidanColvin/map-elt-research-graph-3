/**
 * gate.ts — the server-side inventory gate.
 *
 * The workbook inventory (partnership rows + the company directory) is not
 * bundled into the client. It is served only by /api/inventory/data, and this
 * module is the check that actually holds: the shared access password is
 * verified HERE, never in the browser, and a successful check mints a signed,
 * expiring token the client presents on every data request. A caller who
 * edits localStorage or reads the JS bundle gets neither the password nor the
 * data — the bundle contains only this gate's client-facing door.
 *
 * Config (all optional — sensible defaults keep the keyless deploy working):
 *   INVENTORY_PASSWORD      — overrides the shared access password.
 *   INVENTORY_TOKEN_SECRET  — overrides the HMAC key. Without it the key is
 *                             derived from the password, which is enough to
 *                             keep tokens unforgeable while the password
 *                             itself stays server-side.
 */
import 'server-only';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

const PASSWORD = process.env.INVENTORY_PASSWORD || 'unc-blue';
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// takes: nothing
// does: derives the 32-byte HMAC key — the configured secret when present,
//       else a stable digest of the password (server-side only either way)
// returns: the key buffer
function secretKey(): Buffer {
  const configured = process.env.INVENTORY_TOKEN_SECRET;
  const material = configured || `map-inventory-v1|${PASSWORD}`;
  return createHash('sha256').update(material).digest();
}

// takes: the submitted password attempt
// does: compares SHA-256 digests in constant time (never the raw strings, so
//       length differences leak nothing either)
// returns: true only on an exact match
export function passwordMatches(attempt: string): boolean {
  const a = createHash('sha256').update(attempt).digest();
  const b = createHash('sha256').update(PASSWORD).digest();
  return timingSafeEqual(a, b);
}

// takes: an optional clock override (tests)
// does: mints an expiring access token: "<expiryMs>.<hmacHex(expiryMs)>"
// returns: the token string
export function mintToken(now: number = Date.now()): string {
  const exp = String(now + TOKEN_TTL_MS);
  const sig = createHmac('sha256', secretKey()).update(exp).digest('hex');
  return `${exp}.${sig}`;
}

// takes: a token from a request header (or null) and an optional clock
// does: checks shape, expiry, and the HMAC signature in constant time
// returns: true only for a well-formed, unexpired, correctly signed token
export function tokenValid(token: string | null, now: number = Date.now()): boolean {
  if (!token) return false;
  const dot = token.indexOf('.');
  if (dot <= 0) return false;
  const exp = token.slice(0, dot);
  const sigHex = token.slice(dot + 1);
  if (!/^\d{1,16}$/.test(exp) || Number(exp) < now) return false;
  if (!/^[0-9a-f]{64}$/.test(sigHex)) return false;
  const want = createHmac('sha256', secretKey()).update(exp).digest();
  const got = Buffer.from(sigHex, 'hex');
  return got.length === want.length && timingSafeEqual(got, want);
}
