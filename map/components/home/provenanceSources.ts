/**
 * The five public records the brief is assembled from, and the caption each one
 * swaps in when it is hovered, focused, or tapped in the provenance diagram.
 *
 * Data and lookups only — the diagram component owns the drawing and the
 * interaction, and imports what it says from here.
 */

export type ProvenanceSource = {
  /** The record's name, set in mono in the diagram. */
  name: string;
  /** What this record contributes to the assembled brief. */
  contribution: string;
  /** The record's live public home, linked from the caption. */
  url: string;
};

export const PROVENANCE_SOURCES: ProvenanceSource[] = [
  {
    name: "SEC EDGAR",
    contribution:
      "Financial statements from XBRL company facts, the narrative sections of the latest 10-K, and executive names parsed from Form 4 filings.",
    url: "https://www.sec.gov/edgar/search/",
  },
  {
    name: "ClinicalTrials.gov",
    contribution:
      "Interventional studies matched on sponsor and collaborator fields, never on free text, so unrelated trials are never attributed.",
    url: "https://clinicaltrials.gov/",
  },
  {
    name: "PubMed",
    contribution:
      "Publications co-authored with UNC, resolved by school and department.",
    url: "https://pubmed.ncbi.nlm.nih.gov/",
  },
  {
    name: "NIH RePORTER",
    contribution:
      "Active federally funded projects naming both the company and the university.",
    url: "https://reporter.nih.gov/",
  },
  {
    name: "OpenAlex",
    contribution:
      "Recent research output used to establish subject-area alignment.",
    url: "https://openalex.org/",
  },
];

/** Shown whenever no source is being hovered, focused, or tapped. */
export const RESTING_CAPTION =
  "Every claim in the brief resolves to one of these five records. Nothing else is permitted as a citation.";

/**
 * takes a source index from 0 to 4, or null for the resting state
 * looks up what that record contributes to the brief
 * returns the caption line to show beneath the diagram
 */
export function captionFor(index: number | null): string {
  if (index === null) return RESTING_CAPTION;
  return PROVENANCE_SOURCES[index]?.contribution ?? RESTING_CAPTION;
}

/**
 * takes the index of a path's own source, and the index being highlighted
 * compares them to decide how prominently that path should draw
 * returns "active" for the highlighted path, "dimmed" for the others, "resting" for none
 */
export function pathState(
  ownIndex: number,
  activeIndex: number | null,
): "active" | "dimmed" | "resting" {
  if (activeIndex === null) return "resting";
  return ownIndex === activeIndex ? "active" : "dimmed";
}

/**
 * takes nothing
 * writes out the flow the diagram draws, for readers who cannot see it
 * returns the SVG's long description text
 */
export function diagramDescription(): string {
  const names = PROVENANCE_SOURCES.map((s) => s.name).join(", ");
  return `Five public records — ${names} — each feed a line into a single assembled brief on the right. One claim in the brief carries citation number one, and a dashed line traces it back to a single filing on sec.gov.`;
}
