"use client";

import { useState } from "react";
import { downloadBrandedPdf } from "@/lib/report-export";
import { FINANCE_REPORT_TITLE, FINANCE_REPORT_MARKDOWN } from "./content";

function LogoMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="3.2" fill="#1d1d1f" />
      {[0, 60, 120, 180, 240, 300].map((deg) => {
        const r = (deg * Math.PI) / 180;
        const x = 12 + 8.5 * Math.cos(r);
        const y = 12 + 8.5 * Math.sin(r);
        return (
          <g key={deg}>
            <line x1="12" y1="12" x2={x} y2={y} stroke="#1d1d1f" strokeWidth="1.1" />
            <circle cx={x} cy={y} r="1.9" fill="#1d1d1f" />
          </g>
        );
      })}
    </svg>
  );
}

export default function FinanceReportPage() {
  const [downloading, setDownloading] = useState(false);

  async function handleDownload() {
    setDownloading(true);
    try {
      await downloadBrandedPdf(
        FINANCE_REPORT_MARKDOWN,
        FINANCE_REPORT_TITLE,
        "finance-partnership-report"
      );
    } finally {
      setDownloading(false);
    }
  }

  // Parse markdown for on-page rendering
  const sections = FINANCE_REPORT_MARKDOWN
    .split(/^## /m)
    .filter(Boolean)
    .map((s) => {
      const firstNewline = s.indexOf("\n");
      return {
        heading: firstNewline > 0 ? s.slice(0, firstNewline).trim() : s.trim(),
        body: firstNewline > 0 ? s.slice(firstNewline + 1).trim() : "",
      };
    });

  return (
    <div style={{ fontFamily: "var(--font-inter, -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif)", background: "#f5f5f7", minHeight: "100dvh" }}>
      {/* Nav bar */}
      <header style={{ background: "rgba(255,255,255,0.85)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(0,0,0,0.08)", position: "sticky", top: 0, zIndex: 100, height: 54, display: "flex", alignItems: "center", padding: "0 32px", gap: 12 }}>
        <a href="/" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none", color: "inherit" }}>
          <LogoMark size={22} />
          <span style={{ fontWeight: 600, fontSize: 15, color: "#1d1d1f", letterSpacing: "-0.3px" }}>Map</span>
        </a>
        <span style={{ color: "#86868b", fontSize: 13 }}>/</span>
        <span style={{ fontSize: 13, color: "#86868b" }}>Finance Partnership Report</span>
        <div style={{ flex: 1 }} />
        <button
          onClick={handleDownload}
          disabled={downloading}
          style={{
            background: downloading ? "#86868b" : "#1d1d1f",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            padding: "8px 20px",
            fontSize: 14,
            fontWeight: 600,
            cursor: downloading ? "default" : "pointer",
            fontFamily: "inherit",
            letterSpacing: "-0.2px",
            transition: "background 0.15s",
          }}
        >
          {downloading ? "Generating PDF…" : "Download PDF"}
        </button>
      </header>

      {/* Hero */}
      <div style={{ background: "#1d1d1f", color: "#fff", padding: "60px 32px 48px" }}>
        <div style={{ maxWidth: 860, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
            <LogoMark size={18} />
            <span style={{ fontSize: 12, color: "#86868b", fontWeight: 500, letterSpacing: "0.5px", textTransform: "uppercase" }}>Map Research Intelligence</span>
          </div>
          <h1 style={{ fontSize: 40, fontWeight: 700, letterSpacing: "-1.5px", margin: "0 0 12px", lineHeight: 1.1 }}>
            Finance Sector<br />Partnership Intelligence
          </h1>
          <p style={{ fontSize: 17, color: "#a1a1a6", margin: "0 0 32px", fontWeight: 400, lineHeight: 1.5 }}>
            UNC Chapel Hill Business Development · June 2025 · 20 companies analyzed
          </p>
          <div style={{ display: "flex", gap: 24 }}>
            {[
              { label: "Confirmed UNC Ties", value: "2" },
              { label: "Compliance Flags", value: "3" },
              { label: "Tier 1 Targets", value: "4" },
              { label: "Analyst Review Needed", value: "12" },
            ].map(({ label, value }) => (
              <div key={label}>
                <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-1px", color: "#f5f5f7" }}>{value}</div>
                <div style={{ fontSize: 12, color: "#6e6e73", fontWeight: 500 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Download CTA */}
      <div style={{ background: "#fff", borderBottom: "1px solid rgba(0,0,0,0.06)", padding: "16px 32px" }}>
        <div style={{ maxWidth: 860, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 14, color: "#6e6e73" }}>
            Board-ready PDF with Map branding — Helvetica, clean layout, ~10 pages
          </span>
          <button
            onClick={handleDownload}
            disabled={downloading}
            style={{
              background: downloading ? "#f5f5f7" : "#1d1d1f",
              color: downloading ? "#6e6e73" : "#fff",
              border: "1px solid " + (downloading ? "#d1d1d6" : "#1d1d1f"),
              borderRadius: 8,
              padding: "8px 20px",
              fontSize: 14,
              fontWeight: 600,
              cursor: downloading ? "default" : "pointer",
              fontFamily: "inherit",
            }}
          >
            {downloading ? "Generating…" : "↓ Download PDF"}
          </button>
        </div>
      </div>

      {/* Report body */}
      <main style={{ maxWidth: 860, margin: "0 auto", padding: "40px 32px 80px" }}>
        <ReportSection
          heading=""
          body={FINANCE_REPORT_MARKDOWN.split(/^## /m)[0]}
        />
        {sections.map((s, i) => (
          <ReportSection key={i} heading={s.heading} body={s.body} />
        ))}
      </main>

      {/* Footer */}
      <footer style={{ borderTop: "1px solid rgba(0,0,0,0.08)", padding: "24px 32px", textAlign: "center" }}>
        <p style={{ fontSize: 12, color: "#86868b", margin: 0 }}>
          Map Research Intelligence · Source data: SEC EDGAR, NIH RePORTER, ClinicalTrials.gov, PubMed · UNC Chapel Hill
        </p>
      </footer>
    </div>
  );
}

function renderBold(text: string): React.ReactNode[] {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return parts.map((part, i) =>
    i % 2 === 1 ? <strong key={i}>{part}</strong> : <span key={i}>{part}</span>
  );
}

function ReportSection({ heading, body }: { heading: string; body: string }) {
  if (!body.trim() && !heading) return null;

  const lines = body.split("\n");
  const elements: React.ReactNode[] = [];
  let tableBuffer: string[] = [];
  let listBuffer: string[] = [];

  function flushTable() {
    if (!tableBuffer.length) return;
    const rows = tableBuffer.filter((r) => !/^\|[\s:|-]+\|/.test(r));
    const headers = rows[0]?.replace(/^\||\|$/g, "").split("|").map((c) => c.trim()) ?? [];
    const bodyRows = rows.slice(1).map((r) => r.replace(/^\||\|$/g, "").split("|").map((c) => c.trim()));
    elements.push(
      <div key={elements.length} style={{ overflowX: "auto", margin: "16px 0 24px" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr>
              {headers.map((h, i) => (
                <th key={i} style={{ background: "#1d1d1f", color: "#fff", padding: "8px 12px", textAlign: "left", fontWeight: 600, fontSize: 12 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {bodyRows.map((row, ri) => (
              <tr key={ri} style={{ borderBottom: "1px solid #f0f0f0" }}>
                {row.map((cell, ci) => (
                  <td key={ci} style={{ padding: "8px 12px", color: "#1d1d1f", verticalAlign: "top" }}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
    tableBuffer = [];
  }

  function flushList() {
    if (!listBuffer.length) return;
    elements.push(
      <ul key={elements.length} style={{ margin: "8px 0 16px", paddingLeft: 20 }}>
        {listBuffer.map((item, i) => (
          <li key={i} style={{ fontSize: 14, color: "#3a3a3c", lineHeight: 1.65, marginBottom: 4 }}>{item}</li>
        ))}
      </ul>
    );
    listBuffer = [];
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.startsWith("|")) {
      flushList();
      tableBuffer.push(line);
      continue;
    }
    if (tableBuffer.length && !line.startsWith("|")) {
      flushTable();
    }

    if (/^[-*+]\s+/.test(line)) {
      elements.push(...[]);
      listBuffer.push(line.replace(/^[-*+]\s+/, ""));
      continue;
    }
    if (listBuffer.length && !/^[-*+]\s+/.test(line)) {
      flushList();
    }

    if (!line) { elements.push(<div key={elements.length} style={{ height: 8 }} />); continue; }
    if (/^#{3,}\s+/.test(line)) {
      elements.push(<h3 key={elements.length} style={{ fontSize: 14, fontWeight: 600, color: "#1d1d1f", margin: "20px 0 6px", letterSpacing: "-0.3px" }}>{line.replace(/^#+\s+/, "")}</h3>);
      continue;
    }
    if (line.startsWith("**") && line.endsWith("**")) {
      elements.push(<p key={elements.length} style={{ fontSize: 14, fontWeight: 600, color: "#1d1d1f", margin: "12px 0 4px" }}>{line.replace(/\*\*/g, "")}</p>);
      continue;
    }
    if (line.startsWith("---")) {
      elements.push(<hr key={elements.length} style={{ border: "none", borderTop: "1px solid #e8e8ed", margin: "24px 0" }} />);
      continue;
    }
    if (line.startsWith("*") && line.endsWith("*") && !line.startsWith("**")) {
      elements.push(<p key={elements.length} style={{ fontSize: 12, color: "#86868b", fontStyle: "italic", margin: "16px 0 0" }}>{line.replace(/^\*|\*$/g, "")}</p>);
      continue;
    }
    elements.push(<p key={elements.length} style={{ fontSize: 14, color: "#3a3a3c", lineHeight: 1.7, margin: "6px 0" }}>{renderBold(line)}</p>);
  }
  flushTable();
  flushList();

  return (
    <section style={{ marginBottom: 48 }}>
      {heading && (
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "#1d1d1f", letterSpacing: "-0.6px", margin: "0 0 16px", paddingBottom: 12, borderBottom: "2px solid #1d1d1f" }}>
          {heading}
        </h2>
      )}
      {elements}
    </section>
  );
}
