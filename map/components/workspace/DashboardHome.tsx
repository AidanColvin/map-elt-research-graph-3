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
  { name: "Clean Energy", count: 31, up: true,  color: "#10b981" },
  { name: "Biotech",      count: 44, up: true,  color: "#818cf8" },
  { name: "Quantum",      count: 12, up: false, color: "#f59e0b" },
  { name: "Gene Therapy", count: 19, up: true,  color: "#f472b6" },
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
  onRunCompany:    (name: string) => void;
  onRunSector:     (name: string) => void;
  onOpenCompanyView: () => void;
  onPrefillSector: (name: string) => void;
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
    <>
      {/* ═══════════════════════════════════════
          DARK HERO — full bleed, Apple-style
      ═══════════════════════════════════════ */}
      <div style={{
        margin: "0 -24px",
        background: "#07070e",
        position: "relative",
        overflow: "hidden",
        paddingBottom: 72,
      }}>
        {/* Background noise texture feel via very subtle radial layers */}
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          background: "radial-gradient(ellipse 80% 60% at 70% 55%, rgba(109,40,217,0.18) 0%, rgba(79,70,229,0.08) 40%, transparent 70%)",
        }} />
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          background: "radial-gradient(ellipse 50% 40% at 20% 30%, rgba(99,102,241,0.07) 0%, transparent 60%)",
        }} />

        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "64px 24px 0" }}>
          <div className="db-hero-grid">

            {/* Left: copy + search */}
            <div style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
              <p style={{
                fontSize: 11, fontWeight: 700, letterSpacing: "0.24em",
                color: "rgba(255,255,255,0.35)", textTransform: "uppercase", marginBottom: 24,
              }}>
                UNC Research × Industry
              </p>

              <h1 style={{
                fontSize: "clamp(40px, 5.5vw, 68px)",
                lineHeight: 1.04, fontWeight: 800,
                letterSpacing: "-0.03em", color: "#ffffff",
                marginBottom: 24,
              }}>
                Map the{" "}
                <span style={{
                  fontStyle: "italic",
                  background: "linear-gradient(115deg, #818cf8 0%, #a78bfa 50%, #c084fc 100%)",
                  WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent",
                }}>
                  partnership
                </span>
                <br />landscape.
              </h1>

              <p style={{
                fontSize: 17, color: "rgba(255,255,255,0.5)",
                lineHeight: 1.65, marginBottom: 40, maxWidth: 400,
              }}>
                Deep-dive any public company or scan an entire sector against UNC
                research — sourced, scored, in about a minute.
              </p>

              {/* Search */}
              <form onSubmit={submit} style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "6px 6px 6px 20px",
                background: "rgba(255,255,255,0.07)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 18,
                backdropFilter: "blur(12px)",
                maxWidth: 460,
              }}>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Company, ticker, or sector…"
                  aria-label="Company, ticker, or sector"
                  autoComplete="off" spellCheck={false}
                  style={{
                    flex: 1, background: "transparent", border: "none",
                    fontSize: 15, color: "#ffffff",
                    outline: "none", padding: "9px 0",
                  }}
                />
                <button type="submit" style={{
                  borderRadius: 12,
                  background: "linear-gradient(135deg, #6366f1, #a855f7)",
                  color: "#fff", fontSize: 14, fontWeight: 700,
                  padding: "11px 24px", border: "none", cursor: "pointer",
                  whiteSpace: "nowrap",
                  boxShadow: "0 4px 20px rgba(139,92,246,0.5)",
                  transition: "opacity 0.15s",
                }}
                  onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.85")}
                  onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
                >
                  Map it
                </button>
              </form>

              {/* Chips */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 18 }}>
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", marginRight: 2 }}>Try:</span>
                {["Apple", "Oncology", "Semiconductors"].map((chip) => (
                  <button key={chip} onClick={() => setQuery(chip)} style={{
                    fontSize: 12, color: "rgba(255,255,255,0.6)",
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 999, padding: "5px 14px", cursor: "pointer",
                    transition: "background 0.15s, color 0.15s",
                  }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "rgba(255,255,255,0.12)";
                      e.currentTarget.style.color = "#fff";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "rgba(255,255,255,0.06)";
                      e.currentTarget.style.color = "rgba(255,255,255,0.6)";
                    }}
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </div>

            {/* Right: floating orbit card */}
            <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {/* Large purple glow behind card */}
              <div style={{
                position: "absolute",
                width: "110%", height: "110%",
                background: "radial-gradient(ellipse at center, rgba(139,92,246,0.22) 0%, rgba(79,70,229,0.1) 45%, transparent 70%)",
                borderRadius: "50%",
                filter: "blur(30px)",
                pointerEvents: "none",
              }} />

              <div style={{
                position: "relative", width: "100%",
                borderRadius: 28,
                background: "rgba(255,255,255,0.05)",
                backdropFilter: "saturate(180%) blur(20px)",
                WebkitBackdropFilter: "saturate(180%) blur(20px)",
                border: "1px solid rgba(255,255,255,0.1)",
                boxShadow: "0 32px 80px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.08)",
                padding: "20px 20px 16px",
              }}>
                {/* Card top row */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                  <p style={{
                    display: "flex", alignItems: "center", gap: 8,
                    fontSize: 10.5, fontWeight: 700, letterSpacing: "0.18em",
                    color: "rgba(255,255,255,0.4)", textTransform: "uppercase",
                  }}>
                    <span style={{
                      display: "inline-block", width: 7, height: 7, borderRadius: "50%",
                      background: "#10b981", boxShadow: "0 0 0 3px rgba(16,185,129,0.25)",
                      animation: "pulse 1.6s ease-in-out infinite",
                    }} aria-hidden />
                    Sector Scan · Live
                  </p>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", fontVariantNumeric: "tabular-nums" }}>14 of 18</span>
                </div>

                <h2 style={{ fontSize: 22, fontWeight: 700, color: "#fff", letterSpacing: "-0.01em", marginBottom: 2 }}>Oncology</h2>
                <p style={{ fontSize: 12.5, color: "rgba(255,255,255,0.3)", marginBottom: 4 }}>
                  Public companies × UNC research overlap
                </p>

                {/* Orbit — lives inside the white-tinted card so it renders correctly */}
                <div style={{
                  background: "rgba(255,255,255,0.97)",
                  borderRadius: 18,
                  overflow: "hidden",
                  margin: "8px -4px 0",
                }}>
                  <OrbitNetwork points={SCAN_POINTS} centerLabel="UNC" height={440} />
                </div>

                {/* Stats */}
                <div style={{
                  display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 14,
                }}>
                  {[{ n: "18", label: "Companies" }, { n: "64", label: "Claims" }, { n: "7", label: "UNC Ties" }].map((s) => (
                    <div key={s.label} style={{
                      background: "rgba(255,255,255,0.05)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      borderRadius: 14, padding: "10px 0", textAlign: "center",
                    }}>
                      <p style={{ fontSize: 22, fontWeight: 700, color: "#fff", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{s.n}</p>
                      <p style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: "0.13em", color: "rgba(255,255,255,0.3)", textTransform: "uppercase", marginTop: 4 }}>{s.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Fade-to-light at bottom */}
        <div style={{
          position: "absolute", bottom: 0, left: 0, right: 0, height: 80,
          background: "linear-gradient(to bottom, transparent, #faf9f7)",
          pointerEvents: "none",
        }} />
      </div>

      {/* ═══════════════════════════════════════
          LIGHT SECTIONS
      ═══════════════════════════════════════ */}
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px 72px" }}>

        {/* ── Curated Company Profiles ── */}
        <div style={{ marginTop: 64 }}>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 28 }}>
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.2em", color: "#9ca3af", textTransform: "uppercase", marginBottom: 6 }}>
                Curated Profiles · Instant
              </p>
              <h2 style={{ fontSize: 28, fontWeight: 800, color: "#0f0f10", letterSpacing: "-0.02em" }}>
                Company Intelligence
              </h2>
            </div>
            <button
              onClick={onOpenCompanyView}
              style={{
                fontSize: 13, color: "#6366f1", fontWeight: 600,
                background: "rgba(99,102,241,0.08)",
                border: "1px solid rgba(99,102,241,0.18)",
                borderRadius: 12, padding: "9px 18px", cursor: "pointer",
                transition: "background 0.15s",
                whiteSpace: "nowrap", flexShrink: 0, marginBottom: 4,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(99,102,241,0.14)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(99,102,241,0.08)")}
            >
              View all →
            </button>
          </div>

          <div className="db-company-grid">
            {DEEP_DIVES.map((c) => (
              <button key={c.name} onClick={() => onRunCompany(c.name)}
                className="db-card"
                style={{
                  textAlign: "left", padding: 0, border: "none",
                  borderRadius: 22, cursor: "pointer", overflow: "hidden",
                  background: "#fff",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)",
                }}
              >
                {/* Brand color top bar */}
                <div style={{ height: 5, background: `linear-gradient(90deg, ${c.accent}, ${c.accent}66)` }} />
                <div style={{ padding: "20px 20px 18px" }}>
                  <div className="[&_.company-logo]:w-[44px] [&_.company-logo]:h-[44px] [&_.company-logo]:rounded-xl [&_.company-logo]:shadow-none [&_.company-logo_img]:p-[7px] [&_.company-logo.monogram]:text-[18px]"
                    style={{ marginBottom: 16 }}>
                    <CompanyLogo name={c.name} domain={c.domain} accent={c.accent} />
                  </div>
                  <p style={{ fontSize: 15, fontWeight: 800, color: "#0f0f10", letterSpacing: "-0.01em", marginBottom: 2 }}>{c.name}</p>
                  <p style={{ fontSize: 11, color: "#9ca3af", marginBottom: 14 }}>{c.ticker}</p>
                  <span style={{ fontSize: 12.5, color: "#6366f1", fontWeight: 600 }}>View profile →</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* ── Trending Sectors ── */}
        <div style={{ marginTop: 64 }}>
          <div style={{ marginBottom: 28 }}>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.2em", color: "#9ca3af", textTransform: "uppercase", marginBottom: 6 }}>
              Trending Now
            </p>
            <h2 style={{ fontSize: 28, fontWeight: 800, color: "#0f0f10", letterSpacing: "-0.02em" }}>
              Sector Intelligence
            </h2>
          </div>

          <div className="db-sector-grid">
            {TRENDING.map((s) => (
              <button key={s.name} onClick={() => onPrefillSector(s.name)}
                className="db-card"
                style={{
                  textAlign: "left", border: "none",
                  padding: "26px 24px 22px", borderRadius: 22, cursor: "pointer",
                  background: "#fff",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)",
                  position: "relative", overflow: "hidden",
                }}
              >
                {/* Large soft blob */}
                <div style={{
                  position: "absolute", top: -30, right: -30, width: 120, height: 120,
                  borderRadius: "50%", background: `${s.color}20`, pointerEvents: "none",
                }} />

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                  <div style={{
                    width: 42, height: 42, borderRadius: 13,
                    background: `${s.color}18`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 20, color: s.color,
                  }}>✳</div>
                  <div style={{
                    width: 32, height: 32, borderRadius: "50%",
                    background: s.up ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 15, color: s.up ? "#10b981" : "#ef4444", fontWeight: 700,
                  }}>
                    {s.up ? "↗" : "↘"}
                  </div>
                </div>

                <p style={{ fontSize: 17, fontWeight: 800, color: "#0f0f10", letterSpacing: "-0.01em", marginBottom: 6 }}>{s.name}</p>
                <p style={{ fontSize: 12, color: "#9ca3af" }}>
                  <span style={{ fontWeight: 700, color: s.color, fontVariantNumeric: "tabular-nums" }}>{s.count}</span> companies
                </p>
              </button>
            ))}
          </div>
        </div>
      </div>

      <style>{`
        .db-hero-grid {
          display: grid;
          grid-template-columns: 1fr 1.15fr;
          gap: 48px;
          align-items: center;
          min-height: 540px;
        }
        .db-company-grid {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 16px;
        }
        .db-sector-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
        }
        .db-card {
          transition: transform 0.22s cubic-bezier(.22,1,.36,1), box-shadow 0.22s ease;
        }
        .db-card:hover {
          transform: translateY(-4px) scale(1.01);
          box-shadow: 0 16px 48px rgba(0,0,0,0.1) !important;
        }
        @media (max-width: 980px) {
          .db-hero-grid { grid-template-columns: 1fr !important; min-height: auto !important; }
          .db-company-grid { grid-template-columns: repeat(3, 1fr) !important; }
          .db-sector-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
        @media (max-width: 600px) {
          .db-company-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .db-sector-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </>
  );
}
