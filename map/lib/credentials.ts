/**
 * credentials.ts
 * Password hashing for the keyless (no-Firebase) account path.
 *
 * When Firebase is configured it owns authentication and this module is never
 * used — passwords never reach the app at all. When it is NOT configured the app
 * still offers email/password accounts, and those credentials used to be written
 * to localStorage in PLAINTEXT, keyed by email. Anyone with the device, any
 * browser extension, or any XSS could read every password verbatim — and people
 * reuse passwords across sites, so the blast radius reached well past this app.
 *
 * Now only a salted PBKDF2-SHA256 digest is stored. The plaintext is never
 * persisted, never placed in the session object, and never displayed.
 *
 * This is real hashing, but be clear about what it can and cannot do: a
 * browser-local account store is a convenience for a keyless deployment, not an
 * access-control boundary. Anything that must actually be enforced belongs on
 * the server (Firebase Auth plus Firestore rules).
 */

// OWASP's 2023 floor for PBKDF2-HMAC-SHA256. High enough to make offline
// guessing expensive, low enough to stay imperceptible on a sign-in.
const ITERATIONS = 210_000;
const SALT_BYTES = 16;
const KEY_BITS = 256;

export interface StoredCredential {
  /** Hex-encoded random salt, unique per account. */
  salt: string;
  /** Hex-encoded PBKDF2 digest of the password with that salt. */
  hash: string;
  /** Iteration count used, so the cost can be raised later without breaking logins. */
  iterations: number;
}

// takes: a Uint8Array
// does: renders it as lowercase hex
// returns: the hex string
function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// takes: a hex string
// does: parses it back into bytes
// returns: the Uint8Array
function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

// takes: a plaintext password, a salt, and an iteration count
// does: derives the PBKDF2-SHA256 key for that combination
// returns: the derived bits as hex
async function derive(password: string, salt: Uint8Array, iterations: number): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" },
    keyMaterial,
    KEY_BITS,
  );
  return toHex(new Uint8Array(bits));
}

// takes: a plaintext password
// does: generates a fresh random salt and derives the digest to store
// returns: the StoredCredential to persist — never the plaintext
export async function hashPassword(password: string): Promise<StoredCredential> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derive(password, salt, ITERATIONS);
  return { salt: toHex(salt), hash, iterations: ITERATIONS };
}

// takes: two hex strings of equal length
// does: compares them without an early return, so timing does not reveal how
//       many leading characters matched
// returns: true when they are identical
function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// takes: a candidate password and the stored credential for that account
// does: re-derives the digest with the stored salt and compares in constant time
// returns: true when the password matches
export async function verifyPassword(
  password: string,
  stored: StoredCredential | undefined | null,
): Promise<boolean> {
  if (!stored?.salt || !stored?.hash) return false;
  const candidate = await derive(password, fromHex(stored.salt), stored.iterations || ITERATIONS);
  return constantTimeEquals(candidate, stored.hash);
}
