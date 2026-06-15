"use client";

import { useMemo, useState } from "react";
import type { AccountProfile } from "./accountProfile";
import { FONT } from "./ui";

/**
 * Interactive Database table: live search, type filter pills (Public / Private /
 * Nonprofit / Government), sortable columns, and a focused, scannable column set
 * with structure pills and exchange tags. All derived from the existing
 * AccountProfile data, no schema changes.
 */

type Kind = "public" | "private" | "nonprofit" | "government";
type SortKey = "account" | "exchange" | "sector" | "structure" | "hq" | "employees" | "revenue";

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

// takes: an employees string like "183,000"
// does: parses the leading integer for numeric sorting
// returns: a number (0 when unparseable)
function empNum(s: string): number {
  const n = parseInt((s || "").replace(/[^0-9]/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
}

// takes: a revenue string like "$716.9B (FY2025)"
// does: parses the leading value and B/M/K suffix into a comparable number
// returns: a number in dollars (0 when unparseable)
function revNum(s: string): number {
  const m = (s || "").match(/([\d.]+)\s*([BMK])?/i);
  if (!m) return 0;
  const v = parseFloat(m[1]);
  if (!Number.isFinite(v)) return 0;
  const mult = m[2]?.toUpperCase() === "B" ? 1e9 : m[2]?.toUpperCase() === "M" ? 1e6 : m[2]?.toUpperCase() === "K" ? 1e3 : 1;
  return v * mult;
}

const KIND_STYLE: Record<Kind, { label: string; color: string }> = {
  public:     { label: "Public",     color: "#007aff" },
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

export default function InteractiveAccountsTable({
  accounts,
  onExportExcel,
  onExportPdf,
  onExportMarkdown,
  busyExport,
}: {
  accounts: AccountProfile[];
  onExportExcel: (rows: AccountProfile[]) => void;
  onExportPdf: (rows: AccountProfile[]) => void;
  onExportMarkdown: (rows: AccountProfile[]) => void;
  busyExport: string | null;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | Kind>("all");
  const [sortKey, setSortKey] = useState<SortKey>("account");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // Precompute derived fields once so search/sort don't re-derive per keystroke.
  const enriched = useMemo(
    () =>
      accounts.map((a) => ({
        a,
        kind: classify(a),
        exchange: exchangeOf(a),
        alias: aliasSub(a),
        hq: hqOf(a),
        emp: empNum(a.approximateEmployees),
        rev: revNum(a.approximateRevenue),
      })),
    [accounts],
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = enriched.filter((e) => {
      if (filter !== "all" && e.kind !== filter) return false;
      if (!q) return true;
      return (
        e.a.account.toLowerCase().includes(q) ||
        e.a.companyAliases.toLowerCase().includes(q) ||
        e.a.topIndustrySectorProfile.toLowerCase().includes(q) ||
        e.hq.toLowerCase().includes(q)
      );
    });
    const dir = sortDir === "asc" ? 1 : -1;
    list = [...list].sort((x, y) => {
      switch (sortKey) {
        case "employees": return (x.emp - y.emp) * dir;
        case "revenue":   return (x.rev - y.rev) * dir;
        case "exchange":  return x.exchange.localeCompare(y.exchange) * dir;
        case "sector":    return x.a.topIndustrySectorProfile.localeCompare(y.a.topIndustrySectorProfile) * dir;
        case "structure": return x.kind.localeCompare(y.kind) * dir;
        case "hq":        return x.hq.localeCompare(y.hq) * dir;
        default:          return x.a.account.localeCompare(y.a.account) * dir;
      }
    });
    return list;
  }, [enriched, query, filter, sortKey, sortDir]);

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

  const cols: { key: SortKey; label: string; align?: "right" }[] = [
    { key: "account", label: "Company" },
    { key: "exchange", label: "Ticker" },
    { key: "sector", label: "Sector" },
    { key: "structure", label: "Structure" },
    { key: "hq", label: "HQ" },
    { key: "employees", label: "Employees", align: "right" },
    { key: "revenue", label: "Revenue", align: "right" },
  ];

  return (
    <div style={{ fontFamily: FONT, height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Controls */}
      <div style={{ padding: "16px 20px 12px", display: "flex", flexDirection: "column", gap: 12, borderBottom: "1px solid #f0f0f2" }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, sector, HQ…"
            style={{
              flex: "1 1 280px", minWidth: 200, border: "1px solid #e5e5ea",
              borderRadius: 12, padding: "11px 16px", fontSize: 15, outline: "none",
              fontFamily: FONT, color: "#1d1d1f", background: "#fff",
            }}
          />
          <div style={{ display: "flex", padding: 3, background: "#f0f0f2", borderRadius: 999, gap: 2, maxWidth: "100%", overflowX: "auto" }}>
            {FILTERS.map((f) => (
              <button key={f.key} onClick={() => setFilter(f.key)} style={{
                padding: "6px 14px", fontSize: 13.5, fontWeight: 600, border: "none",
                borderRadius: 999, cursor: "pointer", flexShrink: 0, whiteSpace: "nowrap",
                background: filter === f.key ? (f.key === "all" ? "#007aff" : "#fff") : "transparent",
                color: filter === f.key ? (f.key === "all" ? "#fff" : "#1d1d1f") : "#6e6e73",
                boxShadow: filter === f.key && f.key !== "all" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                transition: "all 0.12s",
              }}>
                {f.label}
              </button>
            ))}
          </div>
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
                  key={c.key}
                  onClick={() => toggleSort(c.key)}
                  style={{ textAlign: c.align ?? "left", cursor: "pointer" }}
                >
                  {c.label}
                  <span style={{ color: "#007aff", marginLeft: 4, opacity: sortKey === c.key ? 1 : 0 }}>
                    {sortDir === "asc" ? "↑" : "↓"}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => {
              const ks = KIND_STYLE[e.kind];
              return (
                <tr key={e.a.account}>
                  <td>
                    <div style={{ fontWeight: 600, color: "#1d1d1f", fontSize: 14 }}>{e.a.account}</div>
                    {e.alias && <div style={{ fontSize: 12, color: "#a0a0a5", marginTop: 1 }}>{e.alias}</div>}
                  </td>
                  <td style={{ color: e.exchange ? "#2563eb" : "#c7c7cc", fontWeight: 500 }}>
                    {e.exchange || "—"}
                  </td>
                  <td style={{ color: "#4b4b51" }}>{e.a.topIndustrySectorProfile || "—"}</td>
                  <td>
                    <span style={{
                      display: "inline-block", padding: "2px 10px", fontSize: 12, fontWeight: 600,
                      borderRadius: 999, border: `1px solid ${ks.color}55`, color: ks.color,
                    }}>
                      {ks.label}
                    </span>
                  </td>
                  <td style={{ color: "#4b4b51" }}>{e.hq || "—"}</td>
                  <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {e.a.approximateEmployees || "—"}
                  </td>
                  <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {e.a.approximateRevenue || "—"}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={cols.length} style={{ textAlign: "center", padding: 40, color: "#a0a0a5" }}>
                No companies match your search.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
