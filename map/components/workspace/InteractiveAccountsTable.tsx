"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { AccountProfile, UncPartner } from "./accountProfile";
import { FONT } from "./ui";

// takes: a headcount (or null)
// does: formats it with grouped thousands and tabular figures, em dash on null
// returns: the display string for the Employees cell
function fmtEmployees(n: number | null): string {
  return n == null ? "—" : n.toLocaleString("en-US");
}

// UNC partnership pill palette — green for a current partner, amber for a past
// one. "none" renders a quiet gray dash instead of a pill.
const UNC_STYLE: Record<"current" | "past", { label: string; bg: string; color: string }> = {
  current: { label: "Current", bg: "#e7f7ee", color: "#0a7d4f" },
  past: { label: "Past", bg: "#fef3da", color: "#9a6700" },
};

// Sort rank for the UNC column: current partners first, then past, then none.
const UNC_RANK: Record<UncPartner["status"], number> = { current: 2, past: 1, none: 0 };

// takes: a partnership standing
// does: renders the subtle status pill, or a quiet gray dash when not a partner
// returns: the UNC cell node
function UncPill({ unc }: { unc: UncPartner }) {
  if (unc.status === "none") return <span style={{ color: "#c7c7cc" }}>—</span>;
  const s = UNC_STYLE[unc.status];
  return (
    <span
      title={unc.detail || `${s.label} UNC partner`}
      style={{
        display: "inline-block", padding: "2px 10px", fontSize: 12, fontWeight: 500,
        borderRadius: 999, background: s.bg, color: s.color,
      }}
    >
      {s.label}
    </span>
  );
}

// takes: a size in px
// does: draws the small "open in new tab" glyph used by the homepage action
// returns: an inline SVG element
function ExternalLinkIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

/**
 * Interactive Database table: live search, type filter pills (Public / Private /
 * Nonprofit / Government), sortable columns, and a focused, scannable column set
 * with structure pills and exchange tags. All derived from the existing
 * AccountProfile data, no schema changes.
 */

type Kind = "public" | "private" | "nonprofit" | "government";
type SortKey =
  | "account" | "fit" | "unc" | "exchange" | "sector" | "secondary" | "structure" | "ownership"
  | "parent" | "hq" | "employees" | "revenue" | "founded" | "keyProducts"
  | "businessSplit" | "description" | "website" | "aliases" | "researchBy"
  | "dateOfResearch" | "resources" | "report";

// takes: one account row
// does: classifies it into a coarse ownership type by scanning the structure,
//       ownership, and sector text (priority: gov, then nonprofit, then private)
// returns: the Kind bucket used by the filter pills and the structure pill
function classify(a: AccountProfile): Kind {
  const s = `${a.companyStructure} ${a.ownership} ${a.secondaryIndustrySectorProfile}`.toLowerCase();
  if (/government|federal|cabinet|\bdod\b|defense health|state of north carolina|state government|public university entity/.test(s)) return "government";
  if (/nonprofit|non-profit|not-for-profit|501\(c\)|foundation|university-internal/.test(s)) return "nonprofit";
  if (/\bprivate|privately held|venture|family-owned|gmbh|\bsas \(|\bsarl\b/.test(s)) return "private";
  return "public";
}

// takes: one account row
// does: pulls a stock exchange tag (NYSE, NASDAQ, etc.) from the ownership,
//       structure, or alias text if the company is listed
// returns: the exchange name, or "" when none is found
function exchangeOf(a: AccountProfile): string {
  const hay = `${a.ownership} ${a.companyStructure} ${a.companyAliases}`;
  const m = hay.match(/\b(NYSE American|NYSE|NASDAQ|HKEX|XETRA|Euronext|LSE|TSE|SIX|OTC)\b/i);
  if (!m) return "";
  const x = m[1].toUpperCase();
  return x === "NYSE AMERICAN" ? "NYSE Am." : x;
}

// takes: one account row
// does: derives a short alias subtitle (the first alias that is not the row's
//       own name) to show beneath the company name
// returns: the alias string, or ""
function aliasSub(a: AccountProfile): string {
  if (!a.companyAliases) return "";
  const parts = a.companyAliases.split(/[,;]/).map((p) => p.trim()).filter(Boolean);
  for (const p of parts) {
    if (p.toLowerCase() !== a.account.toLowerCase() && !/^[A-Z]{1,5}$/.test(p)) return p;
  }
  return "";
}

// takes: one account row
// does: composes a compact HQ string from city/state, falling back to country
// returns: the HQ label, or ""
function hqOf(a: AccountProfile): string {
  const cs = [a.city, a.state].filter(Boolean).join(", ");
  return cs || a.country || "";
}

// takes: a revenue string (this dataset reports $-millions, e.g. "~$128,700
//        (FY2025)" = $128.7B, or "~$754 million", or "$94.2 billion")
// does: parses the first currency value, keeping commas/decimals, and scales by
//       its unit — bare numbers are millions (the source's convention)
// returns: a comparable number in dollars (0 when unparseable / not disclosed)
function revNum(s: string): number {
  if (!s) return 0;
  const m = s.toLowerCase().match(/\$?\s*([\d,]+(?:\.\d+)?)\s*(billion|million|b|m|k)?/);
  if (!m) return 0;
  const v = parseFloat(m[1].replace(/,/g, ""));
  if (!Number.isFinite(v)) return 0;
  const unit = m[2];
  if (unit === "billion" || unit === "b") return v * 1e9;
  if (unit === "k") return v * 1e3;
  // "million", "m", or no unit at all → $-millions (the dataset's default).
  return v * 1e6;
}

/**
 * UNC Fit (est.) — a deterministic, multi-variable scoring matrix estimating how
 * well a company aligns with UNC's research-partnership strengths. NOT a
 * predictive model: it accumulates explicit weighted points (sector, geography,
 * revenue scale, and growth-pipeline triggers) into a 0+ score, maps that score
 * to a High / Mid / Low pill, and reports the triggers that drove it.
 */

// Primary high-fit sectors (life sciences + health). Includes the spec's terms
// plus the dataset's actual health vocabulary (Medical Devices, Diagnostics,
// Therapeutics, etc.) so obvious health companies aren't missed on wording.
const HIGH_SECTOR = /life scien|biotech|pharma|health|medtech|biomedical|health informatics|pharmacolog|public health|medical|diagnostic|therap|clinical|hospital/i;
// Cross-domain: an IT/software company integrated with healthcare.
const TECH_SECTOR = /it services|software/i;
const HEALTH_KW = /healthcare|clinical|medical/i;
// Research-Triangle / NC geography mentioned outside the HQ state field.
const RTP_GEO = /research triangle|\brtp\b|raleigh|durham|chapel hill|\bcary\b|morrisville|north carolina/i;
// Active non-dilutive federal pipeline or later-stage venture funding.
const GROWTH = /\bnih\b|national institutes of health|\bseries [b-z]\b/i;

type Fit = "High" | "Mid" | "Low";
interface FitResult { level: Fit; score: number; reason: string; }

// takes: one account row plus its parsed revenue in dollars
// does: runs the multi-variable scoring matrix — sector (+40 high-fit / +20
//       health-tech crossover), geography (+30 NC HQ / +15 NC presence), tiered
//       revenue (+30 >$10B / +15 >$1B, gated on having any sector alignment),
//       and growth triggers (+25 for active NIH funding or Series B+). Maps the
//       total to High (>=55) / Mid (15-54) / Low (<15).
// returns: the fit level, its raw score, and the joined trigger-tag rationale
function uncFit(a: AccountProfile, rev: number): FitResult {
  const primary = a.topIndustrySectorProfile || "";
  // Sector classification keys off the sector strings only; the crossover check
  // may also consult descriptive text for a healthcare integration signal.
  const sectorStr = `${a.topIndustrySectorProfile} ${a.secondaryIndustrySectorProfile}`;
  const descBlob = `${sectorStr} ${a.description} ${a.keyProducts}`;
  const tags: string[] = [];
  let score = 0;

  // Sector (max +40) — primary high-fit, else health-tech crossover.
  let sectorScore = 0;
  if (HIGH_SECTOR.test(sectorStr)) { sectorScore = 40; tags.push("life sciences"); }
  else if (TECH_SECTOR.test(primary) && HEALTH_KW.test(descBlob)) { sectorScore = 20; tags.push("health-tech crossover"); }
  score += sectorScore;

  // Geography (max +30) — NC HQ, else an NC / RTP operating footprint.
  const inNC = (a.state || "").trim().toUpperCase() === "NC";
  const nearNC = !inNC && RTP_GEO.test(`${a.city} ${a.streetAddress} ${a.description}`);
  if (inNC) { score += 30; tags.push("NC-based"); }
  else if (nearNC) { score += 15; tags.push("NC presence"); }

  // Revenue (max +30) — tiered, and only amplifies already-aligned companies.
  if (sectorScore > 0) {
    if (rev > 10e9) { score += 30; tags.push("$10B+"); }
    else if (rev > 1e9) { score += 15; tags.push("$1B+"); }
  }

  // Growth trajectory (+25) — active NIH pipeline or Series B+ funding.
  if (GROWTH.test(`${a.description} ${a.resources} ${a.ownership} ${a.companyStructure} ${a.businessSplit}`)) {
    score += 25;
    tags.push("growth pipeline");
  }

  const level: Fit = score >= 55 ? "High" : score >= 15 ? "Mid" : "Low";
  return { level, score, reason: tags.join(" • ") || "no strong signals" };
}

const FIT_STYLE: Record<Fit, { bg: string; color: string }> = {
  High: { bg: "#e7f7ee", color: "#0a7d4f" },
  Mid:  { bg: "#fef3da", color: "#9a6700" },
  Low:  { bg: "#f0f0f2", color: "#6e6e73" },
};

// takes: one account row
// does: extracts the first SEC EDGAR (sec.gov) URL from its resources/report text
// returns: the URL string, or "" when none is present
function secUrlOf(a: AccountProfile): string {
  const hay = `${a.resources} ${a.linkToReport} ${a.ownership}`;
  const m = hay.match(/https?:\/\/(?:www\.)?sec\.gov\/[^\s)]+/i);
  return m ? m[0].replace(/[.,)]+$/, "") : "";
}

const KIND_STYLE: Record<Kind, { label: string; color: string }> = {
  public:     { label: "Public",     color: "#0071e3" },
  private:    { label: "Private",    color: "#e6428a" },
  nonprofit:  { label: "Nonprofit",  color: "#0a9d6e" },
  government: { label: "Government", color: "#e08317" },
};

const FILTERS: { key: "all" | Kind; label: string }[] = [
  { key: "all", label: "All" },
  { key: "public", label: "Public" },
  { key: "private", label: "Private" },
  { key: "nonprofit", label: "Nonprofit" },
  { key: "government", label: "Government" },
];

// Shared native-<select> styling for the filter dropdowns.
const SELECT_STYLE: React.CSSProperties = {
  flex: "0 1 auto", maxWidth: 220, border: "1px solid #e5e5ea", borderRadius: 12,
  padding: "10px 14px", fontSize: 14, outline: "none", fontFamily: FONT,
  color: "#1d1d1f", background: "#fff", cursor: "pointer",
};

export default function InteractiveAccountsTable({
  accounts,
  onExportExcel,
  onExportPdf,
  onExportMarkdown,
  onRunDeepDive,
  busyExport,
}: {
  accounts: AccountProfile[];
  onExportExcel: (rows: AccountProfile[]) => void;
  onExportPdf: (rows: AccountProfile[]) => void;
  onExportMarkdown: (rows: AccountProfile[]) => void;
  onRunDeepDive?: (company: string) => void;
  busyExport: string | null;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | Kind>("all");
  const [sectorFilter, setSectorFilter] = useState("all");
  const [stateFilter, setStateFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("account");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  // The row whose full record is shown in the slide-out panel (null = closed).
  const [selected, setSelected] = useState<AccountProfile | null>(null);
  const [showAllProducts, setShowAllProducts] = useState(false);

  // Precompute derived fields once so search/sort don't re-derive per keystroke.
  const enriched = useMemo(
    () =>
      accounts.map((a) => ({
        a,
        kind: classify(a),
        exchange: exchangeOf(a),
        alias: aliasSub(a),
        hq: hqOf(a),
        emp: a.employees,
        rev: revNum(a.approximateRevenue),
        fit: uncFit(a, revNum(a.approximateRevenue)),
        lifeSci: HIGH_SECTOR.test(`${a.topIndustrySectorProfile} ${a.secondaryIndustrySectorProfile}`),
      })),
    [accounts],
  );

  // Filter option lists, derived from the data so they always stay in sync.
  const sectorOptions = useMemo(
    () =>
      Array.from(new Set(accounts.map((a) => a.topIndustrySectorProfile.trim()).filter(Boolean))).sort(
        (x, y) => x.localeCompare(y),
      ),
    [accounts],
  );
  const stateOptions = useMemo(
    () =>
      Array.from(new Set(accounts.map((a) => (a.state || "").trim()).filter(Boolean))).sort((x, y) =>
        x.localeCompare(y),
      ),
    [accounts],
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = enriched.filter((e) => {
      if (filter !== "all" && e.kind !== filter) return false;
      if (sectorFilter !== "all" && e.a.topIndustrySectorProfile.trim() !== sectorFilter) return false;
      if (stateFilter !== "all" && (e.a.state || "").trim() !== stateFilter) return false;
      if (!q) return true;
      return (
        e.a.account.toLowerCase().includes(q) ||
        e.a.companyAliases.toLowerCase().includes(q) ||
        e.a.topIndustrySectorProfile.toLowerCase().includes(q) ||
        e.hq.toLowerCase().includes(q)
      );
    });
    const dir = sortDir === "asc" ? 1 : -1;
    const str = (e: typeof enriched[number]): string => {
      switch (sortKey) {
        case "fit":           return e.fit.level;
        case "exchange":      return e.exchange;
        case "sector":        return e.a.topIndustrySectorProfile;
        case "secondary":     return e.a.secondaryIndustrySectorProfile;
        case "structure":     return e.kind;
        case "ownership":     return e.a.ownership;
        case "parent":        return e.a.parentAccount;
        case "hq":            return e.hq;
        case "founded":       return e.a.founded;
        case "keyProducts":   return e.a.keyProducts;
        case "businessSplit": return e.a.businessSplit;
        case "description":   return e.a.description;
        case "website":       return e.a.website;
        case "aliases":       return e.a.companyAliases;
        case "researchBy":    return e.a.researchBy;
        case "dateOfResearch":return e.a.dateOfResearch;
        case "resources":     return e.a.resources;
        case "report":        return e.a.linkToReport;
        default:              return e.a.account;
      }
    };
    list = [...list].sort((x, y) => {
      switch (sortKey) {
        // Unknown headcounts (null) always sort to the bottom of the list.
        case "employees": return ((x.emp ?? -1) - (y.emp ?? -1)) * dir;
        case "revenue":   return (x.rev - y.rev) * dir;
        case "fit":       return (x.fit.score - y.fit.score) * dir;
        case "unc":       return (UNC_RANK[x.a.uncPartner.status] - UNC_RANK[y.a.uncPartner.status]) * dir;
        default:          return str(x).localeCompare(str(y)) * dir;
      }
    });
    return list;
  }, [enriched, query, filter, sectorFilter, stateFilter, sortKey, sortDir]);

  // Summary metrics reflect the *currently filtered* set, not the full database.
  const stats = useMemo(() => {
    const total = rows.length;
    const nc = rows.filter((e) => (e.a.state || "").trim().toUpperCase() === "NC").length;
    const lifeSci = rows.filter((e) => e.lifeSci).length;
    const pub = rows.filter((e) => e.kind === "public").length;
    return { total, nc, lifeSci, pub };
  }, [rows]);

  // Close the slide-out panel on Escape; reset the "show more" toggle per record.
  useEffect(() => {
    if (!selected) return;
    setShowAllProducts(false);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setSelected(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  }

  function exportCsv() {
    const headers = ["Company", "Aliases", "Exchange", "Sector", "Structure", "HQ", "Employees", "Revenue", "Founded", "Website"];
    const esc = (v: string) => `"${(v || "").replace(/"/g, '""')}"`;
    const lines = [headers.join(",")];
    for (const e of rows) {
      lines.push([
        e.a.account, e.a.companyAliases, e.exchange, e.a.topIndustrySectorProfile,
        KIND_STYLE[e.kind].label, e.hq, e.a.approximateEmployees, e.a.approximateRevenue,
        e.a.founded, e.a.website,
      ].map(esc).join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "map-database.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  const filteredRows = rows.map((e) => e.a);

  type Enr = (typeof enriched)[number];

  // Reusable cell renderers — plain text (em-dash when empty), external links.
  const txt = (v: string, width?: number): ReactNode => (
    <span
      title={width && v ? v : undefined}
      style={{
        color: v ? "#4b4b51" : "#c7c7cc",
        ...(width ? { display: "block", maxWidth: width, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } : {}),
      }}
    >
      {v || "—"}
    </span>
  );
  const link = (href: string, label: string): ReactNode =>
    href && /^https?:\/\//.test(href) ? (
      <a href={href} target="_blank" rel="noreferrer" title={href} onClick={(ev) => ev.stopPropagation()} style={{ color: "#0071e3", textDecoration: "none", fontWeight: 500 }}>
        {label} ↗
      </a>
    ) : (
      <span style={{ color: "#c7c7cc" }}>{href || "—"}</span>
    );
  // Normalizes a website value (which may omit the scheme) into a full URL.
  const toHref = (url: string): string => (url && !/^https?:\/\//i.test(url) ? `https://${url}` : url);
  const host = (url: string): string => {
    try { return new URL(toHref(url)).hostname.replace(/^www\./, ""); } catch { return "Website"; }
  };

  // The scannable column set — HQ and the rest of the record open in the
  // slide-out panel on row click. A column with no `sort` key is not sortable.
  const cols: { id: string; sort?: SortKey; label: string; align?: "right"; cell: (e: Enr) => ReactNode }[] = [
    {
      id: "account", sort: "account", label: "Company",
      cell: (e) => (
        <>
          <div style={{ fontWeight: 500, color: "#1d1d1f", fontSize: 14 }}>{e.a.account}</div>
          {e.alias && <div style={{ fontSize: 12, color: "#a0a0a5", marginTop: 1 }}>{e.alias}</div>}
        </>
      ),
    },
    {
      id: "employees", sort: "employees", label: "Employees", align: "right",
      cell: (e) => (
        <span style={{ fontVariantNumeric: "tabular-nums", color: e.emp == null ? "#c7c7cc" : "#4b4b51" }}>
          {fmtEmployees(e.emp)}
        </span>
      ),
    },
    { id: "unc", sort: "unc", label: "UNC", cell: (e) => <UncPill unc={e.a.uncPartner} /> },
    {
      id: "fit", sort: "fit", label: "Fit",
      cell: (e) => {
        const fs = FIT_STYLE[e.fit.level];
        return (
          <span title={e.fit.reason} style={{
            display: "inline-block", padding: "2px 10px", fontSize: 12, fontWeight: 500,
            borderRadius: 999, background: fs.bg, color: fs.color,
          }}>
            {e.fit.level}
          </span>
        );
      },
    },
    { id: "sector", sort: "sector", label: "Sector", cell: (e) => txt(e.a.topIndustrySectorProfile, 240) },
    { id: "revenue", sort: "revenue", label: "Revenue", align: "right", cell: (e) => <span style={{ fontVariantNumeric: "tabular-nums" }}>{e.a.approximateRevenue || "—"}</span> },
    {
      id: "actions", label: "Actions",
      cell: (e) => (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }} onClick={(ev) => ev.stopPropagation()}>
          {e.a.homepage && (
            <a
              href={toHref(e.a.homepage)}
              target="_blank" rel="noopener noreferrer"
              title={`Open ${host(e.a.homepage)}`}
              aria-label={`Open ${host(e.a.homepage)} in a new tab`}
              style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                width: 30, height: 30, borderRadius: 8, color: "#6e6e73",
                border: "1px solid #e8e8ed", background: "#fff",
              }}
            >
              <ExternalLinkIcon />
            </a>
          )}
          {onRunDeepDive && (
            <button
              onClick={() => onRunDeepDive(e.a.account)}
              title={`Generate a profile report for ${e.a.account}`}
              style={{
                padding: "6px 12px", fontSize: 13, fontWeight: 500, borderRadius: 8,
                border: "1px solid #e8e8ed", background: "#fff", color: "#0071e3",
                cursor: "pointer", fontFamily: FONT, whiteSpace: "nowrap",
              }}
            >
              Profile
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div style={{ fontFamily: FONT, height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Controls */}
      <div style={{ padding: "16px 20px 12px", display: "flex", flexDirection: "column", gap: 14, borderBottom: "1px solid #f0f0f2" }}>
        {/* Summary metric cards — reflect the currently filtered set */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
          {[
            { label: "Total Partners", value: stats.total },
            { label: "NC-Based", value: stats.nc },
            { label: "Life Sciences", value: stats.lifeSci },
            { label: "Public Companies", value: stats.pub },
          ].map((card) => (
            <div key={card.label} style={{
              background: "#fff", border: "1px solid #ececef", borderRadius: 14,
              padding: "12px 16px",
            }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: "#1d1d1f", letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>
                {card.value}
              </div>
              <div style={{ fontSize: 12, fontWeight: 500, color: "#86868b", marginTop: 2 }}>
                {card.label}
              </div>
            </div>
          ))}
        </div>

        {/* Filter bar — search + three client-side dropdowns */}
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, sector, HQ…"
            style={{
              flex: "1 1 240px", minWidth: 180, border: "1px solid #e5e5ea",
              borderRadius: 12, padding: "11px 16px", fontSize: 15, outline: "none",
              fontFamily: FONT, color: "#1d1d1f", background: "#fff",
            }}
          />
          <select
            value={sectorFilter}
            onChange={(e) => setSectorFilter(e.target.value)}
            style={SELECT_STYLE}
          >
            <option value="all">All Sectors</option>
            {sectorOptions.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value)}
            style={SELECT_STYLE}
          >
            <option value="all">All States</option>
            {stateOptions.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as "all" | Kind)}
            style={SELECT_STYLE}
          >
            {FILTERS.map((f) => (
              <option key={f.key} value={f.key}>{f.key === "all" ? "All Types" : f.label}</option>
            ))}
          </select>
        </div>

        {/* Live count of the filtered set */}
        <div style={{ fontSize: 13, color: "#86868b" }}>
          Showing <strong style={{ color: "#1d1d1f" }}>{rows.length}</strong> of {accounts.length} partners
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={exportCsv} className="ws-btn" style={{ padding: "8px 16px", fontSize: 13 }}>
            ↓ Export CSV ({rows.length})
          </button>
          <button onClick={() => onExportExcel(filteredRows)} disabled={!!busyExport} className="ws-btn" style={{ padding: "8px 16px", fontSize: 13 }}>
            {busyExport === "Excel" ? "Preparing…" : "↓ Excel"}
          </button>
          <button onClick={() => onExportPdf(filteredRows)} disabled={!!busyExport} className="ws-btn" style={{ padding: "8px 16px", fontSize: 13 }}>
            {busyExport === "PDF" ? "Preparing…" : "↓ PDF"}
          </button>
          <button onClick={() => onExportMarkdown(filteredRows)} disabled={!!busyExport} className="ws-btn" style={{ padding: "8px 16px", fontSize: 13 }}>
            {busyExport === "Markdown" ? "Preparing…" : "↓ Markdown"}
          </button>
        </div>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflow: "auto" }}>
        <table className="db-table">
          <thead>
            <tr>
              {cols.map((c) => (
                <th
                  key={c.id}
                  onClick={c.sort ? () => toggleSort(c.sort!) : undefined}
                  style={{ textAlign: c.align ?? "left", cursor: c.sort ? "pointer" : "default" }}
                >
                  {c.label}
                  {c.sort && (
                    <span style={{ color: "#0071e3", marginLeft: 4, opacity: sortKey === c.sort ? 1 : 0 }}>
                      {sortDir === "asc" ? "↑" : "↓"}
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr
                key={e.a.account}
                onClick={() => setSelected(e.a)}
                style={{ cursor: "pointer" }}
              >
                {cols.map((c) => (
                  <td key={c.id} style={{ textAlign: c.align ?? "left" }}>
                    {c.cell(e)}
                  </td>
                ))}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={cols.length} style={{ textAlign: "center", padding: 40, color: "#a0a0a5" }}>
                No companies match your search.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Slide-out detail panel — overlay + right-anchored sheet */}
      <div
        onClick={() => setSelected(null)}
        aria-hidden={!selected}
        style={{
          position: "fixed", inset: 0, zIndex: 200,
          background: "rgba(0,0,0,0.3)",
          opacity: selected ? 1 : 0,
          pointerEvents: selected ? "auto" : "none",
          transition: "opacity 0.25s ease",
        }}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={selected ? `${selected.account} details` : undefined}
        onClick={(ev) => ev.stopPropagation()}
        style={{
          position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 201,
          width: "min(420px, 100vw)",
          background: "#fff", boxShadow: "-12px 0 48px rgba(0,0,0,0.18)",
          transform: selected ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.28s cubic-bezier(0.32, 0.72, 0, 1)",
          display: "flex", flexDirection: "column",
          fontFamily: FONT,
        }}
      >
        {selected && (() => {
          const sec = secUrlOf(selected);
          const fit = uncFit(selected, revNum(selected.approximateRevenue));
          const fs = FIT_STYLE[fit.level];
          const hq = hqOf(selected);
          const exchange = exchangeOf(selected);
          const kind = classify(selected);
          const Field = ({ label, children }: { label: string; children: ReactNode }) => (
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: "#a0a0a5", marginBottom: 4 }}>
                {label}
              </div>
              <div style={{ fontSize: 14.5, color: "#1d1d1f", lineHeight: 1.5 }}>{children}</div>
            </div>
          );
          // A single quick-stat tile: a value over a thin provenance line.
          const Stat = ({ label, value, source }: { label: string; value: string; source?: string }) => (
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "#a0a0a5" }}>{label}</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#1d1d1f", marginTop: 3, fontVariantNumeric: "tabular-nums" }}>{value}</div>
              {source && <div style={{ fontSize: 11, color: "#86868b", marginTop: 2 }}>{source}</div>}
            </div>
          );
          return (
            <>
              {/* Header — name, ticker, fit pill, close */}
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "22px 24px 16px", borderBottom: "1px solid #f0f0f2" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: "#1d1d1f", letterSpacing: "-0.02em" }}>
                    {selected.account}
                  </div>
                  {exchange && (
                    <div style={{ fontSize: 12.5, color: "#86868b", marginTop: 2, fontWeight: 500 }}>{exchange}</div>
                  )}
                  <span title={fit.reason} style={{
                    display: "inline-block", marginTop: 8, padding: "2px 10px", fontSize: 12, fontWeight: 600,
                    borderRadius: 999, background: fs.bg, color: fs.color,
                  }}>
                    UNC Fit (est.): {fit.level}
                  </span>
                  {fit.reason && (
                    <div style={{ fontSize: 12, color: "#86868b", marginTop: 6 }}>{fit.reason}</div>
                  )}
                </div>
                <button
                  onClick={() => setSelected(null)}
                  aria-label="Close"
                  style={{
                    flexShrink: 0, width: 32, height: 32, borderRadius: "50%", border: "none",
                    background: "#f0f0f2", color: "#6e6e73", fontSize: 17, cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1,
                  }}
                >
                  ✕
                </button>
              </div>

              {/* Body */}
              <div style={{ flex: 1, overflow: "auto", padding: "20px 24px 28px" }}>
                {/* Quick stats — Employees, Revenue, HQ, each with a source line */}
                <div style={{
                  display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12,
                  padding: "14px 16px", marginBottom: 20,
                  background: "#f5f5f7", borderRadius: 14,
                }}>
                  <Stat label="Employees" value={fmtEmployees(selected.employees)} source={selected.employees == null ? undefined : "SEC 10-K"} />
                  <Stat label="Revenue" value={selected.approximateRevenue || "—"} source={selected.approximateRevenue ? "SEC EDGAR" : undefined} />
                  <Stat label="HQ" value={hq || "—"} />
                </div>

                {/* UNC partnership — inventory standing plus its detail string */}
                <Field label="UNC partnership">
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <UncPill unc={selected.uncPartner} />
                    <span style={{ color: selected.uncPartner.detail ? "#1d1d1f" : "#86868b" }}>
                      {selected.uncPartner.detail || (selected.uncPartner.status === "none" ? "No recorded UNC partnership." : "")}
                    </span>
                  </div>
                </Field>

                {/* The stored selling angle — never generated live */}
                <Field label="What they would sell to UNC">
                  {selected.uncAngle || <span style={{ color: "#86868b" }}>Not yet documented.</span>}
                </Field>

                {selected.companyAliases && <Field label="Aliases">{selected.companyAliases}</Field>}
                {selected.parentAccount && <Field label="Parent account">{selected.parentAccount}</Field>}
                <Field label="Sector">{selected.topIndustrySectorProfile || "—"}</Field>
                {selected.secondaryIndustrySectorProfile && (
                  <Field label="Secondary sector">{selected.secondaryIndustrySectorProfile}</Field>
                )}
                {/* Compact facts grid for the remaining record fields */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
                  <Field label="Type">
                    <span style={{ color: KIND_STYLE[kind].color, fontWeight: 500 }}>{KIND_STYLE[kind].label}</span>
                  </Field>
                  <Field label="Founded">{selected.founded || "—"}</Field>
                  <Field label="Website">{link(toHref(selected.homepage || selected.website), host(selected.homepage || selected.website))}</Field>
                </div>
                {selected.keyProducts && (
                  <Field label="Key products">
                    <span style={{
                      display: "-webkit-box",
                      WebkitLineClamp: showAllProducts ? "unset" : 3,
                      WebkitBoxOrient: "vertical",
                      overflow: showAllProducts ? "visible" : "hidden",
                    }}>
                      {selected.keyProducts}
                    </span>
                    {selected.keyProducts.length > 90 && (
                      <button
                        onClick={() => setShowAllProducts((v) => !v)}
                        style={{ marginTop: 4, border: "none", background: "none", color: "#0071e3", fontSize: 13.5, fontWeight: 500, cursor: "pointer", padding: 0, fontFamily: FONT }}
                      >
                        {showAllProducts ? "Show less" : "Show more"}
                      </button>
                    )}
                  </Field>
                )}
                {selected.description && <Field label="Description">{selected.description}</Field>}
                {sec && (
                  <div style={{ marginBottom: 18 }}>
                    <a href={sec} target="_blank" rel="noreferrer" style={{ color: "#0071e3", fontSize: 14.5, fontWeight: 500, textDecoration: "none" }}>
                      View SEC filing →
                    </a>
                  </div>
                )}
              </div>

              {/* Footer — homepage link left, profile-report action right */}
              <div style={{
                padding: "14px 24px", borderTop: "1px solid #f0f0f2",
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
              }}>
                {selected.homepage ? (
                  <a
                    href={toHref(selected.homepage)}
                    target="_blank" rel="noopener noreferrer"
                    style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#0071e3", fontSize: 14, fontWeight: 500, textDecoration: "none" }}
                  >
                    <ExternalLinkIcon size={14} /> {host(selected.homepage)}
                  </a>
                ) : <span />}
                {onRunDeepDive && (
                  <button
                    onClick={() => { onRunDeepDive(selected.account); setSelected(null); }}
                    style={{
                      padding: "11px 18px", fontSize: 15, fontWeight: 600,
                      border: "none", borderRadius: 12, cursor: "pointer",
                      background: "#0071e3", color: "#fff", fontFamily: FONT, whiteSpace: "nowrap",
                    }}
                  >
                    Generate profile report →
                  </button>
                )}
              </div>
            </>
          );
        })()}
      </aside>
    </div>
  );
}
