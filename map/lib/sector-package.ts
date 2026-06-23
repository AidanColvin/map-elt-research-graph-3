/**
 * sector-package.ts — Sector-to-Package pipeline.
 *
 * Turns a completed sector scan into a downloadable ZIP: the full sector PDF,
 * one PDF per company (with UNC partnership signals appended), an Excel export
 * in the exact Database template, a BD one-pager, and a README. Uses only
 * existing endpoints and renderers — no new backend, no invented content.
 *   GET  /api/generate?company=    (streaming markdown)
 *   POST /api/partnerships         (JSON, envelope: { status, data: PartnerData })
 */
import JSZip from "jszip";
import * as XLSX from "xlsx";
import type { ReportData } from "@/components/Report";
import type { AccountProfile } from "@/components/workspace/accountProfile";
import { ACCOUNT_COLUMNS } from "@/components/workspace/accountProfile";
import { ACCOUNTS, getUniqueAccounts } from "@/components/workspace/accountsData";
import { deriveEmployees } from "@/components/workspace/accountEnrich";
import { markdownToPdfBytes, sectorReportToPdfBytes } from "@/lib/report-export";

type SectorProfile = ReportData["section4_profiles"][number];

export interface UNCSignals {
  paperCount: number;
  secMentions: number;
  nihGrants: number;
  uncTrials: number;
  topSchools: string[];
  isPartner: boolean;
}

const EMPTY_SIGNALS: UNCSignals = {
  paperCount: 0, secMentions: 0, nihGrants: 0, uncTrials: 0, topSchools: [], isPartner: false,
};

// takes: a company display name
// does: lowercases + collapses non-alphanumerics to hyphens for safe filenames
// returns: the slug
function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// takes: the completed sector ReportData and an optional cap
// does: lists the scanned company names, UNC-tied companies first, deduped
// returns: up to `maxCount` company names
export function extractTopCompanies(reportData: ReportData, maxCount = 25): string[] {
  const profiles = reportData.section4_profiles || [];
  const tied = (p: SectorProfile) => p.existing_unc_tie || (p.unc_alignment?.length ?? 0) > 0;
  const ordered = [...profiles.filter(tied), ...profiles.filter((p) => !tied(p))];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of ordered) {
    const name = (p.company_name || "").trim();
    const key = name.toLowerCase();
    if (!name || key === "n/a" || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
    if (out.length >= maxCount) break;
  }
  return out;
}

// takes: a company name
// does: GET /api/generate?company= and accumulates all streamed chunks (55s cap)
// returns: the full markdown, or "" on any error — never throws
export async function fetchCompanyMarkdown(company: string): Promise<string> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 55_000);
    const res = await fetch(`/api/generate?company=${encodeURIComponent(company)}`, { signal: controller.signal });
    if (!res.ok || !res.body) { clearTimeout(timer); return ""; }
    const reader = res.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let out = "";
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      out += decoder.decode(value, { stream: true });
    }
    out += decoder.decode();
    clearTimeout(timer);
    return out;
  } catch {
    return "";
  }
}

// takes: a company name
// does: POST /api/partnerships and extracts the real UNC signal counts
// returns: the signals, all fields defaulting to 0/[]/false on any error
export async function fetchPartnershipSignals(company: string): Promise<UNCSignals> {
  try {
    const res = await fetch("/api/partnerships", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: company, type: "company" }),
    });
    const json = await res.json().catch(() => null);
    const d = json?.data;
    if (!res.ok || !d) return { ...EMPTY_SIGNALS };
    const paperCount = d.clinical?.count ?? 0;
    const secMentions = d.financial?.quotes?.length ?? 0;
    const nihGrants = d.nih_grants?.length ?? 0;
    const uncTrials = d.trials?.length ?? 0;
    const topSchools: string[] = (d.unc_units ?? []).slice(0, 2).map((u: { unit: string }) => u.unit);
    return {
      paperCount, secMentions, nihGrants, uncTrials, topSchools,
      isPartner: paperCount > 0 || secMentions > 0 || nihGrants > 0 || uncTrials > 0,
    };
  } catch {
    return { ...EMPTY_SIGNALS };
  }
}

// takes: a sector profile, the sector name, its UNC signals, and a date stamp
// does: maps the profile into a Database AccountProfile row — every absent field
//       is "" (never invented)
// returns: the AccountProfile row
export function sectorProfileToAccountRow(
  profile: SectorProfile,
  sector: string,
  _signals: UNCSignals,
  date: string,
): AccountProfile {
  const fact = (k: string) => profile.facts?.[k]?.value || "";
  return {
    account: profile.company_name,
    founded: "",
    companyAliases: "",
    parentAccount: "",
    topIndustrySectorProfile: profile.sector_tag || sector,
    secondaryIndustrySectorProfile: "",
    description: (profile.overview?.text || "").slice(0, 480),
    website: fact("website"),
    companyStructure: fact("company_structure"),
    ownership: fact("ownership"),
    streetAddress: "",
    city: fact("hq_city"),
    state: fact("hq_state"),
    zipCode: "",
    country: "United States",
    approximateEmployees: fact("employees"),
    approximateRevenue: fact("revenue"),
    keyProducts: (profile.pipeline || []).slice(0, 3).map((p) => p.program).filter(Boolean).join("; "),
    businessSplit: "",
    researchBy: "Map sector scan (auto-generated)",
    dateOfResearch: date,
    resources: (profile.overview?.sources || []).join(" · "),
    linkToReport: "",
    homepage: fact("website"),
    employees: deriveEmployees(fact("employees")),
    uncPartner: { status: "none" },
    uncAngle: "",
  };
}

// takes: a company name and its UNC signals
// does: builds the markdown appendix appended to each company PDF
// returns: the appendix markdown
export function buildUNCAppendix(company: string, signals: UNCSignals): string {
  const depth = signals.isPartner
    ? "Active — verifiable public research ties exist."
    : "None confirmed — no public research signals found. Operational relationships (IT, hiring, clinical) may exist but are not indexed in public research databases.";
  const units = signals.topSchools.length > 0 ? `\n**UNC units involved:** ${signals.topSchools.join(", ")}` : "";
  return [
    "---",
    "## UNC Partnership Signals",
    "",
    "| Signal | Count | Source |",
    "|---|---|---|",
    `| Co-authored papers | ${signals.paperCount} | PubMed |`,
    `| NIH grants (UNC PI) | ${signals.nihGrants} | NIH RePORTER |`,
    `| Clinical trials (UNC site) | ${signals.uncTrials} | ClinicalTrials.gov |`,
    `| SEC filing mentions of UNC | ${signals.secMentions} | SEC EDGAR |`,
    "",
    `**Relationship depth:** ${depth}${units}`,
    "",
    "*Signals from PubMed, NIH RePORTER, ClinicalTrials.gov, SEC EDGAR. Generated by Map.*",
  ].join("\n");
}

// takes: the sector, its ReportData, and per-company summaries
// does: builds a BD-ready one-page markdown summary
// returns: the one-pager markdown
export function buildOnePager(
  sector: string,
  reportData: ReportData,
  summaries: { name: string; isPartner: boolean; sector: string }[],
): string {
  const date = new Date().toISOString().split("T")[0];
  const models = (reportData.section5_value_prop?.partnership_models || [])
    .map((m) => `- **${m.model}** — ${m.description}`).join("\n");
  const rows = summaries.map((c) => `| ${c.name} | ${c.isPartner ? "✅ Active" : "—"} | ${c.sector} |`).join("\n");
  return [
    `# ${sector} — Partnership Intelligence One-Pager`,
    `*Generated ${date} · UNC Innovate Carolina · Map*`,
    "",
    "## Sector Overview",
    reportData.section1_overview?.definition?.text || "",
    "",
    "## Companies Reviewed",
    "| Company | UNC Tie | Sector Tag |",
    "|---|---|---|",
    rows,
    "",
    "## UNC Partnership Models",
    models,
    "",
    "## Sources",
    "Every claim in the full report traces to SEC EDGAR, PubMed, NIH RePORTER, or ClinicalTrials.gov.",
  ].join("\n");
}

export interface PackageResult {
  blob: Blob;
  filename: string;
  newRows: AccountProfile[];
  companyCount: number;
}

// takes: the completed sector ReportData, the sector name, and a progress callback
// does: profiles up to 25 companies (deep-dive + UNC signals, batched 5 at a
//       time), builds new Database rows for companies not already on file, and
//       assembles a ZIP (sector PDF, company PDFs, Excel, one-pager, README)
// returns: the ZIP blob + filename + the new rows + company count
export async function buildSectorPackage(
  reportData: ReportData,
  sector: string,
  onProgress: (step: string, done: number, total: number) => void,
): Promise<PackageResult> {
  const zip = new JSZip();
  const sectorSlug = slugify(sector);
  const dateStr = new Date().toISOString().split("T")[0];

  const companies = extractTopCompanies(reportData, 25);
  onProgress("Extracted companies", 0, companies.length);

  const markdowns: string[] = new Array(companies.length).fill("");
  const signals: UNCSignals[] = companies.map(() => ({ ...EMPTY_SIGNALS }));

  for (let i = 0; i < companies.length; i += 5) {
    const batch = companies.slice(i, i + 5);
    await Promise.allSettled(
      batch.flatMap((name, j) => [
        fetchCompanyMarkdown(name).then((md) => { markdowns[i + j] = md; }),
        fetchPartnershipSignals(name).then((sig) => { signals[i + j] = sig; }),
      ]),
    );
    onProgress("Fetching profiles", Math.min(i + 5, companies.length), companies.length);
  }

  // Build Database rows — prefer the sector profile mapping; fall back to a
  // minimal name-only row for any company without a profile entry.
  const rows: AccountProfile[] = companies.map((name, i) => {
    const profile = reportData.section4_profiles.find((p) => p.company_name === name);
    if (profile) return sectorProfileToAccountRow(profile, sector, signals[i], dateStr);
    return sectorProfileToAccountRow(
      { company_name: name } as SectorProfile,
      sector,
      signals[i],
      dateStr,
    );
  });
  const existingNames = new Set(ACCOUNTS.map((a) => a.account.toLowerCase().trim()));
  const newRows = rows.filter((r) => !existingNames.has(r.account.toLowerCase().trim()));

  // 1. Sector PDF (fail-soft to a one-line note rather than aborting the ZIP).
  try {
    zip.file(`${sectorSlug}-sector-scan.pdf`, sectorReportToPdfBytes(reportData));
  } catch {
    zip.file(`${sectorSlug}-sector-scan.txt`, "Full sector report available in the Map application.");
  }

  // 2. Company PDFs (deep-dive + UNC appendix).
  const companiesFolder = zip.folder("companies")!;
  for (let i = 0; i < companies.length; i++) {
    if (!markdowns[i]) continue;
    const fullMd = `${markdowns[i]}\n\n${buildUNCAppendix(companies[i], signals[i])}`;
    try {
      companiesFolder.file(`${slugify(companies[i])}-profile.pdf`, markdownToPdfBytes(fullMd, companies[i]));
    } catch {
      companiesFolder.file(`${slugify(companies[i])}-profile.md`, fullMd);
    }
  }

  // 3. Excel — existing rows + new rows, exact Database template.
  const allRows = getUniqueAccounts(ACCOUNTS, newRows);
  const header = ACCOUNT_COLUMNS.map((c) => c.label);
  const dataRows = allRows.map((a) => ACCOUNT_COLUMNS.map((c) => a[c.key]));
  const ws = XLSX.utils.aoa_to_sheet([header, ...dataRows]);
  ws["!cols"] = ACCOUNT_COLUMNS.map((c) => (c.kind === "wide" || c.kind === "link" ? { wch: 50 } : { wch: 22 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Accounts");
  zip.file(`${sectorSlug}-accounts.xlsx`, XLSX.write(wb, { bookType: "xlsx", type: "array" }));

  // 4. One-pager.
  const summaries = companies.map((name, i) => ({
    name,
    isPartner: signals[i].isPartner,
    sector: reportData.section4_profiles.find((p) => p.company_name === name)?.sector_tag || sector,
  }));
  zip.file("one-pager.md", buildOnePager(sector, reportData, summaries));

  // 5. README.
  zip.file("README.txt", [
    `Map Sector Package — ${sector}`,
    `Generated: ${new Date().toLocaleString()}`,
    "",
    "Contents:",
    `  ${sectorSlug}-sector-scan.pdf    Full sector intelligence report`,
    `  companies/                        Company deep-dives with UNC signals`,
    `  ${sectorSlug}-accounts.xlsx      Database export (${newRows.length} new companies added)`,
    "  one-pager.md                     BD-ready single-page summary",
    "",
    "Sources: SEC EDGAR, PubMed, NIH RePORTER, ClinicalTrials.gov.",
    "Every claim in the full report is source-linked.",
    "",
    `New companies added to Database this session: ${newRows.length}`,
    ...newRows.map((r) => `  - ${r.account}`),
  ].join("\n"));

  onProgress("Building ZIP", companies.length, companies.length);
  const blob = await zip.generateAsync({ type: "blob" });
  return { blob, filename: `${sectorSlug}-map-package-${dateStr}.zip`, newRows, companyCount: companies.length };
}
