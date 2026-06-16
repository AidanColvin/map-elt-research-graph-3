"use client";

import { useEffect, useRef, useState } from "react";
import Report, { type ReportData } from "@/components/Report";
import { OrbitNetwork } from "@/components/Chart3D";
import { SectorActionBar } from "./ActionBar";
import TickerGrid from "./TickerGrid";
import type { SectorScanState } from "./useSectorScan";
import type { SavedReportsState } from "./useSavedReports";
import { SavedStrip, SaveControl, VerifyPill } from "./SavedReports";
import { savedId, fetchSignature, type SavedReport } from "@/lib/savedReports";
import { CanvasCard, Loading, FONT } from "./ui";
import PackageButton from "./PackageButton";
import type { AccountProfile } from "./accountProfile";

// One-click sector starting points offered on the idle hero.
const POPULAR_SECTORS = [
  "Oncology", "Gene Therapy", "Semiconductors", "Fintech", "Clean Energy", "Artificial Intelligence",
];

// Illustrative orbit points for the static sample-output preview card.
const SAMPLE_POINTS = [
  { label: "Merck", size: 0.9, highlight: true, weight: 2 },
  { label: "Pfizer", size: 0.8, highlight: true, weight: 2 },
  { label: "AstraZeneca", size: 0.7, weight: 1 },
  { label: "Novartis", size: 0.65, weight: 1 },
  { label: "Amgen", size: 0.6, highlight: true, weight: 1 },
  { label: "Gilead", size: 0.5, weight: 1 },
  { label: "BioNTech", size: 0.45, weight: 1 },
  { label: "Regeneron", size: 0.4, highlight: true, weight: 1 },
  { label: "Vertex", size: 0.35, weight: 1 },
];

// takes: a small caps eyebrow string + optional style
// does: renders the shared 11px tracked-uppercase label used across heroes
// returns: a styled label element
function Eyebrow({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.16em", textTransform: "uppercase", color: "#9a9aa2", margin: 0, fontFamily: FONT, ...style }}>
      {children}
    </p>
  );
}

// takes: the lifted draft value/onChange, the run handler, busy flag, and the
//        saved-scans store + handlers
// does: renders the Sector Scan idle hero — a split layout with the headline,
//       search bar, and popular-sector chips on the left, and a static
//       illustrative "sample output" preview (orbit + stat tiles) on the right
// returns: the idle-state hero element
function SectorHero({
  draft,
  onDraftChange,
  onRun,
  busy,
  savedItems,
  onOpenSaved,
  onRemoveSaved,
}: {
  draft: string;
  onDraftChange: (v: string) => void;
  onRun: (name: string) => void;
  busy: boolean;
  savedItems: SavedReport[];
  onOpenSaved: (r: SavedReport) => void;
  onRemoveSaved: (id: string) => void;
}) {
  return (
    <div className="flex flex-col md:flex-row gap-8 md:gap-10" style={{ padding: "28px 28px 40px", fontFamily: FONT }}>
      {/* Left panel (~60%) */}
      <div className="md:w-3/5">
        <Eyebrow>Sector Intelligence</Eyebrow>
        <h1 style={{ fontSize: 38, lineHeight: 1.08, fontWeight: 700, letterSpacing: "-0.025em", color: "#1d1d1f", margin: "14px 0 0" }}>
          Scan an entire sector
          <br />
          against UNC research.
        </h1>
        <p style={{ fontSize: 15.5, lineHeight: 1.55, color: "#6b6b73", margin: "16px 0 0", maxWidth: 460 }}>
          We map the public companies in any sector to UNC trials, grants, and
          publications — sourced and scored, in about a minute.
        </p>

        <div style={{ margin: "22px 0 0", marginLeft: -24 }}>
          <SectorActionBar value={draft} onChange={onDraftChange} onRun={onRun} busy={busy} />
        </div>

        <Eyebrow style={{ margin: "10px 0 12px" }}>Popular sectors</Eyebrow>
        <div className="flex flex-wrap gap-2.5">
          {POPULAR_SECTORS.map((s) => (
            <button
              key={s}
              onClick={() => { onDraftChange(s); onRun(s); }}
              className="rounded-full bg-white/80 border border-black/[0.06] hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-pointer"
              style={{ padding: "6px 14px", fontSize: 13.5, fontWeight: 500, color: "#1d1d1f" }}
            >
              {s}
            </button>
          ))}
        </div>

        {savedItems.length > 0 && (
          <div style={{ marginTop: 26 }}>
            <SavedStrip items={savedItems} onOpen={onOpenSaved} onRemove={onRemoveSaved} label="Saved scans" />
          </div>
        )}
      </div>

      {/* Right panel (~40%) — sample output preview */}
      <div className="md:w-2/5">
        <div style={{ background: "#efecfb", borderRadius: 22, padding: 18 }}>
          <Eyebrow style={{ color: "#8b80c4", marginBottom: 12 }}>Sample Output</Eyebrow>
          <div style={{ background: "#fff", borderRadius: 16, padding: 18, boxShadow: "0 8px 28px rgba(60,40,120,0.08)" }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 2 }}>
              <Eyebrow>Sector Scan · Example</Eyebrow>
              <span style={{ fontSize: 11, color: "#a0a0a8" }}>Oncology</span>
            </div>
            <OrbitNetwork points={SAMPLE_POINTS} centerLabel="UNC" height={300} />
            <div className="grid grid-cols-3 gap-2" style={{ marginTop: 10 }}>
              {[{ n: "18", l: "Companies" }, { n: "64", l: "Claims" }, { n: "7", l: "UNC Ties" }].map((s) => (
                <div key={s.l} style={{ background: "#f6f6f8", borderRadius: 10, padding: "10px 8px", textAlign: "center" }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#1d1d1f" }}>{s.n}</div>
                  <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "#a0a0a8", marginTop: 2 }}>{s.l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

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
  onNewRows,
}: {
  scan: SectorScanState;
  draft: string;
  onDraftChange: (v: string) => void;
  onSelectCompany: (company: string) => void;
  activeCompany?: string;
  saved: SavedReportsState;
  onNewRows?: (rows: AccountProfile[]) => void;
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
        scan.status === "idle" ? undefined : (
          <SectorActionBar
            value={draft}
            onChange={onDraftChange}
            onRun={scan.run}
            busy={scan.status === "running"}
          />
        )
      }
    >
      {scan.status === "idle" && (
        <SectorHero
          draft={draft}
          onDraftChange={onDraftChange}
          onRun={scan.run}
          busy={false}
          savedItems={sectorItems}
          onOpenSaved={openSaved}
          onRemoveSaved={saved.remove}
        />
      )}
      {scan.status === "running" && (
        <Loading
          label={`Scanning ${scan.sector}…`}
          detail={
            scan.progress && scan.progress.total
              ? `${scan.progress.done} of ${scan.progress.total} companies`
              : "~60 seconds"
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
          {onNewRows && (
            <div
              data-testid="package-section"
              style={{ margin: "0 28px", marginTop: 32, paddingTop: 24, borderTop: "1px solid rgba(0,0,0,0.06)" }}
            >
              <PackageButton reportData={scan.data} sector={scan.sector} onNewRows={onNewRows} />
            </div>
          )}
        </>
      )}
    </CanvasCard>
  );
}
