"use client";

import { useEffect, useRef, useState } from "react";
import Report, { type ReportData } from "@/components/Report";
import { SectorActionBar } from "./ActionBar";
import TickerGrid from "./TickerGrid";
import type { SectorScanState } from "./useSectorScan";
import type { SavedReportsState } from "./useSavedReports";
import { SavedStrip, SaveControl, VerifyPill } from "./SavedReports";
import { savedId, fetchSignature, type SavedReport } from "@/lib/savedReports";
import { CanvasCard, EmptyGlyph, Loading, FONT } from "./ui";

// takes: the useSectorScan hook state, the lifted draft value/onChange, the
//        onSelectCompany cross-tool callback, the active deep-dive company, and
//        the per-user saved-reports store
// does: renders the Sector Scan module — its command bar pinned at the top,
//       then empty glyph (with any saved scans), live-progress loading row, or
//       the ticker grid stacked above the full report, with save & reuse
// returns: the sector canvas card element
export default function SectorCanvas({
  scan,
  draft,
  onDraftChange,
  onSelectCompany,
  activeCompany,
  saved,
}: {
  scan: SectorScanState;
  draft: string;
  onDraftChange: (v: string) => void;
  onSelectCompany: (company: string) => void;
  activeCompany?: string;
  saved: SavedReportsState;
}) {
  const sectorItems = saved.saved.filter((r) => r.kind === "sector");
  const [verifyNote, setVerifyNote] = useState("");
  const resaveRef = useRef<{ query: string; sig: string } | null>(null);

  // takes: a saved sector scan
  // does: shows the saved scan instantly, then re-verifies — a sector is
  //       re-verified by re-running the pipeline when the day-bucket signature
  //       has moved on; otherwise it just refreshes the "verified" time
  async function openSaved(r: SavedReport) {
    onDraftChange(r.query);
    try {
      scan.loadSaved(r.query, JSON.parse(r.content) as ReportData);
    } catch {
      // corrupt cache — fall back to a fresh run
      scan.run(r.query);
      return;
    }
    setVerifyNote("Checking for updates…");
    const sig = await fetchSignature("sector", r.query);
    if (sig && r.sig && sig !== r.sig) {
      setVerifyNote("Re-running to verify…");
      resaveRef.current = { query: r.query, sig };
      scan.run(r.query);
    } else {
      setVerifyNote("Verified current");
      await saved.save({ ...r, verifiedAt: Date.now() });
      window.setTimeout(() => setVerifyNote(""), 2600);
    }
  }

  // After a staleness-triggered re-run finishes, persist the fresh scan.
  useEffect(() => {
    const pending = resaveRef.current;
    if (scan.status === "done" && scan.data && pending && pending.query === scan.sector) {
      resaveRef.current = null;
      const now = Date.now();
      saved
        .save({
          id: savedId("sector", pending.query),
          kind: "sector",
          query: pending.query,
          title: pending.query,
          content: JSON.stringify(scan.data),
          sig: pending.sig,
          savedAt: now,
          verifiedAt: now,
        })
        .finally(() => {
          setVerifyNote("Updated to latest");
          window.setTimeout(() => setVerifyNote(""), 2600);
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scan.status, scan.sector]);

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
      {scan.status === "idle" && (
        <div>
          {sectorItems.length > 0 && (
            <div style={{ padding: "20px 28px 0", fontFamily: FONT }}>
              <SavedStrip
                items={sectorItems}
                onOpen={openSaved}
                onRemove={saved.remove}
                label="Saved scans"
              />
            </div>
          )}
          <EmptyGlyph />
        </div>
      )}
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
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: 10,
              padding: "12px 28px 0",
            }}
          >
            <VerifyPill note={verifyNote} />
            <SaveControl
              saved={saved}
              kind="sector"
              query={scan.sector}
              title={scan.sector}
              getContent={() => JSON.stringify(scan.data)}
            />
          </div>
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
