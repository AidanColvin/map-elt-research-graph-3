"use client";

import type { SectorReportModel, PeerBar, MatrixRow, FacultyRow } from "@/lib/sectorReport";
import { FONT } from "./ui";

/**
 * Sector-overview header of the Projects report — stat strip, quick-reference
 * lists, OSP warning, revenue/R&D peer charts, priority matrix, faculty table,
 * and UNC data assets. Pure presentation over the sourced SectorReportModel.
 * Inline-styled to match the workspace (the app has no shadcn Tailwind tokens).
 */

const INK = "#1d1d1f";
const MUTED = "#8a8a92";
const BORDER = "#ececf0";
const BLUE = "#2563eb";

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: MUTED, margin: "0 0 12px" }}>{children}</p>;
}
function A({ href, children, bold }: { href?: string; children: React.ReactNode; bold?: boolean }) {
  if (!href) return <span style={{ fontWeight: bold ? 600 : undefined, color: bold ? INK : "inherit" }}>{children}</span>;
  return <a href={href} target="_blank" rel="noreferrer" style={{ color: BLUE, textDecoration: "none", fontWeight: bold ? 600 : 500 }}>{children}</a>;
}

function PeerChart({ peers, color }: { peers: PeerBar[]; color: string }) {
  if (!peers.length) return null;
  const max = Math.max(...peers.map((p) => p.valueB), 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      {peers.map((p, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, width: 86, textAlign: "right", color: INK, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flexShrink: 0 }}>{p.name}</span>
          <span style={{ flex: 1, height: 10, background: "#f2f2f2", borderRadius: 3, overflow: "hidden" }}>
            <span style={{ display: "block", height: "100%", width: `${(p.valueB / max) * 100}%`, background: color }} />
          </span>
          <span style={{ fontSize: 11, width: 42, color: MUTED, flexShrink: 0 }}>${p.valueB}B</span>
        </div>
      ))}
    </div>
  );
}

const SIGNAL_DOT: Record<string, string> = { "NIH grant": "#16a34a", PubMed: "#3b82f6", Trial: "#a855f7", None: "#9ca3af" };

const th = { fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" as const, color: MUTED, borderBottom: `1px solid ${BORDER}`, padding: "8px 10px 8px 0", textAlign: "left" as const };
const td = { fontSize: 13, color: MUTED, padding: "11px 10px 11px 0", borderBottom: `1px solid ${BORDER}`, verticalAlign: "top" as const };
const codePill = { fontFamily: "ui-monospace, monospace", fontSize: 11, background: "#f2f2f2", padding: "2px 6px", borderRadius: 4 } as const;

export default function SectorReportHeader({ m }: { m: SectorReportModel }) {
  const stats = [
    { n: m.uncTies, l: "UNC ties" },
    { n: m.nihOverlaps, l: "NIH grant overlaps" },
    { n: m.pubmedPapers, l: "Co-authored papers" },
    { n: `$${m.combinedRevenueB >= 1000 ? (m.combinedRevenueB / 1000).toFixed(1) + "T" : m.combinedRevenueB + "B"}`, l: "Combined revenue" },
    { n: m.ncHeadquartered, l: "NC-headquartered" },
  ];

  return (
    <div style={{ fontFamily: FONT }}>
      {/* Eyebrow + title */}
      <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: MUTED, margin: 0 }}>
        UNC Partnership Intelligence · {m.sector} · {m.date} · All claims double-sourced
      </p>
      <h1 style={{ fontSize: 32, fontWeight: 800, letterSpacing: "-0.025em", margin: "8px 0 4px", color: INK }}>{m.sector}</h1>
      <p style={{ fontSize: 13, color: MUTED, margin: "0 0 18px" }}>
        {m.companiesReviewed} companies reviewed · SEC EDGAR · NIH RePORTER · PubMed · ClinicalTrials.gov
      </p>

      {/* Stat strip */}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${stats.length}, 1fr)`, gap: 1, background: BORDER, border: `1px solid ${BORDER}`, borderRadius: 14, overflow: "hidden", marginBottom: 24 }}>
        {stats.map((s, i) => (
          <div key={i} style={{ background: "#fafafa", padding: "16px 18px" }}>
            <p style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em", color: INK, margin: 0 }}>{s.n}</p>
            <p style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: MUTED, margin: "3px 0 0" }}>{s.l}</p>
          </div>
        ))}
      </div>

      {/* OSP routing — the primary engagement step, shown first */}
      {m.ospCompanies.length > 0 && (
        <div style={{ background: "#fdf6e3", borderRadius: 10, padding: "11px 15px", marginBottom: 22, fontSize: 12.5, color: "#8a6d1a", display: "flex", gap: 8, alignItems: "flex-start" }}>
          <span>⚠</span>
          <span>{m.ospCompanies.length} compan{m.ospCompanies.length === 1 ? "y has" : "ies have"} active NIH grants — route initial outreach through <a href="https://research.unc.edu/osp" target="_blank" rel="noreferrer" style={{ color: BLUE, textDecoration: "none" }}>UNC OSP</a> before contacting any investigator.</span>
        </div>
      )}

      {/* Sector snapshot — revenue + R&D charts. The R&D column only renders
          when companies report R&D (banks, REITs, insurers do not), so a
          non-R&D sector never shows a dangling "R&D spend" label with no chart. */}
      {(m.revenuePeers.length > 0 || m.rdPeers.length > 0) && <>
        <Eyebrow>Sector snapshot</Eyebrow>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 40, marginBottom: 28 }}>
          {m.revenuePeers.length > 0 && (
            <div>
              <Eyebrow>Revenue (SEC XBRL · latest FY)</Eyebrow>
              <PeerChart peers={m.revenuePeers} color="#93b8f5" />
            </div>
          )}
          {m.rdPeers.length > 0 && (
            <div>
              <Eyebrow>R&amp;D spend</Eyebrow>
              <PeerChart peers={m.rdPeers} color="#9ed8bf" />
            </div>
          )}
        </div>
      </>}

      {/* Data assets */}
      <Eyebrow>UNC data assets available to partners</Eyebrow>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 8 }}>
        {m.dataAssets.map((a, i) => (
          <div key={i} style={{ border: `1px solid ${BORDER}`, borderRadius: 14, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 8 }}>
            <a href={a.url} target="_blank" rel="noreferrer" style={{ fontSize: 14, fontWeight: 700, color: BLUE, textDecoration: "none", letterSpacing: "-0.1px" }}>{a.name}</a>
            <p style={{ fontSize: 12.5, color: INK, margin: 0, lineHeight: 1.45 }}>{a.description}</p>
            <p style={{ fontSize: 12, color: MUTED, margin: 0, lineHeight: 1.45 }}><span style={{ fontWeight: 600, color: INK }}>Why it fits:</span> {a.relevance}</p>
            <p style={{ fontSize: 11, color: MUTED, margin: "auto 0 0", paddingTop: 2 }}>Held by {a.heldBy}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
