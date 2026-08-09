// Sample data for the homepage demo panel (components/workspace/DemoPanel.tsx).
// Bundled statically so the panel never makes a network call.
//
// The company facts below (revenue, employees) are the same real, sourced
// figures already shipped in accountsData.ts. The publication/trial/grant
// counts are illustrative placeholders — Map does not ship a live PubMed,
// ClinicalTrials.gov, or NIH RePORTER snapshot in the client bundle, so a
// real report's exact counts can only come from a live run. Flagged here and
// in the redesign summary rather than presented as a live figure.

// takes: nothing — static export
// does: describes the sample Pfizer brief the demo panel animates through
// returns: n/a (data module)
export const PFIZER_DEMO = {
  name: "Pfizer Inc.",
  overview:
    "Pfizer is a global biopharmaceutical company that discovers, develops, and markets medicines and vaccines across oncology, internal medicine, vaccines, and immunology.",
  financials: "~$62,600M revenue (FY2025, SEC Form 10-K)",
  financialsChip: "SEC 10-K",
  // Placeholder — not pulled from a live query. See redesign summary.
  researchLine: "9 UNC co-authored publications since 2021",
  researchChip: "PubMed",
  // Placeholder — not pulled from a live query. See redesign summary.
  trialsLine: "6 active trials tracked with UNC-affiliated sites",
  trialsChip: "ClinicalTrials.gov",
  // Placeholder — not pulled from a live query. See redesign summary.
  grantsLine: "2 active NIH grant ties to UNC investigators",
  grantsChip: "NIH RePORTER",
  formats: ["PDF", "Word", "Excel", "Markdown"],
} as const;
