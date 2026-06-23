"use client";

import { useState, useRef } from "react";
import { getCompanySuggestion } from "./companySuggestions";

function MapFlowDiagram() {
  const sources = ["SEC EDGAR", "ClinicalTrials.gov", "NIH RePORTER", "PubMed", "UNC website"];

  // Layout constants
  const BW = 210, BH = 48, BR = 10;
  const startY = 52, gapY = 63;
  // Source box centers: 76, 139, 202, 265, 328
  const sourceCY = sources.map((_, i) => startY + BH / 2 + i * gapY);
  const mapCY = (sourceCY[0] + sourceCY[sourceCY.length - 1]) / 2; // 202

  const srcX = 10;
  const mapX = 360, mapY = mapCY - 56, mapW = 195, mapH = 112;
  const outX = 632, outY = mapCY - 47, outW = 200, outH = 90;

  return (
    <svg
      width="100%"
      viewBox="0 0 860 400"
      role="img"
      fontFamily="-apple-system, 'SF Pro Text', system-ui, sans-serif"
    >
      <title>How MAP works</title>
      <desc>Five public sources feed MAP. MAP reads, matches, and drafts. You receive a sourced, ranked, and cited report.</desc>

      <defs>
        <marker id="mfd-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M2 1L8 5L2 9" fill="none" stroke="#86868b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </marker>
      </defs>

      {/* PUBLIC SOURCES label */}
      <text
        x={srcX + BW / 2} y={26} textAnchor="middle"
        fontSize="11" fontWeight="600" letterSpacing="0.1em" fill="#a1a1a6"
        className="dark:fill-[#636366]"
      >PUBLIC SOURCES</text>

      {/* Source boxes */}
      {sources.map((name, i) => (
        <g key={name}>
          <rect
            x={srcX} y={sourceCY[i] - BH / 2} width={BW} height={BH} rx={BR}
            fill="#f5f5f7" stroke="#d2d2d7" strokeWidth={0.75}
            className="dark:fill-[#1c1c1e] dark:stroke-[#3a3a3c]"
          />
          <text
            x={srcX + BW / 2} y={sourceCY[i]} textAnchor="middle" dominantBaseline="central"
            fontSize="15" fill="#1d1d1f"
            className="dark:fill-[#f5f5f7]"
          >{name}</text>
        </g>
      ))}

      {/* Convergence curves from each source to MAP left edge */}
      {sourceCY.map((cy) => (
        <path
          key={cy}
          d={`M${srcX + BW},${cy} C${mapX - 80},${cy} ${mapX - 80},${mapCY} ${mapX},${mapCY}`}
          fill="none" stroke="#d2d2d7" strokeWidth={1}
          className="dark:stroke-[#3a3a3c]"
        />
      ))}

      {/* MAP center box */}
      <rect
        x={mapX} y={mapY} width={mapW} height={mapH} rx={14}
        fill="#e8f1fd" stroke="#0071e3" strokeWidth={1}
        className="dark:fill-[#0a2540] dark:stroke-[#0071e3]"
      />
      <text
        x={mapX + mapW / 2} y={mapCY - 16} textAnchor="middle" dominantBaseline="central"
        fontSize="24" fontWeight="700" fill="#0071e3"
      >MAP</text>
      <text
        x={mapX + mapW / 2} y={mapCY + 16} textAnchor="middle" dominantBaseline="central"
        fontSize="13" fill="#3a6ea8"
        className="dark:fill-[#6ba3d6]"
      >reads · matches · drafts</text>

      {/* Arrow MAP → output */}
      <line
        x1={mapX + mapW} y1={mapCY} x2={outX - 4} y2={mapCY}
        stroke="#86868b" strokeWidth={1} markerEnd="url(#mfd-arrow)"
        className="dark:stroke-[#636366]"
      />

      {/* WHAT YOU GET label */}
      <text
        x={outX + outW / 2} y={outY - 18} textAnchor="middle"
        fontSize="11" fontWeight="600" letterSpacing="0.1em" fill="#a1a1a6"
        className="dark:fill-[#636366]"
      >WHAT YOU GET</text>

      {/* Output box */}
      <rect
        x={outX} y={outY} width={outW} height={outH} rx={BR}
        fill="#f5f5f7" stroke="#d2d2d7" strokeWidth={0.75}
        className="dark:fill-[#1c1c1e] dark:stroke-[#3a3a3c]"
      />
      <text
        x={outX + outW / 2} y={mapCY - 12} textAnchor="middle" dominantBaseline="central"
        fontSize="17" fontWeight="600" fill="#1d1d1f"
        className="dark:fill-[#f5f5f7]"
      >Sourced report</text>
      <text
        x={outX + outW / 2} y={mapCY + 14} textAnchor="middle" dominantBaseline="central"
        fontSize="13" fill="#6e6e73"
        className="dark:fill-[#a1a1a6]"
      >ranked and cited</text>

      {/* Export formats */}
      <text
        x={outX + outW / 2} y={outY + outH + 22} textAnchor="middle"
        fontSize="12" fill="#a1a1a6"
        className="dark:fill-[#636366]"
      >Word · Excel · PowerPoint · PDF</text>
    </svg>
  );
}

export default function DashboardHome({
  onRunProject,
  onOpenCompanyView,
  onOpenSectorView,
  onPrefillSector,
}: {
  onRunProject:      (name: string) => void;
  onOpenCompanyView: () => void;
  onOpenSectorView:  () => void;
  onPrefillSector:   (name: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const suggestion = query.trim() ? getCompanySuggestion(query) : null;
  const ghost = suggestion && suggestion.toLowerCase().startsWith(query.toLowerCase())
    ? suggestion.slice(query.length)
    : null;

  function acceptSuggestion() {
    if (suggestion) setQuery(suggestion);
  }

  function submit() {
    const q = query.trim();
    if (!q) return;
    onRunProject(q);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if ((e.key === "Tab" || e.key === "ArrowRight") && ghost) {
      e.preventDefault();
      acceptSuggestion();
    } else if (e.key === "Enter") {
      if (ghost) acceptSuggestion();
      submit();
    }
  }

  return (
    <div className="dash-home" style={{
      maxWidth: 720,
      margin: "0 auto",
      padding: "48px 32px 64px",
      minHeight: "calc(100dvh - 54px)",
      display: "flex",
      flexDirection: "column",
      background: "#ffffff",
    }}>

      {/* Hero headline */}
      <h1 style={{ fontSize: "clamp(32px,4.5vw,52px)", fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.08, marginBottom: 20 }}>
        <span style={{ color: "#1d1d1f" }}>Map the company, generate the report, </span>
        <span style={{
          background: "linear-gradient(135deg, #0a84ff 0%, #5e5ce6 100%)",
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          color: "transparent",
        }}>assembled from primary sources.</span>
      </h1>

      {/* Search */}
      <div style={{ marginBottom: 56 }}>
        <div style={{
          display: "inline-flex", padding: "6px 18px", marginBottom: 12,
          background: "#fff", borderRadius: 999,
          boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
        }}>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: "#1d1d1f" }}>
            Project
          </span>
        </div>

        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          background: "#fff", borderRadius: 14,
          border: `1.5px solid ${focused ? "#007aff" : "#e5e5ea"}`,
          boxShadow: focused ? "0 0 0 4px rgba(0,122,255,0.1)" : "none",
          padding: "4px 4px 4px 16px", transition: "all 0.15s",
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
            <circle cx="11" cy="11" r="7" stroke="#86868b" strokeWidth="2" />
            <line x1="16.5" y1="16.5" x2="21" y2="21" stroke="#86868b" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <div style={{ flex: 1, position: "relative" }}>
            {ghost && (
              <div
                aria-hidden="true"
                style={{
                  position: "absolute", inset: 0,
                  display: "flex", alignItems: "center",
                  fontSize: 16, fontFamily: "inherit",
                  whiteSpace: "pre", pointerEvents: "none", overflow: "hidden",
                  padding: "10px 0",
                }}
              >
                <span style={{ color: "transparent" }}>{query}</span>
                <span style={{ color: "#b0b0b8" }}>{ghost}</span>
              </div>
            )}
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder="Start a project, e.g. Pfizer or oncology"
              autoComplete="off"
              spellCheck={false}
              style={{
                width: "100%", border: "none", outline: "none",
                background: "transparent", position: "relative",
                fontSize: 16, color: "#1d1d1f", padding: "10px 0",
              }}
            />
          </div>
          <button onClick={submit} disabled={!query.trim()} style={{
            padding: "10px 22px", fontSize: 14.5, fontWeight: 600,
            border: "none", borderRadius: 11, cursor: query.trim() ? "pointer" : "default",
            background: query.trim() ? "#007aff" : "#e5e5ea",
            color: query.trim() ? "#fff" : "#a0a0a5",
            transition: "background 0.15s", flexShrink: 0,
          }}>
            Search
          </button>
        </div>
      </div>

      {/* Platform positioning */}
      <div style={{ marginBottom: 48 }}>

        {/* Problem space */}
        <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.12em", color: "#c7c7cc", textTransform: "uppercase", marginBottom: 12 }}>
          The Problem It Solves
        </p>
        <p style={{ fontSize: 15, fontWeight: 400, color: "#3a3a3c", lineHeight: 1.75, marginBottom: 20 }}>
          Interns spend hours reading and researching before they can write one report on a sector, a company, or a UNC partnership. They check SEC EDGAR, ClinicalTrials.gov, NIH grants, PubMed, and the UNC website one source at a time. That time is expensive. So are the AI tokens when a model reads and writes it all. MAP cuts both. It reads the sources and builds the draft.
        </p>

        {/* Source traceability */}
        <p style={{ fontSize: 13, fontWeight: 400, color: "#86868b", lineHeight: 1.65 }}>
          No LLM in the request path. No API keys. Every number, sentence, and citation traces to a free, keyless public data source: SEC EDGAR, ClinicalTrials.gov, PubMed, NIH RePORTER.
        </p>
      </div>

      {/* How MAP works — flow diagram */}
      <div style={{ marginBottom: 56 }}>
        <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.12em", color: "#c7c7cc", textTransform: "uppercase", marginBottom: 20 }}>
          How MAP Works
        </p>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <MapFlowDiagram />
        </div>
      </div>

      {/* Cost breakdown */}
      <div style={{ marginBottom: 48 }}>
        <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.12em", color: "#c7c7cc", textTransform: "uppercase", marginBottom: 28 }}>
          Where the Cost Goes Today
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 48px" }}>
          <div>
            <p style={{ fontSize: 13, fontWeight: 600, color: "#1d1d1f", letterSpacing: "0.01em", marginBottom: 8 }}>
              Time
            </p>
            <p style={{ fontSize: 14, fontWeight: 300, color: "#6e6e73", lineHeight: 1.7, margin: 0 }}>
              Hours per report spent reading filings, trials, grants, and papers by hand. Slow and hard to repeat.
            </p>
          </div>

          <div>
            <p style={{ fontSize: 13, fontWeight: 600, color: "#1d1d1f", letterSpacing: "0.01em", marginBottom: 8 }}>
              AI tokens
            </p>
            <p style={{ fontSize: 14, fontWeight: 300, color: "#6e6e73", lineHeight: 1.7, margin: 0 }}>
              Every page fed to a model to read or write costs money. It adds up fast across many companies.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
