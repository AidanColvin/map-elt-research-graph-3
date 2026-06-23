"use client";

import { useState, useRef } from "react";
import { getCompanySuggestion } from "./companySuggestions";

function MapFlowDiagram() {
  // Four-stage process rail: input → read → draft → deliver. The third step is
  // the MAP engine (accent). Source + output detail live in the footnotes so the
  // cards stay clean and scannable. Light-mode inline to match the white canvas.
  const steps = [
    { n: 1, title: "You type",   sub: "a company or sector" },
    { n: 2, title: "MAP reads",  sub: "5 public sources" },
    { n: 3, title: "MAP drafts", sub: "matched · ranked · cited", accent: true },
    { n: 4, title: "You get",    sub: "a sourced report" },
  ];

  const CW = 192, CH = 104, GAP = 32, X0 = 8, CY_TOP = 44;
  const cy = CY_TOP + CH / 2;             // vertical center of the cards
  const x = (i: number) => X0 + i * (CW + GAP);

  return (
    <svg
      width="100%"
      viewBox="0 0 880 220"
      role="img"
      fontFamily="-apple-system, 'SF Pro Text', system-ui, sans-serif"
    >
      <title>How MAP works</title>
      <desc>Four steps: you type a company or sector, MAP reads five public sources, MAP matches and drafts a ranked, cited report, and you get a sourced report you can export.</desc>

      <defs>
        <marker id="mfd-arrow" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="7" markerHeight="7" orient="auto">
          <path d="M2 1L8 5L2 9" fill="none" stroke="#c7c7cc" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </marker>
      </defs>

      {/* Connector arrows in the gaps between cards */}
      {steps.slice(0, -1).map((_, i) => (
        <line
          key={i}
          x1={x(i) + CW + 6} y1={cy} x2={x(i + 1) - 8} y2={cy}
          stroke="#d2d2d7" strokeWidth={1.5} markerEnd="url(#mfd-arrow)"
        />
      ))}

      {/* Step cards */}
      {steps.map((s) => {
        const cx = x(s.n - 1);
        const mid = cx + CW / 2;
        return (
          <g key={s.n}>
            <rect
              x={cx} y={CY_TOP} width={CW} height={CH} rx={16}
              fill={s.accent ? "#e8f1fd" : "#f7f7f9"}
              stroke={s.accent ? "#0071e3" : "#e5e5ea"}
              strokeWidth={s.accent ? 1.25 : 1}
            />
            {/* Numbered badge straddling the top edge */}
            <circle cx={mid} cy={CY_TOP} r={15} fill={s.accent ? "#0071e3" : "#1d1d1f"} />
            <text
              x={mid} y={CY_TOP + 1} textAnchor="middle" dominantBaseline="central"
              fontSize="14" fontWeight="700" fill="#ffffff"
            >{s.n}</text>
            {/* Title + subtitle */}
            <text
              x={mid} y={cy + 2} textAnchor="middle" dominantBaseline="central"
              fontSize="17" fontWeight="600" fill={s.accent ? "#0071e3" : "#1d1d1f"}
            >{s.title}</text>
            <text
              x={mid} y={cy + 24} textAnchor="middle" dominantBaseline="central"
              fontSize="12.5" fill="#6e6e73"
            >{s.sub}</text>
          </g>
        );
      })}

      {/* Detail footnotes */}
      <text x={440} y={186} textAnchor="middle" fontSize="12" fill="#86868b">
        <tspan fontWeight="500" fill="#a1a1a6">Sources  </tspan>
        SEC EDGAR · ClinicalTrials.gov · NIH RePORTER · PubMed · UNC
      </text>
      <text x={440} y={206} textAnchor="middle" fontSize="12" fill="#86868b">
        <tspan fontWeight="500" fill="#a1a1a6">Export  </tspan>
        Word · Excel · PowerPoint · PDF
      </text>
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

      {/* Hero — one idea, flat color */}
      <h1 style={{ fontSize: "clamp(34px,4.8vw,54px)", fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1.06, color: "#1d1d1f", marginBottom: 16 }}>
        Research, written for you.
      </h1>
      <p style={{ fontSize: 18, fontWeight: 400, color: "#6e6e73", lineHeight: 1.55, marginBottom: 32, maxWidth: 540 }}>
        Type a company or sector. MAP reads the public sources and drafts a sourced brief — every figure traceable, no model in the request path.
      </p>

      {/* Search */}
      <div style={{ marginBottom: 64 }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          background: "#fff", borderRadius: 14,
          border: `1.5px solid ${focused ? "#0071e3" : "#e5e5ea"}`,
          boxShadow: focused ? "0 0 0 4px rgba(0,113,227,0.1)" : "none",
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
            padding: "10px 22px", fontSize: 14.5, fontWeight: 500,
            border: "none", borderRadius: 11, cursor: query.trim() ? "pointer" : "default",
            background: query.trim() ? "#0071e3" : "#e5e5ea",
            color: query.trim() ? "#fff" : "#a0a0a5",
            transition: "background 0.15s", flexShrink: 0,
          }}>
            Search
          </button>
        </div>
      </div>

      {/* How it works — the one explainer the daily view keeps */}
      <div>
        <p style={{ fontSize: 13, fontWeight: 500, color: "#86868b", marginBottom: 18 }}>
          How it works
        </p>
        <MapFlowDiagram />
      </div>
    </div>
  );
}
