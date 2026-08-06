# Privacy and data protection

A privacy-first read of Map: what is protected today, what is still exposed, and
what to add next — ranked by how much real risk each one removes.

Written to be honest rather than reassuring. Where a control is cosmetic, it
says so.

---

## 1. What personal data exists here

Three kinds, and they carry very different risk.

| Data | Where it comes from | Risk if leaked |
|---|---|---|
| **Account emails** | People who sign up | Real individuals. A membership list. |
| **Account passwords** | Sign-up form (keyless mode only) | High — people reuse passwords across sites. |
| **Named UNC investigators** | NIH RePORTER, PubMed — public records | Public individually; a *targeted outreach list* in aggregate. |
| **Partner company records** | SEC EDGAR and public web | Low individually; commercially sensitive as a curated set. |
| **Saved projects** | What a user researched | Reveals intent — who this person is scouting, and when. |

The third row is the one most people underestimate. Every fact about a UNC
investigator is individually public. Assembling them into "here are the people
to call, with their live grant numbers" is a new artifact that did not exist
before, and it names people who never opted in.

---

## 2. Fixed

### Passwords were stored in plaintext
`localStorage["map.users"]` held `email → password` verbatim. Any browser
extension, any XSS, any shared or backed-up device yielded working credentials —
for this app and, through reuse, for others.

**Now:** salted PBKDF2-SHA256, 210,000 iterations, constant-time comparison
(`lib/credentials.ts`). The plaintext is never persisted, never placed in the
session object, and never displayed. The Account page's *Show* and *Copy*
password buttons are gone; there is nothing left to reveal.

### Emails were published in storage key names
Saved projects were namespaced `map:saved:email:alice@example.com`, and the
credential store was keyed by address. Anyone reading storage got the full
membership list **without opening a single value**.

**Now:** every store is keyed by an opaque digest of the address
(`lib/savedReports.ts`, `lib/accountApproval.ts`).

### Emails were readable by anything that could read storage
**Now:** the roster keeps a mask (`a•••e@example.com`), a SHA-256 fingerprint for
identity matching, and the real address sealed under **RSA-OAEP to the owner's
public key** (`lib/ownerVault.ts`). The owner's private key exists on disk only
as AES-GCM ciphertext wrapped under a PBKDF2 key from their password.

Reading the roster without the owner's password yields masks and hashes. The
owner unlocks per session, deliberately — masked is the resting state, so a
screen share or a shoulder-surfer does not harvest a mailing list.

### Registering granted immediate access
Anyone who signed up reached the Directory and the named investigators in
Partnerships. **Now** a new account is `pending` until the owner approves it, and
guests are refused those two views outright.

---

## 3. Still exposed — read this part

**The keyless deployment has no server-side authority.** Everything above
protects data *at rest in the browser*. None of it is multi-tenant isolation.
A signed-in user runs scripts on the same origin and can still:

- add or delete roster records (they cannot *read* addresses — that is the
  property being defended, and it holds)
- flip their own `map.session.status` to `approved` and walk into the Directory

**So the approval gate is a UX gate, not an access-control boundary.** It is
worth having — it stops casual access and makes intent explicit — but it will
not stop someone who opens devtools. Do not describe it to users as if it will.

The API routes are the real boundary, and today they are open by design
(`map/middleware.ts`): the pipeline is keyless and guests are supported. That is
a deliberate product decision, and it is fine for *public filings*. It is not
fine for the Directory or Partnerships, which is why those moved behind an
account — but that check currently happens in the client.

---

## 4. What to add next, ranked

### 1. Move the approval check to the server *(highest value)*
Put the roster in Firestore. Have `/api/partnerships` and any directory endpoint
verify a Firebase ID token and refuse callers who are not `approved`. Firestore
rules restrict `accounts/{fingerprint}` to owner-write, self-read.

Until this exists, every other item is defense in depth on a gate that can be
stepped around.

### 2. Stop shipping the partner table to the client wholesale — PARTLY DONE
`accountsData.ts` is compiled into the JS bundle, so the public company facts
(name, revenue, employees, sector — all SEC-public) are in any visitor's
browser before a permission check runs. That remains true and is the next
structural fix: serve the facts from an authenticated, paginated endpoint.

**What is already fixed:** the genuinely sensitive part of that table — the
internal SharePoint report URLs, complete with their `?e=` share tokens — was in
the bundle too and was retrievable by an anonymous GET of a `/_next` chunk (a
confirmed breach). Those URLs now live only in `lib/reportLinks.ts`, a
server-side module the client cannot import, keyed by an opaque id. The browser
carries only `/api/report-link?r=<id>`; the real URL is handed out by that route
solely to a verified, approved caller (fail closed), and the app opens it via an
authenticated fetch. No internal URL or share token ships to the browser.

### 3. Decide the policy on named investigators
This is a judgement call, not a code change, and it should be made explicitly:

- Show names only to approved users (partly done — Partnerships is gated).
- Or show *units and grant numbers* by default and names on request.
- Or drop personal names from exports entirely and keep them on screen only.

Anything exported to CSV/PDF leaves the app permanently. At minimum, exports
should carry a line stating the data names real people and is for internal use.

### 4. Add a retention limit to saved projects
Projects record what a person researched and when — an intent log. There is a
40-item cap and no expiry. Add a visible "clear my history" control and consider
an automatic age-out.

### 5. Make deletion real
There is currently no way for a user to delete their account and its data. If
anyone in scope is in the EU or California, that is a legal requirement, not a
nicety. `clearSession()` only forgets the session.

### 6. Rate-limit by platform IP, not a client header *(done, keep it)*
`lib/verifyAuth.ts` now reads only platform-stamped headers. Do not reintroduce
`x-forwarded-for` — it is caller-controlled and previously defeated the limiter
outright.

### 7. Tighten the existing Content-Security-Policy
A CSP is already served from `next.config.mjs`, along with HSTS, `X-Frame-Options:
DENY`, `nosniff`, `Referrer-Policy: no-referrer` and a `Permissions-Policy`. That
is a genuinely good baseline — an earlier draft of this document wrongly said it
was missing.

The remaining weakness is `script-src 'unsafe-inline'`, which is what a CSP is
mainly there to prevent. Next.js needs it for its inline bootstrap unless nonces
are wired up. Moving to a nonce-based CSP is the single biggest hardening left
here, because `'unsafe-inline'` is exactly the gap an injected script would use
to read the storage this document works to protect.

### 8. Reconsider Sentry's payload
`sentry-sdk` runs with `send_default_pii=False` (good). Confirm report content
and query strings are scrubbed too — a sector query can itself be sensitive.

---

## 5. Threat model, briefly

| Adversary | Stopped by | Result |
|---|---|---|
| Curious person on a shared device | Hashed passwords, sealed emails, masks | Sees masks and hashes. No addresses, no passwords. |
| Browser extension / XSS reading storage | Same | Same — unless it also keylogs the owner's password. |
| Signed-in user poking at devtools | Nothing today | Can self-approve. **Fix with #1.** |
| Someone who wants the partner list | Nothing today | It is in the JS bundle. **Fix with #2.** |
| Network attacker | HTTPS | No plaintext in transit. |
| Someone who wants the investigator list | Account gate (client-side) | Weak until #1. |

---

## 6. Principles worth keeping

- **Mask by default, reveal on purpose.** Ambient exposure is the risk; a
  deliberate unlock is not.
- **Never store what you can derive.** Fingerprints for matching, digests for
  verification, plaintext for neither.
- **Keys must never appear in key names.** The value was encrypted while the
  key name published the address — a whole class of leak hiding in plain sight.
- **Say what a control does not do.** A gate described as security, that is not
  security, is worse than no gate: it produces misplaced confidence.
