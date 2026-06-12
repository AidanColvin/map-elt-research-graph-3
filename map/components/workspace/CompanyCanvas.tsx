"use client";

import MarkdownArticle from "@/app/components/MarkdownArticle";
import { CompanyActionBar } from "./ActionBar";
import type { DeepDiveState } from "./useDeepDive";
import { CanvasCard, EmptyGlyph, Loading, FONT } from "./ui";

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
      {dive.status === "idle" && <EmptyGlyph />}
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
