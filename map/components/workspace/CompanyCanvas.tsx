"use client";

import MarkdownArticle from "@/app/components/MarkdownArticle";
import CompanyLogo from "@/app/components/CompanyLogo";
import { CompanyActionBar } from "./ActionBar";
import { EXAMPLE_CATEGORIES } from "./exampleCompanies";
import type { DeepDiveState } from "./useDeepDive";
import { CanvasCard, Loading, FONT } from "./ui";

// takes: an onPick(name) handler that runs the deep dive for a company
// does: renders the Company Profile empty state — the example companies
//       grouped by Fortune-tech category, each a card that launches a deep
//       dive (live-sourced for all but the few hand-curated names)
// returns: the examples grid element
function CompanyExamples({ onPick }: { onPick: (name: string) => void }) {
  return (
    <div style={{ padding: "8px 28px 36px", fontFamily: FONT }}>
      <p
        className="text-[12px] text-gray-500"
        style={{ margin: "0 0 20px", lineHeight: 1.5 }}
      >
        Search any public company above, or start from an example. Each profile is
        assembled live from SEC EDGAR and Wikipedia, so the figures reflect the
        latest filings every time.
      </p>
      {EXAMPLE_CATEGORIES.map((cat) => (
        <div key={cat.label} style={{ marginBottom: 28 }}>
          <p className="text-[11px] font-semibold tracking-[0.18em] text-gray-500 uppercase mb-3">
            {cat.label}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {cat.companies.map((c) => (
              <button
                key={c.name}
                onClick={() => onPick(c.name)}
                className="text-left p-4 rounded-2xl bg-white/70 backdrop-blur-sm border border-black/[0.05] hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 cursor-pointer"
              >
                <div className="mb-2.5" style={{ width: 32, height: 32 }}>
                  <CompanyLogo name={c.name} domain={c.domain} accent={c.accent} />
                </div>
                <p className="text-[14px] font-semibold text-gray-900 leading-tight">
                  {c.name}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">{c.ticker}</p>
                <span className="text-[12px] text-indigo-600">Deep dive →</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// takes: the useDeepDive hook state plus the lifted draft value/onChange
// does: renders the Company Profile module — its command bar pinned at the
//       top, then empty glyph, standardized loading row, or the streamed
//       report under the company's name
// returns: the company canvas card element
export default function CompanyCanvas({
  dive,
  draft,
  onDraftChange,
}: {
  dive: DeepDiveState;
  draft: string;
  onDraftChange: (v: string) => void;
}) {
  // The H1 is replaced by the card's own title row, like every other module.
  const body = dive.markdown.replace(/^#\s+.*\n?/, "");
  const busy = dive.status === "loading" || dive.status === "streaming";

  return (
    <CanvasCard
      title="Company Profile"
      toolbar={
        <CompanyActionBar value={draft} onChange={onDraftChange} onRun={dive.run} busy={busy} />
      }
    >
      {dive.status === "idle" && <CompanyExamples onPick={dive.run} />}
      {dive.status === "loading" && <Loading label={`Gathering public data on ${dive.company}…`} />}
      {(dive.status === "streaming" || dive.status === "done" || dive.status === "error") && (
        <div style={{ padding: "24px 28px 36px" }}>
          <h2
            style={{
              fontFamily: FONT,
              fontSize: 26,
              fontWeight: 700,
              letterSpacing: "-0.02em",
              margin: "0 0 6px",
              color: "#1d1d1f",
            }}
          >
            {dive.company}
          </h2>
          <div className={`workspace-md ${dive.status === "streaming" ? "streaming" : ""}`}>
            <MarkdownArticle markdown={body} />
            {dive.status === "streaming" && <span className="cursor" />}
          </div>
        </div>
      )}
    </CanvasCard>
  );
}
