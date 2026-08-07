"use client";

import { useMemo, useState } from "react";
import type { PartnershipRecord } from "@/lib/inventory/types";
import { useInventoryData } from "./useInventoryData";
import SignInRequired from "./SignInRequired";

/**
 * PartnershipInventoryView.tsx
 * The Partnerships tab — the UNC partnership inventory from the research
 * workbook, rendered as a searchable, filterable table. Every row is one
 * documented UNC unit ↔ partner organization relationship, with its status,
 * dates, funding, and a source link. Click a row to expand the full
 * description and research provenance.
 *
 * The rows are NOT bundled — they arrive from /api/inventory/data, which
 * refuses callers without a password-minted token or an approved account. A
 * signed-in visitor whose session carries neither sees the same gate a guest
 * does, because the server, not this component, decides who gets data.
 */

// takes: a status string from the inventory
// does: buckets the free-text status into a coarse display class
// returns: the bucket key used for the filter and the status pill color
function statusBucket(s: string): "active" | "completed" | "past" | "other" {
  const t = s.toLowerCase();
  if (t.startsWith("active")) return "active";
  if (t.startsWith("completed") || t.startsWith("concluded")) return "completed";
  if (t.startsWith("past") || t.startsWith("inactive") || t.startsWith("historical") || t.startsWith("acquired")) return "past";
  return "other";
}

const STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  active: { bg: "#e8f6ec", fg: "#1a7f37" },
  completed: { bg: "#eef2ff", fg: "#4655c7" },
  past: { bg: "#f3f4f6", fg: "#6b7280" },
  other: { bg: "#f3f4f6", fg: "#6b7280" },
};

// takes: a partnership record
// does: renders the status pill (colored by bucket, labeled with the raw text)
// returns: the pill element
function StatusPill({ status }: { status: string }) {
  if (!status) return <span style={{ color: "#9ca3af" }}>—</span>;
  const c = STATUS_STYLE[statusBucket(status)];
  return (
    <span
      style={{
        display: "inline-block",
        padding: "3px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        background: c.bg,
        color: c.fg,
        whiteSpace: "nowrap",
        maxWidth: 180,
        overflow: "hidden",
        textOverflow: "ellipsis",
        verticalAlign: "middle",
      }}
      title={status}
    >
      {status}
    </span>
  );
}

// takes: a possibly multi-URL source string ("url1 | url2")
// does: renders each URL as a compact numbered source link
// returns: the link row element (or a dash when there is no source)
function SourceLinks({ source }: { source: string }) {
  const urls = source
    .split(/\s*\|\s*/)
    .map((u) => u.trim())
    .filter((u) => /^https?:\/\//i.test(u));
  if (!urls.length) return <span style={{ color: "#9ca3af" }}>—</span>;
  return (
    <span style={{ display: "inline-flex", gap: 6 }}>
      {urls.map((u, i) => (
        <a
          key={i}
          href={u}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "#007aff",
            textDecoration: "none",
            border: "1px solid #dbe6ff",
            borderRadius: 6,
            padding: "2px 7px",
            background: "#f5f8ff",
          }}
        >
          {urls.length > 1 ? `Source ${i + 1}` : "Source"}
        </a>
      ))}
    </span>
  );
}

// takes: a label and value
// does: renders one detail line inside the expanded row, skipping empty values
// returns: the detail line element or null
function Detail({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div style={{ display: "flex", gap: 8, fontSize: 13.5, lineHeight: 1.55 }}>
      <span style={{ color: "#6b7280", fontWeight: 600, flexShrink: 0, width: 110 }}>{label}</span>
      <span style={{ color: "#1d1d1f" }}>{value}</span>
    </div>
  );
}

const th = {
  textAlign: "left" as const,
  padding: "10px 12px",
  fontSize: 12,
  fontWeight: 600,
  color: "#6b7280",
  textTransform: "uppercase" as const,
  letterSpacing: "0.04em",
  borderBottom: "1px solid #e5e7eb",
  whiteSpace: "nowrap" as const,
  position: "sticky" as const,
  top: 0,
  background: "#fff",
  zIndex: 1,
};

const td = {
  padding: "11px 12px",
  fontSize: 13.5,
  borderBottom: "1px solid #f1f2f4",
  verticalAlign: "top" as const,
};

// takes: the inventory token (null until the password unlock), plus the
//        sign-in and unlock handlers for the inline gate
// does: fetches the partnership rows through the gated API, then renders the
//       Partnerships inventory — stat tiles, search, unit/status/area filters,
//       and the row-expandable partnership table; renders the gate instead
//       whenever the server refuses the caller
// returns: the Partnerships view element
export default function PartnershipInventoryView({
  pwToken,
  onSignIn,
  onUnlock,
}: {
  pwToken: string | null;
  onSignIn: () => void;
  onUnlock: (token: string) => void;
}) {
  const { phase, data: records } = useInventoryData<PartnershipRecord>("partnerships", pwToken);
  const [query, setQuery] = useState("");
  const [unitFilter, setUnitFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [areaFilter, setAreaFilter] = useState("all");
  const [openRow, setOpenRow] = useState<number | null>(null);

  const units = useMemo(
    () => Array.from(new Set(records.map((r) => r.unit).filter(Boolean))).sort(),
    [records]
  );
  const areas = useMemo(
    () => Array.from(new Set(records.map((r) => r.area).filter(Boolean))).sort(),
    [records]
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return records.map((r, i) => ({ r, i })).filter(({ r }) => {
      if (unitFilter !== "all" && r.unit !== unitFilter) return false;
      if (statusFilter !== "all" && statusBucket(r.status) !== statusFilter) return false;
      if (areaFilter !== "all" && r.area !== areaFilter) return false;
      if (!q) return true;
      return (
        r.unit.toLowerCase().includes(q) ||
        r.company.toLowerCase().includes(q) ||
        r.type.toLowerCase().includes(q) ||
        r.area.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q)
      );
    });
  }, [records, query, unitFilter, statusFilter, areaFilter]);

  const stats = useMemo(() => {
    const companies = new Set(rows.map(({ r }) => r.company).filter(Boolean)).size;
    const rowUnits = new Set(rows.map(({ r }) => r.unit).filter(Boolean)).size;
    const active = rows.filter(({ r }) => statusBucket(r.status) === "active").length;
    return { total: rows.length, companies, units: rowUnits, active };
  }, [rows]);

  const select = {
    padding: "8px 12px",
    borderRadius: 10,
    border: "1px solid #d1d5db",
    fontSize: 13.5,
    background: "#fff",
    color: "#1d1d1f",
    maxWidth: 260,
  } as const;

  // The server said no — show the same gate a guest sees. This is the path a
  // signed-in visitor without an approved account or token lands on.
  if (phase === "locked") {
    return <SignInRequired viewLabel="Partnerships" onSignIn={onSignIn} onUnlock={onUnlock} />;
  }
  if (phase === "loading") {
    return (
      <div style={{ padding: "72px 24px", textAlign: "center", color: "#6b7280", fontSize: 15 }}>
        Loading the partnership inventory…
      </div>
    );
  }
  if (phase === "error") {
    return (
      <div style={{ padding: "72px 24px", textAlign: "center", color: "#6b7280", fontSize: 15 }}>
        Couldn&rsquo;t load the partnership inventory. Refresh to try again.
      </div>
    );
  }

  return (
    <div>
      <header style={{ marginBottom: 18 }}>
        <h2 style={{ fontSize: 24, fontWeight: 650, letterSpacing: "-0.02em", margin: 0 }}>
          Partnerships
        </h2>
        <p style={{ fontSize: 14.5, color: "#6b7280", margin: "6px 0 0" }}>
          The UNC partnership inventory — every documented unit-to-organization
          relationship, with status, funding, and sources.
        </p>
      </header>

      {/* Stat tiles reflect the CURRENT filter, so they double as a result count. */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        {[
          ["Partnerships", stats.total],
          ["Organizations", stats.companies],
          ["UNC units", stats.units],
          ["Active", stats.active],
        ].map(([label, n]) => (
          <div
            key={label}
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: 12,
              padding: "10px 16px",
              minWidth: 110,
              background: "#fafafa",
            }}
          >
            <div style={{ fontSize: 20, fontWeight: 650, fontVariantNumeric: "tabular-nums" }}>{n}</div>
            <div style={{ fontSize: 12, color: "#6b7280" }}>{label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search unit, company, type…"
          style={{
            flex: "1 1 240px",
            minWidth: 200,
            padding: "9px 14px",
            borderRadius: 10,
            border: "1px solid #d1d5db",
            fontSize: 14,
            outline: "none",
          }}
        />
        <select value={unitFilter} onChange={(e) => setUnitFilter(e.target.value)} style={select}>
          <option value="all">All UNC units</option>
          {units.map((u) => (
            <option key={u} value={u}>{u}</option>
          ))}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={select}>
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
          <option value="past">Past / acquired</option>
          <option value="other">Other</option>
        </select>
        <select value={areaFilter} onChange={(e) => setAreaFilter(e.target.value)} style={select}>
          <option value="all">All areas</option>
          {areas.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </div>

      <div style={{ overflowX: "auto", maxHeight: "62dvh", overflowY: "auto", border: "1px solid #ececf0", borderRadius: 12 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>UNC Unit</th>
              <th style={th}>Organization</th>
              <th style={th}>Area</th>
              <th style={th}>Partnership Type</th>
              <th style={th}>Status</th>
              <th style={th}>Start</th>
              <th style={th}>Funding</th>
              <th style={th}>Source</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ r, i }) => (
              <RowPair
                key={i}
                r={r}
                open={openRow === i}
                onToggle={() => setOpenRow(openRow === i ? null : i)}
              />
            ))}
            {!rows.length && (
              <tr>
                <td style={{ ...td, textAlign: "center", color: "#9ca3af", padding: 28 }} colSpan={8}>
                  No partnerships match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// takes: one record, whether its detail is open, and a toggle handler
// does: renders the clickable summary row plus (when open) the detail row with
//       the full description, dates, funding type, and research provenance
// returns: the row fragment
function RowPair({ r, open, onToggle }: { r: PartnershipRecord; open: boolean; onToggle: () => void }) {
  return (
    <>
      <tr
        onClick={onToggle}
        style={{ cursor: "pointer", background: open ? "#f7f9ff" : undefined }}
      >
        <td style={{ ...td, fontWeight: 550, maxWidth: 220 }}>{r.unit || "—"}</td>
        <td style={{ ...td, maxWidth: 220 }}>{r.company || "—"}</td>
        <td style={td}>{r.area || "—"}</td>
        <td style={{ ...td, maxWidth: 240 }}>{r.type || "—"}</td>
        <td style={td}><StatusPill status={r.status} /></td>
        <td style={{ ...td, whiteSpace: "nowrap" }}>{r.start || "—"}</td>
        <td style={{ ...td, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{r.funding || "—"}</td>
        <td style={td}><SourceLinks source={r.source} /></td>
      </tr>
      {open && (
        <tr>
          <td style={{ ...td, background: "#fafbff", padding: "14px 18px" }} colSpan={8}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: 900 }}>
              <Detail label="Description" value={r.description} />
              <Detail label="End" value={r.end} />
              <Detail label="Recurring" value={r.recurring} />
              <Detail label="Funding type" value={r.fundingType} />
              <Detail label="Researched" value={[r.researched, r.researchBy && `by ${r.researchBy}`].filter(Boolean).join(" ")} />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
