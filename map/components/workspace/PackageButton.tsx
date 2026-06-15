"use client";
import { useState, useRef } from "react";
import type { ReportData } from "@/components/Report";
import type { AccountProfile } from "@/components/workspace/accountProfile";
import { buildSectorPackage } from "@/lib/sector-package";
import { FONT } from "./ui";

interface PackageButtonProps {
  reportData: ReportData;
  sector: string;
  onNewRows: (rows: AccountProfile[]) => void;
}

// takes: the completed sector ReportData, the sector name, and a new-rows sink
// does: runs the sector-to-package pipeline on click — profiles companies,
//       downloads the ZIP, and pushes the new Database rows up to the workspace.
//       Shows idle / running (progress) / done / error states.
// returns: the package control element
export default function PackageButton({ reportData, sector, onNewRows }: PackageButtonProps) {
  const [phase, setPhase] = useState<"idle" | "running" | "done" | "error">("idle");
  const [step, setStep] = useState("");
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const [newRowCount, setNewRowCount] = useState(0);
  const blobRef = useRef<{ blob: Blob; filename: string } | null>(null);

  function triggerDownload(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function runPackage() {
    setPhase("running");
    setStep("Starting…");
    setDone(0);
    setTotal(0);
    try {
      const result = await buildSectorPackage(reportData, sector, (s, d, t) => {
        setStep(s);
        setDone(d);
        setTotal(t);
      });
      blobRef.current = { blob: result.blob, filename: result.filename };
      triggerDownload(result.blob, result.filename);
      onNewRows(result.newRows);
      setNewRowCount(result.newRows.length);
      setPhase("done");
    } catch (err) {
      console.error("[PackageButton]", err);
      setPhase("error");
    }
  }

  if (phase === "idle")
    return (
      <div style={{ fontFamily: FONT }}>
        <button
          data-testid="package-btn"
          onClick={runPackage}
          style={{
            border: "none", cursor: "pointer", borderRadius: 12,
            padding: "11px 24px", fontSize: 14, fontWeight: 600,
            color: "#fff", background: "#1d1d1f",
          }}
        >
          Package
        </button>
        <p style={{ fontSize: 12, color: "#6b6b73", marginTop: 8, maxWidth: 480 }}>
          Profiles top 25 companies with UNC signals → downloads ZIP with sector PDF, company PDFs, and Excel.
        </p>
      </div>
    );

  if (phase === "running")
    return (
      <div data-testid="package-progress" style={{ fontFamily: FONT, maxWidth: 480 }}>
        <p style={{ fontSize: 14, color: "#1d1d1f", margin: "0 0 10px" }}>{step}</p>
        <div style={{ height: 4, background: "#e5e5ea", borderRadius: 999, overflow: "hidden" }}>
          <div
            style={{
              height: "100%", background: "#5b6cff", borderRadius: 999,
              width: total > 0 ? `${(done / total) * 100}%` : "10%",
              transition: "width 0.3s ease",
            }}
          />
        </div>
        {total > 0 && (
          <p style={{ fontSize: 12, color: "#6b6b73", margin: "6px 0 0" }}>
            {done} of {total} companies
          </p>
        )}
      </div>
    );

  if (phase === "done")
    return (
      <div data-testid="package-done" style={{ fontFamily: FONT }}>
        <p style={{ fontSize: 14, color: "#16a34a", margin: "0 0 10px", fontWeight: 500 }}>
          ✓ Package ready — {newRowCount} new {newRowCount === 1 ? "company" : "companies"} added to Database
        </p>
        <button
          data-testid="package-redownload"
          onClick={() => blobRef.current && triggerDownload(blobRef.current.blob, blobRef.current.filename)}
          style={{
            border: "1px solid rgba(0,0,0,0.1)", cursor: "pointer", borderRadius: 999,
            padding: "6px 14px", fontSize: 13, background: "#fff", color: "#1d1d1f",
          }}
        >
          Download again ↓
        </button>
      </div>
    );

  return (
    <div data-testid="package-error" style={{ fontFamily: FONT }}>
      <p style={{ fontSize: 14, color: "#b91c1c", margin: "0 0 10px" }}>
        Package generation failed. See console for details.
      </p>
      <button
        onClick={() => setPhase("idle")}
        style={{
          border: "1px solid rgba(0,0,0,0.1)", cursor: "pointer", borderRadius: 999,
          padding: "6px 14px", fontSize: 13, background: "#fff", color: "#1d1d1f",
        }}
      >
        Retry
      </button>
    </div>
  );
}
