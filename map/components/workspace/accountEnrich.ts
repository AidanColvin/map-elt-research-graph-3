/**
 * Pure derivations over the account source strings. No network, no LLM — just
 * deterministic parsing so the typed fields stay reproducible across renders.
 */

// Disclaimers that, when they precede the first number, mean the headcount is
// not actually disclosed (the number that follows is an estimate or a parent's
// total, not this account's reported figure).
const NOT_DISCLOSED = /not\s+(separately\s+)?disclosed|not\s+applicable|not\s+publicly|\bn\/a\b|estimated/;

// takes: the free-text approximateEmployees string from a row
// does: extracts the leading reported headcount, rejecting strings whose first
//       number is gated behind a "not disclosed" or "estimated" disclaimer
// returns: the integer headcount, or null when none is cleanly reported
export function deriveEmployees(s: string): number | null {
  if (!s) return null;
  const m = s.match(/\d[\d,]+/);
  if (!m || m.index == null) return null;
  if (NOT_DISCLOSED.test(s.slice(0, m.index).toLowerCase())) return null;
  const n = parseInt(m[0].replace(/,/g, ""), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}
