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
        <SearchBar />
      </div>

      {/* How it works — the one explainer the daily view keeps */}
      <div>
        <p style={{ fontSize: 13, fontWeight: 500, color: "#86868b", marginBottom: 18 }}>
          How it works
        </p>
        <MapFlowDiagram />
      </div>

      {/* ---- Marketing / explainer sections below the search experience ---- */}
      <div className="w-full max-w-4xl mx-auto px-6 mt-16 space-y-16">

        {/* Section 1 — Problem */}
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

        {/* Section 2 — How it works */}
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

        {/* Section 3 — Three tools */}
        <section>
          <p className="text-xs uppercase tracking-widest text-neutral-400 mb-3">Three tools in one</p>
          <h2 className="text-xl font-semibold tracking-tight text-neutral-900 mb-2">
            Pick the view that fits your question.
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="bg-white border border-neutral-200 rounded-xl p-5">
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 inline-block mb-2">Company</span>
              <h3 className="text-sm font-medium text-neutral-900">Company Deep Dive</h3>
              <p className="text-xs text-neutral-500 leading-relaxed mt-1">
                Full intelligence brief on any public company — financials, leadership, strategy, risks, and recent filings.
              </p>
              <p className="text-xs text-neutral-400 mt-3">Try &quot;Apple&quot; or &quot;Merck&quot;</p>
            </div>
            <div className="bg-white border border-neutral-200 rounded-xl p-5">
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 inline-block mb-2">Sector</span>
              <h3 className="text-sm font-medium text-neutral-900">Sector Scan</h3>
              <p className="text-xs text-neutral-500 leading-relaxed mt-1">
                Map every relevant company in a field to UNC&apos;s research capacity — grants, trials, publications, and alignment scores.
              </p>
              <p className="text-xs text-neutral-400 mt-3">Try &quot;gene therapy&quot;</p>
            </div>
            <div className="bg-white border border-neutral-200 rounded-xl p-5">
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 inline-block mb-2">Accounts</span>
              <h3 className="text-sm font-medium text-neutral-900">Partner Accounts</h3>
              <p className="text-xs text-neutral-500 leading-relaxed mt-1">
                Researched profiles of current and prospective UNC partners — verified against SEC filings and official sources.
              </p>
              <p className="text-xs text-neutral-400 mt-3">Browse the database</p>
            </div>
          </div>
        </section>

        {/* Section 4 — Trust */}
        <section>
          <p className="text-xs uppercase tracking-widest text-neutral-400 mb-3">Why trust it</p>
          <h2 className="text-xl font-semibold tracking-tight text-neutral-900 mb-2">
            No model makes things up. Every number has a source.
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="bg-neutral-50 rounded-xl p-5 text-center">
              <div className="text-3xl font-semibold tracking-tight text-neutral-900">5</div>
              <div className="text-xs text-neutral-500 mt-1">primary sources checked per report</div>
            </div>
            <div className="bg-neutral-50 rounded-xl p-5 text-center">
              <div className="text-3xl font-semibold tracking-tight text-neutral-900">142</div>
              <div className="text-xs text-neutral-500 mt-1">partner profiles in the database</div>
            </div>
            <div className="bg-neutral-50 rounded-xl p-5 text-center">
              <div className="text-3xl font-semibold tracking-tight text-neutral-900">$0</div>
              <div className="text-xs text-neutral-500 mt-1">per report — free to run</div>
            </div>
          </div>
          <p className="text-sm text-neutral-500 leading-relaxed mt-5 mb-4">
            MAP doesn&apos;t use an AI language model to write the report. The narrative in a company brief is the company&apos;s own words from their SEC filings. The sector report is assembled from primary data only — if a claim can&apos;t be sourced, it isn&apos;t included.
          </p>
          <div className="flex flex-wrap gap-2">
            {["SEC EDGAR", "NIH RePORTER", "PubMed", "ClinicalTrials.gov", "OpenAlex", "Wikipedia"].map((s) => (
              <span key={s} className="text-xs text-neutral-500 border border-neutral-200 rounded-full px-3 py-1">{s}</span>
            ))}
          </div>
        </section>

        {/* Section 5 — Bottom CTA (same controlled search bar, same submit) */}
        <section className="mt-16 mb-20 text-center">
          <h2 className="text-2xl font-semibold tracking-tight text-neutral-900 mb-2">
            Ready to run your first brief?
          </h2>
          <p className="text-sm text-neutral-500 mb-6">Type a company or research area to start.</p>
          <SearchBar />
        </section>

      </div>
    </div>
  );
}
