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

// Sector-tailored UNC data assets — each report surfaces the assets relevant to
// its topic, falling back to UNC's core health/biomedical strengths.
const ASSET_GROUPS: { match: RegExp; assets: DataAsset[] }[] = [
  { match: /oncolog|cancer|tumou?r|carcinoma|leukem|lymphoma|melanoma/i, assets: [
    { name: "Lineberger Cancer Registry & Tissue Procurement", url: "https://unclineberger.org/", description: "Diagnosis, treatment & outcomes data + tumor biospecimens", heldBy: "UNC Lineberger" },
    { name: "High-Throughput Sequencing Facility", url: "https://www.med.unc.edu/", description: "Genomic & transcriptomic sequencing at scale", heldBy: "UNC School of Medicine" },
    { name: "Carolina Data Warehouse for Health", url: "https://tracs.unc.edu/", description: "EHR, labs & imaging metadata · 1M+ patients", heldBy: "NC TraCS / UNC Health" },
  ] },
  // Climate / energy / environment — placed BEFORE the tech group so a name
  // carrying both a climate token and a \btech\b token (e.g. "Climate Tech")
  // resolves to environmental assets, not data-science ones.
  { match: /climate|energy|environment|sustainab|clean ?tech|carbon|coastal|marine|ocean|\bwater\b|utilit|\bpower\b|electric|\bgrid\b|nuclear|renewable|\bsolar\b|\bwind\b/i, assets: [
    { name: "UNC Institute for the Environment", url: "https://ie.unc.edu/", description: "Environmental modeling, energy transition & clean-tech research", heldBy: "UNC-Chapel Hill" },
    { name: "Institute of Marine Sciences", url: "https://ims.unc.edu/", description: "Coastal, estuarine & marine field data and labs", heldBy: "UNC-Chapel Hill" },
    { name: "The Water Institute", url: "https://waterinstitute.unc.edu/", description: "Water, sanitation & resource-management data", heldBy: "Gillings School of Global Public Health" },
  ] },
  { match: /\bai\b|artificial intelligence|machine learning|\bml\b|data scien|software|cloud|comput|cyber|semiconductor|\bchip|informatics|analytics|quantum|robot|\btech\b|technolog|information technology|\bit\b|internet|hardware|electronic|telecom|\bnetwork|\b5g\b|streaming|\bmedia\b|gaming|video game|\bsaas\b|platform|digital|communication|broadcast|publishing|advertis/i, assets: [
    { name: "RENCI — Renaissance Computing Institute", url: "https://renci.org/", description: "Applied AI, cyberinfrastructure & large-scale data science", heldBy: "UNC-Chapel Hill" },
    { name: "School of Data Science and Society", url: "https://datascience.unc.edu/", description: "Cross-disciplinary data-science research & talent", heldBy: "UNC-Chapel Hill" },
    { name: "Odum Institute for Research in Social Science", url: "https://odum.unc.edu/", description: "Survey, economic & administrative-data archive · analytics methods", heldBy: "UNC-Chapel Hill" },
  ] },
  // Materials / chemicals / mining — UNC's chemistry & applied physical sciences.
  { match: /material|chemical|mining|\bmetals?\b|\bsteel\b|cement|\bpaper\b|packaging|polymer|coating|\bplastic/i, assets: [
    { name: "UNC Department of Chemistry", url: "https://chem.unc.edu/", description: "Materials, polymer & synthetic chemistry research", heldBy: "UNC-Chapel Hill" },
    { name: "Department of Applied Physical Sciences", url: "https://aps.unc.edu/", description: "Materials science, soft matter & advanced manufacturing", heldBy: "UNC-Chapel Hill" },
    { name: "Frank Hawkins Kenan Institute", url: "https://kenaninstitute.unc.edu/", description: "Commercialization & industry partnerships", heldBy: "Kenan-Flagler Business School" },
  ] },
  { match: /fintech|financ|bank|insur|capital|invest|business|econom|\bmarket|retail|consumer|staple|discretionary|real estate|\breit|propert|apparel|restaurant|hotel|leisure|homebuild|industrial|manufactur/i, assets: [
    { name: "Frank Hawkins Kenan Institute of Private Enterprise", url: "https://kenaninstitute.unc.edu/", description: "Economic forecasting, market & private-capital research", heldBy: "Kenan-Flagler Business School" },
    { name: "Institute for Private Capital", url: "https://uncipc.org/", description: "Private equity, venture & fund-performance datasets", heldBy: "Kenan-Flagler Business School" },
    { name: "Odum Institute for Research in Social Science", url: "https://odum.unc.edu/", description: "Survey, economic & administrative-data archive", heldBy: "UNC-Chapel Hill" },
  ] },
  { match: /population|social|demograph|policy|education|\bedtech|\bed ?tech|workforce|government|public health/i, assets: [
    { name: "Carolina Population Center", url: "https://www.cpc.unc.edu/", description: "Population, health & demographic longitudinal data", heldBy: "UNC-Chapel Hill" },
    { name: "Odum Institute for Research in Social Science", url: "https://odum.unc.edu/", description: "Survey research, data archiving & quantitative methods", heldBy: "UNC-Chapel Hill" },
    { name: "Cecil G. Sheps Center", url: "https://www.shepscenter.unc.edu/", description: "Health services, workforce & rural-health data", heldBy: "UNC-Chapel Hill" },
  ] },
  // Broad health/life-sciences catch-all — covers health sectors that don't hit
  // the oncology group (diabetes, immunology, cardiology, neuro, gene therapy,
  // medical devices, etc.) so they still surface UNC's clinical data assets.
  { match: /health|medical|medicine|clinical|disease|therap|drug|pharma|\bbio|genom|\bgene\b|immun|diabet|cardio|neuro|vaccine|patient|device|diagnostic|surg|hospital|life scien|medtech|med ?tech/i, assets: DATA_ASSETS.slice(0, 3) },
];

// Cross-cutting research infrastructure for sectors that match no specific
// domain — relevant to almost any industry, and never health-specific (so a
// tech/industrial/consumer sector never shows a cancer registry as its asset).
const GENERIC_ASSETS: DataAsset[] = [
  { name: "RENCI — Renaissance Computing Institute", url: "https://renci.org/", description: "Applied AI, cyberinfrastructure & large-scale data science", heldBy: "UNC-Chapel Hill" },
  { name: "School of Data Science and Society", url: "https://datascience.unc.edu/", description: "Cross-disciplinary data-science research & talent", heldBy: "UNC-Chapel Hill" },
  { name: "Odum Institute for Research in Social Science", url: "https://odum.unc.edu/", description: "Survey, economic & administrative-data archive", heldBy: "UNC-Chapel Hill" },
];

// takes: the report's sector name
// does: picks the UNC data assets relevant to that topic; sectors that match no
//       specific domain get cross-cutting research infrastructure, NOT health
//       datasets (showing a cancer registry to a tech firm reads as nonsensical)
// returns: up to 3 tailored DataAssets
function pickDataAssets(sector: string): DataAsset[] {
  const hit = ASSET_GROUPS.find((g) => g.match.test(sector || ""));
  return hit ? hit.assets : GENERIC_ASSETS;
}

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
      matrix.push({ company: p.company_name, tier, signal: "NIH grant", contact: pi.name, contactUrl: pi.grant_url, grantOrPmid: pi.grant_num || grantIdFromUrl(pi.grant_url || ""), grantUrl: pi.grant_url, firstMove: "Route via UNC OSP" });
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

  // UNC investigators with RECENT (last 5 FY) NIH grants overlapping a sector
  // company, deduped, newest FY first. We do NOT claim vetted "sector expertise"
  // — only a verified, recent RePORTER overlap (older grants are filtered out).
  const nowFY = new Date().getFullYear();
  const seen = new Set<string>();
  const faculty: FacultyRow[] = [];
  for (const p of profiles) {
    for (const pi of uncPisOf(p)) {
      const key = (pi.name || "").toLowerCase();
      if (!pi.name || seen.has(key)) continue;
      const fyNum = parseInt(String(pi.fiscal_year || "").slice(0, 4), 10);
      if (!fyNum || fyNum < nowFY - 5) continue;
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
    revenuePeers, rdPeers, matrix, faculty: faculty.slice(0, 12), dataAssets: pickDataAssets(sector),
  };
}
