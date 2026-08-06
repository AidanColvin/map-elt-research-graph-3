/**
 * accountApproval.ts
 * The owner-approval gate for new accounts.
 *
 * Signing up no longer grants access. A new account is recorded as PENDING and
 * sees a "waiting for approval" screen; a developer-role account reviews the
 * queue and approves or denies it. Only APPROVED accounts reach the workspace,
 * which is what keeps the Directory and the named UNC investigators in
 * Partnerships from being readable by whoever happens to register.
 *
 * ADDRESSES ARE NEVER STORED IN THE CLEAR — not in a value, not in a key.
 * Each record holds three derived things instead:
 *
 *   fingerprint — SHA-256 of the normalized address. It is the record's key, so
 *                 a returning user is recognized without anything reversible.
 *   masked      — `a•••e@example.com`, the only shape a non-owner surface shows.
 *   sealed      — the real address under RSA-OAEP to the owner's public key.
 *                 Openable only by someone who can derive the private key from
 *                 the owner's password (lib/ownerVault.ts).
 *
 * Anything that can read this store without that password gets hashes and masks
 * — never a mailing list of real people.
 *
 * Scope, stated plainly so nobody mistakes this for more than it is: in the
 * keyless deployment the roster lives in localStorage, so it gates the UI on
 * that device but is not an access-control boundary — a signed-in visitor runs
 * scripts on the same origin and can still add or delete records, they simply
 * cannot READ addresses. Enforcing who may write, and keeping one user's data
 * off another user's device at all, requires the server to hold the roster. The
 * record shape is deliberately the shape a Firestore document would have, so
 * that migration is a swap of the read/write helpers and nothing else.
 * See docs/PRIVACY.md.
 */
import { emailFingerprint, maskEmail, sealEmail } from "./ownerVault";

export type ApprovalStatus = "pending" | "approved" | "denied";

export interface AccountRecord {
  /** SHA-256 of the normalized address. The record's key. Not reversible. */
  fingerprint: string;
  /** Masked display form. The only address shape shown outside the owner's view. */
  masked: string;
  /** Base64 RSA-OAEP ciphertext of the real address, or absent if no vault existed. */
  sealed?: string;
  status: ApprovalStatus;
  /** ISO timestamp of the signup request. */
  requestedAt: string;
  /** ISO timestamp of the approve/deny decision, when one has been made. */
  decidedAt?: string;
  /** Masked address of the developer who decided, for a minimal audit trail. */
  decidedBy?: string;
}

const ACCOUNTS_KEY = "map.accounts";

// takes: nothing
// does: reads the account roster from browser storage, tolerating corruption
// returns: a map of fingerprint to record
export function loadAccounts(): Record<string, AccountRecord> {
  try {
    const raw = localStorage.getItem(ACCOUNTS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

// takes: the full account roster
// does: persists it, ignoring quota/private-mode write failures
// returns: nothing
function saveAccounts(accounts: Record<string, AccountRecord>): void {
  try {
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
  } catch {}
}

// takes: an email address
// does: looks up that account's approval status by fingerprint
// returns: the status, or null when the address has never been seen
export async function statusFor(email: string): Promise<ApprovalStatus | null> {
  const record = loadAccounts()[await emailFingerprint(email)];
  return record ? record.status : null;
}

// takes: an email address and whether it should bypass the queue
// does: records a signup request, leaving any existing decision untouched so a
//       denied account cannot re-register its way back to pending
// returns: the resulting status
export async function requestAccess(email: string, autoApprove = false): Promise<ApprovalStatus> {
  const fingerprint = await emailFingerprint(email);
  const accounts = loadAccounts();
  const existing = accounts[fingerprint];
  if (existing) return existing.status;

  const status: ApprovalStatus = autoApprove ? "approved" : "pending";
  const sealed = await sealEmail(email);
  accounts[fingerprint] = {
    fingerprint,
    masked: maskEmail(email),
    ...(sealed ? { sealed: sealed.ciphertext } : {}),
    status,
    requestedAt: new Date().toISOString(),
    ...(autoApprove ? { decidedAt: new Date().toISOString(), decidedBy: "auto" } : {}),
  };
  saveAccounts(accounts);
  return status;
}

// takes: the fingerprint being decided, the decision, and the deciding owner's
//        masked address
// does: records an approve/deny decision with who made it and when
// returns: nothing
export function decide(
  fingerprint: string,
  status: Exclude<ApprovalStatus, "pending">,
  decidedByMasked: string,
): void {
  const accounts = loadAccounts();
  const existing = accounts[fingerprint];
  if (!existing) return;
  accounts[fingerprint] = {
    ...existing,
    status,
    decidedAt: new Date().toISOString(),
    decidedBy: decidedByMasked,
  };
  saveAccounts(accounts);
}

// takes: nothing
// does: collects the accounts still awaiting a decision, oldest request first
// returns: the pending records
export function pendingAccounts(): AccountRecord[] {
  return Object.values(loadAccounts())
    .filter((a) => a.status === "pending")
    .sort((a, b) => a.requestedAt.localeCompare(b.requestedAt));
}

// takes: nothing
// does: collects every account on record, newest request first
// returns: all records
export function allAccounts(): AccountRecord[] {
  return Object.values(loadAccounts()).sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
}
