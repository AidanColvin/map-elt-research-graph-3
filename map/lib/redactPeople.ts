/**
 * redactPeople.ts
 * Server-side removal of named individuals from a partnership/sector payload.
 *
 * WHY THIS EXISTS
 * The partnership and sector reports name real people — NIH principal
 * investigators, PubMed co-authors — and staple grant numbers to them. Each
 * fact is individually public, but the assembled artifact ("here is who to
 * call, and their live grant") is a targeted outreach list about people who
 * never opted in. A client-side check cannot protect a payload the server has
 * already sent: the names are in the response bytes whatever React renders.
 *
 * WHY TWO PASSES
 * Key-based redaction alone is not enough, and an audit proved it: the sector
 * report embeds the same names inside FREE TEXT — `relationship_type` reads
 * "grant 5R21… (PI: Owen S Fenton)", and there is a whole
 * `condensed_report_markdown` document with names in prose. Stripping known
 * key names left all of that untouched.
 *
 * So redaction is two passes:
 *   1. HARVEST every personal name from the structured person-fields.
 *   2. REDACT: drop people-subtrees and name-fields by key, AND scrub every
 *      harvested name string out of every remaining text value, prose included.
 *
 * The guarantee therefore does not rest on the key lists being complete; a name
 * that appears in a structured field is scrubbed from the whole document even if
 * it also appears somewhere nobody listed.
 *
 * FAIL CLOSED
 * Names are included ONLY when the caller is positively verified and approved
 * (see lib/serverApproval.ts). No token, no service account, any error → redact.
 *
 * Counts, institutions and grant numbers survive, so the product still answers
 * "is there a tie, and how strong" without handing over the people.
 */

const HIDDEN = "[name hidden — sign in for access]";

/** Keys whose value IS a personal name (a string, or an array of them). */
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
 * Keys whose entire subtree describes people. The subtree is dropped wholesale,
 * so a newly added property inside one (a PI's email, ORCID) cannot leak just
 * because nobody listed it. `.name` fields inside these are also harvested so
 * the person can be scrubbed from free text elsewhere in the document.
 */
const PEOPLE_CONTAINERS = new Set([
  "nih_pis",
  "people",
  "investigator_details",
  "unc_faculty",
  "faculty",
  "priority_targets",
  "unc_pis",
  "research_capacity",
]);

// takes: a candidate harvested string
// does: judges whether it is specific enough to scrub from free text without
//       risking collateral matches — a real full name has a space and length
// returns: true when it is safe and worth scrubbing
function isScrubbable(name: string): boolean {
  const n = name.trim();
  return n.length >= 5 && n.includes(" ");
}

// takes: a value, whether we are inside a people-subtree, and the name set
// does: collects every personal name from name-keyed fields and from `.name`
//       fields that sit inside a people container
// returns: nothing; `names` is populated in place
function collectNames(value: unknown, insidePeople: boolean, names: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) collectNames(item, insidePeople, names);
    return;
  }
  if (!value || typeof value !== "object") return;

  for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
    if (NAME_KEYS.has(key)) {
      if (typeof inner === "string") names.add(inner);
      else if (Array.isArray(inner)) inner.forEach((v) => typeof v === "string" && names.add(v));
    }
    if (insidePeople && key === "name" && typeof inner === "string") names.add(inner);
    collectNames(inner, insidePeople || PEOPLE_CONTAINERS.has(key), names);
  }
}

// takes: a text value and the harvested names (longest first)
// does: replaces every occurrence of a harvested name with the hidden marker
// returns: the scrubbed text
function scrubText(text: string, names: string[]): string {
  let out = text;
  for (const name of names) {
    if (!out.includes(name)) continue;
    out = out.split(name).join(HIDDEN);
  }
  return out;
}

// takes: a value, the harvested names, and whether it is a free-text field
// does: drops people-subtrees, blanks name-keyed fields, and scrubs harvested
//       names out of every remaining string
// returns: the redacted value
function walk(value: unknown, names: string[]): unknown {
  if (typeof value === "string") return scrubText(value, names);
  if (Array.isArray(value)) return value.map((v) => walk(v, names));
  if (!value || typeof value !== "object") return value;

  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
    if (PEOPLE_CONTAINERS.has(key)) {
      // Preserve the count — "3 investigators" stays true — and nothing else.
      out[key] = Array.isArray(inner) ? inner.map(() => ({ redacted: true })) : { redacted: true };
      continue;
    }
    if (NAME_KEYS.has(key)) {
      out[key] = Array.isArray(inner) ? inner.map(() => HIDDEN) : HIDDEN;
      continue;
    }
    out[key] = walk(inner, names);
  }
  return out;
}

// takes: the upstream payload and whether the caller is verified + approved
// does: returns the payload untouched for an approved caller; otherwise strips
//       every personal name — by key, by subtree, and from free text
// returns: the payload safe to send to this caller
export function redactPeople(payload: unknown, approved: boolean): unknown {
  if (approved) return payload;

  const harvested = new Set<string>();
  collectNames(payload, false, harvested);
  // Longest first so "Owen S Fenton" is scrubbed before a shorter substring of
  // it could partially match.
  const names = [...harvested].filter(isScrubbable).sort((a, b) => b.length - a.length);

  const redacted = walk(payload, names) as Record<string, unknown>;
  if (redacted && typeof redacted === "object" && !Array.isArray(redacted)) {
    redacted._redacted = true;
    redacted._redaction_reason =
      "Named individuals are only sent to approved accounts. Counts and grant identifiers are unaffected.";
  }
  return redacted;
}
