"use client";

import { useState } from "react";
import { FONT } from "./ui";

type PartnerType = "company" | "sector";

// Result shapes mirror the backend resolver payload (verbatim, source-linked).
interface Paper { pmid: string; title: string; authors: string[]; journal?: string; year?: string; url: string; company?: string; }
interface Quote { company?: string; text: string; filing_url?: string; }
interface Mention { title: string; url: string; company?: string; }
interface Unit { unit: string; count: number; }
interface PartnerData {
  query: string;
  resolved_name?: string;
  type: PartnerType;
  links?: { pubmed?: string; edgar?: string; unc_web?: string };
  clinical: { count: number; top_authors: string[]; papers: Paper[] };
  coi?: { count: number; papers: Paper[]; window_years: number };
  unc_units?: Unit[];
  financial: { quotes: (Quote | string)[]; filing_url?: string };
  ecosystem: Mention[];
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

// takes: an external href and a button label
// does: renders a pill-style link that opens a primary-source database in a new
//       tab (never underlined, matching the app's link styling)
// returns: the source-link element
function SourceLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        fontSize: 12.5, fontWeight: 500, color: "#1d1d1f", textDecoration: "none",
        background: "#fff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 999, padding: "6px 14px",
      }}
    >
      {label} →
    </a>
  );
}

// takes: a value that may be a Quote object or a plain string
// does: normalizes it to a { text, filing_url, company } shape
// returns: the normalized quote
function asQuote(q: Quote | string): Quote {
  return typeof q === "string" ? { text: q } : q;
}

// takes: nothing
// does: renders the Partnerships content — a Company|Sector toggle + search bar
//       and the three source-linked result cards plus the Conflict-of-Interest
//       panel. Self-contained and chrome-free so it can mount both as the
//       standalone /partnerships route and as an in-app workspace view (the
//       latter keeps navigation reload-free, so the intro never replays).
// returns: the Partnerships view element
export default function PartnershipsView() {
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
    <div style={{ maxWidth: 1100, margin: "0 auto", width: "100%", fontFamily: FONT, color: "#1d1d1f" }}>
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
        <div data-testid="results-canvas" style={{ marginTop: 28, display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Typo correction notice — shown only when the backend resolved the
              query to a different official company name. */}
          {data.resolved_name &&
            data.resolved_name.trim().toLowerCase() !== data.query.trim().toLowerCase() && (
              <p data-testid="resolved-notice" style={{ fontSize: 13.5, color: "#6b6b73", margin: 0 }}>
                Showing verifiable results for: <strong style={{ color: "#1d1d1f" }}>{data.resolved_name}</strong>
              </p>
            )}

          {/* Jump-to-source links — open the primary databases directly */}
          {data.links && (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {data.links.pubmed && <SourceLink href={data.links.pubmed} label="Open in PubMed" />}
              {data.links.edgar && <SourceLink href={data.links.edgar} label="SEC EDGAR filings" />}
              {data.links.unc_web && <SourceLink href={data.links.unc_web} label="Search unc.edu" />}
            </div>
          )}

          {/* Conflict of Interest — emphasized: disclosures from the last 5 years */}
          <div data-testid="card-coi" style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 18, padding: 22 }}>
            <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.16em", textTransform: "uppercase", color: "#9a3412", margin: 0 }}>
              Conflict of Interest · last {data.coi?.window_years ?? 5} years
            </p>
            <p style={{ fontSize: 13, color: "#9a6b4a", margin: "4px 0 14px" }}>
              UNC-authored papers that disclosed a financial relationship with {data.query} (consulting, equity, or funding).
            </p>
            {!data.coi || data.coi.papers.length === 0 ? (
              <p style={{ fontSize: 13, color: "#b08968", margin: 0 }}>No disclosed conflicts of interest found in the last 5 years.</p>
            ) : (
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 12 }}>
                {data.coi.papers.map((p) => (
                  <li key={p.pmid} style={{ borderLeft: "2px solid #fdba74", paddingLeft: 12 }}>
                    <a href={p.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13.5, color: "#7c2d12", fontWeight: 500, textDecoration: "none" }}>{p.title}</a>
                    <p style={{ fontSize: 11.5, color: "#b08968", margin: "3px 0 0" }}>
                      PMID {p.pmid}{p.company ? ` · ${p.company}` : ""}{p.year ? ` · ${p.year}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Three source-linked panels */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
            <div data-testid="card-clinical">
              <Card title="Clinical / Research" subtitle={`${data.clinical.count} co-authored paper(s) with UNC`}>
                {data.unc_units && data.unc_units.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
                    {data.unc_units.map((u) => (
                      <span key={u.unit} style={{ fontSize: 11.5, background: "#eef0ff", color: "#4451c8", borderRadius: 999, padding: "3px 10px" }}>
                        {u.unit} · {u.count}
                      </span>
                    ))}
                  </div>
                )}
                {data.clinical.top_authors.length > 0 && (
                  <p style={{ fontSize: 12.5, color: "#6b6b73", margin: "0 0 12px" }}>Top authors: {data.clinical.top_authors.join(", ")}</p>
                )}
                {data.clinical.papers.length === 0 ? (
                  <p style={{ fontSize: 13, color: "#9a9aa2", margin: 0 }}>No co-authored papers found.</p>
                ) : (
                  <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 12 }}>
                    {data.clinical.papers.map((p) => (
                      <li key={p.pmid} style={{ borderLeft: "2px solid #e5e5ea", paddingLeft: 12 }}>
                        <a href={p.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13.5, color: "#1d1d1f", fontWeight: 500, textDecoration: "none" }}>{p.title}</a>
                        <p style={{ fontSize: 11.5, color: "#9a9aa2", margin: "3px 0 0" }}>
                          PMID {p.pmid}{p.company ? ` · ${p.company}` : ""}{p.year ? ` · ${p.year}` : ""}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>

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

            <div data-testid="card-ecosystem">
              <Card title="University Ecosystem" subtitle="Official unc.edu web mentions">
                {data.ecosystem.length === 0 ? (
                  <p style={{ fontSize: 13, color: "#9a9aa2", margin: 0 }}>
                    No official UNC web mentions found. <a href={data.links?.unc_web} target="_blank" rel="noopener noreferrer" style={{ color: "#5b6cff" }}>Search unc.edu →</a>
                  </p>
                ) : (
                  <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
                    {data.ecosystem.map((m, i) => (
                      <li key={i}>
                        <a href={m.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13.5, color: "#1d1d1f", textDecoration: "none" }}>{m.title}</a>
                        {m.company ? <span style={{ fontSize: 11.5, color: "#9a9aa2" }}> · {m.company}</span> : null}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
