"use client";

import { useEffect, useState } from "react";
import { FONT } from "./ui";
import { authFetch } from "@/lib/authFetch";

// The fields this snapshot reads from /api/partnerships — a subset of the full
// resolver payload (see PartnershipsView's PartnerData). Kept narrow on purpose.
interface SnapshotData {
  resolved_name?: string;
  clinical?: { count?: number; top_authors?: string[] };
  coi?: { count?: number };
  financial?: { quotes?: unknown[] };
  unc_units?: { unit: string; count: number }[];
  links?: { pubmed?: string; edgar?: string; unc_web?: string };
  confirmed_interactions?: { found: boolean; engagement_type?: string };
}

// takes: a count and a label
// does: renders one labelled stat cell
// returns: the stat element
function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div style={{ minWidth: 96 }}>
      <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>{value}</div>
      <div style={{ fontSize: 11.5, color: "#6b6b73", margin: "2px 0 0" }}>{label}</div>
    </div>
  );
}

// takes: a co-authored paper count and whether any verbatim SEC mention exists
// does: derives the same relationship-depth label used in the UNC tab
// returns: a { label, bg, color, border } descriptor
function depthOf(papers: number, hasSec: boolean) {
  if (papers > 3 || hasSec) return { label: "Active", bg: "#ecfdf5", color: "#047857", border: "#6ee7b7" };
  if (papers >= 1) return { label: "Exploratory", bg: "#fffbeb", color: "#b45309", border: "#fcd34d" };
  return { label: "None confirmed", bg: "#f3f4f6", color: "#6b7280", border: "#e5e7eb" };
}

// takes: a company name (already known to be a curated profile subject)
// does: fetches the live UNC partnership signals for that company and renders a
//       compact, read-only snapshot card beneath the streamed report. Pulls the
//       SAME primary-source data as the UNC tab — no fabricated content. Fails
//       soft: any error or empty payload renders a muted unavailable state.
// returns: the snapshot card, or the unavailable state
export default function UNCReportSnapshot({ company }: { company: string }) {
  const [data, setData] = useState<SnapshotData | null>(null);
  const [status, setStatus] = useState<"loading" | "done" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setData(null);
    (async () => {
      try {
        const res = await authFetch("/api/partnerships", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: company, type: "company" }),
        });
        const json = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok || !json?.data) { setStatus("error"); return; }
        setData(json.data as SnapshotData);
        setStatus("done");
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();
    return () => { cancelled = true; };
  }, [company]);

  const cardStyle: React.CSSProperties = {
    background: "#fff", border: "1px solid rgba(0,0,0,0.06)", borderRadius: 18,
    padding: 22, boxShadow: "0 8px 30px rgba(0,0,0,0.04)", margin: "20px 0 0", fontFamily: FONT,
  };
  const cornerLabel = (
    <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.16em", textTransform: "uppercase", color: "#9a9aa2", margin: 0 }}>
      UNC
    </p>
  );

  if (status === "loading") {
    return (
      <div style={cardStyle} aria-busy="true">
        {cornerLabel}
        <p style={{ fontSize: 13, color: "#9a9aa2", margin: "10px 0 0" }}>Loading UNC partnership signals…</p>
      </div>
    );
  }

  if (status === "error" || !data) {
    return (
      <div style={cardStyle}>
        {cornerLabel}
        <p style={{ fontSize: 13, color: "#9a9aa2", margin: "10px 0 0" }}>Partnership data unavailable.</p>
      </div>
    );
  }

  const papers = data.clinical?.count ?? 0;
  const coi = data.coi?.count ?? 0;
  const sec = data.financial?.quotes?.length ?? 0;
  const depth = depthOf(papers, sec > 0);
  const units = (data.unc_units ?? []).slice(0, 4);

  return (
    <div data-testid="report-unc-snapshot" style={cardStyle}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div>
          {cornerLabel}
          <h3 style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.01em", margin: "6px 0 0" }}>UNC Partnership Snapshot</h3>
        </div>
        <span
          data-testid="report-depth-badge"
          style={{
            fontSize: 11.5, fontWeight: 600, letterSpacing: "0.04em", whiteSpace: "nowrap",
            background: depth.bg, color: depth.color, border: `1px solid ${depth.border}`,
            borderRadius: 999, padding: "4px 12px",
          }}
        >
          {depth.label}
        </span>
        {data.confirmed_interactions?.found && (
          <span
            data-testid="report-confirmed-badge"
            style={{
              fontSize: 11.5, fontWeight: 600, letterSpacing: "0.04em", whiteSpace: "nowrap",
              background: "#dcfce7", color: "#047857", border: "1px solid #6ee7b7",
              borderRadius: 999, padding: "4px 12px", marginLeft: 8,
            }}
          >
            ✓ Confirmed Partner
          </span>
        )}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 28, margin: "18px 0 0" }}>
        <Stat value={papers} label="Co-authored papers" />
        <Stat value={coi} label="COI disclosures" />
        <Stat value={sec} label="SEC mentions of UNC" />
      </div>

      {units.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "16px 0 0" }}>
          {units.map((u) => (
            <span key={u.unit} style={{ fontSize: 11.5, background: "#eef0ff", color: "#4451c8", borderRadius: 999, padding: "3px 10px" }}>
              {u.unit} · {u.count}
            </span>
          ))}
        </div>
      )}

      {(data.links?.pubmed || data.links?.edgar) && (
        <p style={{ fontSize: 12, color: "#9a9aa2", margin: "16px 0 0" }}>
          Sourced live from{" "}
          {data.links?.pubmed && <a href={data.links.pubmed} target="_blank" rel="noopener noreferrer" style={{ color: "#5b6cff", textDecoration: "none" }}>PubMed</a>}
          {data.links?.pubmed && data.links?.edgar && " · "}
          {data.links?.edgar && <a href={data.links.edgar} target="_blank" rel="noopener noreferrer" style={{ color: "#5b6cff", textDecoration: "none" }}>SEC EDGAR</a>}
          . Open the UNC tab for the full breakdown.
        </p>
      )}
    </div>
  );
}
