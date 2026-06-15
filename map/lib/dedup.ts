/**
 * dedup.ts — validation + deduplication for pipeline-discovered companies
 * before they are merged into the Database tab.
 *
 * Two guarantees the Database relies on:
 *   1. No unvalidated data — every inserted row has a legal name, an identifier
 *      (ticker or CIK), a parseable/empty revenue, and a citable source URL.
 *   2. No duplicates — a company already on file (matched by ticker first, then
 *      normalized legal name) is never re-added, so hand-curated records win.
 *
 * The mapping from a pipeline sector-profile to the Database AccountProfile
 * shape reuses sectorProfileToAccountRow (lib/sector-package.ts) unchanged.
 */
import type { AccountProfile } from "@/components/workspace/accountProfile";
import { sectorProfileToAccountRow, type UNCSignals } from "@/lib/sector-package";

// Mirrors the accepted-domain policy in backend source_tagger.py: a source is
// acceptable when it is a real http(s) URL and is NOT on the aggregator/social
// blocklist. SEC EDGAR and the other primary databases pass; Wikipedia,
// Crunchbase, ZoomInfo, LinkedIn, Glassdoor, and Indeed do not.
const BLOCKED_SOURCE_DOMAINS = [
  "wikipedia.org", "crunchbase.com", "zoominfo.com",
  "linkedin.com", "glassdoor.com", "indeed.com",
];

const EMPTY_SIGNALS: UNCSignals = {
  paperCount: 0, secMentions: 0, nihGrants: 0, uncTrials: 0, topSchools: [], isPartner: false,
};

// takes: a candidate source URL
// does: checks it is a non-empty http(s) URL not on the blocklist
// returns: true when the URL is an acceptable, citable source
export function isAcceptableSource(url: string): boolean {
  const u = (url || "").trim();
  if (!u || !/^https?:\/\//i.test(u)) return false;
  const low = u.toLowerCase();
  return !BLOCKED_SOURCE_DOMAINS.some((d) => low.includes(d));
}

// takes: a raw revenue value (number, or a string like "$416.2B (FY2025)")
// does: parses a leading number with an optional B/M/K suffix; rejects
//       non-numeric placeholders ("N/A", "Not disclosed", etc.)
// returns: the numeric dollar amount, or null when unparseable
export function parseRevenueToNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const m = v.replace(/[, $]/g, "").match(/(-?[\d.]+)\s*([BMK])?/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return null;
  const mult = m[2]?.toUpperCase() === "B" ? 1e9 : m[2]?.toUpperCase() === "M" ? 1e6 : m[2]?.toUpperCase() === "K" ? 1e3 : 1;
  return n * mult;
}

// takes: a company legal name
// does: lowercases and strips common corporate suffixes + punctuation so
//       "Apple Inc." and "apple" collapse to the same key
// returns: the normalized comparison key
export function normalizeLegalName(name: string): string {
  return (name || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\b(inc|incorporated|corp|corporation|ltd|limited|llc|plc|co|company|holdings|group)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// takes: an account row
// does: extracts a stock ticker — first a bare 1–5 letter uppercase alias
//       token, else a "(NYSE: AAPL)" / "NASDAQ: AAPL" style token in the
//       ownership/structure text
// returns: the uppercase ticker, or "" when none is found
export function tickerOf(a: AccountProfile): string {
  const aliasTok = (a.companyAliases || "")
    .split(/[,;]/).map((p) => p.trim())
    .find((p) => /^[A-Z]{1,5}$/.test(p));
  if (aliasTok) return aliasTok.toUpperCase();
  const m = `${a.ownership} ${a.companyStructure}`.match(/\b(?:NYSE|NASDAQ|NYSE American)\s*[:]?\s*([A-Z]{1,5})\b/);
  return m ? m[1].toUpperCase() : "";
}

// takes: a raw pipeline sector profile, the sector name, and a date stamp
// does: validates the company has a legal name, an identifier (ticker or CIK),
//       and at least one citable source; maps it to an AccountProfile with a
//       sanitized revenue, a "Pipeline — <sector> — <date>" provenance, and the
//       ticker preserved for later dedup. Logs and returns null on any failure.
// returns: the validated AccountProfile, or null (skip silently)
export function validateIncomingCompany(
  profile: any,
  sector: string,
  date: string,
): AccountProfile | null {
  const legalName = (profile?.company_name || "").trim();
  if (!legalName) {
    console.warn("[dedup] skipped company with no legal_name");
    return null;
  }
  const facts = profile?.facts || {};
  const fval = (k: string) => facts?.[k]?.value;
  const ticker = String(fval("ticker") || "").trim();
  const cik = String(fval("cik") || "").trim();
  if (!ticker && !cik) {
    console.warn(`[dedup] skipped "${legalName}" — no ticker or CIK`);
    return null;
  }
  const sources: string[] = profile?.overview?.sources || [];
  if (!sources.some(isAcceptableSource)) {
    console.warn(`[dedup] skipped "${legalName}" — no acceptable source URL`);
    return null;
  }

  const row = sectorProfileToAccountRow(profile, sector, EMPTY_SIGNALS, date);
  // Revenue must be a number or empty — never a string like "N/A".
  row.approximateRevenue = parseRevenueToNumber(row.approximateRevenue) === null
    ? "" : row.approximateRevenue;
  // Preserve the ticker (the mapper leaves aliases empty) for dedup + display.
  if (ticker) row.companyAliases = ticker;
  // Provenance stamp.
  row.researchBy = `Pipeline — ${sector} — ${date}`;
  return row;
}

// takes: the existing Database rows and validated incoming rows
// does: merges incoming into existing, skipping any incoming that matches an
//       existing row by ticker (case-insensitive) or, failing that, by
//       normalized legal name; drops rows with neither a ticker nor a name.
//       Existing (curated) rows always win — incoming never overwrites.
// returns: the merged, de-duplicated array (existing first, then new additions)
export function mergeCompaniesIntoDB(
  existing: AccountProfile[],
  incoming: AccountProfile[],
): AccountProfile[] {
  const out = [...existing];
  const tickers = new Set<string>();
  const names = new Set<string>();
  for (const a of existing) {
    const t = tickerOf(a);
    if (t) tickers.add(t.toLowerCase());
    const n = normalizeLegalName(a.account);
    if (n) names.add(n);
  }
  for (const inc of incoming) {
    const t = tickerOf(inc).toLowerCase();
    const n = normalizeLegalName(inc.account);
    if (!t && !n) continue;                 // never add a record with no identity
    if (t && tickers.has(t)) continue;      // ticker match → existing wins
    if (n && names.has(n)) continue;        // name match → existing wins
    out.push(inc);
    if (t) tickers.add(t);
    if (n) names.add(n);
  }
  return out;
}
