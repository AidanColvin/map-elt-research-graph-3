/**
 * domain.ts — health vs non-health classification for sector reports.
 *
 * The report payload carries no `domain` field, so we derive the domain from
 * the sector name (the same approach lib/sectorReport.ts uses to pick data
 * assets). This gates clinical-trial content — pipeline programs, the
 * "Clinical-trial programs by company" chart, the "Trial programs" tile, and
 * "N clinical trials documented on ClinicalTrials.gov" alignment strings —
 * which are ClinicalTrials.gov sponsor-name-collision false positives for
 * non-health sectors (e.g. an oil company carrying an oncology trial, a bank a
 * retinoblastoma trial). Both the on-screen report (components/Report.tsx) and
 * the export builder (lib/report-export.ts) import this single source of truth
 * so the web and downloaded deliverables can never drift apart.
 */

// Health / life-sciences sectors. Mirrors sectorReport.ts oncology + broad-health
// matchers, plus "medtech" (which lacks a \btech\b boundary and otherwise misses).
const HEALTH_RE = /health|medical|medicine|clinical|onco|cancer|tumou?r|carcinoma|leukem|lymphoma|melanoma|disease|therap|drug|pharma|\bbio|genom|\bgene\b|immun|diabet|cardio|neuro|vaccine|patient|\bdevice|diagnostic|surg|hospital|life ?scien|medtech|med ?tech/i;

// takes: the report's sector name (e.g. report_meta.sector)
// does: decides whether the sector is a health / life-sciences domain, where
//       clinical-trial content is legitimate
// returns: true for health sectors, false otherwise (and for empty input)
export function isHealthSector(sector?: string): boolean {
  return HEALTH_RE.test(sector || "");
}

// Phrases that mark sponsor-name-collision clinical contamination when they
// surface on a NON-health company (an oil/bank/food firm "running" trials).
const CLINICAL_RE = /clinical|\btrial|phase\s*\d|carcinoma|cancer|tumou?r|oncolog|leukem|lymphoma|melanoma|gingivitis|colitis|docetaxel|glioblastoma|retinoblastoma/i;

// takes: a free-text label (pipeline program/indication/stage joined, or an
//        alignment string)
// does: tests whether it reads as clinical-trial content
// returns: true when the text looks clinical
export function looksClinical(text?: string): boolean {
  return CLINICAL_RE.test(text || "");
}

// takes: a company's pipeline rows and whether the sector is health
// does: for non-health sectors, drops rows that read as clinical-trial
//       contamination; health sectors are returned untouched
// returns: the pipeline rows safe to render for this sector
export function visiblePipeline<T extends { program?: string; indication?: string; stage?: string }>(
  pipeline: T[] | undefined,
  health: boolean,
): T[] {
  const list = Array.isArray(pipeline) ? pipeline : [];
  if (health) return list;
  return list.filter((r) => !looksClinical(`${r.program || ""} ${r.indication || ""} ${r.stage || ""}`));
}

// takes: a section-3 "UNC Alignment" string and whether the sector is health
// does: for non-health sectors, replaces a bogus "N clinical trials documented
//       on ClinicalTrials.gov" string with a neutral pointer; leaves genuine
//       (publication/grant) alignment strings and all health-sector strings as-is
// returns: the alignment string safe to render
export function cleanAlignment(text: string | undefined, health: boolean): string {
  const s = text || "";
  if (health || !looksClinical(s)) return s;
  return "See company profile";
}
