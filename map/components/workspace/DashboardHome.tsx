"use client";

import { useState } from "react";
import { OrbitNetwork } from "@/components/Chart3D";
import CompanyLogo from "@/app/components/CompanyLogo";
import { SECTORS, getSectorSuggestion } from "./sectors";

const DEEP_DIVES = [
  { name: "Apple", ticker: "AAPL", domain: "apple.com", accent: "#1d1d1f" },
  { name: "NVIDIA", ticker: "NVDA", domain: "nvidia.com", accent: "#76b900" },
  { name: "Microsoft", ticker: "MSFT", domain: "microsoft.com", accent: "#0078d4" },
  { name: "Alphabet", ticker: "GOOGL", domain: "google.com", accent: "#4285f4" },
  { name: "Anthropic", ticker: "Private", domain: "anthropic.com", accent: "#cc785c" },
];

const TRENDING = [
  { name: "Clean Energy", count: 31, up: true, color: "#10b981" },
  { name: "Biotech", count: 44, up: true, color: "#6366f1" },
  { name: "Quantum", count: 12, up: false, color: "#f59e0b" },
  { name: "Gene Therapy", count: 19, up: true, color: "#ec4899" },
];

const SCAN_POINTS = [
  { label: "Merck", size: 0.9, highlight: true, weight: 2 },
  { label: "Pfizer", size: 0.8, highlight: true, weight: 2 },
  { label: "AstraZeneca", size: 0.7, weight: 1 },
  { label: "Novartis", size: 0.65, weight: 1 },
  { label: "Amgen", size: 0.6, highlight: true, weight: 1 },
  { label: "Gilead", size: 0.5, weight: 1 },
  { label: "BioNTech", size: 0.45, weight: 1 },
  { label: "Moderna", size: 0.5, weight: 1 },
  { label: "Regeneron", size: 0.4, highlight: true, weight: 1 },
  { label: "Vertex", size: 0.35, weight: 1 },
  { label: "Illumina", size: 0.3, weight: 1 },
  { label: "Exact Sciences", size: 0.3, weight: 1 },
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
  onRunCompany: (name: string) => void;
  onRunSector: (name: string) => void;
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
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px 64px" }}>

      {/* ── Hero ── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1.1fr",
        gap: 40,
        alignItems: "center",
        marginTop: 16,
        minHeight: 520,
      }}
        className="hero-grid"
      >
        {/* Left: pitch + search */}
        <div>
          <p style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.22em",
            color: "#6b7280",
            textTransform: "uppercase",
            marginBottom: 20,
          }}>
            UNC Research × Industry
          </p>

          <h1 style={{
            fontSize: "clamp(36px, 5vw, 56px)",
            lineHeight: 1.06,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            color: "#0f0f10",
            marginBottom: 20,
          }}>
            Map the{" "}
            <span style={{
              fontStyle: "italic",
              background: "linear-gradient(115deg, #4f46e5 0%, #7c3aed 45%, #a855f7 100%)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
            }}>
              partnership
            </span>
            {" "}landscape.
          </h1>

          <p style={{
            fontSize: 16,
            color: "#6b7280",
            lineHeight: 1.65,
            marginBottom: 32,
            maxWidth: 420,
          }}>
            Deep-dive any public company or scan an entire sector against UNC
            research — sourced, scored, in about a minute.
          </p>

          <form
            onSubmit={submit}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 6px 6px 18px",
              background: "#ffffff",
              border: "1px solid rgba(0,0,0,0.08)",
              borderRadius: 18,
              boxShadow: "0 8px 32px rgba(79,70,229,0.08), 0 2px 8px rgba(0,0,0,0.05)",
              maxWidth: 480,
            }}
          >
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
                fontSize: 15,
                color: "#0f0f10",
                outline: "none",
                padding: "8px 0",
              }}
            />
            <button
              type="submit"
              style={{
                borderRadius: 12,
                background: "linear-gradient(135deg, #4f46e5, #7c3aed)",
                color: "#fff",
                fontSize: 14,
                fontWeight: 600,
                padding: "10px 22px",
                border: "none",
                cursor: "pointer",
                whiteSpace: "nowrap",
                boxShadow: "0 4px 14px rgba(79,70,229,0.35)",
                transition: "opacity 0.15s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.88")}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
            >
              Map it
            </button>
          </form>

          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 16 }}>
            <span style={{ fontSize: 12, color: "#9ca3af", marginRight: 4 }}>Try:</span>
            {["Apple", "Oncology", "Semiconductors"].map((chip) => (
              <button
                key={chip}
                onClick={() => setQuery(chip)}
                style={{
                  fontSize: 12,
                  color: "#374151",
                  background: "#fff",
                  border: "1px solid rgba(0,0,0,0.07)",
                  borderRadius: 999,
                  padding: "5px 14px",
                  cursor: "pointer",
                  transition: "box-shadow 0.15s, transform 0.15s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.08)";
                  e.currentTarget.style.transform = "translateY(-1px)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = "none";
                  e.currentTarget.style.transform = "translateY(0)";
                }}
              >
                {chip}
              </button>
            ))}
          </div>
        </div>

        {/* Right: 3D orbit card */}
        <div style={{ position: "relative" }}>
          {/* Ambient glow behind the network */}
          <div style={{
            position: "absolute",
            inset: "-20px",
            background: "radial-gradient(ellipse at 55% 45%, rgba(139,92,246,0.12) 0%, rgba(79,70,229,0.06) 50%, transparent 75%)",
            borderRadius: 32,
            pointerEvents: "none",
            zIndex: 0,
          }} />

          <div style={{
            position: "relative",
            zIndex: 1,
            borderRadius: 28,
            background: "rgba(255,255,255,0.75)",
            backdropFilter: "saturate(180%) blur(20px)",
            WebkitBackdropFilter: "saturate(180%) blur(20px)",
            border: "1px solid rgba(255,255,255,0.9)",
            boxShadow: "0 20px 60px rgba(79,70,229,0.1), 0 4px 16px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.8)",
            padding: "20px 20px 16px",
          }}>
            {/* Card header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <p style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.18em", color: "#6b7280", textTransform: "uppercase" }}>
                <span
                  style={{
                    display: "inline-block",
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: "#10b981",
                    boxShadow: "0 0 0 3px rgba(16,185,129,0.18)",
                    animation: "pulse 1.6s ease-in-out infinite",
                  }}
                  aria-hidden
                />
                Sector Scan · Live
              </p>
              <span style={{ fontSize: 11, color: "#9ca3af", fontVariantNumeric: "tabular-nums" }}>14 of 18</span>
            </div>

            <h2 style={{ fontSize: 22, fontWeight: 700, color: "#0f0f10", letterSpacing: "-0.01em" }}>Oncology</h2>
            <p style={{ fontSize: 12.5, color: "#9ca3af", marginBottom: 4 }}>
              Public companies × UNC research overlap
            </p>

            <OrbitNetwork points={SCAN_POINTS} centerLabel="UNC" height={460} />

            {/* Stats row */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 8 }}>
              {[
                { n: "18", label: "Companies" },
                { n: "64", label: "Claims" },
                { n: "7", label: "UNC Ties" },
              ].map((s) => (
                <div key={s.label} style={{
                  background: "rgba(249,250,251,0.8)",
                  border: "1px solid rgba(0,0,0,0.04)",
                  borderRadius: 14,
                  padding: "10px 0",
                  textAlign: "center",
                }}>
                  <p style={{ fontSize: 20, fontWeight: 700, color: "#0f0f10", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{s.n}</p>
                  <p style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: "0.13em", color: "#9ca3af", textTransform: "uppercase", marginTop: 4 }}>{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Curated Company Profiles ── */}
      <div style={{ marginTop: 72 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.2em", color: "#9ca3af", textTransform: "uppercase", marginBottom: 4 }}>
              Curated Company Profiles · Instant
            </p>
            <p style={{ fontSize: 13, color: "#6b7280" }}>Click any profile to load a pre-built intelligence report.</p>
          </div>
          <button
            onClick={onOpenCompanyView}
            style={{
              fontSize: 13,
              color: "#4f46e5",
              background: "rgba(79,70,229,0.06)",
              border: "1px solid rgba(79,70,229,0.15)",
              borderRadius: 10,
              padding: "7px 16px",
              cursor: "pointer",
              fontWeight: 600,
              transition: "background 0.15s",
              whiteSpace: "nowrap",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(79,70,229,0.1)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(79,70,229,0.06)")}
          >
            View all →
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 14 }} className="company-grid">
          {DEEP_DIVES.map((c) => (
            <button
              key={c.name}
              onClick={() => onRunCompany(c.name)}
              style={{
                textAlign: "left",
                padding: 0,
                borderRadius: 20,
                background: "#fff",
                border: "1px solid rgba(0,0,0,0.06)",
                boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
                cursor: "pointer",
                overflow: "hidden",
                transition: "transform 0.2s, box-shadow 0.2s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-3px)";
                e.currentTarget.style.boxShadow = "0 12px 32px rgba(0,0,0,0.1)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.04)";
              }}
            >
              {/* Accent band */}
              <div style={{
                height: 4,
                background: `linear-gradient(90deg, ${c.accent}cc, ${c.accent}44)`,
              }} />
              <div style={{ padding: "18px 18px 16px" }}>
                <div className="[&_.company-logo]:w-[42px] [&_.company-logo]:h-[42px] [&_.company-logo]:rounded-xl [&_.company-logo]:shadow-none [&_.company-logo_img]:p-[7px] [&_.company-logo.monogram]:text-[18px]"
                  style={{ marginBottom: 14 }}>
                  <CompanyLogo name={c.name} domain={c.domain} accent={c.accent} />
                </div>
                <p style={{ fontSize: 14, fontWeight: 700, color: "#0f0f10", marginBottom: 2 }}>{c.name}</p>
                <p style={{ fontSize: 11, color: "#9ca3af", marginBottom: 12 }}>{c.ticker}</p>
                <span style={{ fontSize: 12, color: "#4f46e5", fontWeight: 600 }}>View profile →</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Trending Sectors ── */}
      <div style={{ marginTop: 56 }}>
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.2em", color: "#9ca3af", textTransform: "uppercase", marginBottom: 20 }}>
          Trending Sectors
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }} className="sector-grid">
          {TRENDING.map((s) => (
            <button
              key={s.name}
              onClick={() => onPrefillSector(s.name)}
              style={{
                textAlign: "left",
                padding: "22px 22px 20px",
                borderRadius: 20,
                background: "#fff",
                border: "1px solid rgba(0,0,0,0.06)",
                boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
                cursor: "pointer",
                transition: "transform 0.2s, box-shadow 0.2s",
                position: "relative",
                overflow: "hidden",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-3px)";
                e.currentTarget.style.boxShadow = "0 12px 32px rgba(0,0,0,0.1)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.04)";
              }}
            >
              {/* Subtle color blob in corner */}
              <div style={{
                position: "absolute",
                top: -20,
                right: -20,
                width: 80,
                height: 80,
                borderRadius: "50%",
                background: `${s.color}18`,
                pointerEvents: "none",
              }} />

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <span style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: `${s.color}15`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 18,
                  color: s.color,
                }}>✳</span>
                <span style={{
                  fontSize: 18,
                  color: s.up ? "#10b981" : "#ef4444",
                  fontWeight: 700,
                }}>
                  {s.up ? "↗" : "↘"}
                </span>
              </div>

              <p style={{ fontSize: 15, fontWeight: 700, color: "#0f0f10", marginBottom: 4 }}>{s.name}</p>
              <p style={{ fontSize: 12, color: "#9ca3af" }}>
                <span style={{ fontWeight: 700, color: s.color, fontVariantNumeric: "tabular-nums" }}>{s.count}</span> companies
              </p>
            </button>
          ))}
        </div>
      </div>

      <style>{`
        @media (max-width: 900px) {
          .hero-grid { grid-template-columns: 1fr !important; }
          .company-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .sector-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
        @media (max-width: 540px) {
          .company-grid { grid-template-columns: 1fr !important; }
          .sector-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
