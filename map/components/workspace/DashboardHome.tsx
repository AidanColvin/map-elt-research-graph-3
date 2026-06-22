"use client";

import { useState, useRef } from "react";
import { OrbitNetwork } from "@/components/Chart3D";
import { getCompanySuggestion } from "./companySuggestions";
import MapOnePager from "./MapOnePager";

const ORBIT_POINTS = [
  { label: "Merck",       size: 0.8,  highlight: true  },
  { label: "Pfizer",      size: 0.8,  highlight: true  },
  { label: "Amgen",       size: 0.7,  highlight: true  },
  { label: "Regeneron",   size: 0.7,  highlight: true  },
  { label: "BMS",         size: 0.55, highlight: false },
  { label: "AstraZeneca", size: 0.55, highlight: false },
  { label: "Novartis",    size: 0.55, highlight: false },
  { label: "Roche",       size: 0.55, highlight: false },
  { label: "J&J",         size: 0.5,  highlight: false },
  { label: "AbbVie",      size: 0.5,  highlight: false },
  { label: "Gilead",      size: 0.5,  highlight: false },
  { label: "Sanofi",      size: 0.5,  highlight: false },
];

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
      padding: "48px 32px 32px",
      minHeight: "calc(100dvh - 54px)",
      display: "flex",
      flexDirection: "column",
      background: "#ffffff",
    }}>
      {/* Headline */}
      <h1 style={{ fontSize: "clamp(32px,4.5vw,52px)", fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.08, marginBottom: 20 }}>
        <span style={{ color: "#1d1d1f" }}>Board-ready intelligence, </span>
        <span style={{
          background: "linear-gradient(135deg, #0a84ff 0%, #5e5ce6 100%)",
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          color: "transparent",
        }}>assembled from primary sources.</span>
      </h1>

      {/* Body */}
      <p style={{ fontSize: 16, color: "#6e6e73", lineHeight: 1.65, marginBottom: 28 }}>
        No LLM in the request path. No API keys. Every number, sentence, and citation traces to a free, keyless public data source: SEC EDGAR, ClinicalTrials.gov, PubMed, NIH RePORTER.
      </p>

      {/* Search */}
      <div style={{ marginBottom: 16 }}>
        {/* Project label — a search here sets up and runs a new project */}
        <div style={{
          display: "inline-flex", padding: "6px 18px", marginBottom: 12,
          background: "#fff", borderRadius: 999,
          boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
        }}>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: "#1d1d1f" }}>
            Project
          </span>
        </div>

        {/* Search input */}
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
          {/* Ghost-text wrapper */}
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

      {/* 3D orbit */}
      <div style={{ marginBottom: 32, borderRadius: 20, overflow: "hidden", background: "#f9f9fb", border: "1px solid #e5e5ea", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.6), 0 2px 6px rgba(0,0,0,0.05), 0 8px 24px rgba(0,0,0,0.05)" }}>
        <OrbitNetwork
          points={ORBIT_POINTS}
          centerLabel="map"
          height={320}
          baseColor="#007aff"
        />
      </div>

      {/* Footer */}
      <div style={{ marginTop: 32, paddingTop: 20, borderTop: "1px solid #f2f2f7" }}>
        <p style={{ fontSize: 11.5, color: "#8e8e93", marginBottom: 8 }}>
          Independent project. Not affiliated with UNC Chapel Hill. For information only, not investment advice.
        </p>
        <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.12em", color: "#c7c7cc", textTransform: "uppercase" }}>
          Free · Keyless · Primary-Source
        </p>
      </div>

      {/* How MAP works — visual one-pager (distinct section, full-width parent) */}
      <div style={{ marginTop: 32, paddingTop: 20, borderTop: "1px solid #f2f2f7" }}>
        <MapOnePager />
      </div>
    </div>
  );
}
