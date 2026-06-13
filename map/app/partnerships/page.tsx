"use client";

import { useState } from "react";
import Link from "next/link";
import { FONT } from "@/components/workspace/ui";

const HEADER_H = 52;
const SUBNAV_H = 44;

type PartnerType = "company" | "sector";

// Result shapes mirror the backend resolver payload (verbatim, source-linked).
interface Paper { pmid: string; title: string; authors: string[]; journal?: string; year?: string; url: string; company?: string; }
interface Quote { company?: string; text: string; filing_url?: string; }
interface Mention { title: string; url: string; company?: string; }
interface PartnerData {
  query: string;
  type: PartnerType;
  clinical: { count: number; top_authors: string[]; papers: Paper[] };
  financial: { quotes: (Quote | string)[]; filing_url?: string };
  ecosystem: Mention[];
}

// The workspace tabs. Partnerships is the active route; the others return to the
// single-page workspace at "/".
const TABS = [
  { label: "Dashboard", href: "/" },
  { label: "Company Profile", href: "/" },
  { label: "Sector Scan", href: "/" },
  { label: "Companies", href: "/" },
  { label: "Partnerships", href: "/partnerships", active: true },
];

// takes: nothing
// does: renders the fixed header + workspace sub-navigation, reusing the same
//       glass chrome as the main workspace so Partnerships feels native
// returns: the page chrome element
function Chrome() {
  return (
    <>
      <header
        style={{
          position: "fixed", top: 0, left: 0, right: 0, height: HEADER_H, zIndex: 100,
          display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px",
          background: "rgba(255,255,255,0.66)", backdropFilter: "saturate(180%) blur(20px)",
          borderBottom: "1px solid rgba(0,0,0,0.05)", fontFamily: FONT,
        }}
      >
        <Link href="/" aria-label="Map home" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
          <svg width={22} height={22} viewBox="0 0 24 24" aria-hidden>
            <circle cx="12" cy="12" r="3.2" fill="#1d1d1f" />
            {[0, 60, 120, 180, 240, 300].map((deg) => {
              const r = (deg * Math.PI) / 180;
              const x = 12 + 8.5 * Math.cos(r), y = 12 + 8.5 * Math.sin(r);
              return (
                <g key={deg}>
                  <line x1="12" y1="12" x2={x} y2={y} stroke="#1d1d1f" strokeWidth="1.1" />
                  <circle cx={x} cy={y} r="1.9" fill="#1d1d1f" />
                </g>
              );
            })}
          </svg>
          <span style={{ fontSize: 16, fontWeight: 600, letterSpacing: "0.32em", color: "#1d1d1f" }}>map</span>
        </Link>
      </header>
      <nav
        aria-label="Workspace views"
        style={{
          position: "fixed", top: HEADER_H, left: 0, right: 0, height: SUBNAV_H, zIndex: 90,
          display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          background: "rgba(255,255,255,0.55)", backdropFilter: "saturate(180%) blur(14px)",
          borderBottom: "1px solid rgba(0,0,0,0.04)", fontFamily: FONT,
        }}
      >
        {TABS.map((t) => (
          <Link key={t.label} href={t.href} className={`ws-nav-item ${t.active ? "active" : ""}`}
            aria-current={t.active ? "page" : undefined}>
            {t.label}
          </Link>
        ))}
      </nav>
    </>
  );
}

// takes: a card title, subtitle, and children
// does: renders one minimalist result panel
// returns: the card element
function Card({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.06)", borderRadius: 18, padding: 22, boxShadow: "0 8px 30px rgba(0,0,0,0.04)" }}>
      <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.16em", textTransform: "uppercase", color: "#9a9aa2", margin: 0 }}>{title}</p>
      <p style={{ fontSize: 13, color: "#6b6b73", margin: "4px 0 14px" }}>{subtitle}</p>
      {children}
    </div>
  );
}

// takes: a value that may be a Quote object or a plain string
// does: normalizes it to a { text, filing_url, company } shape
// returns: the normalized quote
function asQuote(q: Quote | string): Quote {
  return typeof q === "string" ? { text: q } : q;
}

// takes: nothing (page component)
// does: renders the Partnerships page — a Company|Sector toggle + search bar and
//       three source-linked result cards (Clinical, Financial, Ecosystem)
// returns: the Partnerships page element
export default function PartnershipsPage() {
  const [type, setType] = useState<PartnerType>("company");
  const [query, setQuery] = useState("");
  const [data, setData] = useState<PartnerData | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");

  // takes: a form submit event
  // does: posts the query+type to /api/partnerships and stores the result
  // returns: nothing (updates state)
  async function search(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setStatus("loading");
    setData(null);
    try {
      const res = await fetch("/api/partnerships", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q, type }),
      });
      const json = await res.json();
      if (!res.ok || !json.data) { setStatus("error"); return; }
      setData(json.data as PartnerData);
      setStatus("done");
    } catch {
      setStatus("error");
    }
  }

  return (
    <div style={{ fontFamily: FONT, minHeight: "100vh", color: "#1d1d1f", background: "#f5f5f7" }}>
      <Chrome />
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: `${HEADER_H + SUBNAV_H + 32}px 28px 48px` }}>
        <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.22em", textTransform: "uppercase", color: "#9a9aa2", margin: 0 }}>
          UNC × Industry
        </p>
        <h1 style={{ fontSize: 36, fontWeight: 700, letterSpacing: "-0.025em", margin: "10px 0 6px" }}>Partnerships</h1>
        <p style={{ fontSize: 15, color: "#6b6b73", margin: 0, maxWidth: 560 }}>
          Verifiable UNC links only — every fact below is tied to a primary source (PubMed, SEC filings, unc.edu). No summaries.
        </p>

        {/* Toggle + search */}
        <form onSubmit={search} style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", margin: "22px 0 0" }}>
          <div role="tablist" aria-label="Search type" style={{ display: "inline-flex", background: "#ececf0", borderRadius: 999, padding: 3 }}>
            {(["company", "sector"] as PartnerType[]).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={type === t}
                onClick={() => setType(t)}
                style={{
                  border: "none", cursor: "pointer", borderRadius: 999, padding: "7px 18px",
                  fontSize: 13.5, fontWeight: 600, textTransform: "capitalize",
                  background: type === t ? "#fff" : "transparent",
                  color: type === t ? "#1d1d1f" : "#8a8a92",
                  boxShadow: type === t ? "0 1px 4px rgba(0,0,0,0.1)" : "none",
                }}
              >
                {t}
              </button>
            ))}
          </div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={type === "company" ? "Company or ticker…" : "Sector — Oncology, Gene Therapy…"}
            aria-label="Partnership search"
            style={{
              flex: 1, minWidth: 240, border: "1px solid rgba(0,0,0,0.12)", borderRadius: 12,
              padding: "11px 15px", fontSize: 15, outline: "none", background: "#fff", fontFamily: FONT,
            }}
          />
          <button
            type="submit"
            disabled={status === "loading"}
            style={{
              border: "none", cursor: "pointer", borderRadius: 12, padding: "11px 22px",
              fontSize: 14, fontWeight: 500, color: "#fff", background: "#1d1d1f", whiteSpace: "nowrap",
            }}
          >
            {status === "loading" ? "Searching…" : "Search"}
          </button>
        </form>

        {status === "error" && (
          <p style={{ marginTop: 22, color: "#b91c1c", fontSize: 14 }}>Couldn&apos;t reach the partnership service. Try again.</p>
        )}

        {status === "done" && data && (
          <div data-testid="results-canvas" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16, marginTop: 28 }}>
            {/* Clinical / Research */}
            <div data-testid="card-clinical">
              <Card title="Clinical / Research" subtitle={`${data.clinical.count} co-authored paper(s) with UNC`}>
                {data.clinical.top_authors.length > 0 && (
                  <p style={{ fontSize: 12.5, color: "#6b6b73", margin: "0 0 12px" }}>
                    Top authors: {data.clinical.top_authors.join(", ")}
                  </p>
                )}
                {data.clinical.papers.length === 0 ? (
                  <p style={{ fontSize: 13, color: "#9a9aa2", margin: 0 }}>No co-authored papers found.</p>
                ) : (
                  <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 12 }}>
                    {data.clinical.papers.map((p) => (
                      <li key={p.pmid} style={{ borderLeft: "2px solid #e5e5ea", paddingLeft: 12 }}>
                        <a href={p.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13.5, color: "#1d1d1f", fontWeight: 500, textDecoration: "none" }}>
                          {p.title}
                        </a>
                        <p style={{ fontSize: 11.5, color: "#9a9aa2", margin: "3px 0 0" }}>
                          PMID {p.pmid}{p.company ? ` · ${p.company}` : ""}{p.year ? ` · ${p.year}` : ""}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>

            {/* Financial / Legal */}
            <div data-testid="card-financial">
              <Card title="Financial / Legal" subtitle="Verbatim SEC filing mentions of UNC">
                {data.financial.quotes.length === 0 ? (
                  <p style={{ fontSize: 13, color: "#9a9aa2", margin: 0 }}>No verbatim SEC mentions found.</p>
                ) : (
                  <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 12 }}>
                    {data.financial.quotes.map((raw, i) => {
                      const q = asQuote(raw);
                      const src = q.filing_url || data.financial.filing_url;
                      return (
                        <li key={i} style={{ background: "#faf9f7", borderRadius: 10, padding: 12 }}>
                          <p style={{ fontSize: 13, color: "#3a3a40", margin: 0, lineHeight: 1.5 }}>&ldquo;{q.text}&rdquo;</p>
                          <p style={{ fontSize: 11.5, margin: "6px 0 0" }}>
                            {q.company ? <span style={{ color: "#9a9aa2" }}>{q.company} · </span> : null}
                            {src ? <a href={src} target="_blank" rel="noopener noreferrer" style={{ color: "#5b6cff" }}>SEC filing →</a> : null}
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>
            </div>

            {/* University Ecosystem */}
            <div data-testid="card-ecosystem">
              <Card title="University Ecosystem" subtitle="Official unc.edu web mentions">
                {data.ecosystem.length === 0 ? (
                  <p style={{ fontSize: 13, color: "#9a9aa2", margin: 0 }}>No official UNC web mentions found.</p>
                ) : (
                  <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
                    {data.ecosystem.map((m, i) => (
                      <li key={i}>
                        <a href={m.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13.5, color: "#1d1d1f", textDecoration: "none" }}>
                          {m.title}
                        </a>
                        {m.company ? <span style={{ fontSize: 11.5, color: "#9a9aa2" }}> · {m.company}</span> : null}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
