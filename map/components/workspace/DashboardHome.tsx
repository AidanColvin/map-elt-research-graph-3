"use client";

import { useState } from "react";
import { OrbitNetwork } from "@/components/Chart3D";
import { SECTORS, getSectorSuggestion } from "./sectors";

// Apple blue
const BLUE = "#007aff";

const SCAN_POINTS = [
  { label: "Merck",       size: 0.9,  highlight: true,  weight: 2 },
  { label: "Pfizer",      size: 0.8,  highlight: true,  weight: 2 },
  { label: "AstraZeneca", size: 0.7,  weight: 1 },
  { label: "Novartis",    size: 0.65, weight: 1 },
  { label: "Amgen",       size: 0.6,  highlight: true,  weight: 1 },
  { label: "Gilead",      size: 0.5,  weight: 1 },
  { label: "BioNTech",    size: 0.45, weight: 1 },
  { label: "Moderna",     size: 0.5,  weight: 1 },
  { label: "Regeneron",   size: 0.4,  highlight: true,  weight: 1 },
  { label: "Vertex",      size: 0.35, weight: 1 },
  { label: "Illumina",    size: 0.3,  weight: 1 },
];

const SECTORS_QUICK = ["Clean Energy", "Biotech", "Quantum", "Gene Therapy"];

function classifyQuery(q: string): "sector" | "company" {
  const v = q.trim().toLowerCase();
  if (SECTORS.some((s) => s.toLowerCase() === v)) return "sector";
  return "company";
}

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
  const [query, setQuery] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const completed = getSectorSuggestion(query) ?? query;
    const target = completed.trim();
    if (!target) return;
    if (classifyQuery(target) === "sector") onRunSector(target);
    else onRunCompany(target);
    setQuery("");
  }

  return (
    <div style={{
      maxWidth: 1120,
      margin: "0 auto",
      padding: "0 32px",
      height: "calc(100vh - 54px)",
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      gap: 0,
    }}>

      {/* ── Two-column hero ── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1.1fr",
        gap: 56,
        alignItems: "center",
      }}>

        {/* LEFT */}
        <div>
          <p style={{
            fontSize: 12, fontWeight: 600, letterSpacing: "0.06em",
            color: "#8e8e93", marginBottom: 20,
          }}>
            UNC Research × Industry
          </p>

          <h1 style={{
            fontSize: "clamp(34px, 4vw, 52px)",
            lineHeight: 1.1,
            fontWeight: 700,
            letterSpacing: "-0.025em",
            color: "#1d1d1f",
            marginBottom: 16,
          }}>
            Map the{" "}
            <span style={{ color: BLUE }}>partnership</span>
            {" "}landscape.
          </h1>

          <p style={{
            fontSize: 17,
            color: "#6e6e73",
            lineHeight: 1.6,
            marginBottom: 32,
            maxWidth: 400,
          }}>
            Deep-dive any company or scan a full sector against UNC research — sourced, scored, in about a minute.
          </p>

          {/* Search */}
          <form onSubmit={submit} style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 6px 6px 18px",
            background: "#ffffff",
            border: "1px solid #d1d1d6",
            borderRadius: 14,
            boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
            maxWidth: 440,
            marginBottom: 14,
          }}>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Company, ticker, or sector…"
              aria-label="Company, ticker, or sector"
              autoComplete="off"
              spellCheck={false}
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                fontSize: 16,
                color: "#1d1d1f",
                outline: "none",
                padding: "7px 0",
              }}
            />
            <button type="submit" style={{
              borderRadius: 10,
              background: BLUE,
              color: "#fff",
              fontSize: 15,
              fontWeight: 600,
              padding: "10px 22px",
              border: "none",
              cursor: "pointer",
              whiteSpace: "nowrap",
              transition: "opacity 0.12s",
            }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.86")}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
            >
              Map it
            </button>
          </form>

          {/* Try chips */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 40 }}>
            <span style={{ fontSize: 13, color: "#8e8e93" }}>Try:</span>
            {["Apple", "Oncology", "Semiconductors"].map((chip) => (
              <button key={chip} onClick={() => setQuery(chip)} style={{
                fontSize: 13,
                color: "#1d1d1f",
                background: "#f2f2f7",
                border: "none",
                borderRadius: 999,
                padding: "5px 14px",
                cursor: "pointer",
                transition: "background 0.12s",
              }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#e5e5ea")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "#f2f2f7")}
              >
                {chip}
              </button>
            ))}
          </div>

          {/* Sector pills */}
          <div>
            <p style={{ fontSize: 12, fontWeight: 600, color: "#8e8e93", letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 12 }}>
              Trending Sectors
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {SECTORS_QUICK.map((s) => (
                <button key={s} onClick={() => onPrefillSector(s)} style={{
                  fontSize: 13,
                  color: BLUE,
                  background: "rgba(0,122,255,0.08)",
                  border: "1px solid rgba(0,122,255,0.18)",
                  borderRadius: 999,
                  padding: "6px 16px",
                  cursor: "pointer",
                  fontWeight: 500,
                  transition: "background 0.12s",
                }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(0,122,255,0.14)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(0,122,255,0.08)")}
                >
                  {s}
                </button>
              ))}
              <button onClick={onOpenCompanyView} style={{
                fontSize: 13,
                color: "#8e8e93",
                background: "#f2f2f7",
                border: "none",
                borderRadius: 999,
                padding: "6px 16px",
                cursor: "pointer",
                transition: "background 0.12s",
              }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#e5e5ea")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "#f2f2f7")}
              >
                All companies →
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT — orbit card */}
        <div style={{
          borderRadius: 24,
          background: "#ffffff",
          border: "1px solid #e5e5ea",
          boxShadow: "0 8px 40px rgba(0,0,0,0.08)",
          padding: "20px 20px 16px",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <p style={{
              display: "flex", alignItems: "center", gap: 7,
              fontSize: 11, fontWeight: 600, letterSpacing: "0.08em",
              color: "#8e8e93", textTransform: "uppercase",
            }}>
              <span style={{
                display: "inline-block", width: 6, height: 6, borderRadius: "50%",
                background: "#30d158",
                animation: "pulse 1.6s ease-in-out infinite",
              }} aria-hidden />
              Sector Scan · Live
            </p>
            <span style={{ fontSize: 11, color: "#aeaeb2", fontVariantNumeric: "tabular-nums" }}>14 of 18</span>
          </div>

          <h2 style={{ fontSize: 22, fontWeight: 700, color: "#1d1d1f", letterSpacing: "-0.015em", marginBottom: 2 }}>Oncology</h2>
          <p style={{ fontSize: 13, color: "#aeaeb2", marginBottom: 6 }}>Public companies × UNC research overlap</p>

          <OrbitNetwork points={SCAN_POINTS} centerLabel="UNC" height={360} baseColor={BLUE} />

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 12 }}>
            {[{ n: "18", label: "Companies" }, { n: "64", label: "Claims" }, { n: "7", label: "UNC Ties" }].map((s) => (
              <div key={s.label} style={{
                background: "#f2f2f7",
                borderRadius: 12,
                padding: "10px 0",
                textAlign: "center",
              }}>
                <p style={{ fontSize: 20, fontWeight: 700, color: "#1d1d1f", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{s.n}</p>
                <p style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: "0.1em", color: "#aeaeb2", textTransform: "uppercase", marginTop: 3 }}>{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

    </div>
  );
}
