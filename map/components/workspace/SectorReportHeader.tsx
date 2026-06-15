"use client";

import type { SectorReportModel, PeerBar, MatrixRow, FacultyRow, AlignmentBar } from "@/lib/sectorReport";
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

// Vertical alignment-signal chart: bar height = signal count, colored by
// strength (green 3+, blue 2, gray 1) — matches the report's key.
function AlignmentChart({ bars }: { bars: AlignmentBar[] }) {
  if (!bars.length) return null;
  const max = Math.max(...bars.map((b) => b.count), 1);
  const color = (n: number) => (n >= 3 ? "#639922" : n === 2 ? "#378ADD" : "#B4B2A9");
  return (
    <div>
      <div style={{ display: "flex", gap: 16, marginBottom: 12 }}>
        {[["3+ signals", "#639922"], ["2 signals", "#378ADD"], ["1 signal", "#B4B2A9"]].map(([l, c]) => (
          <span key={l} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: MUTED }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: c, display: "inline-block" }} />{l}
          </span>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 180, borderBottom: `1px solid ${BORDER}`, paddingBottom: 0, overflowX: "auto" }}>
        {bars.map((b, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, minWidth: 34, flex: "1 0 auto" }}>
            <span style={{ flex: 1, display: "flex", alignItems: "flex-end" }}>
              <span title={`${b.name}: ${b.count}`} style={{ display: "block", width: 26, height: `${(b.count / max) * 150}px`, background: color(b.count), borderRadius: "4px 4px 0 0" }} />
            </span>
            <span style={{ fontSize: 9.5, color: MUTED, transform: "rotate(-35deg)", transformOrigin: "center", whiteSpace: "nowrap", height: 36 }}>{b.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

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

      {/* Quick reference */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 40, marginBottom: 20 }}>
        <div>
          <Eyebrow>Contact now — verify OSP first</Eyebrow>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {m.contactNow.map((c, i) => (
              <li key={i} style={{ fontSize: 13, color: MUTED, padding: "9px 0", borderBottom: i < m.contactNow.length - 1 ? `1px solid ${BORDER}` : "none" }}>
                <span style={{ color: "#c7c7cc", marginRight: 7 }}>·</span>
                <span style={{ fontWeight: 700, color: INK }}>{c.name}</span> · {c.detail}
              </li>
            ))}
            {!m.contactNow.length && <li style={{ fontSize: 13, color: MUTED }}>None with active NIH grants.</li>}
          </ul>
        </div>
        <div>
          <Eyebrow>Warm — paper on record</Eyebrow>
          <ul style={{ listStyle: "none", margin: "0 0 16px", padding: 0 }}>
            {m.warm.map((c, i) => (
              <li key={i} style={{ fontSize: 13, color: MUTED, padding: "9px 0", borderBottom: i < m.warm.length - 1 ? `1px solid ${BORDER}` : "none" }}>
                <span style={{ color: "#c7c7cc", marginRight: 7 }}>·</span>
                <span style={{ fontWeight: 700, color: INK }}>{c.name}</span> · {c.detail}
                {c.nc && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, color: "#085041", background: "#e1f5ee", borderRadius: 999, padding: "2px 8px" }}>◉ NC</span>}
              </li>
            ))}
            {!m.warm.length && <li style={{ fontSize: 13, color: MUTED }}>None.</li>}
          </ul>
          {m.cold.length > 0 && <>
            <Eyebrow>No documented tie</Eyebrow>
            <p style={{ fontSize: 13, color: MUTED, margin: 0 }}><span style={{ color: "#c7c7cc", marginRight: 7 }}>·</span>{m.cold.join(" · ")}</p>
          </>}
        </div>
      </div>

      {/* OSP warning */}
      {m.ospCompanies.length > 0 && (
        <div style={{ background: "#fdf6e3", borderRadius: 10, padding: "10px 14px", marginBottom: 28, fontSize: 12, color: "#8a6d1a", display: "flex", gap: 8, alignItems: "flex-start" }}>
          <span>⚠</span>
          <span>{m.ospCompanies.length} companies have active NIH grants — contact <a href="https://research.unc.edu/osp" target="_blank" rel="noreferrer" style={{ color: BLUE, textDecoration: "none" }}>UNC OSP</a> before any outreach</span>
        </div>
      )}

      {/* Sector snapshot — revenue + R&D charts */}
      <Eyebrow>Sector snapshot</Eyebrow>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 40, marginBottom: 28 }}>
        <div>
          <Eyebrow>Revenue (SEC XBRL · latest FY)</Eyebrow>
          <PeerChart peers={m.revenuePeers} color="#93b8f5" />
        </div>
        <div>
          <Eyebrow>R&amp;D spend</Eyebrow>
          <PeerChart peers={m.rdPeers} color="#9ed8bf" />
        </div>
      </div>

      {/* Priority matrix */}
      <Eyebrow>Priority matrix</Eyebrow>
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 28 }}>
        <thead><tr><th style={th}>Company</th><th style={th}>Tier</th><th style={th}>Signal</th><th style={th}>UNC contact</th><th style={th}>Grant / paper</th><th style={th}>First move</th></tr></thead>
        <tbody>
          {m.matrix.map((r: MatrixRow, i) => (
            <tr key={i}>
              <td style={{ ...td, color: INK, fontWeight: 600 }}>{r.company}</td>
              <td style={td}><span style={{ fontSize: 11, fontWeight: 600, padding: "2px 9px", borderRadius: 999, background: r.tier === "Strategic" ? "#e8effb" : "#f2f2f2", color: r.tier === "Strategic" ? "#1f5d99" : MUTED }}>{r.signal === "None" ? "Various" : r.tier}</span></td>
              <td style={td}><span style={{ display: "inline-block", width: 7, height: 7, borderRadius: 999, background: SIGNAL_DOT[r.signal], marginRight: 6, verticalAlign: "middle" }} />{r.signal}</td>
              <td style={td}>{r.contactUrl ? <A href={r.contactUrl}>{r.contact}</A> : r.contact}</td>
              <td style={td}>{r.grantOrPmid ? <a href={r.grantUrl} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}><code style={codePill}>{r.grantOrPmid}</code></a> : "—"}</td>
              <td style={td}>{r.firstMove}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* UNC alignment-signal chart */}
      {m.alignmentChart.length > 0 && <div style={{ marginBottom: 28 }}>
        <Eyebrow>UNC alignment signals by company</Eyebrow>
        <AlignmentChart bars={m.alignmentChart} />
      </div>}

      {/* Faculty */}
      {m.faculty.length > 0 && <>
        <Eyebrow>UNC faculty with verified sector expertise</Eyebrow>
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 28 }}>
          <thead><tr><th style={th}>PI</th><th style={th}>Unit</th><th style={th}>Grant</th><th style={th}>Topic</th><th style={th}>FY</th><th style={th}>Company overlap</th></tr></thead>
          <tbody>
            {m.faculty.map((f: FacultyRow, i) => (
              <tr key={i}>
                <td style={{ ...td, color: INK, fontWeight: 600 }}>{f.grantUrl ? <A href={f.grantUrl}>{f.name}</A> : f.name}</td>
                <td style={td}>{f.unit}</td>
                <td style={td}>{f.grant ? <a href={f.grantUrl} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}><code style={codePill}>{f.grant}</code></a> : "—"}</td>
                <td style={td}>{f.topic || "—"}</td>
                <td style={td}>{f.fy || "—"}</td>
                <td style={td}>{f.overlap}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </>}

      {/* Data assets */}
      <Eyebrow>UNC data assets available to partners</Eyebrow>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 8 }}>
        {m.dataAssets.map((a, i) => (
          <div key={i} style={{ border: `1px solid ${BORDER}`, borderRadius: 14, padding: "16px 18px" }}>
            <a href={a.url} target="_blank" rel="noreferrer" style={{ fontSize: 14, fontWeight: 700, color: BLUE, textDecoration: "none", letterSpacing: "-0.1px" }}>{a.name}</a>
            <p style={{ fontSize: 12, color: MUTED, margin: "6px 0 0", lineHeight: 1.45 }}>{a.description} · held by {a.heldBy}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
