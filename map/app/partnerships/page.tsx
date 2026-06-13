"use client";

import { useState } from "react";
import { FONT, cardStyle, Loading, EmptyGlyph } from "@/components/workspace/ui";

const HEADER_H = 52;

type Mode = "company" | "sector";

type Paper = {
  pmid: string;
  title: string;
  authors: string[];
  journal: string;
  year: string;
  url: string;
};
type Filing = { form: string; date: string; url: string; quotes: string[] };
type Mention = { title: string; url: string };

// A normalized, company-labeled view of the resolver payload so a single
// company result and a sector's Top-10 list render through the same canvas.
type Normalized = {
  papers: { company: string; paper: Paper }[];
  authors: { company: string; name: string; papers: number }[];
  filings: { company: string; filing: Filing }[];
  mentions: { company: string; mention: Mention }[];
};

// takes: an optional pixel size,
// does: draws the node-graph brand glyph used in the header,
// returns: the logo SVG element.
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

// takes: the raw resolver payload (company or sector shape),
// does: flattens it into one company-labeled structure for rendering,
// returns: a Normalized object with papers, authors, filings, and mentions.
function normalize(data: any): Normalized {
  const out: Normalized = { papers: [], authors: [], filings: [], mentions: [] };
  const companies = data?.type === "sector" ? data?.companies ?? [] : [data];
  for (const c of companies) {
    if (!c) continue;
    const name = c.company ?? data?.query ?? "";
    for (const p of c.research?.papers ?? []) out.papers.push({ company: name, paper: p });
    for (const a of c.research?.top_authors ?? [])
      out.authors.push({ company: name, name: a.name, papers: a.papers });
    for (const f of c.financial?.filings ?? []) out.filings.push({ company: name, filing: f });
    for (const m of c.ecosystem?.mentions ?? []) out.mentions.push({ company: name, mention: m });
  }
  return out;
}

// takes: a section title and its children,
// does: renders one minimalist glass result panel with an uppercase eyebrow,
// returns: a card section element.
function ResultCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      data-testid="result-card"
      style={{ ...cardStyle, display: "flex", flexDirection: "column", flex: 1, minWidth: 280 }}
    >
      <div
        style={{
          padding: "16px 22px 12px",
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "#a8a8ad",
        }}
      >
        {title}
      </div>
      <div style={{ padding: "0 22px 22px", borderTop: "1px solid rgba(0,0,0,0.04)" }}>
        {children}
      </div>
    </section>
  );
}

// takes: a company-prefix string,
// does: renders a small muted company tag (only shown for sector results),
// returns: a span element, or null when there is nothing to label.
function CompanyTag({ company, show }: { company: string; show: boolean }) {
  if (!show || !company) return null;
  return (
    <span style={{ fontSize: 11, color: "#86868b", fontWeight: 600 }}>{company} · </span>
  );
}

// takes: a label and a verbatim quote string,
// does: renders an exact-source blockquote so facts stay clinically verifiable,
// returns: a styled quote element.
function Quote({ text, href }: { text: string; href: string }) {
  return (
    <blockquote
      style={{
        margin: "0 0 10px",
        padding: "10px 14px",
        background: "rgba(0,0,0,0.025)",
        borderLeft: "3px solid rgba(0,0,0,0.18)",
        borderRadius: 8,
        fontSize: 13,
        lineHeight: 1.5,
        color: "#1d1d1f",
      }}
    >
      “{text}”
      {href && (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          style={{ display: "block", marginTop: 6, fontSize: 11.5, color: "#0066cc" }}
        >
          View source ↗
        </a>
      )}
    </blockquote>
  );
}

// takes: a muted hint string,
// does: renders the intentional empty state inside a result card,
// returns: a centered placeholder element.
function CardEmpty({ hint }: { hint: string }) {
  return (
    <div style={{ textAlign: "center", color: "#b6b6bc", fontSize: 13 }}>
      <EmptyGlyph />
      <div style={{ marginTop: -24 }}>{hint}</div>
    </div>
  );
}

// takes: nothing (page component),
// does: renders the Partnerships canvas — a search bar with a Company|Sector
//       toggle and three verbatim-source result cards (Research, Financial,
//       Ecosystem) that map verifiable UNC↔company relationships,
// returns: the Partnerships page element.
export default function PartnershipsPage() {
  const [mode, setMode] = useState<Mode>("company");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [data, setData] = useState<Normalized | null>(null);
  const [error, setError] = useState("");

  const isSector = mode === "sector";

  // takes: nothing (reads component state),
  // does: posts the query to /api/partnerships and normalizes the response,
  //       always landing on a rendered three-card canvas (even when empty),
  // returns: nothing.
  async function search() {
    const q = query.trim();
    if (!q) return;
    setStatus("loading");
    setError("");
    try {
      const res = await fetch("/api/partnerships", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q, type: mode }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `Lookup failed (${res.status})`);
      setData(normalize(json));
      setStatus("done");
    } catch (e: any) {
      // Still render the (empty) canvas so the relationship view never vanishes
      // on a flaky upstream — the cards show their empty states instead.
      setData({ papers: [], authors: [], filings: [], mentions: [] });
      setError(e?.message ?? "Lookup failed");
      setStatus("done");
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
      {/* Header chrome — matches the main workspace shell. */}
      <header
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          height: HEADER_H,
          zIndex: 100,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 20px",
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
          <span style={{ fontSize: 16, fontWeight: 600, letterSpacing: "0.32em", color: "#1d1d1f" }}>
            map
          </span>
        </a>
        <span style={{ fontSize: 13, color: "#86868b", letterSpacing: "0.04em" }}>Partnerships</span>
      </header>

      <main
        style={{
          maxWidth: 1120,
          margin: "0 auto",
          padding: `${HEADER_H + 48}px 24px 64px`,
        }}
      >
        {/* Hero */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <h1 style={{ fontSize: 30, fontWeight: 600, margin: "0 0 8px", letterSpacing: "-0.02em" }}>
            UNC Partnership Map
          </h1>
          <p style={{ fontSize: 15, color: "#86868b", margin: 0 }}>
            Verifiable relationships between UNC Chapel Hill and any company or sector.
          </p>
        </div>

        {/* Search row + toggle */}
        <div
          style={{
            ...cardStyle,
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: 12,
            marginBottom: 28,
            flexWrap: "wrap",
          }}
        >
          {/* Toggle: Company | Sector */}
          <div
            role="group"
            aria-label="Search type"
            style={{
              display: "flex",
              background: "rgba(0,0,0,0.05)",
              borderRadius: 999,
              padding: 3,
            }}
          >
            {(["company", "sector"] as Mode[]).map((m) => (
              <button
                key={m}
                aria-pressed={mode === m}
                onClick={() => setMode(m)}
                style={{
                  border: "none",
                  cursor: "pointer",
                  borderRadius: 999,
                  padding: "8px 18px",
                  fontSize: 13,
                  fontWeight: 600,
                  fontFamily: FONT,
                  textTransform: "capitalize",
                  background: mode === m ? "#1d1d1f" : "transparent",
                  color: mode === m ? "#fff" : "#86868b",
                  transition: "all 0.15s ease",
                }}
              >
                {m}
              </button>
            ))}
          </div>

          <input
            aria-label={isSector ? "Sector" : "Company"}
            placeholder={isSector ? "e.g. Biotechnology, Semiconductors…" : "e.g. Apple, Pfizer, Eli Lilly…"}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
            style={{
              flex: 1,
              minWidth: 200,
              border: "1px solid rgba(0,0,0,0.08)",
              borderRadius: 12,
              padding: "12px 16px",
              fontSize: 15,
              fontFamily: FONT,
              outline: "none",
              background: "rgba(255,255,255,0.7)",
            }}
          />

          <button
            onClick={search}
            disabled={!query.trim() || status === "loading"}
            style={{
              border: "none",
              cursor: query.trim() ? "pointer" : "default",
              borderRadius: 12,
              padding: "12px 26px",
              fontSize: 14,
              fontWeight: 600,
              fontFamily: FONT,
              background: "#1d1d1f",
              color: "#fff",
              opacity: query.trim() && status !== "loading" ? 1 : 0.4,
            }}
          >
            Map it
          </button>
        </div>

        {error && (
          <div style={{ textAlign: "center", color: "#c0392b", fontSize: 13, marginBottom: 20 }}>
            {error}
          </div>
        )}

        {/* States */}
        {status === "idle" && (
          <div style={{ ...cardStyle, padding: 8 }}>
            <CardEmpty hint="Search a company or sector to map its UNC relationships." />
          </div>
        )}

        {status === "loading" && (
          <div style={{ ...cardStyle }}>
            <Loading label="Mapping verifiable relationships…" detail={query} />
          </div>
        )}

        {status === "done" && data && (
          <div
            data-testid="results-canvas"
            style={{ display: "flex", gap: 20, alignItems: "stretch", flexWrap: "wrap" }}
          >
            {/* Clinical / Research */}
            <ResultCard title="Clinical / Research">
              {data.papers.length === 0 ? (
                <CardEmpty hint="No co-authored publications found." />
              ) : (
                <>
                  {data.authors.length > 0 && (
                    <div style={{ fontSize: 12.5, color: "#515154", margin: "12px 0 14px" }}>
                      <strong>Top authors:</strong>{" "}
                      {data.authors.map((a) => `${a.name} (${a.papers})`).join(", ")}
                    </div>
                  )}
                  {data.papers.slice(0, 8).map(({ company, paper }, i) => (
                    <div key={paper.pmid + i} style={{ marginBottom: 14, fontSize: 13, lineHeight: 1.45 }}>
                      <CompanyTag company={company} show={isSector} />
                      <a
                        href={paper.url}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: "#1d1d1f", fontWeight: 600, textDecoration: "none" }}
                      >
                        {paper.title}
                      </a>
                      <div style={{ color: "#86868b", fontSize: 11.5, marginTop: 3 }}>
                        {paper.journal} {paper.year} · PMID {paper.pmid}
                      </div>
                    </div>
                  ))}
                </>
              )}
            </ResultCard>

            {/* Financial / Legal */}
            <ResultCard title="Financial / Legal">
              {data.filings.length === 0 ? (
                <CardEmpty hint="No verbatim UNC mentions in SEC filings." />
              ) : (
                data.filings.map(({ company, filing }, i) => (
                  <div key={filing.url + i} style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 12, color: "#515154", fontWeight: 600, margin: "10px 0 8px" }}>
                      <CompanyTag company={company} show={isSector} />
                      {filing.form} · {filing.date}
                    </div>
                    {filing.quotes.map((q, j) => (
                      <Quote key={j} text={q} href={filing.url} />
                    ))}
                  </div>
                ))
              )}
            </ResultCard>

            {/* University Ecosystem */}
            <ResultCard title="University Ecosystem">
              {data.mentions.length === 0 ? (
                <CardEmpty hint="No official unc.edu mentions found." />
              ) : (
                data.mentions.slice(0, 10).map(({ company, mention }, i) => (
                  <div key={mention.url + i} style={{ marginBottom: 12, fontSize: 13, lineHeight: 1.45 }}>
                    <CompanyTag company={company} show={isSector} />
                    <a
                      href={mention.url}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: "#0066cc", textDecoration: "none" }}
                    >
                      {mention.title || mention.url}
                    </a>
                  </div>
                ))
              )}
            </ResultCard>
          </div>
        )}
      </main>
    </div>
  );
}
