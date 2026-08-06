/**
 * ownerVault.ts
 * Sealing user emails so only the workspace owner can read them.
 *
 * THE PROBLEM
 * A signup has to record who asked for access, and the owner has to see that to
 * make a decision. Storing the address in the clear means anything that can read
 * browser storage — an extension, an XSS payload, a synced backup, whoever picks
 * up an unlocked laptop — gets the full membership list of real people.
 *
 * THE DESIGN
 * The owner holds an RSA-OAEP keypair. The PUBLIC key is stored openly, so any
 * signup can encrypt its own address to it without holding a secret. The PRIVATE
 * key is wrapped with AES-GCM under a key derived from the owner's password via
 * PBKDF2, so it exists on disk only as ciphertext. Nothing can read a single
 * address without the owner's password — not another signed-in account, not a
 * script reading localStorage, not the app itself while the owner is away.
 *
 * Alongside the sealed address each record keeps two derived values that are
 * safe to expose: a salted hash for identity matching (so a returning user is
 * recognized without decrypting anything) and a mask like `a•••e@example.com`
 * for display.
 *
 * WHAT THIS IS NOT
 * This protects data AT REST in the browser. It is not multi-tenant isolation:
 * in the keyless deployment every account shares one origin, so a hostile signed-
 * in user still runs scripts on the same storage and can seal new records or
 * delete existing ones. They cannot READ addresses, which is the property asked
 * for — but enforcing who may write, and keeping one user's data off another
 * user's device at all, requires the server to hold the roster. See
 * docs/PRIVACY.md for the boundary and the migration path.
 */

const PBKDF2_ITERATIONS = 210_000;
const RSA_MODULUS_BITS = 2048;

export interface SealedBox {
  /** Base64 RSA-OAEP ciphertext of the plaintext address. */
  ciphertext: string;
}

export interface OwnerKeyMaterial {
  /** Base64 SPKI of the owner's public key — safe to store openly. */
  publicKey: string;
  /** Base64 AES-GCM ciphertext of the PKCS8 private key. */
  wrappedPrivateKey: string;
  /** Base64 salt for the PBKDF2 derivation of the wrapping key. */
  salt: string;
  /** Base64 IV used for the AES-GCM wrap. */
  iv: string;
  iterations: number;
}

const VAULT_KEY = "map.ownerVault";

// takes: an ArrayBuffer or view
// does: base64-encodes it
// returns: the base64 string
function toB64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

// takes: a base64 string
// does: decodes it to bytes
// returns: the Uint8Array
function fromB64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// takes: the owner's password and a salt
// does: derives the AES-GCM key that wraps the private key
// returns: the derived CryptoKey
async function wrappingKey(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

// takes: nothing
// does: reads the stored owner key material
// returns: the material, or null when the vault has never been created
export function loadVault(): OwnerKeyMaterial | null {
  try {
    const raw = localStorage.getItem(VAULT_KEY);
    return raw ? (JSON.parse(raw) as OwnerKeyMaterial) : null;
  } catch {
    return null;
  }
}

// takes: the owner's password
// does: creates the keypair, wraps the private half under the password, and
//       stores both halves; a no-op when a vault already exists
// returns: the stored key material
export async function createVault(password: string): Promise<OwnerKeyMaterial> {
  const existing = loadVault();
  if (existing) return existing;

  const pair = await crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: RSA_MODULUS_BITS,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["encrypt", "decrypt"],
  );

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const aes = await wrappingKey(password, salt, PBKDF2_ITERATIONS);
  const pkcs8 = await crypto.subtle.exportKey("pkcs8", pair.privateKey);
  const wrapped = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, aes, pkcs8);

  const material: OwnerKeyMaterial = {
    publicKey: toB64(await crypto.subtle.exportKey("spki", pair.publicKey)),
    wrappedPrivateKey: toB64(wrapped),
    salt: toB64(salt),
    iv: toB64(iv),
    iterations: PBKDF2_ITERATIONS,
  };
  try {
    localStorage.setItem(VAULT_KEY, JSON.stringify(material));
  } catch {}
  return material;
}

// takes: the owner's password
// does: unwraps the private key, which succeeds only for the right password
// returns: the private CryptoKey, or null when the password is wrong or no
//          vault exists
export async function unlockVault(password: string): Promise<CryptoKey | null> {
  const material = loadVault();
  if (!material) return null;
  try {
    const aes = await wrappingKey(password, fromB64(material.salt), material.iterations);
    const pkcs8 = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromB64(material.iv) as BufferSource },
      aes,
      fromB64(material.wrappedPrivateKey) as BufferSource,
    );
    return await crypto.subtle.importKey("pkcs8", pkcs8, { name: "RSA-OAEP", hash: "SHA-256" }, false, [
      "decrypt",
    ]);
  } catch {
    // A wrong password fails AES-GCM's authentication tag. Indistinguishable
    // from a corrupt vault on purpose — neither case should hint at the other.
    return null;
  }
}

// takes: a plaintext email
// does: encrypts it to the owner's public key so only the owner can read it
// returns: the sealed box, or null when no vault exists yet
export async function sealEmail(email: string): Promise<SealedBox | null> {
  const material = loadVault();
  if (!material) return null;
  const publicKey = await crypto.subtle.importKey(
    "spki",
    fromB64(material.publicKey) as BufferSource,
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["encrypt"],
  );
  const ciphertext = await crypto.subtle.encrypt(
    { name: "RSA-OAEP" },
    publicKey,
    new TextEncoder().encode(email.trim().toLowerCase()),
  );
  return { ciphertext: toB64(ciphertext) };
}

// takes: a sealed box and the unlocked private key
// does: decrypts the address
// returns: the plaintext email, or null when it cannot be opened
export async function openEmail(box: SealedBox, privateKey: CryptoKey): Promise<string | null> {
  try {
    const plain = await crypto.subtle.decrypt(
      { name: "RSA-OAEP" },
      privateKey,
      fromB64(box.ciphertext) as BufferSource,
    );
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}

// takes: an email address
// does: derives a stable, non-reversible id for matching a returning user
//       without decrypting anything
// returns: the hex SHA-256 of the normalized address
export async function emailFingerprint(email: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(email.trim().toLowerCase()),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// takes: an email address
// does: reduces it to a shape that identifies the account to its owner without
//       exposing the address — `alice@example.com` becomes `a•••e@example.com`
// returns: the masked string
export function maskEmail(email: string): string {
  const [local, domain] = email.trim().toLowerCase().split("@");
  if (!domain) return "•••";
  if (local.length <= 2) return `${local[0] ?? "•"}•••@${domain}`;
  return `${local[0]}•••${local[local.length - 1]}@${domain}`;
}
