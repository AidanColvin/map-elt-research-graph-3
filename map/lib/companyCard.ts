/**
 * companyCard.ts — maps one sector-scan company profile into the data model
 * rendered by CompanyReportCard, and serializes that model to Markdown for the
 * PDF / DOCX exporters.
 *
 * EVERY field here comes from the deterministic, double-sourced pipeline
 * (SEC EDGAR, NIH RePORTER, PubMed, ClinicalTrials.gov, 8-Ks). Nothing is
 * invented and no LLM is involved — when a fact isn't in the data, the field is
 * left empty and its section is omitted, never fabricated.
 */
import { parseMoney } from "@/components/Report";
import { isHealthSector, looksClinical, visiblePipeline } from "@/lib/domain";

export interface CardBullet { text: string; url?: string }
export interface CardStat { value: string; label: string }
export interface CardLink { label: string; url: string }
export interface CardContact { pi: string; unit: string; grant?: string; fy?: string; topic?: string; url?: string }
export interface CardAsset { name: string; relevance: string; url?: string }
export interface CardTrial { title: string; status: string; url?: string }
export interface CardPeer { name: string; valueB: number; isSubject: boolean }
export interface CardTalkingPoint { bold: string; boldUrl?: string; rest: string }

export interface CompanyCardData {
  name: string;
  metaLine: string;
  tier: "Strategic" | "Translational";
  uncStatus: "active" | "prior" | "none";
  pills: string[];
  stats: CardStat[];
  links: CardLink[];
  company: CardBullet[];
  problem: CardBullet[];
  goal: CardBullet[];
  solution: CardBullet[];
  contacts: CardContact[];
  assets: CardAsset[];
  trials: CardTrial[];
  rdPeers: CardPeer[];
  talkingPoints: CardTalkingPoint[];
  ospFlag: boolean;
  ospGrantCount: number;
  secOnlyStub?: boolean;
}

const SEC = "https://www.sec.gov";

function trunc(s: string, n: number): string {
  const t = (s || "").trim();
  return t.length <= n ? t : t.slice(0, n - 1).trimEnd() + "…";
}

// "$716.9B (FY2025)" -> "$716.9B"
function stripFy(s: string): string {
  return (s || "").split(" (")[0].trim();
}

// Pull a grant id from a RePORTER project URL, e.g.
// ".../project-details/R01AI1" -> "R01AI1".
function grantIdFromUrl(url: string): string {
  const m = (url || "").match(/project-details\/([A-Za-z0-9-]+)/);
  return m ? m[1] : "";
}

// First non-empty, acceptable source URL in a list.
function firstSource(sources: any): string | undefined {
  if (!Array.isArray(sources)) return undefined;
  return sources.find((s) => typeof s === "string" && /^https?:\/\//.test(s));
}

// Clean a value captured from report markdown: drop a trailing "[n]" citation
// marker, surrounding bold markers, and whitespace.
function cleanMd(s: string): string {
  return (s || "").replace(/\s*\[\d+\]\s*$/, "").replace(/\*\*/g, "").trim();
}

// First capture group of `re` in `md`, cleaned — or "" if no match.
function matchMd(md: string, re: RegExp): string {
  const m = (md || "").match(re);
  return m ? cleanMd(m[1]) : "";
}

// takes: one raw sector-scan profile, the full report (for sector peers +
//        talking points), all sourced from the backend
// does: builds the card data model using only sourced facts
// returns: the CompanyCardData (safe, with empty sections omitted by the card)
export function buildCardData(profile: any, report: any): CompanyCardData {
  const facts = profile?.facts || {};
  const fv = (k: string): string => facts?.[k]?.value || "";
  const fs = (k: string): string => facts?.[k]?.source || "";

  const name: string = profile?.company_name || "Company";
  const edgarUrl = fs("cik") || fs("revenue") || fs("legal_name") || firstSource(profile?.overview?.sources) || SEC;

  const ticker = fv("ticker"); // e.g. "AMZN (Nasdaq)"
  const hq = fv("hq");
  const cik = fv("cik");
  const fyEnd = fv("fy_end");
  const metaLine = [ticker, hq, cik && `CIK ${cik}`, fyEnd && `FY end ${fyEnd}`]
    .filter(Boolean).join(" · ");

  // Sector domain — clinical-trial content is only legitimate for health/
  // life-sciences sectors. For everything else (streaming, banks, retail) the
  // pipeline/trial rows are ClinicalTrials.gov sponsor-name-collision false
  // positives and must be gated out. Single source of truth: lib/domain.ts.
  const health = isHealthSector(report?.report_meta?.sector);
  const rawPipeline: any[] = Array.isArray(profile?.pipeline) ? profile.pipeline : [];
  const pipeline: any[] = visiblePipeline(rawPipeline, health);
  const uncAlignment: any[] = (Array.isArray(profile?.unc_alignment) ? profile.unc_alignment : [])
    // Drop placeholder/non-informative overlaps ("(see SEC filings)", bare
    // "Research overlap") and — for non-health sectors — clinical false
    // positives, so the Goal/Solution sections read honestly instead of echoing
    // sponsor-name-collision trial titles.
    .filter((a: any) => {
      const prog = (a?.company_program || "").trim();
      if (!prog || /^\(see\b/i.test(prog) || /^research overlap$/i.test(prog)) return false;
      if (!health && looksClinical(`${prog} ${a?.unc_fact || ""} ${a?.rationale || ""}`)) return false;
      return true;
    });
  const whatOffers: any[] = Array.isArray(profile?.what_unc_offers) ? profile.what_unc_offers : [];
  const uncPis: any[] = Array.isArray(profile?.unc_pis) ? profile.unc_pis : [];
  const collabCount: number = Number(profile?.collaboration_8k_count) || 0;
  const collab8kDate: string = profile?.most_recent_8k_date || "";
  const collab8kUrl: string = profile?.collaboration_8k_url || edgarUrl;
  const partnershipTerms: number = Number(profile?.partnership_term_count) || 0;

  const tier: "Strategic" | "Translational" = profile?.partnership_type === "Strategic" ? "Strategic" : "Translational";
  const grantCount = uncPis.length;
  const uncStatus: "active" | "prior" | "none" =
    grantCount > 0 ? "active" : profile?.existing_unc_tie ? "prior" : "none";

  // Signal pills — each backed by data in the profile.
  const pills: string[] = [];
  if (grantCount > 0) pills.push("Active NIH overlap");
  else if (profile?.existing_unc_tie) pills.push("UNC research tie");
  if (collabCount > 0 && collab8kDate) pills.push(`Collab 8-K ${collab8kDate}`);
  if (profile?.nc_based) pills.push("NC-headquartered");

  // Stat bar — first available of R&D / net income for the 2nd cell.
  const rd = stripFy(fv("rd_expense"));
  const netInc = stripFy(fv("net_income"));
  const stats: CardStat[] = [
    { value: stripFy(fv("revenue")) || "n/a", label: "Revenue" },
    rd ? { value: rd, label: "R&D" } : { value: netInc || "n/a", label: "Net income" },
    { value: stripFy(fv("total_assets")) || "n/a", label: "Total assets" },
    { value: String(pipeline.length), label: pipeline.length === 1 ? "Active trial" : "Active trials" },
  ];

  // Links row.
  const links: CardLink[] = [{ label: "SEC EDGAR", url: edgarUrl }];
  if (collabCount > 0) links.push({ label: `Collab 8-K${collab8kDate ? ` ${collab8kDate}` : ""}`, url: collab8kUrl });
  const firstTrialUrl = firstSource(pipeline[0]?.sources);
  if (pipeline.length) links.push({ label: `${pipeline.length} trials`, url: firstTrialUrl || "https://clinicaltrials.gov" });

  // Company facts (left column, top).
  const company: CardBullet[] = [];
  const sic = fv("sic");
  const programs = pipeline.slice(0, 3).map((p) => p.program).filter(Boolean).join(", ");
  if (sic || programs) company.push({ text: `Focus · ${[sic, programs].filter(Boolean).join(" — ")}`, url: edgarUrl });
  if (health && pipeline.length) company.push({ text: `Clinical pipeline · ${pipeline.length} trial${pipeline.length === 1 ? "" : "s"} on ClinicalTrials.gov`, url: firstTrialUrl });
  if (partnershipTerms > 0) company.push({ text: `Partnership signal · ${partnershipTerms} partnership-language mention${partnershipTerms === 1 ? "" : "s"} in latest 10-K`, url: edgarUrl });
  if (collabCount > 0) company.push({ text: `Deal track · ${collabCount} collaboration/licensing 8-K${collabCount === 1 ? "" : "s"}${collab8kDate ? ` (latest ${collab8kDate})` : ""}`, url: collab8kUrl });
  company.push({ text: `UNC status · ${uncStatus}${grantCount ? ` · ${grantCount} NIH grant${grantCount === 1 ? "" : "s"} overlapping` : ""}`, url: grantCount ? (uncPis[0]?.grant_url) : edgarUrl });

  // Problem — factual gaps only (never speculation).
  const problem: CardBullet[] = [];
  if (collabCount === 0) problem.push({ text: "No collaboration or licensing 8-K on file (2018–present)", url: edgarUrl });
  if (!profile?.existing_unc_tie) problem.push({ text: "No documented UNC research tie found in public databases", url: edgarUrl });
  if (health && pipeline.length) problem.push({ text: `${pipeline.length} active trial${pipeline.length === 1 ? "" : "s"} — clinical evidence is being generated now`, url: firstTrialUrl });

  // Goal — sourced UNC overlaps (where company work meets a UNC unit), deduped
  // (the backend can emit the same overlap several times).
  const goalSeen = new Set<string>();
  const goal: CardBullet[] = [];
  for (const a of uncAlignment) {
    const text = `${trunc(a.company_program, 60)} → ${a.unc_unit || "UNC"}`;
    if (goalSeen.has(text)) continue;
    goalSeen.add(text);
    goal.push({ text, url: firstSource(a.sources) });
    if (goal.length >= 3) break;
  }

  // Solution — sourced "why it matters" rationale, deduped.
  const solSeen = new Set<string>();
  const solution: CardBullet[] = [];
  for (const a of uncAlignment) {
    const text = trunc(a.rationale || a.unc_fact || "", 140);
    if (!text || solSeen.has(text)) continue;
    solSeen.add(text);
    solution.push({ text, url: firstSource(a.sources) });
    if (solution.length >= 3) break;
  }

  // UNC contacts — named PIs with their grant link (sourced to RePORTER).
  const contacts: CardContact[] = uncPis.slice(0, 6).map((p) => ({
    pi: p.name || "",
    unit: trunc(p.org || "UNC Chapel Hill", 40),
    grant: p.grant_num || grantIdFromUrl(p.grant_url || ""),
    fy: p.fiscal_year || "",
    topic: trunc(p.project_title || "", 60),
    url: p.grant_url || "https://reporter.nih.gov",
  })).filter((c) => c.pi);

  // UNC data assets — what UNC can offer (sourced).
  const assets: CardAsset[] = whatOffers.slice(0, 5).map((o) => ({
    name: o.offering || "",
    relevance: trunc(o.description || "", 70),
    url: firstSource(o.sources),
  })).filter((a) => a.name);

  // Active trials list (sourced to ClinicalTrials.gov).
  const trials: CardTrial[] = pipeline.slice(0, 6).map((p) => ({
    title: trunc(p.program || "Trial", 60),
    status: p.stage || "",
    url: firstSource(p.sources) || "https://clinicaltrials.gov",
  }));

  // R&D peers — top 5 in the sector by R&D, this company highlighted.
  const allProfiles: any[] = Array.isArray(report?.section4_profiles) ? report.section4_profiles : [];
  const rdPeers: CardPeer[] = allProfiles
    .map((p) => ({
      name: p.company_name as string,
      valueB: parseMoney(p.facts?.["rd_expense"]?.value || p.facts?.["rd expense"]?.value) / 1e9,
    }))
    .filter((p) => p.valueB > 0)
    .sort((a, b) => b.valueB - a.valueB)
    .slice(0, 5)
    .map((p) => ({ name: p.name, valueB: Math.round(p.valueB * 10) / 10, isSubject: p.name === name }));
  // Only keep the chart if the subject company appears in it.
  const rdPeersFinal = rdPeers.some((p) => p.isSubject) ? rdPeers : [];

  // Talking points — from the report's sourced talking-point block.
  const tpEntry = (report?.section6_talking_points?.companies || []).find((c: any) => c.company === name);
  const talkingPoints: CardTalkingPoint[] = [];
  // Drop low-signal talking points: generic 8-K "material event" filler, bare
  // revenue restatements (already in the stat tile), and ClinicalTrials.gov
  // boilerplate. Clinical content is additionally dropped on non-health sectors.
  const TP_DROP = [
    /filed its most recent 8-K/i,
    /material event disclosure/i,
    /reported FY\d*\s+revenue of/i,
    /no active ClinicalTrials\.gov entries/i,
  ];
  for (const key of ["unc_hook", "know_pipeline", "know_moves", "know_company"]) {
    // `know_pipeline` is inherently a clinical-trial summary ("lead disclosed
    // study is …" / "no active ClinicalTrials.gov entries"); irrelevant for
    // non-health sectors.
    if (!health && key === "know_pipeline") continue;
    const s = tpEntry?.[key];
    if (!s?.text) continue;
    const txt: string = s.text;
    if (TP_DROP.some((re) => re.test(txt))) continue;
    if (!health && looksClinical(txt)) continue;
    const dash = txt.indexOf(" — ");
    const bold = dash > 0 ? txt.slice(0, dash) : txt.split(" ").slice(0, 5).join(" ");
    const rest = dash > 0 ? txt.slice(dash + 3) : txt.slice(bold.length);
    talkingPoints.push({ bold: bold.trim(), rest: rest.trim(), boldUrl: firstSource(s.sources) });
    if (talkingPoints.length >= 4) break;
  }

  return {
    name, metaLine, tier, uncStatus, pills, stats, links,
    company, problem, goal, solution, contacts, assets, trials,
    rdPeers: rdPeersFinal, talkingPoints,
    ospFlag: grantCount > 0, ospGrantCount: grantCount,
    secOnlyStub: profile?.sec_only_stub ?? false,
  };
}

// takes: the company subject, the streamed Company Profile markdown, and the
//        resolved UNC partnership payload (PartnerData; either may be partial)
// does: assembles the SAME CompanyCardData model the sector cards use, so a
//       single-company run renders with the rich card layout. Financial stat
//       tiles + meta line are read from the profile prose; UNC ties (contacts,
//       trials, data assets, signals) come from the structured partnership data.
//       Nothing is invented — fields with no source stay empty and the card
//       omits their section. Sector-only pieces (R&D peer chart) are left empty.
// returns: a CompanyCardData for one company run
export function buildCompanyCard(subject: string, companyMd: string, partner: any): CompanyCardData {
  const md = companyMd || "";
  const name = (partner?.resolved_name || subject || matchMd(md, /^#\s+(.+)$/m) || "Company").trim();

  // ── Financials, parsed from the Company Profile prose (live-report template).
  const moneyRe = "(\\$[\\d.,]+\\s*(?:billion|million|trillion|[BMKT])?)";
  const revenue = matchMd(md, new RegExp(`reported revenue of ${moneyRe}`, "i"));
  const netIncome = matchMd(md, new RegExp(`[Nn]et income was ${moneyRe}`));
  const netLoss = matchMd(md, new RegExp(`net loss of ${moneyRe}`, "i"));
  const grossMargin = matchMd(md, /[Gg]ross margin was ([\d.]+%)/);
  const totalAssets = matchMd(md, new RegExp(`[Tt]otal assets(?:\\s+were|\\s+of)?\\s+${moneyRe}`));

  // ── UNC ties, from the structured partnership payload.
  const nihPis: any[] = Array.isArray(partner?.nih_pis) ? partner.nih_pis : [];
  const facultyLeads: any[] = Array.isArray(partner?.unc_faculty_leads) ? partner.unc_faculty_leads : [];
  const grants: any[] = Array.isArray(partner?.nih_grants) ? partner.nih_grants : [];
  const trials: any[] = Array.isArray(partner?.trials) ? partner.trials : [];
  const units: any[] = Array.isArray(partner?.unc_units) ? partner.unc_units : [];
  const signals: any[] = Array.isArray(partner?.relationship_signals) ? partner.relationship_signals : [];
  const jointTrials: any[] = Array.isArray(partner?.unc_joint_trials) ? partner.unc_joint_trials : [];
  const papers: number = Number(partner?.clinical?.count) || 0;
  const secMentions: number = Array.isArray(partner?.financial?.quotes) ? partner.financial.quotes.length : 0;
  const edgar: string | undefined = partner?.links?.edgar || undefined;
  const pubmed: string | undefined = partner?.links?.pubmed || undefined;
  const trialCount = Number(partner?.trials_total) || trials.length;

  const uncActive = nihPis.length > 0 || grants.length > 0 || papers > 0 || jointTrials.length > 0;
  const uncStatus: "active" | "prior" | "none" = uncActive ? "active" : secMentions > 0 ? "prior" : "none";

  // Meta line — exchange/ticker, HQ, industry, fiscal year end.
  const listing = matchMd(md, /\*\*Listing:\*\*\s*([^\n]+)/);
  const hq = matchMd(md, /\*\*HQ:\*\*\s*([^\n]+)/);
  const industry = matchMd(md, /\*\*Industry:\*\*\s*([^\n]+)/);
  const fyEnd = matchMd(md, /\*\*Fiscal year end:\*\*\s*([^\n]+)/);
  const metaLine = [listing, hq, fyEnd && `FY end ${fyEnd}`].filter(Boolean).join(" · ");

  // Stat tiles — same four-up bar as the sector card. "—" when not on file.
  const stats: CardStat[] = [
    { value: revenue || "n/a", label: "Revenue" },
    netIncome ? { value: netIncome, label: "Net income" }
      : netLoss ? { value: `-${netLoss}`, label: "Net loss" }
      : { value: grossMargin || "n/a", label: "Gross margin" },
    { value: totalAssets || "n/a", label: "Total assets" },
    { value: String(trialCount), label: trialCount === 1 ? "Active trial" : "Active trials" },
  ];

  // Signal pills (the "Active NIH"/"UNC research" ones are rendered via the
  // status pill, so they're filtered out by the card — keep extras only).
  const pills: string[] = [];
  if (partner?.nc_based) pills.push("NC-headquartered");
  if (papers > 0) pills.push(`${papers} UNC paper${papers === 1 ? "" : "s"}`);

  const links: CardLink[] = [];
  if (edgar) links.push({ label: "SEC EDGAR", url: edgar });
  if (pubmed && papers > 0) links.push({ label: `${papers} UNC paper${papers === 1 ? "" : "s"}`, url: pubmed });
  if (trials.length) links.push({ label: `${trials.length} trial${trials.length === 1 ? "" : "s"}`, url: trials[0]?.url || "https://clinicaltrials.gov" });

  const company: CardBullet[] = [];
  if (industry) company.push({ text: `Focus · ${industry}`, url: edgar });
  if (trials.length) company.push({ text: `Clinical pipeline · ${trials.length} trial${trials.length === 1 ? "" : "s"} on ClinicalTrials.gov`, url: trials[0]?.url });
  if (papers > 0) company.push({ text: `Research footprint · ${papers} UNC co-authored paper${papers === 1 ? "" : "s"} in PubMed`, url: pubmed });
  if (secMentions > 0) company.push({ text: `Partnership signal · ${secMentions} verbatim UNC mention${secMentions === 1 ? "" : "s"} in SEC filings`, url: edgar });
  company.push({ text: `UNC status · ${uncStatus}${grants.length ? ` · ${grants.length} NIH grant${grants.length === 1 ? "" : "s"} overlapping` : ""}`, url: grants.length ? grants[0]?.url : edgar });

  // Problem — factual gaps only.
  const problem: CardBullet[] = [];
  if (!uncActive) problem.push({ text: "No co-authored papers, NIH grants, or trials with UNC found in public databases", url: edgar });
  if (secMentions === 0) problem.push({ text: "No verbatim UNC mention on file in recent SEC filings", url: edgar });
  if (trials.length) problem.push({ text: `${trials.length} active trial${trials.length === 1 ? "" : "s"} — clinical evidence is being generated now`, url: trials[0]?.url });

  // Goal — sourced UNC joint trials (where the company's work meets UNC).
  const goal: CardBullet[] = jointTrials.slice(0, 3).map((t) => ({
    text: `${trunc(t.title || "Joint clinical trial", 64)} → UNC`,
    url: t.url,
  }));

  // Solution — sourced relationship signals (8-K excerpts, filings).
  const solution: CardBullet[] = signals.slice(0, 3).map((s) => ({
    text: trunc(s.excerpt || s.filing_type || "", 140),
    url: s.source_url,
  })).filter((b) => b.text);

  // UNC contacts — named PIs (RePORTER) then verified faculty leads.
  const contacts: CardContact[] = [];
  nihPis.slice(0, 6).forEach((p) => contacts.push({
    pi: p.name || "", unit: trunc(p.org || "UNC Chapel Hill", 40),
    grant: grantIdFromUrl(p.grant_url || ""), fy: "",
    topic: trunc(p.project_title || "", 60), url: p.grant_url || "https://reporter.nih.gov",
  }));
  facultyLeads.slice(0, Math.max(0, 6 - contacts.length)).forEach((f) => contacts.push({
    pi: f.pi_name || "", unit: trunc(f.department || "UNC Chapel Hill", 40),
    grant: f.grant_number || "", fy: f.fiscal_year ? String(f.fiscal_year) : "",
    topic: trunc(f.project_title || "", 60), url: undefined,
  }));
  const contactsFinal = contacts.filter((c) => c.pi);

  // UNC data assets — units that have published on the subject.
  const assets: CardAsset[] = units.slice(0, 5).map((u) => ({
    name: u.unit || "", relevance: `${u.count} UNC publication${u.count === 1 ? "" : "s"} referencing ${name}`,
    url: pubmed,
  })).filter((a) => a.name);

  // Active trials list (ClinicalTrials.gov).
  const trialsList: CardTrial[] = trials.slice(0, 6).map((t) => ({
    title: trunc(t.title || "Trial", 60), status: t.status || t.phase || "",
    url: t.url || "https://clinicaltrials.gov",
  }));

  const grantCount = nihPis.length || grants.length;
  return {
    name, metaLine, tier: "Translational", uncStatus, pills, stats, links,
    company, problem, goal, solution, contacts: contactsFinal, assets, trials: trialsList,
    rdPeers: [], talkingPoints: [],
    ospFlag: grants.length > 0, ospGrantCount: grantCount,
  };
}

// takes: a card data model
// does: serializes it to Markdown (headings, pipe tables, bullet lists) so the
//       existing report-export PDF/DOCX renderers can produce a downloadable
//       file — links are kept as [text](url) and survive into the references
// returns: the Markdown string
export function cardToMarkdown(c: CompanyCardData): string {
  const out: string[] = [];
  const link = (b: CardBullet) => (b.url ? `[${b.text}](${b.url})` : b.text);

  out.push(`# ${c.name}`);
  out.push("");
  if (c.metaLine) out.push(`*${c.metaLine}*`);
  out.push(`**Tier:** ${c.tier} · **UNC status:** ${c.uncStatus}${c.pills.length ? ` · ${c.pills.join(" · ")}` : ""}`);
  out.push("");
  out.push("| Metric | Value |");
  out.push("|---|---|");
  for (const s of c.stats) out.push(`| ${s.label} | ${s.value} |`);
  out.push("");

  if (c.ospFlag) {
    out.push(`**Engagement route:** route initial outreach through [UNC OSP](https://research.unc.edu/osp) — ${c.ospGrantCount} active NIH grant${c.ospGrantCount === 1 ? "" : "s"} to verify first.`);
    out.push("");
  }

  const section = (title: string, bullets: CardBullet[]) => {
    if (!bullets.length) return;
    out.push(`## ${title}`);
    out.push("");
    for (const b of bullets) out.push(`- ${link(b)}`);
    out.push("");
  };
  section("Company", c.company);
  section("Problem", c.problem);
  section("Goal", c.goal);

  if (c.assets.length) {
    out.push("## UNC Data Assets");
    out.push("");
    out.push("| Asset | Relevance |");
    out.push("|---|---|");
    for (const a of c.assets) {
      const nm = a.url ? `[${a.name}](${a.url})` : a.name;
      out.push(`| ${nm} | ${a.relevance} |`);
    }
    out.push("");
  }
  section("Solution", c.solution);

  if (c.talkingPoints.length) {
    out.push("## Talking Points");
    out.push("");
    for (const tp of c.talkingPoints) {
      const bold = tp.boldUrl ? `[**${tp.bold}**](${tp.boldUrl})` : `**${tp.bold}**`;
      out.push(`- ${bold}${tp.rest ? ` ${tp.rest}` : ""}`);
    }
    out.push("");
  }
  return out.join("\n");
}
