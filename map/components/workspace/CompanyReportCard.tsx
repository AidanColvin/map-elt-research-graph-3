"use client";

import { useState } from "react";
import type {
  CompanyCardData, CardBullet, CardContact, CardAsset, CardPeer, CardTalkingPoint,
} from "@/lib/companyCard";
import { FONT } from "./ui";

/**
 * One per-company partnership report card. Pure presentation — every value is
 * already validated/sourced upstream (see lib/companyCard.ts). Styled inline to
 * match the rest of the workspace (the app doesn't use shadcn Tailwind tokens).
 */

const MUTED = "#8a8a92";
const INK = "#1d1d1f";
const BORDER = "#ececf0";
const BLUE = "#2563eb";

// A small external link rendered in body text / tables.
function A({ href, children, bold }: { href?: string; children: React.ReactNode; bold?: boolean }) {
  if (!href || !/^https?:\/\//.test(href)) {
    return <span style={{ color: bold ? INK : "inherit", fontWeight: bold ? 600 : undefined }}>{children}</span>;
  }
  return (
    <a href={href} target="_blank" rel="noreferrer"
       style={{ color: BLUE, textDecoration: "none", fontWeight: bold ? 600 : 500 }}>
      {children}
    </a>
  );
}

// A "·"-prefixed, bottom-bordered bullet list (no native markers).
function Bullets({ items }: { items: CardBullet[] }) {
  if (!items.length) return null;
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {items.map((b, i) => (
        <li key={i} style={{
          position: "relative", paddingLeft: 12, fontSize: 12, color: MUTED,
          lineHeight: 1.5, padding: "5px 0 5px 12px",
          borderBottom: i < items.length - 1 ? `1px solid ${BORDER}` : "none",
        }}>
          <span style={{ position: "absolute", left: 0, color: "#c7c7cc" }}>·</span>
          <A href={b.url}>{b.text}</A>
        </li>
      ))}
    </ul>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: MUTED, margin: "0 0 6px" }}>
      {children}
    </p>
  );
}

function Pill({ text, kind }: { text: string; kind: "tier" | "active" | "prior" | "none" | "signal" }) {
  const map: Record<string, { bg: string; fg: string }> = {
    tier: { bg: "#eeedfe", fg: "#3c3489" },
    active: { bg: "#e1f5ee", fg: "#085041" },
    prior: { bg: "#e6f1fb", fg: "#1f5d99" },
    none: { bg: "#f2f2f7", fg: "#8a8a92" },
    signal: { bg: "#f2f2f7", fg: "#5a5a62" },
  };
  const c = map[kind] || map.signal;
  return (
    <span style={{ fontSize: 11.5, fontWeight: 600, padding: "3px 11px", borderRadius: 999, background: c.bg, color: c.fg }}>
      {text}
    </span>
  );
}

function ContactsTable({ rows }: { rows: CardContact[] }) {
  if (!rows.length) return null;
  const th = { fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" as const, color: MUTED, borderBottom: `1px solid ${BORDER}`, padding: "6px 8px 6px 0", textAlign: "left" as const };
  const td = { fontSize: 12, color: MUTED, padding: "7px 8px 7px 0", borderBottom: `1px solid ${BORDER}`, verticalAlign: "top" as const };
  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead><tr><th style={th}>PI</th><th style={th}>Unit</th><th style={th}>Grant</th><th style={th}>Topic</th></tr></thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            <td style={{ ...td, color: INK, fontWeight: 500 }}><A href={r.url}>{r.pi}</A></td>
            <td style={td}>{r.unit}</td>
            <td style={{ ...td, fontFamily: "ui-monospace, monospace", fontSize: 11 }}>{r.grant || "—"}</td>
            <td style={td}>{r.topic || "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function AssetsTable({ rows }: { rows: CardAsset[] }) {
  if (!rows.length) return null;
  const th = { fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" as const, color: MUTED, borderBottom: `1px solid ${BORDER}`, padding: "6px 8px 6px 0", textAlign: "left" as const };
  const td = { fontSize: 12, color: MUTED, padding: "7px 8px 7px 0", borderBottom: `1px solid ${BORDER}`, verticalAlign: "top" as const };
  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead><tr><th style={th}>Asset</th><th style={th}>Relevance</th></tr></thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            <td style={{ ...td, color: INK, fontWeight: 500 }}><A href={r.url}>{r.name}</A></td>
            <td style={td}>{r.relevance}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function RdChart({ peers }: { peers: CardPeer[] }) {
  if (!peers.length) return null;
  const max = Math.max(...peers.map((p) => p.valueB), 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {peers.map((p, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 10, width: 70, textAlign: "right", color: p.isSubject ? INK : MUTED, fontWeight: p.isSubject ? 700 : 400, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</span>
          <span style={{ flex: 1, height: 10, background: "#f2f2f7", borderRadius: 3, overflow: "hidden" }}>
            <span style={{ display: "block", height: "100%", width: `${(p.valueB / max) * 100}%`, background: p.isSubject ? "#60a5fa" : "#bfdbfe" }} />
          </span>
          <span style={{ fontSize: 9, width: 34, color: p.isSubject ? INK : MUTED, fontWeight: p.isSubject ? 700 : 400 }}>${p.valueB}B</span>
        </div>
      ))}
    </div>
  );
}

export default function CompanyReportCard({ data, onDownloadPDF, onDownloadDOCX }: {
  data: CompanyCardData;
  onDownloadPDF: () => void | Promise<void>;
  onDownloadDOCX: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  async function run(label: string, fn: () => void | Promise<void>) {
    if (busy) return;
    setBusy(label);
    try { await fn(); } finally { setBusy(null); }
  }
  const btn = {
    fontSize: 12, fontWeight: 600, padding: "6px 13px", borderRadius: 999, cursor: "pointer",
    display: "inline-flex", alignItems: "center", gap: 5,
  } as const;

  return (
    <section style={{ fontFamily: FONT, padding: "24px 0", borderTop: `1px solid ${BORDER}` }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.02em", margin: 0, color: INK }}>{data.name}</h2>
          {data.metaLine && <p style={{ fontSize: 12, color: MUTED, margin: "4px 0 0" }}>{data.metaLine}</p>}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => run("PDF", onDownloadPDF)} disabled={!!busy} style={{ ...btn, border: "none", background: INK, color: "#fff" }}>
            {busy === "PDF" ? "…" : "↓ PDF"}
          </button>
          <button onClick={() => run("DOCX", onDownloadDOCX)} disabled={!!busy} style={{ ...btn, border: `1px solid ${BORDER}`, background: "#fff", color: INK }}>
            {busy === "DOCX" ? "…" : "↓ DOCX"}
          </button>
        </div>
      </div>

      {/* Pills */}
      <div style={{ display: "flex", gap: 7, flexWrap: "wrap", margin: "12px 0 16px" }}>
        <Pill text={data.tier} kind="tier" />
        <Pill text={data.uncStatus === "active" ? "Active UNC overlap" : data.uncStatus === "prior" ? "Prior UNC tie" : "No UNC tie confirmed"} kind={data.uncStatus} />
        {data.pills.filter((p) => !p.startsWith("Active NIH") && !p.startsWith("UNC research")).map((p) => <Pill key={p} text={p} kind="signal" />)}
      </div>

      {/* Stat bar */}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${data.stats.length}, 1fr)`, gap: 1, background: BORDER, borderRadius: 12, overflow: "hidden", marginBottom: 16 }}>
        {data.stats.map((s, i) => (
          <div key={i} style={{ background: "#fafafad0", padding: "14px 16px" }}>
            <p style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.02em", color: INK, margin: 0 }}>{s.value}</p>
            <p style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: MUTED, margin: "2px 0 0" }}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* Links */}
      {data.links.length > 0 && (
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginBottom: 18 }}>
          {data.links.map((l, i) => (
            <a key={i} href={l.url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: BLUE, textDecoration: "none" }}>↗ {l.label}</a>
          ))}
        </div>
      )}

      {/* Body grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32 }}>
        <div>
          {data.company.length > 0 && <><SectionLabel>Company</SectionLabel><Bullets items={data.company} /></>}
          {data.problem.length > 0 && <div style={{ marginTop: 16 }}><SectionLabel>Problem</SectionLabel><Bullets items={data.problem} /></div>}
          {data.goal.length > 0 && <div style={{ marginTop: 16 }}><SectionLabel>Goal</SectionLabel><Bullets items={data.goal} /></div>}
          {data.rdPeers.length > 0 && <div style={{ marginTop: 16 }}><SectionLabel>R&D vs sector peers</SectionLabel><RdChart peers={data.rdPeers} /></div>}
        </div>
        <div>
          {data.contacts.length > 0 && <><SectionLabel>UNC Contacts &amp; Resources</SectionLabel><ContactsTable rows={data.contacts} /></>}
          {data.assets.length > 0 && <div style={{ marginTop: 16 }}><SectionLabel>UNC Data Assets</SectionLabel><AssetsTable rows={data.assets} /></div>}
          {data.solution.length > 0 && <div style={{ marginTop: 16 }}><SectionLabel>Solution</SectionLabel><Bullets items={data.solution} /></div>}
        </div>
      </div>

      {/* Talking points */}
      {data.talkingPoints.length > 0 && (
        <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 18, marginTop: 18 }}>
          <SectionLabel>Talking Points</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 28px" }}>
            {data.talkingPoints.map((tp: CardTalkingPoint, i) => (
              <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 0", borderBottom: i < data.talkingPoints.length - (data.talkingPoints.length % 2 === 0 ? 2 : 1) ? `1px solid ${BORDER}` : "none" }}>
                <span style={{ width: 6, height: 6, borderRadius: 999, background: INK, marginTop: 7, flexShrink: 0 }} />
                <p style={{ fontSize: 13.5, color: MUTED, lineHeight: 1.45, margin: 0 }}>
                  <A href={tp.boldUrl} bold>{tp.bold}</A>{tp.rest ? ` ${tp.rest}` : ""}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* OSP flag */}
      {data.ospFlag && (
        <div style={{ background: "#fdeceb", borderRadius: 10, padding: "8px 12px", marginTop: 14, fontSize: 11.5, color: "#b3261e", display: "flex", gap: 6, alignItems: "flex-start" }}>
          <span>⚠</span>
          <span>
            {data.ospGrantCount} active NIH grant{data.ospGrantCount === 1 ? "" : "s"} · verify with{" "}
            <a href="https://research.unc.edu/osp" target="_blank" rel="noreferrer" style={{ color: "#b3261e", textDecoration: "underline" }}>UNC OSP</a>{" "}
            before contact
          </span>
        </div>
      )}
    </section>
  );
}
