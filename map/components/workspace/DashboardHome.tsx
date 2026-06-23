"use client";

import { useState, useRef, useEffect } from "react";
import { getCompanySuggestion } from "./companySuggestions";

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

  // Autofocus the search bar when the home page mounts so the user can start
  // typing immediately — no click required. (Mobile keyboards stay closed until
  // tap, so this is a no-op there.)
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

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

  // takes: nothing (closure over query/ghost/refs/handlers above)
  // does: renders the existing controlled search bar — extracted so the hero and
  //       the bottom CTA render the IDENTICAL bar bound to the same query state
  //       and submit() handler (no duplicated state, no second handler)
  // returns: the search bar element
  function SearchBar() {
    return (
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
    );
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
        Curious about a company, sector, or partnership with UNC? MAP is a tool that reads the research and generates a report.
      </p>

      {/* Search */}
      <div style={{ marginBottom: 64 }}>
        {/* Called as a function, NOT <SearchBar />, so it does not become a
            separate component instance that React would remount on every
            keystroke — that remount was stealing focus after each letter. */}
        {SearchBar()}
      </div>

      {/* The problem */}
      <section>
        <p className="text-xs uppercase tracking-widest text-neutral-400 mb-3">The problem</p>
        <h2 className="text-xl font-semibold tracking-tight text-neutral-900 mb-2">
          Partnership research takes days. MAP takes 60 seconds.
        </h2>
        <p className="text-sm text-neutral-500 leading-relaxed mb-5">
          Before any outreach, someone has to read the filings, check the trials, pull the grants, and find the researchers. That&apos;s hours of work per company — and it still might miss something.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="bg-white border border-neutral-200 rounded-xl p-5">
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1d1d1f" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="mb-3">
              <circle cx="12" cy="12" r="9" />
              <polyline points="12 7 12 12 15 14" />
            </svg>
            <h3 className="text-sm font-medium text-neutral-900">Hours per company</h3>
            <p className="text-xs text-neutral-500 leading-relaxed mt-1">
              Manual research across SEC, PubMed, NIH, and ClinicalTrials takes a full day per target.
            </p>
          </div>
          <div className="bg-white border border-neutral-200 rounded-xl p-5">
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1d1d1f" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="mb-3">
              <path d="m18.84 12.25 1.72-1.71a5.004 5.004 0 0 0-.12-7.07 5.006 5.006 0 0 0-6.95 0l-1.72 1.71" />
              <path d="m5.17 11.75-1.71 1.71a5.004 5.004 0 0 0 .12 7.07 5.006 5.006 0 0 0 6.95 0l1.71-1.71" />
              <line x1="8" y1="2" x2="8" y2="5" />
              <line x1="2" y1="8" x2="5" y2="8" />
              <line x1="16" y1="19" x2="16" y2="22" />
              <line x1="19" y1="16" x2="22" y2="16" />
            </svg>
            <h3 className="text-sm font-medium text-neutral-900">Sources are scattered</h3>
            <p className="text-xs text-neutral-500 leading-relaxed mt-1">
              Every data point lives in a different database, in a different format, with no single view.
            </p>
          </div>
          <div className="bg-white border border-neutral-200 rounded-xl p-5">
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1d1d1f" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="mb-3">
              <circle cx="12" cy="12" r="9" />
              <line x1="12" y1="8" x2="12" y2="13" />
              <line x1="12" y1="16.5" x2="12.01" y2="16.5" />
            </svg>
            <h3 className="text-sm font-medium text-neutral-900">Numbers go stale</h3>
            <p className="text-xs text-neutral-500 leading-relaxed mt-1">
              Revenue, trial status, and leadership change constantly. Saved decks go out of date.
            </p>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="mt-12">
        <p className="text-xs uppercase tracking-widest text-neutral-400 mb-3">How it works</p>
        <h2 className="text-xl font-semibold tracking-tight text-neutral-900 mb-2">
          Four steps. No guesswork.
        </h2>
        <div className="divide-y divide-neutral-100">
          <div className="flex items-start gap-4 py-5">
            <div className="w-7 h-7 rounded-full bg-neutral-900 text-white text-xs font-semibold flex items-center justify-center flex-shrink-0 mt-0.5">1</div>
            <div>
              <h3 className="text-sm font-medium text-neutral-900">You type a name or topic</h3>
              <p className="text-xs text-neutral-500 leading-relaxed mt-1">
                Enter a company (like &quot;Pfizer&quot;), a sector (like &quot;oncology&quot;), or a research area. No account needed to try it.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-4 py-5">
            <div className="w-7 h-7 rounded-full bg-neutral-900 text-white text-xs font-semibold flex items-center justify-center flex-shrink-0 mt-0.5">2</div>
            <div>
              <h3 className="text-sm font-medium text-neutral-900">MAP reads the public record</h3>
              <p className="text-xs text-neutral-500 leading-relaxed mt-1">
                In parallel, MAP checks SEC EDGAR for financials and filings, NIH RePORTER for active grants, PubMed for UNC co-authored research, and ClinicalTrials.gov for active trials.
              </p>
              <p className="text-xs text-neutral-400 mt-1">
                No AI generating text. Every sentence traces to a primary source.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-4 py-5">
            <div className="w-7 h-7 rounded-full bg-neutral-900 text-white text-xs font-semibold flex items-center justify-center flex-shrink-0 mt-0.5">3</div>
            <div>
              <h3 className="text-sm font-medium text-neutral-900">A sourced brief assembles</h3>
              <p className="text-xs text-neutral-500 leading-relaxed mt-1">
                MAP drafts a structured report — company overview, financials, research alignment, partnership signals, and citations. You watch it build in real time.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-4 py-5">
            <div className="w-7 h-7 rounded-full bg-neutral-900 text-white text-xs font-semibold flex items-center justify-center flex-shrink-0 mt-0.5">4</div>
            <div>
              <h3 className="text-sm font-medium text-neutral-900">You get a brief you can use</h3>
              <p className="text-xs text-neutral-500 leading-relaxed mt-1">
                Download as PDF, Word, Excel, or Markdown. Take it into the meeting, share it with leadership, or use it to draft outreach.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
