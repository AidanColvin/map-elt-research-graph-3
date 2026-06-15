/**
 * sectorReport.ts — derives the sector-overview report model (stat strip,
 * quick-reference lists, priority matrix, faculty table, data assets, revenue /
 * R&D peer charts) from the already-fetched, double-sourced sector scan.
 *
 * No new API calls, no LLM — every value comes from the pipeline's primary
 * sources (SEC EDGAR, NIH RePORTER, PubMed, ClinicalTrials.gov).
 */
import { parseMoney } from "@/components/Report";

export interface PeerBar { name: string; valueB: number; isSubject?: boolean }
export interface QuickRef { name: string; detail: string; nc?: boolean }
export interface MatrixRow {
  company: string;
  tier: "Strategic" | "Translational";
  signal: "NIH grant" | "PubMed" | "Trial" | "None";
  contact: string;
  contactUrl?: string;
  grantOrPmid?: string;
  grantUrl?: string;
  firstMove: string;
}
export interface FacultyRow {
  name: string; unit: string; grant?: string; grantUrl?: string;
  topic?: string; fy?: string; overlap: string;
}
export interface DataAsset { name: string; url: string; description: string; heldBy: string }
export interface AlignmentBar { name: string; count: number }

export interface SectorReportModel {
  sector: string;
  date: string;
  companiesReviewed: number;
  uncTies: number;
  nihOverlaps: number;
  pubmedPapers: number;
  combinedRevenueB: number;
  ncHeadquartered: number;
  contactNow: QuickRef[];
  warm: QuickRef[];
  cold: string[];
  ospCompanies: string[];
  revenuePeers: PeerBar[];
  rdPeers: PeerBar[];
  matrix: MatrixRow[];
  alignmentChart: AlignmentBar[];
  faculty: FacultyRow[];
  dataAssets: DataAsset[];
}

// Fixed UNC data assets (same set the condensed brief uses).
const DATA_ASSETS: DataAsset[] = [
  { name: "Carolina Data Warehouse for Health", url: "https://tracs.unc.edu/index.php/services/informatics-and-data-science", description: "EHR, labs, imaging metadata · 1M+ patient records", heldBy: "NC TraCS / UNC Health" },
  { name: "NC AHEC Network Data", url: "https://www.ncahec.net/", description: "Rural and underserved populations · 80 NC counties", heldBy: "NC AHEC Program" },
  { name: "Lineberger Cancer Registry", url: "https://unclineberger.org/", description: "Diagnosis, treatment, outcomes · oncology imaging", heldBy: "UNC Lineberger" },
  { name: "Biospecimen Processing Facility", url: "https://www.med.unc.edu/", description: "Tissue, blood, biofluid samples · translational research", heldBy: "UNC School of Medicine" },
  { name: "Sheps Center Rural Health Data", url: "https://www.shepscenter.unc.edu/", description: "Health services · rural NC research", heldBy: "Cecil G. Sheps Center" },
  { name: "NC TraCS Institute", url: "https://tracs.unc.edu/", description: "NIH CTSA hub · IRB infrastructure · clinical research coordination", heldBy: "NC TraCS" },
];

function firstSource(sources: any): string | undefined {
  if (!Array.isArray(sources)) return undefined;
  return sources.find((s) => typeof s === "string" && /^https?:\/\//.test(s));
}
function grantIdFromUrl(url: string): string {
  const m = (url || "").match(/project-details\/([A-Za-z0-9-]+)/);
  return m ? m[1] : "";
}
function fy4(s: string): string {
  const m = (s || "").match(/(19|20)\d{2}/);
  return m ? m[0] : "";
}

// takes: the raw sector-scan report
// does: derives the full sector-overview model from sourced fields only
// returns: SectorReportModel (safe defaults throughout)
export function buildSectorReport(report: any): SectorReportModel {
  const profiles: any[] = Array.isArray(report?.section4_profiles) ? report.section4_profiles : [];
  const sector: string = report?.report_meta?.sector || "Sector";
  const date: string = report?.report_meta?.date || "";

  const fv = (p: any, k: string) => p?.facts?.[k]?.value || "";
  const uncPisOf = (p: any): any[] => Array.isArray(p?.unc_pis) ? p.unc_pis : [];
  const pubAlign = (p: any): any[] =>
    (Array.isArray(p?.unc_alignment) ? p.unc_alignment : []).filter((a: any) => (firstSource(a.sources) || "").includes("pubmed"));

  const uncTies = profiles.filter((p) => p.existing_unc_tie).length;
  const nihOverlaps = profiles.filter((p) => uncPisOf(p).length > 0).length;
  const pubmedPapers = profiles.reduce((s, p) => s + pubAlign(p).length, 0);
  const combinedRevenueB = Math.round(
    profiles.reduce((s, p) => s + parseMoney(fv(p, "revenue")), 0) / 1e9,
  );
  const ncHeadquartered = profiles.filter((p) => p.nc_based).length;

  // Quick reference lists.
  const contactNow: QuickRef[] = [];
  const warm: QuickRef[] = [];
  const cold: string[] = [];
  const ospCompanies: string[] = [];
  for (const p of profiles) {
    const pis = uncPisOf(p);
    if (pis.length) {
      contactNow.push({ name: p.company_name, detail: pis.slice(0, 3).map((x) => x.name).filter(Boolean).join(", ") });
      ospCompanies.push(p.company_name);
    } else if (p.existing_unc_tie) {
      const a = pubAlign(p)[0];
      const yr = a ? fy4(a.unc_fact || a.rationale || "") : "";
      warm.push({ name: p.company_name, detail: yr ? `paper on record (${yr})` : "paper on record", nc: !!p.nc_based });
    } else {
      cold.push(p.company_name);
    }
  }

  // Revenue / R&D peer charts (top 8).
  const peers = (key: string): PeerBar[] =>
    profiles
      .map((p) => ({ name: p.company_name as string, valueB: Math.round((parseMoney(fv(p, key)) / 1e9) * 10) / 10 }))
      .filter((x) => x.valueB > 0)
      .sort((a, b) => b.valueB - a.valueB)
      .slice(0, 8);
  const revenuePeers = peers("revenue");
  const rdPeers = peers("rd_expense");

  // City (for NC in-person first moves), e.g. "Cary, NC" -> "Cary".
  const cityOf = (p: any): string => (fv(p, "hq") || "").split(",")[0].trim();

  // Priority matrix — sorted NIH → PubMed → Trial → None. Companies with no
  // documented signal collapse into a single "Various" row at the end (matches
  // the report layout — one cold-outreach line instead of many empty rows).
  const rank = (p: any) => uncPisOf(p).length ? 3 : p.existing_unc_tie ? 2 : (p.pipeline?.length ? 1 : 0);
  const sorted = [...profiles].sort((a, b) => rank(b) - rank(a));
  const matrix: MatrixRow[] = [];
  const noneNames: string[] = [];
  for (const p of sorted) {
    const pis = uncPisOf(p);
    const tier: "Strategic" | "Translational" = p.partnership_type === "Strategic" ? "Strategic" : "Translational";
    if (pis.length) {
      const pi = pis[0];
      matrix.push({ company: p.company_name, tier, signal: "NIH grant", contact: pi.name, contactUrl: pi.grant_url, grantOrPmid: pi.grant_num || grantIdFromUrl(pi.grant_url || ""), grantUrl: pi.grant_url, firstMove: "Email PI · OSP first" });
    } else if (p.existing_unc_tie) {
      const a = pubAlign(p)[0];
      const yr = a ? fy4(a.unc_fact || a.rationale || "") : "";
      const move = p.nc_based ? `In-person · ${cityOf(p) || "NC"} NC` : (yr ? `Cite ${yr} paper` : "Cite paper");
      matrix.push({ company: p.company_name, tier, signal: "PubMed", contact: a ? (a.unc_unit || "Co-author") : "Co-author", contactUrl: a ? firstSource(a.sources) : undefined, grantOrPmid: undefined, grantUrl: a ? firstSource(a.sources) : undefined, firstMove: move });
    } else if (p.pipeline?.length) {
      matrix.push({ company: p.company_name, tier, signal: "Trial", contact: "—", firstMove: "Reference trial" });
    } else {
      noneNames.push(p.company_name);
    }
  }
  if (noneNames.length) {
    matrix.push({ company: noneNames.join(" · "), tier: "Translational", signal: "None", contact: "—", firstMove: "Cold outreach" });
  }

  // UNC alignment-signal chart — one bar per company (count of sourced UNC
  // alignment links), tallest first; the header colors them by count.
  const alignmentChart: AlignmentBar[] = profiles
    .map((p) => ({ name: p.company_name as string, count: (Array.isArray(p?.unc_alignment) ? p.unc_alignment.length : 0) }))
    .filter((x) => x.count > 0)
    .sort((a, b) => b.count - a.count);

  // Faculty table — flatten PIs across companies, dedupe, newest FY first.
  const seen = new Set<string>();
  const faculty: FacultyRow[] = [];
  for (const p of profiles) {
    for (const pi of uncPisOf(p)) {
      const key = (pi.name || "").toLowerCase();
      if (!pi.name || seen.has(key)) continue;
      seen.add(key);
      faculty.push({
        name: pi.name, unit: pi.org || "UNC Chapel Hill",
        grant: pi.grant_num || grantIdFromUrl(pi.grant_url || ""), grantUrl: pi.grant_url,
        topic: pi.project_title || "", fy: pi.fiscal_year || "", overlap: p.company_name,
      });
    }
  }
  faculty.sort((a, b) => (b.fy || "").localeCompare(a.fy || ""));

  return {
    sector, date, companiesReviewed: profiles.length, uncTies, nihOverlaps, pubmedPapers,
    combinedRevenueB, ncHeadquartered, contactNow, warm, cold, ospCompanies,
    revenuePeers, rdPeers, matrix, alignmentChart, faculty: faculty.slice(0, 12), dataAssets: DATA_ASSETS,
  };
}
