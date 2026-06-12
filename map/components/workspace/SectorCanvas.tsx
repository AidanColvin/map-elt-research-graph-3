"use client";

import { useEffect, useState } from "react";
import Report from "@/components/Report";
import EmptyState from "@/components/ui/EmptyState";
import Skeleton from "@/components/ui/Skeleton";
import { SectorActionBar } from "./ActionBar";
import TickerGrid from "./TickerGrid";
import type { SectorScanState } from "./useSectorScan";
import { CanvasCard } from "./ui";

const EXAMPLES = ["Technology", "Oncology", "Fintech", "Artificial Intelligence", "Climate Tech"];

// takes: the useSectorScan hook state, the lifted draft value/onChange, an
//        onRun(sector) callback (lets the page record scan stats), the
//        onSelectCompany cross-tool callback, and the active deep-dive company
// does: renders the Sector Scan module: command bar pinned at the top, then
//       an example-chip empty state with recent scans, a skeleton with the
//       live company count during the real fetch, or the ticker grid stacked
//       above the full report
// returns: the sector canvas card element
export default function SectorCanvas({
  scan,
  draft,
  onDraftChange,
  onRun,
  onSelectCompany,
  activeCompany,
}: {
  scan: SectorScanState;
  draft: string;
  onDraftChange: (v: string) => void;
  onRun: (sector: string) => void;
  onSelectCompany: (company: string) => void;
  activeCompany?: string;
}) {
  const [recent, setRecent] = useState<string[]>([]);

  // takes: nothing (effect on scan completion)
  // does: records each finished sector at the front of the recent scans list,
  //       deduplicated and capped at five
  // returns: nothing
  useEffect(() => {
    if (scan.status === "done" && scan.sector) {
      setRecent((r) => [scan.sector, ...r.filter((s) => s !== scan.sector)].slice(0, 5));
    }
  }, [scan.status, scan.sector]);

  // takes: a sector name from a chip or the recent scans list
  // does: fills the draft and starts the scan through the page-level runner
  // returns: nothing
  function pick(sector: string) {
    onDraftChange(sector);
    onRun(sector);
  }

  return (
    <CanvasCard
      title="Sector Scan"
      toolbar={
        <SectorActionBar
          value={draft}
          onChange={onDraftChange}
          onRun={onRun}
          busy={scan.status === "running"}
        />
      }
    >
      {scan.status === "idle" && (
        <>
          <EmptyState
            title="Scan any sector"
            subtitle="Maps the sector's public companies to overlapping UNC Chapel Hill research: trials, publications, grants, and outreach talking points."
            chips={EXAMPLES}
            onPick={pick}
            previewLine="Output: a sourced 7-section report with charts, Excel, and slides."
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
                  marginBottom: 10,
                }}
              >
                Recent scans
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {recent.map((s) => (
                  <button key={s} className="tk-chip" onClick={() => pick(s)}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
      {scan.status === "running" && (
        <div>
          <div
            style={{
              padding: "20px 28px 0",
              fontSize: 13.5,
              color: "var(--text-2)",
              fontFamily: "var(--font)",
            }}
          >
            Scanning {scan.sector}
            {scan.progress && scan.progress.total
              ? `: ${scan.progress.done} of ${scan.progress.total} companies analyzed`
              : ""}
          </div>
          <Skeleton rows={9} />
        </div>
      )}
      {scan.status === "error" && (
        <div style={{ padding: "24px 28px", color: "var(--danger)", fontSize: 14 }}>{scan.error}</div>
      )}
      {scan.status === "done" && scan.data && (
        <>
          <TickerGrid data={scan.data} onSelect={onSelectCompany} active={activeCompany} />
          {/* The report was designed for a padded standalone page; give it
              matching gutters so nothing runs against the rounded card edge. */}
          <div style={{ padding: "0 28px" }}>
            <Report data={scan.data} hideToc />
          </div>
        </>
      )}
    </CanvasCard>
  );
}
