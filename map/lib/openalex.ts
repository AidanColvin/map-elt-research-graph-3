/**
 * OpenAlex client — free, no API key
 * surfaces recent research output that actually names the company
 */

import { getJson } from "./http";
import type { ResearchSignal } from "./types";

// Only life-sciences companies legitimately appear as the subject of the
// biomedical papers OpenAlex is dominated by, so only they keep unfiltered
// results. Tech / software / semiconductor / retail companies get the strict
// relevance filter below — otherwise a common-word name ("Meta", "Oracle",
// "Target") pulls in thousands of unrelated medical papers.
const LIFE_SCIENCES =
  /pharma|biotech|biolog|medic|health|drug|therap|diagnost|life scien|genom|clinical|hospital|vaccine|laborator|surgical|dental/i;

// Top-level OpenAlex concepts that signal a basic-science paper rather than one
// about a consumer/retail/industrial company — used to drop false positives
// for common dictionary-word names like "Target".
const BASIC_SCIENCE = new Set([
  "medicine", "biology", "chemistry", "physics", "genetics", "psychology",
  "cancer", "immunology", "biochemistry", "microbiology", "pharmacology",
  "neuroscience", "geology", "ecology", "virology", "pathology",
  "molecular biology", "organic chemistry", "mathematics", "materials science",
]);

// takes: a SIC / industry description string (or undefined)
// does: decides whether the biomedical papers OpenAlex returns could legitimately
//       be about this company (true only for life-sciences industries)
// returns: true for life-sciences industries, false otherwise
function isLifeSciences(industry?: string): boolean {
  return !!industry && LIFE_SCIENCES.test(industry);
}

// takes: a company name
// does: builds a case-insensitive matcher requiring the name as a whole word
//       (so "Target" matches "Target" but not "targeted" / "targets")
// returns: a RegExp
function nameMatcher(name: string): RegExp {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z])${esc}([^a-z]|$)`, "i");
}

// takes: an OpenAlex work
// does: finds its dominant top-level concept (level ≤ 1, highest score)
// returns: the lowercased concept name, or "" if none
function topConcept(work: any): string {
  const c = (work.concepts ?? [])
    .filter((x: any) => (x.level ?? 0) <= 1 && (x.score ?? 0) >= 0.4)
    .sort((a: any, b: any) => (b.score ?? 0) - (a.score ?? 0))[0];
  return (c?.display_name ?? "").toLowerCase();
}

// takes: a company name and its industry description
// does: queries OpenAlex for recent works, then keeps only ones that actually
//       name the company — and, for non-research industries, drops basic-science
//       papers that merely reuse a common-word name (the "Target" false-positive)
// returns: a relevance-filtered research signal, or null when unavailable
export async function fetchResearch(
  name: string,
  industry?: string,
): Promise<ResearchSignal | null> {
  const url =
    "https://api.openalex.org/works?" +
    `search=${encodeURIComponent(name)}` +
    "&filter=from_publication_date:2024-01-01" +
    "&select=display_name,title,publication_year,primary_location,concepts" +
    "&sort=cited_by_count:desc&per_page=25&mailto=deepdivegen@example.com";
  const data = await getJson<any>(url);
  if (!data?.results) return null;

  const toWork = (w: any) => ({
    title: w.title ?? w.display_name ?? "Untitled",
    year: w.publication_year,
    venue: w.primary_location?.source?.display_name,
  });

  // Life-sciences companies legitimately are the subject of biomedical papers,
  // so keep OpenAlex's results as-is for them.
  if (isLifeSciences(industry)) {
    return {
      count: data.meta?.count ?? data.results.length,
      topWorks: data.results.slice(0, 5).map(toWork),
    };
  }

  // Otherwise (retail/consumer/industrial, common-word names like "Target"),
  // require the paper to actually name the company in its title AND drop
  // basic-science papers that merely reuse the word.
  const named = nameMatcher(name);
  const relevant = data.results.filter((w: any) => {
    const title = w.title ?? w.display_name ?? "";
    return named.test(title) && !BASIC_SCIENCE.has(topConcept(w));
  });
  if (!relevant.length) return { count: 0, topWorks: [] };
  return { count: relevant.length, topWorks: relevant.slice(0, 5).map(toWork) };
}
