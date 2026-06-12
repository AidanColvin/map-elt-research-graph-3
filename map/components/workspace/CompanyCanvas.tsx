"use client";

import { useEffect, useState } from "react";
import MarkdownArticle from "@/app/components/MarkdownArticle";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import Skeleton from "@/components/ui/Skeleton";
import { CompanyActionBar } from "./ActionBar";
import type { DeepDiveState } from "./useDeepDive";
import { CanvasCard } from "./ui";

const EXAMPLES = ["Apple", "Sanofi", "Pfizer", "Eli Lilly"];

// takes: the useDeepDive hook state plus the lifted draft value/onChange
// does: renders the Company Profile module: command bar pinned at the top,
//       then an example-chip empty state with recently viewed cards, a
//       skeleton during the real fetch, or the streamed report
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
  const [recent, setRecent] = useState<string[]>([]);

  // takes: nothing (effect on report completion)
  // does: records each finished company at the front of the recently viewed
  //       list, deduplicated and capped at four
  // returns: nothing
  useEffect(() => {
    if (dive.status === "done" && dive.company) {
      setRecent((r) => [dive.company, ...r.filter((c) => c !== dive.company)].slice(0, 4));
    }
  }, [dive.status, dive.company]);

  // takes: a company name from a chip or a recently viewed card
  // does: fills the search draft and runs the analysis
  // returns: nothing
  function pick(name: string) {
    onDraftChange(name);
    dive.run(name);
  }

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
      {dive.status === "idle" && (
        <>
          <EmptyState
            title="Profile any public company"
            subtitle="SEC filings, full financials, leadership, talking points, and UNC fit, sourced and streamed in seconds."
            chips={EXAMPLES}
            onPick={pick}
            previewLine="Output: a board-ready report with charts and cited sources."
          />
          {recent.length > 0 && (
            <div style={{ padding: "0 28px 32px" }}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--text-2)",
                  marginBottom: 12,
                }}
              >
                Recently viewed
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                  gap: 14,
                }}
              >
                {recent.map((name) => (
                  <Card
                    key={name}
                    title="Company"
                    value={name}
                    preview="Open report →"
                    onClick={() => pick(name)}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}
      {dive.status === "loading" && <Skeleton rows={8} />}
      {(dive.status === "streaming" || dive.status === "done" || dive.status === "error") && (
        <div style={{ padding: "24px 28px 36px" }}>
          <h2
            style={{
              fontFamily: "var(--font)",
              fontSize: 26,
              fontWeight: 700,
              letterSpacing: "var(--tracking-tight)",
              margin: "0 0 6px",
              color: "var(--text)",
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
