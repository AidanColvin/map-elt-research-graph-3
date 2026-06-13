"use client";

import Report from "@/components/Report";
import { SectorActionBar } from "./ActionBar";
import SectorEmptyState from "./SectorEmptyState";
import TickerGrid from "./TickerGrid";
import type { SectorScanState } from "./useSectorScan";
import { CanvasCard, Loading } from "./ui";

// takes: the useSectorScan hook state, the lifted draft value/onChange, the
//        onSelectCompany cross-tool callback, and the active deep-dive company
// does: renders the Sector Scan module — its command bar pinned at the top,
//       then empty glyph, live-progress loading row, or the ticker grid
//       stacked natively above the full (gutter-padded) report
// returns: the sector canvas card element
export default function SectorCanvas({
  scan,
  draft,
  onDraftChange,
  onSelectCompany,
  activeCompany,
}: {
  scan: SectorScanState;
  draft: string;
  onDraftChange: (v: string) => void;
  onSelectCompany: (company: string) => void;
  activeCompany?: string;
}) {
  return (
    <CanvasCard
      title={scan.data ? `Sector Scan — ${scan.sector}` : "Sector Scan"}
      toolbar={
        <SectorActionBar
          value={draft}
          onChange={onDraftChange}
          onRun={scan.run}
          busy={scan.status === "running"}
        />
      }
    >
      {scan.status === "idle" && <SectorEmptyState onRun={scan.run} />}
      {scan.status === "running" && (
        <Loading
          label={`Scanning ${scan.sector}…`}
          detail={
            scan.progress && scan.progress.total
              ? `${scan.progress.done} of ${scan.progress.total} companies`
              : undefined
          }
        />
      )}
      {scan.status === "error" && (
        <div style={{ padding: "24px 28px", color: "#dc2626", fontSize: 14 }}>{scan.error}</div>
      )}
      {scan.status === "done" && scan.data && (
        <>
          <TickerGrid data={scan.data} onSelect={onSelectCompany} active={activeCompany} />
          {/* The report was designed for a padded standalone page — give it
              matching gutters so nothing runs against the rounded card edge. */}
          <div style={{ padding: "0 28px" }}>
            <Report data={scan.data} hideToc />
          </div>
        </>
      )}
    </CanvasCard>
  );
}
