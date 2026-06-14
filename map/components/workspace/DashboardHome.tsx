"use client";

import { useState } from "react";
import { OrbitNetwork } from "@/components/Chart3D";
import CompanyLogo from "@/app/components/CompanyLogo";
import { SECTORS, getSectorSuggestion } from "./sectors";

// Curated deep-dive companies shown on the launchpad — instant, recognizable
// entry points. Domains feed the existing CompanyLogo fallback chain.
const DEEP_DIVES = [
  { name: "Apple", ticker: "AAPL", domain: "apple.com", accent: "#1d1d1f" },
  { name: "NVIDIA", ticker: "NVDA", domain: "nvidia.com", accent: "#76b900" },
  { name: "Microsoft", ticker: "MSFT", domain: "microsoft.com", accent: "#0078d4" },
  { name: "Alphabet", ticker: "GOOGL", domain: "google.com", accent: "#4285f4" },
  { name: "Anthropic", ticker: "Private", domain: "anthropic.com", accent: "#cc785c" },
];

const TRENDING = [
  { name: "Clean Energy", count: 31, up: true },
  { name: "Biotech", count: 44, up: true },
  { name: "Quantum", count: 12, up: false },
  { name: "Gene Therapy", count: 19, up: true },
];

// Illustrative preview points for the live-scan orbit card.
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

// takes: the raw search text
// does: decides whether the query names a sector (curated list match) or a
//       company — the same split the focused views use
// returns: "sector" | "company"
function classifyQuery(q: string): "sector" | "company" {
  const v = q.trim().toLowerCase();
  if (SECTORS.some((s) => s.toLowerCase() === v)) return "sector";
  return "company";
}

// takes: onRunCompany(name), onRunSector(name), onOpenCompanyView() for the
//        "View all" link, and onPrefillSector(name) for trending-sector cards
// does: renders the designed dashboard — split hero (pitch + live sector-scan
//       preview card), curated deep dives, and trending sectors
// returns: the dashboard overview element
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

  // takes: a form submit event
  // does: routes the query — known sectors go to Sector Scan, everything
  //       else is treated as a company deep dive (completing a partial
  //       sector name first, e.g. "onco" → "Oncology")
  // returns: nothing
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
    <div className="max-w-6xl mx-auto px-6 pb-8">
      {/* ── Split hero ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center mt-6">
        {/* Left: pitch + combined search */}
        <div>
          <p className="text-[11px] font-semibold tracking-[0.22em] text-gray-500 uppercase mb-4">
            UNC Research × Industry
          </p>
          <h1 className="text-[44px] leading-[1.08] font-semibold tracking-tight text-gray-900 mb-4">
            Map the{" "}
            <em
              className="not-italic"
              style={{
                fontStyle: "italic",
                background: "linear-gradient(90deg,#4f46e5,#7c3aed)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              partnership
            </em>{" "}
            landscape.
          </h1>
          <p className="text-[15px] text-gray-500 leading-relaxed mb-6 max-w-md">
            Deep-dive any public company or scan an entire sector against UNC
            research — sourced, scored, in about a minute.
          </p>

          <form
            onSubmit={submit}
            className="flex items-center gap-2 p-2 bg-white/80 backdrop-blur-md border border-black/[0.06] rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.05)] max-w-md"
          >
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Company, ticker, or sector..."
              aria-label="Company, ticker, or sector"
              autoComplete="off"
              spellCheck={false}
              className="flex-1 bg-transparent border-0 text-[15px] text-gray-900 placeholder:text-gray-400 outline-none px-3 py-2"
            />
            <button
              type="submit"
              className="rounded-xl bg-gray-900 hover:bg-black text-white text-sm font-medium px-5 py-2.5 transition-colors whitespace-nowrap"
            >
              Map it
            </button>
          </form>

          <div className="flex items-center gap-2 mt-4">
            <span className="text-xs text-gray-400 mr-1">Try:</span>
            {["Apple", "Oncology", "Semiconductors"].map((chip) => (
              <button
                key={chip}
                onClick={() => setQuery(chip)}
                className="text-xs text-gray-600 bg-white/70 border border-black/[0.06] rounded-full px-3 py-1.5 hover:bg-white hover:shadow-sm transition-all cursor-pointer"
              >
                {chip}
              </button>
            ))}
          </div>
        </div>

        {/* Right: live sector-scan preview card */}
        <div className="rounded-3xl bg-white/75 backdrop-blur-md border border-black/[0.06] shadow-[0_12px_40px_rgb(0,0,0,0.06)] p-6">
          <div className="flex items-center justify-between mb-1">
            <p className="flex items-center gap-2 text-[10.5px] font-semibold tracking-[0.18em] text-gray-500 uppercase">
              <span
                className="inline-block w-2 h-2 rounded-full bg-emerald-500"
                style={{ animation: "pulse 1.6s ease-in-out infinite" }}
                aria-hidden
              />
              Sector Scan · Live
            </p>
            <span className="text-xs text-gray-400 tabular-nums">14 of 18</span>
          </div>
          <h2 className="text-2xl font-semibold text-gray-900">Oncology</h2>
          <p className="text-[13px] text-gray-500 mb-2">
            Public companies × UNC research overlap
          </p>

          <OrbitNetwork points={SCAN_POINTS} centerLabel="UNC" height={420} />

          <div className="grid grid-cols-3 gap-3 mt-3">
            {[
              { n: "18", label: "Companies" },
              { n: "64", label: "Claims" },
              { n: "7", label: "UNC Ties" },
            ].map((s) => (
              <div
                key={s.label}
                className="rounded-2xl bg-gray-50/80 border border-black/[0.04] px-3 py-3 text-center"
              >
                <p className="text-lg font-semibold text-gray-900 tabular-nums">{s.n}</p>
                <p className="text-[10px] font-medium tracking-[0.14em] text-gray-400 uppercase">
                  {s.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Curated deep dives ── */}
      <div className="mt-14">
        <div className="flex items-center justify-between mb-4">
          <p className="text-[11px] font-semibold tracking-[0.2em] text-gray-500 uppercase">
            Curated Company Profiles · Instant
          </p>
          <button
            onClick={onOpenCompanyView}
            className="text-[13px] text-indigo-600 hover:text-indigo-800 transition-colors"
          >
            View all →
          </button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {DEEP_DIVES.map((c) => (
            <button
              key={c.name}
              onClick={() => onRunCompany(c.name)}
              className="text-left p-5 rounded-2xl bg-white/70 backdrop-blur-sm border border-black/[0.05] hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 cursor-pointer"
            >
              {/* Size the shared CompanyLogo down from its 76px report-header
                  default; without these overrides the global .company-logo CSS
                  renders a 76px tile that overflows and collides with the name
                  below. Matches the override pattern used in CompanyCanvas. */}
              <div className="mb-3 [&_.company-logo]:w-[44px] [&_.company-logo]:h-[44px] [&_.company-logo]:rounded-xl [&_.company-logo]:shadow-none [&_.company-logo_img]:p-[7px] [&_.company-logo.monogram]:text-[20px]">
                <CompanyLogo name={c.name} domain={c.domain} accent={c.accent} />
              </div>
              <p className="text-[15px] font-semibold text-gray-900">{c.name}</p>
              <p className="text-xs text-gray-400 mb-2">{c.ticker}</p>
              <span className="text-[13px] text-indigo-600">View profile →</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Trending sectors ── */}
      <div className="mt-12">
        <p className="text-[11px] font-semibold tracking-[0.2em] text-gray-500 uppercase mb-4">
          Trending Sectors
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {TRENDING.map((s) => (
            <button
              key={s.name}
              onClick={() => onPrefillSector(s.name)}
              className="text-left p-5 rounded-2xl bg-white/70 backdrop-blur-sm border border-black/[0.05] hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 cursor-pointer"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-lg text-gray-700" aria-hidden>✳</span>
                <span
                  className={`text-sm ${s.up ? "text-emerald-600" : "text-rose-500"}`}
                  aria-label={s.up ? "trending up" : "trending down"}
                >
                  {s.up ? "↗" : "↘"}
                </span>
              </div>
              <p className="text-[15px] font-semibold text-gray-900">{s.name}</p>
              <p className="text-xs text-gray-400">{s.count} cos</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
