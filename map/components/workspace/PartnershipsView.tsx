"use client";

import { useEffect, useRef, useState } from "react";
import { FONT } from "./ui";
import { ACCOUNTS } from "@/components/workspace/accountsData";
import { authFetch } from "@/lib/authFetch";
import MarkdownArticle from "@/app/components/MarkdownArticle";
import { CompanyExportBar } from "./CompanyExportBar";
import { ProjectSaveControl } from "./ProjectSaveControl";
import { SaveControl } from "./SavedReports";
import type { SavedReportsState } from "./useSavedReports";

type PartnerType = "company" | "sector";

// Result shapes mirror the backend resolver payload (verbatim, source-linked).
interface Paper { pmid: string; title: string; authors: string[]; journal?: string; year?: string; url: string; company?: string; }
interface Quote { company?: string; text: string; filing_url?: string; }
interface Mention { title: string; url: string; company?: string; }
interface Unit { unit: string; count: number; }
interface Grant { project_num: string; title: string; pi: string; department: string; fiscal_year: string | number; url: string; }
interface PI { name: string; org: string; project_title: string; grant_url: string; }
// unc_signal is the matched facility/collaborator NAME (a string), or "" — not a
// boolean. Truthiness, not `=== true`, is the correct UNC-site test.
interface Trial { nct_id: string; title: string; phase: string; status: string; lead_sponsor: string; collaborators: string[]; unc_signal: string | boolean; url: string; }
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
  nih_grants?: Grant[];
  nih_pis?: PI[];
  trials?: Trial[];
  trials_total?: number;
}

// Static UNC partnership assets — copied VERBATIM from the backend
// aria_pi/data/unc_programs.json (partnership_models + nc_access). The backend
// JSON is not bundled into the frontend, so the canonical values are embedded
// here rather than invented. partnership_models carry no URLs in the source, so
// none are shown for them.
const PARTNERSHIP_MODELS: { model: string; unit: string }[] = [
  { model: "Sponsored Research Agreement", unit: "UNC Office of Sponsored Research" },
  { model: "License / IP Commercialization", unit: "UNC Office of Technology Commercialization" },
  { model: "Clinical Research Collaboration", unit: "UNC Health / NC TraCS" },
];
const NC_ACCESS: { asset: string; description: string; url: string }[] = [
  {
    asset: "UNC Health",
    description: "Academic health system operating hospitals and clinics across North Carolina, with research partnerships through NC TraCS.",
    url: "https://www.unchealth.org",
  },
  {
    asset: "NC AHEC Network",
    description: "Statewide rural and community health network supporting training, telehealth, and access for partner research.",
    url: "https://www.ncahec.net",
  },
];

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

// takes: an uppercase eyebrow label
// does: renders the shared 11px tracked muted section label
// returns: the eyebrow element
function Eyebrow({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.16em", textTransform: "uppercase", color: "#9a9aa2", margin: 0, ...style }}>
      {children}
    </p>
  );
}

// The 24 highlighted companies, grouped, used as idle-state quick searches.
const COMPANY_GROUPS: { label: string; names: string[] }[] = [
  { label: "AI & Cloud", names: ["Microsoft", "Google", "Amazon Web Services (AWS)", "NVIDIA", "OpenAI", "Anthropic"] },
  { label: "Enterprise Software", names: ["Salesforce", "Oracle", "SAS Institute", "Databricks", "Snowflake", "Palantir Technologies"] },
  { label: "Hardware & Devices", names: ["Apple", "Lenovo", "Cisco", "IBM", "Red Hat (IBM)", "Splunk (Cisco)"] },
  { label: "Defense & Energy", names: ["Lockheed Martin", "Leidos", "Duke Energy", "Bandwidth", "Epic Games", "Meta"] },
];
const SECTOR_CHIPS = ["Artificial Intelligence", "Cybersecurity", "Cloud Computing", "Semiconductors", "Health IT", "Defense"];

const CHIP_CLASS = "rounded-full bg-white/80 border border-black/[0.06] hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-pointer";

// takes: the resolved partnership data
// does: renders the same evidence into a downloadable Markdown report — the
//       document the export bar (PDF / DOCX / Markdown) and the saved-report /
//       project snapshots all serialize. Mirrors the on-screen sections so the
//       file matches what the user sees. Every line traces to a primary source.
// returns: the report Markdown string
function buildPartnershipMarkdown(data: PartnerData): string {
  const resolvedName = data.resolved_name ?? data.query;
  const paperCount = data.clinical.count;
  const secMentions = data.financial.quotes.length;
  const nihGrants = data.nih_grants ?? [];
  const nihPis = data.nih_pis ?? [];
  const trials = data.trials ?? [];
  const coiCount = data.coi?.count ?? 0;
  const units = data.unc_units ?? [];
  const isPartner = paperCount > 0 || secMentions > 0 || nihGrants.length > 0 || trials.length > 0;
  const depth =
    (paperCount > 3 || secMentions > 0 || nihGrants.length > 0 || trials.length > 0) ? "Active"
    : (paperCount >= 1 || coiCount > 0) ? "Exploratory"
    : "None confirmed";

  const L: string[] = [];
  L.push(`# ${resolvedName}: UNC Partnership Report`);
  L.push("");
  L.push(`_Relationship depth: **${depth}** · ${isPartner ? "UNC Partner" : "Not yet a partner"} · assembled from public primary sources_`);
  L.push("");

  L.push("## Partnership Status");
  L.push("");
  L.push(
    isPartner
      ? `${resolvedName} has a verifiable research relationship with UNC Chapel Hill.`
      : `No public research relationship with UNC was found in PubMed, NIH RePORTER, or SEC filings. This reflects publicly indexed academic and financial data only — operational relationships (IT deployments, hiring, clinical pilots) are not captured here.`
  );
  L.push("");
  L.push(`- Co-authored papers with UNC: **${paperCount}**`);
  L.push(`- NIH RePORTER grants (UNC, mentioning ${resolvedName}): **${nihGrants.length}**`);
  L.push(`- Clinical trials with UNC as a site/collaborator: **${trials.length}**`);
  L.push(`- Verbatim SEC filing mentions of UNC: **${secMentions}**`);
  L.push(`- Conflict-of-interest disclosures (last ${data.coi?.window_years ?? 5} years): **${coiCount}**`);
  L.push("");

  L.push("## UNC Research Contacts");
  L.push("");
  if (nihPis.length > 0) {
    nihPis.forEach((p) => {
      L.push(`- **${p.name}** — ${p.org || "UNC Chapel Hill"}. ${p.project_title}${p.grant_url ? ` ([NIH grant](${p.grant_url}))` : ""}`);
    });
  } else if (data.clinical.top_authors.length > 0) {
    data.clinical.top_authors.forEach((a) => L.push(`- ${a} · UNC Chapel Hill`));
  } else {
    L.push("_No named UNC investigators found in public grant or publication records._");
  }
  L.push("");

  L.push("## Active Programs — ClinicalTrials.gov");
  L.push("");
  if (trials.length > 0) {
    trials.forEach((t) => {
      const meta = [t.nct_id, t.phase, t.status].filter(Boolean).join(" · ");
      L.push(`- [${t.title}](${t.url}) — ${meta}${t.unc_signal ? " · **UNC site**" : ""}`);
    });
  } else if ((data.trials_total ?? 0) > 0) {
    L.push(`${resolvedName} sponsors ${data.trials_total} active trial(s) — none with UNC listed as a site.`);
  } else {
    L.push("_No active clinical trials found with UNC as a collaborator._");
  }
  L.push("");

  if (units.length > 0) {
    L.push("## UNC Units Involved");
    L.push("");
    units.forEach((u) => L.push(`- ${u.unit} · ${u.count} paper${u.count !== 1 ? "s" : ""}`));
    L.push("");
  }

  L.push("## Verifiable Evidence");
  L.push("");
  L.push(`### Clinical / Research — ${paperCount} co-authored paper(s)`);
  L.push("");
  if (data.clinical.papers.length > 0) {
    data.clinical.papers.forEach((p) => L.push(`- [${p.title}](${p.url}) — PMID ${p.pmid}${p.year ? ` · ${p.year}` : ""}`));
  } else {
    L.push("_No co-authored papers found._");
  }
  L.push("");
  L.push(`### Conflict of Interest — last ${data.coi?.window_years ?? 5} years`);
  L.push("");
  if (data.coi && data.coi.papers.length > 0) {
    data.coi.papers.forEach((p) => L.push(`- [${p.title}](${p.url}) — PMID ${p.pmid}${p.year ? ` · ${p.year}` : ""}`));
  } else {
    L.push("_No disclosed conflicts of interest found._");
  }
  L.push("");
  L.push("### Financial / Legal — verbatim SEC mentions of UNC");
  L.push("");
  if (data.financial.quotes.length > 0) {
    data.financial.quotes.forEach((raw) => {
      const q = typeof raw === "string" ? { text: raw, filing_url: "" } : raw;
      const src = q.filing_url || data.financial.filing_url;
      L.push(`> ${q.text}${src ? ` — [SEC filing](${src})` : ""}`);
      L.push("");
    });
  } else {
    L.push("_No verbatim SEC mentions found._");
    L.push("");
  }
  L.push("### University Ecosystem — official unc.edu mentions");
  L.push("");
  if (data.ecosystem.length > 0) {
    data.ecosystem.forEach((m) => L.push(`- [${m.title}](${m.url})`));
  } else {
    L.push("_No official UNC web mentions found._");
  }
  L.push("");

  L.push(`## ${isPartner ? "Deepen the Relationship" : "Why UNC"}`);
  L.push("");
  const inventoryMatch = ACCOUNTS.find((a) =>
    a.account.toLowerCase().includes(resolvedName.toLowerCase()) ||
    resolvedName.toLowerCase().includes(a.account.toLowerCase())
  );
  if (inventoryMatch?.linkToReport) {
    L.push(`- 📄 **Partnership Profile on file** — [open the full background profile for ${inventoryMatch.account}](${inventoryMatch.linkToReport})`);
  }
  L.push("");
  L.push("**UNC partnership models**");
  PARTNERSHIP_MODELS.forEach((m) => L.push(`- ${m.model} → ${m.unit}`));
  L.push("");
  L.push("**UNC research assets**");
  NC_ACCESS.forEach((a) => L.push(`- **${a.asset}** — ${a.description} (${a.url})`));
  L.push("");

  L.push("## Sources");
  L.push("");
  if (data.links?.pubmed) L.push(`- PubMed: ${data.links.pubmed}`);
  if (data.links?.edgar) L.push(`- SEC EDGAR: ${data.links.edgar}`);
  if (data.links?.unc_web) L.push(`- unc.edu: ${data.links.unc_web}`);
  L.push("");
  L.push("_Signals from PubMed co-authorship, NIH RePORTER grants, ClinicalTrials.gov, and SEC filings. Operational relationships (IT contracts, hiring, clinical pilots) are not indexed in public research databases and may not appear above._");

  return L.join("\n");
}

// takes: nothing
// does: renders the Partnerships content — answers the two BD questions ("are
//       they a UNC partner, and where" / "if not, why should they be") from
//       verified, source-linked public data only (PubMed, NIH RePORTER,
//       ClinicalTrials.gov, SEC EDGAR, unc_programs.json). Self-contained and
//       chrome-free so it mounts both as the in-app UNC view and the standalone
//       /partnerships route.
// returns: the Partnerships view element
export default function PartnershipsView({
  saved,
  initialQuery,
}: {
  saved?: SavedReportsState;
  initialQuery?: string;
} = {}) {
  const [type, setType] = useState<PartnerType>("company");
  const [query, setQuery] = useState("");
  const [data, setData] = useState<PartnerData | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const whyRef = useRef<HTMLDivElement | null>(null);

  // Reopening a saved UNC report (or a Save-to-Project snapshot) lands here with
  // an initialQuery — re-run its live company lookup so the freshest evidence
  // shows. Empty/unset initialQuery leaves the idle state untouched.
  useEffect(() => {
    const q = (initialQuery ?? "").trim();
    if (q) runSearch(q, "company");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery]);

  // takes: a query string and a search type
  // does: posts to /api/partnerships and stores the result, syncing the visible
  //       toggle/input to what was searched
  // returns: nothing (updates state)
  async function runSearch(q: string, t: PartnerType) {
    const trimmed = q.trim();
    if (!trimmed) return;
    setType(t);
    setQuery(trimmed);
    setStatus("loading");
    setData(null);
    try {
      const res = await authFetch("/api/partnerships", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: trimmed, type: t }),
      });
      const json = await res.json();
      if (!res.ok || !json.data) { setStatus("error"); return; }
      setData(json.data as PartnerData);
      setStatus("done");
    } catch {
      setStatus("error");
    }
  }

  // takes: a form submit event
  // does: runs the search for the current input + toggle
  // returns: nothing
  function search(e: React.FormEvent) {
    e.preventDefault();
    runSearch(query, type);
  }

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", width: "100%", fontFamily: FONT, color: "#1d1d1f" }}>
      {/* Static intelligence header — flat on the white canvas (matches the
          Company view's eyebrow/title treatment, no card chrome). */}
      <div style={{ marginBottom: 22 }}>
        <Eyebrow style={{ letterSpacing: "0.14em" }}>Company Profile · UNC</Eyebrow>
        <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", margin: "10px 0 0" }}>UNC Partnership Intelligence</h2>
        <p style={{ fontSize: 14, color: "#6b6b73", margin: "6px 0 0", maxWidth: 640 }}>
          Signals derived from PubMed co-authorship, NIH RePORTER grants, ClinicalTrials.gov, disclosed conflicts of interest, and verbatim SEC filing mentions — every fact links to its primary source.
        </p>
        <hr style={{ border: "none", borderTop: "1px solid rgba(0,0,0,0.06)", margin: "16px 0 0" }} />
      </div>

      <Eyebrow style={{ letterSpacing: "0.22em" }}>UNC × Industry</Eyebrow>
      <h1 style={{ fontSize: 36, fontWeight: 700, letterSpacing: "-0.025em", margin: "10px 0 6px" }}>Partnerships</h1>
      <p style={{ fontSize: 15, color: "#6b6b73", margin: 0, maxWidth: 560 }}>
        Verifiable UNC links only — every fact below is tied to a primary source (PubMed, NIH RePORTER, ClinicalTrials.gov, SEC filings, unc.edu). No summaries.
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
          placeholder={type === "company" ? "Company or ticker…" : "Sector — Artificial Intelligence, Health IT…"}
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

      {/* Idle state — depth legend, the 24 highlighted companies grouped, and
          the sector quick-searches. */}
      {status === "idle" && (
        <div style={{ marginTop: 26 }}>
          {/* Depth legend */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 26 }}>
            {[
              { dot: "●", color: "#16a34a", label: "Active", note: "3+ papers, NIH grant, or UNC trial site" },
              { dot: "●", color: "#d97706", label: "Exploratory", note: "1–2 papers or COI disclosure" },
              { dot: "○", color: "#9ca3af", label: "None confirmed", note: "no public research signals" },
            ].map((d) => (
              <span key={d.label} style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12.5, color: "#6b6b73", background: "#fff", border: "1px solid rgba(0,0,0,0.06)", borderRadius: 999, padding: "6px 13px" }}>
                <span style={{ color: d.color, fontSize: 13 }}>{d.dot}</span>
                <strong style={{ color: "#1d1d1f", fontWeight: 600 }}>{d.label}</strong>
                <span>· {d.note}</span>
              </span>
            ))}
          </div>

          {COMPANY_GROUPS.map((g) => (
            <div key={g.label} style={{ marginBottom: 18 }}>
              <Eyebrow style={{ margin: "0 0 10px" }}>{g.label}</Eyebrow>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {g.names.map((c) => (
                  <button key={c} onClick={() => runSearch(c, "company")} className={CHIP_CLASS} style={{ padding: "6px 14px", fontSize: 13.5, fontWeight: 500, color: "#1d1d1f" }}>
                    {c}
                  </button>
                ))}
              </div>
            </div>
          ))}

          <Eyebrow style={{ margin: "22px 0 10px" }}>…or a whole sector</Eyebrow>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {SECTOR_CHIPS.map((s) => (
              <button key={s} onClick={() => runSearch(s, "sector")} className={CHIP_CLASS} style={{ padding: "6px 14px", fontSize: 13.5, fontWeight: 500, color: "#1d1d1f" }}>
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {status === "error" && (
        <p style={{ marginTop: 22, color: "#b91c1c", fontSize: 14 }}>Couldn&apos;t reach the partnership service. Try again.</p>
      )}

      {status === "done" && data && (() => {
        const resolvedName = data.resolved_name ?? data.query;
        const paperCount = data.clinical.count;
        const secMentions = data.financial.quotes.length;
        const nihGrants = data.nih_grants?.length ?? 0;
        const nihPis = data.nih_pis ?? [];
        const uncTrials = data.trials ?? [];
        const uncTrialCount = uncTrials.length;
        const coiCount = data.coi?.count ?? 0;
        const units = data.unc_units ?? [];

        const isPartner = paperCount > 0 || secMentions > 0 || nihGrants > 0 || uncTrialCount > 0;
        const depth =
          (paperCount > 3 || secMentions > 0 || nihGrants > 0 || uncTrialCount > 0) ? "Active"
          : (paperCount >= 1 || coiCount > 0) ? "Exploratory"
          : "None confirmed";
        const depthColor = depth === "Active" ? "#16a34a" : depth === "Exploratory" ? "#d97706" : "#9ca3af";

        const inventoryMatch = ACCOUNTS.find((a) =>
          a.account.toLowerCase().includes(resolvedName.toLowerCase()) ||
          resolvedName.toLowerCase().includes(a.account.toLowerCase())
        );

        return (
          <div data-testid="results-canvas" style={{ marginTop: 28, display: "flex", flexDirection: "column", gap: 16 }}>
            {/* ── Downloadable report — same Company-Profile chrome (title +
                export/save bar + rendered Markdown body, same font). The export
                bar and save controls serialize the full report Markdown. ───── */}
            {(() => {
              const reportMd = buildPartnershipMarkdown(data);
              const fileTitle = `${resolvedName} — UNC Partnership Report`;
              return (
                <div data-testid="unc-report" style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 6 }}>
                  <Eyebrow>UNC Partnership Report</Eyebrow>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <h2 style={{ fontFamily: FONT, fontSize: "clamp(28px,3.2vw,42px)", fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1.05, margin: 0, color: "#1d1d1f" }}>
                      {resolvedName}: UNC Partnership Report
                    </h2>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <CompanyExportBar markdown={reportMd} title={fileTitle} />
                      <ProjectSaveControl companyName={`${resolvedName} — UNC Partnership`} getMarkdown={() => reportMd} />
                      {saved && (
                        <SaveControl saved={saved} kind="partnership" query={resolvedName} title={`${resolvedName}: UNC Partnership Report`} getContent={() => reportMd} />
                      )}
                    </div>
                  </div>
                  <div className="workspace-md">
                    <MarkdownArticle markdown={reportMd.replace(/^#\s+.*\n?/, "")} />
                  </div>
                  <hr style={{ border: "none", borderTop: "1px solid rgba(0,0,0,0.08)", margin: "10px 0 0" }} />
                  <Eyebrow>Interactive detail · clickable sources</Eyebrow>
                </div>
              );
            })()}

            {/* Typo correction notice */}
            {data.resolved_name &&
              data.resolved_name.trim().toLowerCase() !== data.query.trim().toLowerCase() && (
                <p data-testid="resolved-notice" style={{ fontSize: 13.5, color: "#6b6b73", margin: 0 }}>
                  Showing verifiable results for: <strong style={{ color: "#1d1d1f" }}>{data.resolved_name}</strong>
                </p>
              )}

            {/* ── Section A — Partner Status Banner ───────────────────────── */}
            <div
              data-testid="partner-status-banner"
              style={{
                background: "#fff", border: "1px solid rgba(0,0,0,0.06)", borderLeft: `4px solid ${isPartner ? "#16a34a" : "#9ca3af"}`,
                borderRadius: 18, padding: 22, boxShadow: "0 8px 30px rgba(0,0,0,0.04)",
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20, flexWrap: "wrap",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 150 }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13, fontWeight: 600, color: depthColor }}>
                  <span>{isPartner ? "●" : "○"}</span> {depth}
                </span>
                <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.12em", color: isPartner ? "#16a34a" : "#6b7280" }}>
                  {isPartner ? "UNC PARTNER" : "NOT YET A PARTNER"}
                </span>
              </div>

              <div style={{ flex: 1, minWidth: 240 }}>
                {isPartner ? (
                  <p style={{ fontSize: 14.5, color: "#1d1d1f", margin: 0, lineHeight: 1.45 }}>
                    {resolvedName} has a verifiable research relationship with UNC Chapel Hill.
                  </p>
                ) : (
                  <>
                    <p style={{ fontSize: 14.5, color: "#1d1d1f", margin: 0, lineHeight: 1.45 }}>
                      No public research relationship found in PubMed, NIH RePORTER, or SEC filings.
                    </p>
                    <p style={{ fontSize: 12.5, color: "#9a9aa2", margin: "6px 0 0", lineHeight: 1.45 }}>
                      This reflects publicly indexed academic and financial data only — operational relationships (IT deployments, hiring, clinical pilots) are not captured here.
                    </p>
                  </>
                )}
              </div>

              <div style={{ textAlign: "right", minWidth: 150 }}>
                {isPartner ? (
                  <p style={{ fontSize: 12.5, color: "#6b6b73", margin: 0, lineHeight: 1.6 }}>
                    {paperCount} papers · {nihGrants} NIH grants · {uncTrialCount} UNC trials · {secMentions} SEC mentions
                  </p>
                ) : (
                  <button
                    onClick={() => whyRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
                    style={{ border: "none", background: "none", cursor: "pointer", fontSize: 13.5, fontWeight: 500, color: "#5b6cff", padding: 0 }}
                  >
                    See why UNC is a fit →
                  </button>
                )}
              </div>
            </div>

            {/* Jump-to-source links */}
            {data.links && (
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {data.links.pubmed && <SourceLink href={data.links.pubmed} label="Open in PubMed" />}
                {data.links.edgar && <SourceLink href={data.links.edgar} label="SEC EDGAR filings" />}
                {data.links.unc_web && <SourceLink href={data.links.unc_web} label="Search unc.edu" />}
              </div>
            )}

            {/* ── Section B — Where they partner with UNC ─────────────────── */}
            {isPartner && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
                {/* Sub-card 1 — UNC staff / PIs */}
                <Card title="UNC Research Contacts" subtitle="Named investigators from NIH grants and co-authored papers">
                  {nihPis.length > 0 ? (
                    <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 14 }}>
                      {nihPis.map((p, i) => (
                        <li key={`${p.name}-${i}`}>
                          <p style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>{p.name}</p>
                          {p.org && <p style={{ fontSize: 12, color: "#9a9aa2", margin: "2px 0 0" }}>{p.org}</p>}
                          {p.project_title && (
                            <p style={{ fontSize: 13, color: "#3a3a40", margin: "4px 0 0", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{p.project_title}</p>
                          )}
                          <a href={p.grant_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12.5, color: "#5b6cff", textDecoration: "none" }}>NIH grant →</a>
                        </li>
                      ))}
                    </ul>
                  ) : data.clinical.top_authors.length > 0 ? (
                    <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                      {data.clinical.top_authors.map((a) => (
                        <li key={a} style={{ fontSize: 13.5, color: "#1d1d1f" }}>
                          {a} · <span style={{ color: "#9a9aa2" }}>UNC Chapel Hill</span>
                          {data.links?.pubmed && (
                            <>{" "}<a href={data.links.pubmed} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12.5, color: "#5b6cff", textDecoration: "none" }}>Search PubMed →</a></>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p style={{ fontSize: 13, color: "#9a9aa2", margin: 0 }}>No named UNC investigators found in public grant or publication records.</p>
                  )}
                </Card>

                {/* Sub-card 2 — Active programs / trials */}
                <Card title="Active Programs" subtitle="ClinicalTrials.gov — UNC is a listed site or collaborator">
                  {uncTrials.length > 0 ? (
                    <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 14 }}>
                      {uncTrials.map((t) => (
                        <li key={t.nct_id} style={{ borderLeft: "2px solid #e5e5ea", paddingLeft: 12 }}>
                          <a href={t.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13.5, color: "#1d1d1f", fontWeight: 500, textDecoration: "none" }}>{t.title}</a>
                          <p style={{ fontSize: 11.5, color: "#9a9aa2", margin: "3px 0 0" }}>
                            {t.nct_id}{t.phase ? ` · ${t.phase}` : ""}{t.status ? ` · ${t.status}` : ""}
                          </p>
                          {t.unc_signal ? (
                            <span style={{ display: "inline-block", marginTop: 6, fontSize: 11, fontWeight: 600, color: "#15803d", background: "#dcfce7", borderRadius: 999, padding: "2px 9px" }}>UNC SITE</span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : (data.trials_total ?? 0) > 0 ? (
                    <p style={{ fontSize: 13, color: "#6b6b73", margin: 0 }}>
                      {resolvedName} sponsors {data.trials_total} active trial(s) — none with UNC listed as a site.{" "}
                      <a href={`https://clinicaltrials.gov/search?spons=${encodeURIComponent(resolvedName)}`} target="_blank" rel="noopener noreferrer" style={{ color: "#5b6cff", textDecoration: "none" }}>Search ClinicalTrials.gov →</a>
                    </p>
                  ) : (
                    <p style={{ fontSize: 13, color: "#9a9aa2", margin: 0 }}>No active clinical trials found with UNC as a collaborator.</p>
                  )}
                </Card>

                {/* Sub-card 3 — UNC units */}
                <Card title="UNC Units" subtitle="Schools and centers with documented ties">
                  {units.length > 0 ? (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {units.map((u) => (
                        <span key={u.unit} style={{ fontSize: 11.5, background: "#eef0ff", color: "#4451c8", borderRadius: 999, padding: "3px 10px" }}>
                          {u.unit} · {u.count} paper{u.count !== 1 ? "s" : ""}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p style={{ fontSize: 13, color: "#9a9aa2", margin: 0 }}>No UNC school attribution found in PubMed.</p>
                  )}
                  {coiCount > 0 && (
                    <p style={{ fontSize: 12.5, color: "#92400e", background: "#fffbeb", borderRadius: 10, padding: "8px 12px", margin: "14px 0 0", lineHeight: 1.45 }}>
                      {coiCount} conflict-of-interest disclosure(s) in the last {data.coi?.window_years ?? 5} years — indicates disclosed financial ties.
                    </p>
                  )}
                </Card>
              </div>
            )}

            {/* ── Section C — Verifiable evidence ─────────────────────────── */}
            <Eyebrow style={{ marginTop: 8 }}>Verifiable evidence · every item below links to its primary source</Eyebrow>

            {/* Conflict of Interest */}
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
                  {units.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
                      {units.map((u) => (
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

            {/* ── Section D — Why UNC is a fit (always shown) ─────────────── */}
            <div ref={whyRef} style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.06)", borderRadius: 18, padding: 22, boxShadow: "0 8px 30px rgba(0,0,0,0.04)", marginTop: 8 }}>
              <Eyebrow>{isPartner ? "Deepen the relationship" : "Why UNC"}</Eyebrow>
              <p style={{ fontSize: 14, color: "#6b6b73", margin: "6px 0 18px" }}>
                {isPartner ? `UNC assets most relevant to ${resolvedName}'s strategy:` : `What UNC brings to ${resolvedName}:`}
              </p>

              {/* Item 1 — Partnership Profile (only if on file) */}
              {inventoryMatch?.linkToReport ? (
                <div style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.06)", borderLeft: "4px solid #5b6cff", borderRadius: 12, padding: 16, marginBottom: 16 }}>
                  <p style={{ fontSize: 13.5, fontWeight: 600, margin: 0 }}>📄 Partnership Profile on file</p>
                  <p style={{ fontSize: 13, color: "#6b6b73", margin: "4px 0 8px", lineHeight: 1.45 }}>
                    A full background profile for {inventoryMatch.account} is available in the UNC partnership inventory.
                  </p>
                  <a href={inventoryMatch.linkToReport} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, fontWeight: 500, color: "#5b6cff", textDecoration: "none" }}>Open Partnership Profile →</a>
                </div>
              ) : null}

              {/* Item 2 — UNC partnership models (static, from unc_programs.json) */}
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
                {PARTNERSHIP_MODELS.map((m) => (
                  <div key={m.model} style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 13.5, fontWeight: 700 }}>{m.model}</span>
                    <span style={{ fontSize: 12, color: "#9a9aa2" }}>→ {m.unit}</span>
                  </div>
                ))}
              </div>

              {/* Item 3 — UNC research assets (static, from nc_access) */}
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {NC_ACCESS.map((a) => (
                  <div key={a.asset} style={{ fontSize: 13.5, lineHeight: 1.45 }}>
                    <strong>{a.asset}</strong>
                    <span style={{ color: "#6b6b73" }}> — {a.description} </span>
                    <a href={a.url} target="_blank" rel="noopener noreferrer" style={{ color: "#5b6cff", textDecoration: "none" }}>{a.url}</a>
                  </div>
                ))}
              </div>
              <p style={{ fontSize: 11, color: "#9a9aa2", margin: "8px 0 0" }}>Source: unc.edu / tracs.unc.edu</p>

              <p style={{ fontSize: 12, color: "#9a9aa2", fontStyle: "italic", margin: "18px 0 0", lineHeight: 1.5 }}>
                Signals from PubMed co-authorship, NIH RePORTER grants, ClinicalTrials.gov, and SEC filings. Operational relationships (IT contracts, hiring, clinical pilots) are not indexed in public research databases and may not appear above — check the Partnership Profile for the full picture.
              </p>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
