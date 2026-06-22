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

      {/* Canvas card */}
      <div style={{
        border: "1px solid #e5e5ea",
        borderRadius: 20,
        overflow: "hidden",
        marginBottom: "auto",
        background: "#fff",
        boxShadow: "0 2px 6px rgba(0,0,0,0.05), 0 8px 24px rgba(0,0,0,0.05)",
      }}>
        <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", color: "#8e8e93", textTransform: "uppercase", padding: "14px 20px 10px", borderBottom: "1px solid #f2f2f7" }}>
          Open a canvas
        </p>
        {[
          { label: "Company Profile", sub: "Live SEC filings, charts, leadership", action: () => onOpenCompanyView() },
          { label: "Sector Scan",     sub: "Trials + grants + filings, parallel pull", action: () => onOpenSectorView() },
          { label: "Data",            sub: "Partner database, exportable", action: () => onOpenCompanyView() },
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

      {/* One-pager */}
      <div style={{ marginTop: 48, paddingTop: 40, borderTop: "1px solid #f2f2f7" }}>

        {/* Hero text */}
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", color: "#8e8e93", textTransform: "uppercase", marginBottom: 12 }}>
          About this tool
        </p>
        <h2 style={{ fontSize: "clamp(24px,3.5vw,36px)", fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1, color: "#1d1d1f", marginBottom: 12 }}>
          Partnership intelligence,<br />without the manual work.
        </h2>
        <p style={{ fontSize: 14.5, color: "#6e6e73", lineHeight: 1.65, marginBottom: 8, maxWidth: 560 }}>
          Map 3 finds the research connection between UNC and any company or industry — using only public, verified data. No subscriptions. No guesswork. Results in seconds.
        </p>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 36 }}>
          {["Free to operate", "Every fact is source-linked", "Exports to PDF, Excel, Word, PPT"].map(t => (
            <span key={t} style={{ fontSize: 12, padding: "4px 12px", borderRadius: 999, border: "1px solid #e5e5ea", color: "#6e6e73", background: "#fff" }}>{t}</span>
          ))}
        </div>

        {/* Problem grid */}
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", color: "#8e8e93", textTransform: "uppercase", marginBottom: 14 }}>
          The problem it solves
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, background: "#e5e5ea", borderRadius: 14, overflow: "hidden", marginBottom: 36 }}>
          {[
            { before: "Hours of manual research across 5+ websites", after: "A full company background in under 15 seconds" },
            { before: "AI tools that make up facts and cost money per use", after: "Every claim traced to a free, primary public source" },
            { before: "No way to know if UNC already has a relationship", after: "Verifiable UNC signals surfaced automatically" },
            { before: "BD reps walk into calls without context", after: "Ready-to-use talking points before every meeting" },
          ].map((row) => (
            <div key={row.after} style={{ background: "#fff", padding: "18px 20px" }}>
              <p style={{ fontSize: 11.5, color: "#aeaeb2", textDecoration: "line-through", lineHeight: 1.4, marginBottom: 5 }}>{row.before}</p>
              <p style={{ fontSize: 13, fontWeight: 600, color: "#1d1d1f", lineHeight: 1.4 }}>{row.after}</p>
            </div>
          ))}
        </div>

        {/* Three engines */}
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", color: "#8e8e93", textTransform: "uppercase", marginBottom: 14 }}>
          Three tools, one sign-in
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 1, background: "#e5e5ea", borderRadius: 14, overflow: "hidden", marginBottom: 36 }}>
          {[
            { icon: "🏢", bg: "#eeedfe", title: "Company profile", body: "Type any company. Get financials, strategy, leadership, and UNC partnership history — from SEC filings, not invented." },
            { icon: "📡", bg: "#e1f5ee", title: "Sector scan", body: "Type an industry — \"AI,\" \"Defense,\" \"Oncology.\" Get a ranked report of top companies mapped to UNC's research." },
            { icon: "🔗", bg: "#e6f1fb", title: "UNC signals", body: "For any company, shows co-authored papers, NIH grants, clinical trials, SEC mentions, and which UNC school is involved." },
          ].map((e) => (
            <div key={e.title} style={{ background: "#fff", padding: "20px 18px" }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: e.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, marginBottom: 12 }}>{e.icon}</div>
              <p style={{ fontSize: 13.5, fontWeight: 700, color: "#1d1d1f", marginBottom: 5, letterSpacing: "-0.1px" }}>{e.title}</p>
              <p style={{ fontSize: 12, color: "#6e6e73", lineHeight: 1.55 }}>{e.body}</p>
            </div>
          ))}
        </div>

        {/* What BD gets */}
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", color: "#8e8e93", textTransform: "uppercase", marginBottom: 14 }}>
          What BD gets from each search
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, background: "#e5e5ea", borderRadius: 14, overflow: "hidden", marginBottom: 36 }}>
          {[
            {
              head: "Company search",
              items: [
                ["Strategy", "what they're building, in their own SEC filing words"],
                ["Financial scale", "revenue, R&D spend, employees"],
                ["UNC relationship depth", "Active, Exploratory, or None confirmed"],
                ["Leadership + UNC alumni", "named executives and their credentials"],
                ["Next step", "the clearest partnership pathway for this company"],
              ],
            },
            {
              head: "Sector scan",
              items: [
                ["Market landscape", "definition, NC context, why this sector now"],
                ["UNC faculty map", "researchers already working in this space"],
                ["Top companies ranked", "up to 22, scored by UNC research overlap"],
                ["Risk flags", "companies requiring OSP review before outreach"],
                ["Talking points", "what UNC knows, what the company is doing, the hook"],
              ],
            },
          ].map((col) => (
            <div key={col.head} style={{ background: "#fff", padding: "18px 20px" }}>
              <p style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "#aeaeb2", marginBottom: 12 }}>{col.head}</p>
              {col.items.map(([label, desc], i) => (
                <div key={label} style={{ display: "flex", gap: 9, marginBottom: i < col.items.length - 1 ? 8 : 0, alignItems: "flex-start" }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: "#8e8e93", background: "#f2f2f7", borderRadius: 4, padding: "2px 5px", flexShrink: 0, marginTop: 2, minWidth: 20, textAlign: "center" }}>{i + 1}</span>
                  <p style={{ fontSize: 12.5, color: "#6e6e73", lineHeight: 1.5 }}><span style={{ fontWeight: 600, color: "#1d1d1f" }}>{label}</span> — {desc}</p>
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Data sources */}
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", color: "#8e8e93", textTransform: "uppercase", marginBottom: 14 }}>
          Where the data comes from
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 1, background: "#e5e5ea", borderRadius: 14, overflow: "hidden", marginBottom: 36 }}>
          {[
            { name: "SEC EDGAR", desc: "Financials and strategy — in the company's own filing words" },
            { name: "PubMed", desc: "UNC co-authored research and disclosed financial ties" },
            { name: "NIH RePORTER", desc: "Federal grants — names the UNC PI and department" },
            { name: "ClinicalTrials.gov", desc: "Active trials — flags when UNC is a listed site" },
            { name: "USPTO / PatentsView", desc: "Patent activity and potential UNC co-inventors" },
            { name: "OpenAlex", desc: "Research context for private companies without SEC filings" },
          ].map((s) => (
            <div key={s.name} style={{ background: "#fff", padding: "16px 18px" }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: "#1d1d1f", marginBottom: 4, letterSpacing: "-0.1px" }}>{s.name}</p>
              <p style={{ fontSize: 11.5, color: "#6e6e73", lineHeight: 1.45 }}>{s.desc}</p>
            </div>
          ))}
        </div>

        {/* Limitations */}
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", color: "#8e8e93", textTransform: "uppercase", marginBottom: 14 }}>
          Honest limitations
        </p>
        <div style={{ marginBottom: 36 }}>
          {[
            { title: "Private companies show less", body: "OpenAI, SAS, Databricks, and Epic Games don't file with the SEC, so financials and leadership aren't available. UNC research signals still appear when they exist in public databases." },
            { title: "\"None confirmed\" doesn't mean no relationship", body: "IT contracts, campus deployments, and hiring don't appear in research databases. Always check the SharePoint partnership profile for the full picture." },
            { title: "Reports are starting points, not final answers", body: "Map removes the data-gathering gruntwork. It doesn't replace analyst judgment. Review every report before outreach — especially the OSP risk flags it surfaces automatically." },
            { title: "Contacts are not included", body: "Map produces the background. BD sources the specific person. LinkedIn links in reports are search URLs, not direct profiles." },
          ].map((l, i, arr) => (
            <div key={l.title} style={{ display: "flex", gap: 14, padding: "16px 0", borderBottom: i < arr.length - 1 ? "1px solid #f2f2f7" : "none", alignItems: "flex-start" }}>
              <div style={{ width: 28, height: 28, borderRadius: 7, background: "#faeeda", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1, fontSize: 14 }}>⚠</div>
              <div>
                <p style={{ fontSize: 13.5, fontWeight: 700, color: "#1d1d1f", marginBottom: 4, letterSpacing: "-0.1px" }}>{l.title}</p>
                <p style={{ fontSize: 12, color: "#6e6e73", lineHeight: 1.55 }}>{l.body}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Maintenance */}
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", color: "#8e8e93", textTransform: "uppercase", marginBottom: 14 }}>
          Keeping it running
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, background: "#e5e5ea", borderRadius: 14, overflow: "hidden", marginBottom: 36 }}>
          {[
            { task: "Adding a company", desc: "Add one entry to a data file and redeploy — like adding a row to a spreadsheet.", tag: "~5 min per company", tagBg: "#e1f5ee", tagColor: "#085041" },
            { task: "Adding a sector", desc: "Add the company list for that sector to one file. Sectors not listed still work automatically via live discovery.", tag: "~15 min per sector", tagBg: "#e1f5ee", tagColor: "#085041" },
            { task: "Updating a company report", desc: "Seven marquee companies use hand-written files — edit and redeploy. All others update live from public data automatically.", tag: "~30 min per update", tagBg: "#e1f5ee", tagColor: "#085041" },
            { task: "Operating cost", desc: "$0. No subscriptions, no API keys, no per-search fees. Both services run on free hosting tiers — by design, permanently.", tag: "Free, permanently", tagBg: "#eeedfe", tagColor: "#3c3489" },
          ].map((m) => (
            <div key={m.task} style={{ background: "#fff", padding: "18px 20px" }}>
              <p style={{ fontSize: 13.5, fontWeight: 700, color: "#1d1d1f", marginBottom: 5, letterSpacing: "-0.1px" }}>{m.task}</p>
              <p style={{ fontSize: 12, color: "#6e6e73", lineHeight: 1.5, marginBottom: 8 }}>{m.desc}</p>
              <span style={{ fontSize: 11, borderRadius: 99, padding: "3px 10px", background: m.tagBg, color: m.tagColor }}>{m.tag}</span>
            </div>
          ))}
        </div>

        {/* Bottom link */}
        <div style={{ textAlign: "center", padding: "8px 0 4px" }}>
          <a href="https://map-omega-azure.vercel.app" target="_blank" rel="noreferrer" style={{ fontSize: 13, color: "#007aff", textDecoration: "none", fontWeight: 600 }}>
            map-omega-azure.vercel.app →
          </a>
          <p style={{ fontSize: 11, color: "#aeaeb2", marginTop: 6 }}>Aidan Colvin · UNC Innovate Carolina · 2026</p>
        </div>

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
