"use client";

import { useState } from "react";
import { OrbitNetwork } from "@/components/Chart3D";
import CompanyLogo from "@/app/components/CompanyLogo";
import { SECTORS, getSectorSuggestion } from "./sectors";

const DEEP_DIVES = [
  { name: "Apple",     ticker: "AAPL",    domain: "apple.com",     accent: "#1d1d1f" },
  { name: "NVIDIA",    ticker: "NVDA",    domain: "nvidia.com",    accent: "#76b900" },
  { name: "Microsoft", ticker: "MSFT",    domain: "microsoft.com", accent: "#0078d4" },
  { name: "Alphabet",  ticker: "GOOGL",   domain: "google.com",    accent: "#4285f4" },
  { name: "Anthropic", ticker: "Private", domain: "anthropic.com", accent: "#cc785c" },
];

const TRENDING = [
  { name: "Clean Energy", count: 31, color: "#10b981" },
  { name: "Biotech",      count: 44, color: "#818cf8" },
  { name: "Quantum",      count: 12, color: "#f59e0b" },
  { name: "Gene Therapy", count: 19, color: "#f472b6" },
];

const SCAN_POINTS = [
  { label: "Merck",          size: 0.9,  highlight: true,  weight: 2 },
  { label: "Pfizer",         size: 0.8,  highlight: true,  weight: 2 },
  { label: "AstraZeneca",    size: 0.7,  weight: 1 },
  { label: "Novartis",       size: 0.65, weight: 1 },
  { label: "Amgen",          size: 0.6,  highlight: true,  weight: 1 },
  { label: "Gilead",         size: 0.5,  weight: 1 },
  { label: "BioNTech",       size: 0.45, weight: 1 },
  { label: "Moderna",        size: 0.5,  weight: 1 },
  { label: "Regeneron",      size: 0.4,  highlight: true,  weight: 1 },
  { label: "Vertex",         size: 0.35, weight: 1 },
  { label: "Illumina",       size: 0.3,  weight: 1 },
  { label: "Exact Sciences", size: 0.3,  weight: 1 },
];

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
      maxWidth: 1160,
      margin: "0 auto",
      padding: "0 24px",
      /* Fill the viewport below the 54px nav without overflow */
      height: "calc(100vh - 54px)",
      display: "flex",
      flexDirection: "column",
      gap: 0,
    }}>

      {/* ── Main split: fills most of the vertical space ── */}
      <div style={{
        flex: 1,
        display: "grid",
        gridTemplateColumns: "1fr 1.05fr",
        gap: 40,
        alignItems: "center",
        paddingTop: 32,
        paddingBottom: 16,
        minHeight: 0,
      }}>

        {/* LEFT — pitch + search + companies */}
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          <p style={{
            fontSize: 10.5, fontWeight: 700, letterSpacing: "0.24em",
            color: "#9ca3af", textTransform: "uppercase", marginBottom: 16,
          }}>
            UNC Research × Industry
          </p>

          <h1 style={{
            fontSize: "clamp(30px, 3.8vw, 48px)",
            lineHeight: 1.08, fontWeight: 700,
            letterSpacing: "-0.025em", color: "#0f0f10",
            marginBottom: 14,
          }}>
            Map the{" "}
            <em style={{
              fontStyle: "italic",
              background: "linear-gradient(110deg,#4f46e5,#7c3aed,#a855f7)",
              WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent",
            }}>
              partnership
            </em>{" "}
            landscape.
          </h1>

          <p style={{
            fontSize: 15, color: "#6b7280", lineHeight: 1.55, marginBottom: 24, maxWidth: 380,
          }}>
            Deep-dive any public company or scan an entire sector against UNC research — sourced, scored, in about a minute.
          </p>

          {/* Search */}
          <form onSubmit={submit} style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "5px 5px 5px 18px",
            background: "#fff",
            border: "1px solid rgba(0,0,0,0.09)",
            borderRadius: 16,
            boxShadow: "0 4px 20px rgba(79,70,229,0.07), 0 1px 4px rgba(0,0,0,0.05)",
            maxWidth: 420, marginBottom: 12,
          }}>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Company, ticker, or sector…"
              aria-label="Company, ticker, or sector"
              autoComplete="off" spellCheck={false}
              style={{
                flex: 1, background: "transparent", border: "none",
                fontSize: 14.5, color: "#0f0f10", outline: "none", padding: "8px 0",
              }}
            />
            <button type="submit" style={{
              borderRadius: 11,
              background: "linear-gradient(135deg,#4f46e5,#7c3aed)",
              color: "#fff", fontSize: 13.5, fontWeight: 600,
              padding: "9px 20px", border: "none", cursor: "pointer",
              whiteSpace: "nowrap",
              boxShadow: "0 3px 12px rgba(79,70,229,0.32)",
            }}>
              Map it
            </button>
          </form>

          {/* Try chips */}
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 28 }}>
            <span style={{ fontSize: 11.5, color: "#9ca3af" }}>Try:</span>
            {["Apple", "Oncology", "Semiconductors"].map((chip) => (
              <button key={chip} onClick={() => setQuery(chip)} style={{
                fontSize: 12, color: "#4b5563",
                background: "#fff", border: "1px solid rgba(0,0,0,0.07)",
                borderRadius: 999, padding: "4px 13px", cursor: "pointer",
                transition: "box-shadow 0.12s",
              }}
                onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.09)")}
                onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "none")}
              >
                {chip}
              </button>
            ))}
          </div>

          {/* Company quick-launch row */}
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <p style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.18em", color: "#9ca3af", textTransform: "uppercase" }}>
                Instant Profiles
              </p>
              <button onClick={onOpenCompanyView} style={{
                fontSize: 12, color: "#4f46e5", fontWeight: 600,
                background: "none", border: "none", cursor: "pointer", padding: 0,
              }}>View all →</button>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              {DEEP_DIVES.map((c) => (
                <button key={c.name} onClick={() => onRunCompany(c.name)} style={{
                  flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
                  gap: 6, padding: "12px 6px 10px",
                  background: "#fff", border: "1px solid rgba(0,0,0,0.06)",
                  borderRadius: 16, cursor: "pointer",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
                  transition: "transform 0.18s, box-shadow 0.18s",
                }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = "translateY(-2px)";
                    e.currentTarget.style.boxShadow = "0 8px 24px rgba(0,0,0,0.09)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "translateY(0)";
                    e.currentTarget.style.boxShadow = "0 1px 4px rgba(0,0,0,0.04)";
                  }}
                >
                  <div style={{ height: 3, width: "60%", borderRadius: 99, background: c.accent, opacity: 0.7, marginBottom: 2 }} />
                  <div className="[&_.company-logo]:w-[32px] [&_.company-logo]:h-[32px] [&_.company-logo]:rounded-lg [&_.company-logo]:shadow-none [&_.company-logo_img]:p-[5px] [&_.company-logo.monogram]:text-[14px]">
                    <CompanyLogo name={c.name} domain={c.domain} accent={c.accent} />
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "#374151" }}>{c.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT — live sector scan card */}
        <div style={{
          borderRadius: 24,
          background: "rgba(255,255,255,0.82)",
          backdropFilter: "saturate(180%) blur(16px)",
          WebkitBackdropFilter: "saturate(180%) blur(16px)",
          border: "1px solid rgba(0,0,0,0.06)",
          boxShadow: "0 16px 48px rgba(79,70,229,0.08), 0 2px 8px rgba(0,0,0,0.05)",
          padding: "18px 18px 14px",
          display: "flex", flexDirection: "column",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
            <p style={{
              display: "flex", alignItems: "center", gap: 7,
              fontSize: 10, fontWeight: 700, letterSpacing: "0.18em",
              color: "#6b7280", textTransform: "uppercase",
            }}>
              <span style={{
                display: "inline-block", width: 6, height: 6, borderRadius: "50%",
                background: "#10b981", boxShadow: "0 0 0 3px rgba(16,185,129,0.2)",
                animation: "pulse 1.6s ease-in-out infinite",
              }} aria-hidden />
              Sector Scan · Live
            </p>
            <span style={{ fontSize: 10.5, color: "#9ca3af", fontVariantNumeric: "tabular-nums" }}>14 of 18</span>
          </div>

          <h2 style={{ fontSize: 20, fontWeight: 700, color: "#0f0f10", letterSpacing: "-0.01em", marginBottom: 1 }}>Oncology</h2>
          <p style={{ fontSize: 12, color: "#9ca3af", marginBottom: 4 }}>Public companies × UNC research overlap</p>

          {/* Orbit — flex:1 so it fills remaining height */}
          <div style={{ flex: 1, minHeight: 0 }}>
            <OrbitNetwork points={SCAN_POINTS} centerLabel="UNC" height={300} />
          </div>

          {/* Stats */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 10 }}>
            {[{ n: "18", label: "Companies" }, { n: "64", label: "Claims" }, { n: "7", label: "UNC Ties" }].map((s) => (
              <div key={s.label} style={{
                background: "rgba(249,250,251,0.9)", border: "1px solid rgba(0,0,0,0.04)",
                borderRadius: 12, padding: "8px 0", textAlign: "center",
              }}>
                <p style={{ fontSize: 18, fontWeight: 700, color: "#0f0f10", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{s.n}</p>
                <p style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.12em", color: "#9ca3af", textTransform: "uppercase", marginTop: 3 }}>{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Sector strip — pinned to bottom ── */}
      <div style={{ paddingBottom: 20 }}>
        <p style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.18em", color: "#9ca3af", textTransform: "uppercase", marginBottom: 10 }}>
          Trending Sectors
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
          {TRENDING.map((s) => (
            <button key={s.name} onClick={() => onPrefillSector(s.name)} style={{
              textAlign: "left", border: "1px solid rgba(0,0,0,0.06)",
              padding: "12px 14px", borderRadius: 14, cursor: "pointer",
              background: "#fff",
              boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
              display: "flex", alignItems: "center", gap: 10,
              transition: "transform 0.15s, box-shadow 0.15s",
            }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-2px)";
                e.currentTarget.style.boxShadow = "0 6px 20px rgba(0,0,0,0.08)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "0 1px 4px rgba(0,0,0,0.04)";
              }}
            >
              <span style={{
                width: 32, height: 32, borderRadius: 9,
                background: `${s.color}18`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 15, color: s.color, flexShrink: 0,
              }}>✳</span>
              <div>
                <p style={{ fontSize: 13, fontWeight: 700, color: "#0f0f10", lineHeight: 1.2 }}>{s.name}</p>
                <p style={{ fontSize: 11, color: s.color, fontWeight: 600, marginTop: 2 }}>{s.count} cos</p>
              </div>
            </button>
          ))}
        </div>
      </div>

    </div>
  );
}
