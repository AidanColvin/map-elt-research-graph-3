"use client";

import { OrbitNetwork } from "@/components/Chart3D";

const ORBIT_POINTS = [
  { label: "Merck",       size: 14, highlight: true  },
  { label: "Pfizer",      size: 14, highlight: true  },
  { label: "Amgen",       size: 12, highlight: true  },
  { label: "Regeneron",   size: 12, highlight: true  },
  { label: "BMS",         size: 10, highlight: false },
  { label: "AstraZeneca", size: 10, highlight: false },
  { label: "Novartis",    size: 10, highlight: false },
  { label: "Roche",       size: 10, highlight: false },
  { label: "J&J",         size: 9,  highlight: false },
  { label: "AbbVie",      size: 9,  highlight: false },
  { label: "Gilead",      size: 9,  highlight: false },
  { label: "Sanofi",      size: 9,  highlight: false },
];

export default function DashboardHome({
  onRunCompany,
  onRunSector,
  onOpenCompanyView,
  onPrefillSector,
}: {
  onRunCompany:      (name: string) => void;
  onRunSector:       (name: string) => void;
  onOpenCompanyView: () => void;
  onPrefillSector:   (name: string) => void;
}) {
  return (
    <div style={{
      maxWidth: 1100,
      margin: "0 auto",
      padding: "48px 32px 32px",
      minHeight: "calc(100vh - 54px)",
      display: "flex",
      gap: 48,
      alignItems: "flex-start",
    }}>
    {/* Left editorial column */}
    <div style={{ flex: "0 0 480px", display: "flex", flexDirection: "column" }}>
      {/* Eyebrow */}
      <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", color: "#8e8e93", textTransform: "uppercase", marginBottom: 24 }}>
        A Research Workspace · Est. 2026
      </p>

      {/* Headline */}
      <h1 style={{ fontSize: "clamp(32px,4.5vw,52px)", fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.08, marginBottom: 20 }}>
        <span style={{ color: "#1d1d1f" }}>Board-ready intelligence,{"\n"}</span>
        <span style={{ color: "#007aff" }}>assembled from primary sources.</span>
      </h1>

      {/* Body */}
      <p style={{ fontSize: 16, color: "#6e6e73", lineHeight: 1.65, marginBottom: 40, maxWidth: 560 }}>
        No LLM in the request path. No API keys. Every number, sentence, and citation traces to a free, keyless public data source — SEC EDGAR, ClinicalTrials.gov, PubMed, NIH RePORTER.
      </p>

      {/* Canvas card */}
      <div style={{
        border: "1px solid #e5e5ea",
        borderRadius: 20,
        overflow: "hidden",
        marginBottom: "auto",
      }}>
        <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", color: "#8e8e93", textTransform: "uppercase", padding: "14px 20px 10px", borderBottom: "1px solid #f2f2f7" }}>
          Open a canvas
        </p>
        {[
          { label: "Company Profile", sub: "Live SEC filings, charts, leadership", action: () => onOpenCompanyView() },
          { label: "Sector Scan", sub: "Trials + grants + filings, parallel pull", action: () => onRunSector("") },
          { label: "Accounts", sub: "Partner database, exportable", action: () => onOpenCompanyView() },
        ].map((row, i, arr) => (
          <button key={row.label} onClick={row.action} style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            width: "100%", padding: "18px 20px",
            background: "#fff", border: "none",
            borderBottom: i < arr.length - 1 ? "1px solid #f2f2f7" : "none",
            cursor: "pointer", textAlign: "left",
            transition: "background 0.12s",
          }}
            onMouseEnter={e => (e.currentTarget.style.background = "#f9f9f9")}
            onMouseLeave={e => (e.currentTarget.style.background = "#fff")}
          >
            <div>
              <p style={{ fontSize: 15, fontWeight: 600, color: "#1d1d1f", marginBottom: 2 }}>{row.label}</p>
              <p style={{ fontSize: 12.5, color: "#8e8e93" }}>{row.sub}</p>
            </div>
            <span style={{ fontSize: 18, color: "#007aff", fontWeight: 400 }}>→</span>
          </button>
        ))}
      </div>

      {/* Footer */}
      <div style={{ marginTop: 32, paddingTop: 20, borderTop: "1px solid #f2f2f7" }}>
        <p style={{ fontSize: 11.5, color: "#8e8e93", marginBottom: 8 }}>
          Independent project. Not affiliated with UNC Chapel Hill. For information only — not investment advice.
        </p>
        <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.12em", color: "#c7c7cc", textTransform: "uppercase" }}>
          Free · Keyless · Primary-Source
        </p>
      </div>
    </div>

    {/* Right orbit column */}
    <div style={{ flex: 1, minWidth: 0, paddingTop: 8 }}>
      <OrbitNetwork
        points={ORBIT_POINTS}
        centerLabel="map"
        height={420}
        baseColor="#007aff"
      />
    </div>
    </div>
  );
}
