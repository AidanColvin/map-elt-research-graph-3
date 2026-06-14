"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import MarkdownArticle from "@/app/components/MarkdownArticle";
import Report from "@/components/Report";
import { loadShare, type SharedReport } from "@/lib/shareReport";
import { FONT } from "@/components/workspace/ui";

type Status = "loading" | "ready" | "missing";

// takes: an optional pixel size
// does: draws the node-graph brand glyph used in the app header (kept in sync
//       with the workspace logo so a shared page reads as the same product)
// returns: the logo SVG element
function LogoMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="3.2" fill="#1d1d1f" />
      {[0, 60, 120, 180, 240, 300].map((deg) => {
        const r = (deg * Math.PI) / 180;
        const x = 12 + 8.5 * Math.cos(r);
        const y = 12 + 8.5 * Math.sin(r);
        return (
          <g key={deg}>
            <line x1="12" y1="12" x2={x} y2={y} stroke="#1d1d1f" strokeWidth="1.1" />
            <circle cx={x} cy={y} r="1.9" fill="#1d1d1f" />
          </g>
        );
      })}
    </svg>
  );
}

// takes: nothing (route component; reads the [id] param)
// does: loads a publicly shared report by id and renders a clean, read-only
//       view — a company deep dive (Markdown) or a sector scan (Report) — with
//       a minimal branded header that links back into the app
// returns: the public shared-report page
export default function SharedReportPage() {
  const params = useParams<{ id: string }>();
  const id = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const [status, setStatus] = useState<Status>("loading");
  const [report, setReport] = useState<SharedReport | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!id) {
      setStatus("missing");
      return;
    }
    loadShare(id)
      .then((r) => {
        if (cancelled) return;
        if (r) {
          setReport(r);
          setStatus("ready");
          if (typeof document !== "undefined") {
            document.title = `${r.title} — Map`;
          }
        } else {
          setStatus("missing");
        }
      })
      .catch(() => {
        if (!cancelled) setStatus("missing");
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  // The sector content is JSON; the company content is Markdown.
  let sectorData: any = null;
  if (report?.kind === "sector") {
    try {
      sectorData = JSON.parse(report.content);
    } catch {
      sectorData = null;
    }
  }

  return (
    <div
      style={{
        fontFamily: FONT,
        minHeight: "100vh",
        color: "#1d1d1f",
        background:
          "radial-gradient(1100px 520px at 12% -8%, rgba(120,140,255,0.07), transparent 60%)," +
          "radial-gradient(900px 480px at 95% 4%, rgba(255,150,120,0.05), transparent 55%)," +
          "#f5f5f7",
      }}
    >
      {/* Minimal branded header — logo links into the app. */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 100,
          height: 54,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 22px",
          background: "rgba(255,255,255,0.66)",
          backdropFilter: "saturate(180%) blur(20px)",
          WebkitBackdropFilter: "saturate(180%) blur(20px)",
          borderBottom: "1px solid rgba(0,0,0,0.05)",
        }}
      >
        <a
          href="/"
          aria-label="Map home"
          style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}
        >
          <LogoMark />
          <span
            style={{
              fontSize: 16,
              fontWeight: 600,
              letterSpacing: "0.32em",
              color: "#1d1d1f",
            }}
          >
            map
          </span>
        </a>
        <span style={{ fontSize: 12, color: "#8a8a92", letterSpacing: "0.04em" }}>
          Shared report · read-only
        </span>
      </header>

      <main style={{ maxWidth: 900, margin: "0 auto", padding: "28px 24px 64px" }}>
        {status === "loading" && (
          <p style={{ textAlign: "center", marginTop: 80, color: "#8a8a92", fontSize: 14 }}>
            Loading shared report…
          </p>
        )}

        {status === "missing" && (
          <div style={{ textAlign: "center", marginTop: 90 }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 8px" }}>
              This link isn’t available
            </h1>
            <p style={{ color: "#8a8a92", fontSize: 14, margin: "0 0 20px" }}>
              The shared report may have been removed, or the link is incorrect.
            </p>
            <a
              href="/"
              className="rounded-full bg-gray-900 hover:bg-black text-white transition-colors"
              style={{ padding: "9px 18px", fontSize: 13.5, fontWeight: 500, textDecoration: "none" }}
            >
              Open Map
            </a>
          </div>
        )}

        {status === "ready" && report?.kind === "company" && (
          <div
            style={{
              background: "#fff",
              border: "1px solid rgba(0,0,0,0.06)",
              borderRadius: 18,
              padding: "28px 30px",
              boxShadow: "0 10px 40px rgba(0,0,0,0.05)",
            }}
          >
            <h1 style={{ fontSize: 30, fontWeight: 700, letterSpacing: "-0.02em", margin: "0 0 18px" }}>
              {report.title}
            </h1>
            <div className="workspace-md">
              <MarkdownArticle markdown={report.content.replace(/^#\s+.*\n?/, "")} />
            </div>
          </div>
        )}

        {status === "ready" && report?.kind === "sector" && sectorData && (
          <Report data={sectorData} />
        )}

        {status === "ready" && report?.kind === "sector" && !sectorData && (
          <p style={{ textAlign: "center", marginTop: 80, color: "#8a8a92", fontSize: 14 }}>
            This shared report couldn’t be displayed.
          </p>
        )}
      </main>
    </div>
  );
}
