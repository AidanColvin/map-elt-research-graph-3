"use client";

import { authFetch } from "./authFetch";

/**
 * openReport.ts
 * Opens an internal partnership-report PDF for an approved user.
 *
 * The report's real SharePoint URL is not in the page — only an opaque id is.
 * This exchanges that id for the URL through the auth-gated /api/report-link
 * route (which fails closed for anyone unapproved), then opens the result. So
 * the internal URL exists in the browser only for the instant an approved user
 * clicks, and never in any bundle a scraper could read.
 */

// takes: the opaque report path stored in the row (e.g. "/api/report-link?r=ab12")
// does: fetches the real URL with the caller's token and opens it in a new tab;
//       shows a short notice when the caller is not approved or the link is gone
// returns: nothing (async)
export async function openReport(reportPath: string): Promise<void> {
  try {
    const res = await authFetch(reportPath, { cache: "no-store" });
    if (res.ok) {
      const { url } = (await res.json()) as { url?: string };
      if (url) {
        window.open(url, "_blank", "noopener,noreferrer");
        return;
      }
    }
    if (res.status === 403) {
      alert("This report is available to approved accounts only.");
      return;
    }
    alert("That report link is not available.");
  } catch {
    alert("Could not open the report right now.");
  }
}

// takes: any string
// does: recognizes the opaque report-link path so callers can special-case it
// returns: true when the value is a gated report link rather than a plain URL
export function isReportLink(value: string): boolean {
  return typeof value === "string" && value.startsWith("/api/report-link?");
}
