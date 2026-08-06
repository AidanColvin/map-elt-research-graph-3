/**
 * redactPeople.ts
 * Server-side removal of named individuals from a partnership payload.
 *
 * WHY THIS EXISTS
 * The partnership lookup returns real people: NIH principal investigators
 * (`pi_name`), PubMed co-authors (`authors`, `top_authors`), and the grant
 * numbers tying them to funded work. Each fact is individually public, but the
 * assembled artifact — "here is who to call, and their live grant" — is a
 * targeted outreach list about people who never opted in.
 *
 * Until this module, the only thing keeping that list from anyone with the URL
 * was a check in the browser. A client-side check cannot protect a payload the
 * server already sent: the names arrive over the wire and are in the response
 * whether or not React chooses to render them. Anyone reading the network tab
 * has them.
 *
 * FAIL CLOSED
 * Names are included ONLY when the server can positively verify an approved
 * caller. Everything else — no token, unverifiable token, no service account
 * configured, an error mid-check — redacts. A deployment that forgets to set
 * FIREBASE_SERVICE_ACCOUNT therefore leaks nothing; it just shows counts. That
 * is the correct direction to fail, and it is the opposite of what the app did
 * before, where a missing service account silently meant "treat everyone as
 * anonymous and send everything anyway".
 *
 * Counts, institutions and grant numbers survive redaction, so the product
 * still answers "is there a real tie here, and how strong" without handing over
 * the people.
 */

/**
 * Keys whose value IS a personal name (a string, or an array of them).
 *
 * This list is maintained by hand, which makes it exactly the kind of control
 * that rots: the first version of this module missed `unc_authors`, `pi` and
 * `nih_pis`, and real investigator names shipped to anonymous callers while the
 * response cheerfully carried `"_redacted": true`. The guarantee therefore does
 * not rest on this list being right — it rests on the test in
 * tests/integration/test_partnership_redaction.py, which pulls the upstream
 * payload, harvests every name the backend actually returned, and fails if any
 * of them survives the proxy. Add a key here when that test tells you to.
 */
const NAME_KEYS = new Set([
  "pi_name",
  "pi",
  "authors",
  "top_authors",
  "unc_authors",
  "contact",
  "contacts",
  "investigators",
]);

/**
 * Keys whose entire subtree describes people. The subtree is dropped wholesale
 * rather than field-by-field, so a newly added property inside one of these
 * (say a PI's email or ORCID) cannot leak just because nobody listed it above.
 */
const PEOPLE_CONTAINERS = new Set(["nih_pis", "people", "investigator_details"]);

// takes: any JSON value from the upstream payload
// does: walks it and replaces personal-name fields with a redaction marker,
//       preserving array lengths so counts and "N co-authors" stay truthful
// returns: the redacted value
function walk(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(walk);
  if (!value || typeof value !== "object") return value;

  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
    if (PEOPLE_CONTAINERS.has(key)) {
      // Preserve the count — "3 investigators" stays true — and nothing else.
      out[key] = Array.isArray(inner) ? inner.map(() => ({ redacted: true })) : { redacted: true };
      continue;
    }
    if (NAME_KEYS.has(key)) {
      // Keep the shape and the count; drop the identity.
      out[key] = Array.isArray(inner)
        ? inner.map(() => "[name hidden — sign in for access]")
        : "[name hidden — sign in for access]";
      continue;
    }
    out[key] = walk(inner);
  }
  return out;
}

// takes: the upstream partnership payload and whether the caller is a verified,
//        approved account
// does: returns the payload untouched for an approved caller; otherwise strips
//       every personal name from it
// returns: the payload safe to send to this caller
export function redactPeople(payload: unknown, approved: boolean): unknown {
  if (approved) return payload;
  const redacted = walk(payload) as Record<string, unknown>;
  if (redacted && typeof redacted === "object") {
    redacted._redacted = true;
    redacted._redaction_reason =
      "Named individuals are only sent to approved accounts. Counts and grant identifiers are unaffected.";
  }
  return redacted;
}
