/**
 * GET /api/freshness?kind=company&q=Apple
 *
 * Returns a cheap "freshness signature" for a subject so a saved report can be
 * re-verified on open without regenerating it. The signature changes whenever
 * the underlying public source has new data, so the client can compare it
 * against the signature stored with a saved report and regenerate only when it
 * has actually gone stale.
 *
 * For companies the signature is derived from SEC EDGAR — the most recent
 * filing's accession + date (any new filing => new data) plus the latest 10-K
 * accession — or, for hand-curated profiles, the curated `updated` stamp.
 */

import type { NextRequest } from "next/server";
import { findCurated } from "@/lib/registry";
import { resolveCik, fetchRecentFilings, findLatest10K } from "@/lib/sec";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const kind = req.nextUrl.searchParams.get("kind") ?? "company";
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!q) return json({ sig: "" });

  try {
    if (kind === "company") {
      return json({ sig: await companySignature(q) });
    }
    // Sector freshness is verified by re-running the scan (the client does this
    // in the background), so a coarse day-bucket signature is enough here.
    return json({ sig: `sector:${normalize(q)}:${dayBucket()}` });
  } catch {
    // Never throw — an unknown signature just means "couldn't confirm", and the
    // client treats that conservatively (keeps showing the saved copy).
    return json({ sig: "" });
  }
}

// takes: a company query
// does: builds a signature from the curated stamp and/or the latest SEC filings
// returns: a stable signature string
async function companySignature(q: string): Promise<string> {
  const parts: string[] = [];

  const curated = findCurated(q);
  if (curated) parts.push(`curated:${curated.slug}:${curated.updated}`);

  const hit = await resolveCik(q);
  if (hit) {
    const filings = await fetchRecentFilings(hit.cik);
    const latest = filings[0];
    const tenk = filings.length ? findLatest10K(filings) : null;
    parts.push(
      `sec:${hit.cik}`,
      latest ? `last:${latest.accession}:${latest.date}` : "last:none",
      tenk ? `10k:${tenk.accession}` : "10k:none",
    );
  }

  return parts.length ? parts.join("|") : `none:${normalize(q)}`;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function dayBucket(): string {
  // UTC day, so a saved sector scan re-verifies (re-runs) at most once per day
  // unless the user forces it.
  return new Date().toISOString().slice(0, 10);
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
