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
import { isHealthSector, visiblePipeline } from "@/lib/domain";

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

// First non-empty capture across several patterns (prose phrasing varies, e.g.
// "generated $X in revenue" vs "reported revenue of $X").
function firstMatchMd(md: string, res: RegExp[]): string {
  for (const re of res) {
    const v = matchMd(md, re);
    if (v) return v;
  }
  return "";
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
  // Some foreign filers carry a literal "NONE"/"N/A" state from EDGAR — strip it
  // so the meta line reads "Luxembourg" not "Luxembourg, NONE".
  const hq = fv("hq").replace(/,\s*(none|n\/?a|null)\s*$/i, "").trim();
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
  const uncAlignment: any[] = Array.isArray(profile?.unc_alignment) ? profile.unc_alignment : [];
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
    // Trials only mean something for health sectors. Elsewhere the count is
    // always 0 (collisions are gated out), so show the decision-relevant UNC
    // signal instead.
    health
      ? { value: String(pipeline.length), label: pipeline.length === 1 ? "Active trial" : "Active trials" }
      : { value: String(grantCount), label: grantCount === 1 ? "UNC NIH overlap" : "UNC NIH overlaps" },
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

  // Goal — "company program → UNC unit" overlaps. Only meaningful for health
  // sectors: there `company_program` is a real pipeline/program. For non-health
  // it's a ClinicalTrials.gov collision title or a bare SIC restatement
  // ("SEC-registered Services-Computer Programming…"), so the section is omitted.
  // Placeholders dropped, deduped.
  const goalSeen = new Set<string>();
  const goal: CardBullet[] = [];
  if (health) {
    for (const a of uncAlignment) {
      const prog = (a?.company_program || "").trim();
      if (!prog || /^\(see\b/i.test(prog) || /^research overlap$/i.test(prog) || /^sec-registered/i.test(prog)) continue;
      const text = `${trunc(prog, 60)} → ${a.unc_unit || "UNC"}`;
      if (goalSeen.has(text)) continue;
      goalSeen.add(text);
      goal.push({ text, url: firstSource(a.sources) });
      if (goal.length >= 3) break;
    }
  }

  // Solution — the sourced "why it matters" rationale (UNC faculty federally
  // funded on overlapping topics, co-authored publications). Useful for any
  // sector, deduped. Unlike the program titles, the rationale is clean prose.
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

  // Talking points — an outreach-ready argument built from THIS company's own
  // sourced facts, most-specific first so every card reads differently:
  //   1) the named UNC investigator + their exact NIH-funded topic + grant id
  //      (or the specific co-authored paper);
  //   2) concrete capacity — R&D budget + rank, or revenue scale (varies per co);
  //   3) the company's 10-K partnership posture (count-driven framing);
  //   4) deal posture — committed external R&D, or a greenfield opening, used
  //      only when nothing more specific applies.
  // The backend's own strings ("filed its most recent 8-K", revenue
  // restatements, clinical boilerplate) are deliberately NOT used.
  const hook = (report?.section6_talking_points?.companies || []).find((c: any) => c.company === name)?.unc_hook;
  const revenue = stripFy(fv("revenue"));
  const tp: CardTalkingPoint[] = [];

  // 1 · The warmest, most SPECIFIC documented tie.
  if (grantCount > 0) {
    const pi = uncPis[0] || {};
    const topic = trunc(pi.project_title || "", 58);
    tp.push({
      bold: `${grantCount} UNC investigator${grantCount === 1 ? "" : "s"} overlap ${name}`,
      rest: `${pi.name || "A UNC PI"}${topic ? ` — NIH-funded on “${topic}”` : " holds related NIH funding"}${pi.grant_num ? ` (${pi.grant_num})` : ""}. Open via UNC OSP.`,
      boldUrl: pi.grant_url || "https://research.unc.edu/osp",
    });
  } else if (profile?.existing_unc_tie && hook?.text && /co-author|publication|paper/i.test(hook.text)) {
    const txt: string = hook.text;
    const dash = txt.indexOf(" — ");
    tp.push({
      bold: (dash > 0 ? txt.slice(0, dash) : "Co-authored UNC publication on record").trim(),
      rest: (dash > 0 ? txt.slice(dash + 3) : txt).trim(),
      boldUrl: firstSource(hook.sources),
    });
  } else if (profile?.existing_unc_tie) {
    tp.push({ bold: "Prior UNC tie on record", rest: `${name} and UNC share a documented research link — a warm, public entry point.`, boldUrl: edgarUrl });
  }

  // 2 · Capacity to fund — concrete scale, varies per company.
  if (rd) {
    const idx = rdPeersFinal.findIndex((p) => p.isSubject);
    tp.push({ bold: `${rd} R&D budget`, rest: `${name} ${idx >= 0 ? `ranks #${idx + 1} for R&D in this set` : "is a major R&D spender"} — capacity to fund a sponsored UNC program now.`, boldUrl: edgarUrl });
  } else if (revenue) {
    tp.push({ bold: `${revenue} in revenue`, rest: `At ${name}'s scale, even a small research carve-out funds a serious UNC collaboration.`, boldUrl: edgarUrl });
  }

  // 3 · Partnership posture — framing scales with the 10-K mention count.
  if (partnershipTerms >= 8) {
    tp.push({ bold: `Partnerships cited ${partnershipTerms}× in the latest 10-K`, rest: `${partnershipTerms >= 30 ? "Outside collaboration is central to its strategy" : "It is actively structuring outside collaborations"} — UNC fits that posture.`, boldUrl: edgarUrl });
  }

  // 4 · Deal posture — committed external R&D, or a greenfield opening.
  if (collabCount > 0) {
    tp.push({ bold: `${collabCount} disclosed R&D deal${collabCount === 1 ? "" : "s"}`, rest: `${name} files collaboration/licensing 8-Ks${collab8kDate ? ` (latest ${collab8kDate})` : ""} — it already contracts external research.`, boldUrl: collab8kUrl });
  } else if (!profile?.existing_unc_tie && grantCount === 0) {
    tp.push({ bold: "Open field — no incumbent academic partner", rest: `No collaboration or licensing 8-K on file since 2018; UNC would be ${name}'s first university research partner.`, boldUrl: edgarUrl });
  }

  if (profile?.nc_based) {
    tp.push({ bold: "NC-headquartered", rest: `In-state presence supports in-person engagement and a state economic-development case.`, boldUrl: edgarUrl });
  }

  const talkingPoints = tp.slice(0, 4);

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

  // ── Financials, parsed from the Company Profile prose. Phrasing varies
  // ("Apple generated $416.2B in revenue" vs "reported revenue of $X"), so each
  // metric tries several patterns.
  const M = "(\\$[\\d.,]+\\s*(?:billion|million|trillion|[BMKT])?)";
  const revenue = firstMatchMd(md, [
    new RegExp(`${M}\\s+in (?:total\\s+)?revenue`, "i"),
    new RegExp(`revenue of ${M}`, "i"),
    new RegExp(`reported revenue of ${M}`, "i"),
  ]);
  const netIncome = firstMatchMd(md, [
    new RegExp(`net income of ${M}`, "i"),
    new RegExp(`net income was ${M}`, "i"),
    new RegExp(`${M}\\s+in net income`, "i"),
  ]);
  const netLoss = firstMatchMd(md, [
    new RegExp(`net loss of ${M}`, "i"),
    new RegExp(`${M}\\s+net loss`, "i"),
  ]);
  const grossMargin = firstMatchMd(md, [
    /([\d.]+%)\s+gross margin/i,
    /gross margin (?:was|of)\s+([\d.]+%)/i,
  ]);
  const totalAssets = firstMatchMd(md, [
    new RegExp(`total assets (?:were|of)\\s+${M}`, "i"),
    new RegExp(`total assets\\s+${M}`, "i"),
    new RegExp(`${M}\\s+in total assets`, "i"),
  ]);

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

  // Clinical-trial framing is only legitimate for health companies (derived from
  // the parsed industry). For non-health, the company's own ClinicalTrials.gov
  // rows are sponsor-name collisions and are gated out — but UNC-joint trials
  // (a verified collaboration) still surface in Goal/talking points.
  const health = isHealthSector(industry);
  const visTrials: any[] = health ? trials : [];

  // Stat tiles — same four-up bar as the sector card. "—" when not on file.
  const stats: CardStat[] = [
    { value: revenue || "n/a", label: "Revenue" },
    netIncome ? { value: netIncome, label: "Net income" }
      : netLoss ? { value: `-${netLoss}`, label: "Net loss" }
      : { value: grossMargin || "n/a", label: "Gross margin" },
    { value: totalAssets || "n/a", label: "Total assets" },
    health
      ? { value: String(trialCount), label: trialCount === 1 ? "Active trial" : "Active trials" }
      : { value: String(papers), label: papers === 1 ? "UNC paper" : "UNC papers" },
  ];

  // Signal pills (the "Active NIH"/"UNC research" ones are rendered via the
  // status pill, so they're filtered out by the card — keep extras only).
  const pills: string[] = [];
  if (partner?.nc_based) pills.push("NC-headquartered");
  if (papers > 0) pills.push(`${papers} UNC paper${papers === 1 ? "" : "s"}`);

  const links: CardLink[] = [];
  if (edgar) links.push({ label: "SEC EDGAR", url: edgar });
  if (pubmed && papers > 0) links.push({ label: `${papers} UNC paper${papers === 1 ? "" : "s"}`, url: pubmed });
  if (visTrials.length) links.push({ label: `${visTrials.length} trial${visTrials.length === 1 ? "" : "s"}`, url: visTrials[0]?.url || "https://clinicaltrials.gov" });

  const company: CardBullet[] = [];
  if (industry) company.push({ text: `Focus · ${industry}`, url: edgar });
  if (health && visTrials.length) company.push({ text: `Clinical pipeline · ${visTrials.length} trial${visTrials.length === 1 ? "" : "s"} on ClinicalTrials.gov`, url: visTrials[0]?.url });
  if (papers > 0) company.push({ text: `Research footprint · ${papers} UNC co-authored paper${papers === 1 ? "" : "s"} in PubMed`, url: pubmed });
  if (secMentions > 0) company.push({ text: `Partnership signal · ${secMentions} verbatim UNC mention${secMentions === 1 ? "" : "s"} in SEC filings`, url: edgar });
  company.push({ text: `UNC status · ${uncStatus}${grants.length ? ` · ${grants.length} NIH grant${grants.length === 1 ? "" : "s"} overlapping` : ""}`, url: grants.length ? grants[0]?.url : edgar });

  // Problem — factual gaps only.
  const problem: CardBullet[] = [];
  if (!uncActive) problem.push({ text: "No co-authored papers, NIH grants, or trials with UNC found in public databases", url: edgar });
  if (secMentions === 0) problem.push({ text: "No verbatim UNC mention on file in recent SEC filings", url: edgar });
  if (health && visTrials.length) problem.push({ text: `${visTrials.length} active trial${visTrials.length === 1 ? "" : "s"} — clinical evidence is being generated now`, url: visTrials[0]?.url });

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

  // Active trials list (ClinicalTrials.gov) — gated to health companies.
  const trialsList: CardTrial[] = visTrials.slice(0, 6).map((t) => ({
    title: trunc(t.title || "Trial", 60), status: t.status || t.phase || "",
    url: t.url || "https://clinicaltrials.gov",
  }));

  const grantCount = nihPis.length || grants.length;

  // Talking points — synthesized from the structured UNC partnership evidence
  // into a logical outreach argument (warmest tie first), mirroring the sector
  // card. Was previously empty on single-company runs.
  const tp: CardTalkingPoint[] = [];
  let usedPapers = false, usedSec = false;
  if (grantCount > 0) {
    const pi = nihPis[0] || {};
    const topic = trunc(pi.project_title || "", 58);
    const gid = grantIdFromUrl(pi.grant_url || "");
    tp.push({ bold: `${grantCount} UNC investigator${grantCount === 1 ? "" : "s"} overlap ${name}`, rest: `${pi.name || "A UNC PI"}${topic ? ` — NIH-funded on “${topic}”` : " holds related NIH funding"}${gid ? ` (${gid})` : ""}. Open via UNC OSP.`, boldUrl: pi.grant_url || grants[0]?.url || "https://research.unc.edu/osp" });
  } else if (papers > 0) {
    usedPapers = true;
    tp.push({ bold: `${papers} UNC co-authored paper${papers === 1 ? "" : "s"} on record`, rest: `${name} and UNC already publish together — the warmest public starting point.`, boldUrl: pubmed });
  } else if (jointTrials.length) {
    tp.push({ bold: `${jointTrials.length} UNC-joint clinical trial${jointTrials.length === 1 ? "" : "s"}`, rest: `${name} runs trials with UNC as a site or collaborator — an active, documented tie.`, boldUrl: jointTrials[0]?.url });
  } else if (secMentions > 0) {
    usedSec = true;
    tp.push({ bold: `${name} names UNC in SEC filings`, rest: `${secMentions} verbatim UNC mention${secMentions === 1 ? "" : "s"} — an acknowledged relationship to build on.`, boldUrl: edgar });
  } else {
    tp.push({ bold: "No documented UNC tie yet", rest: `Greenfield — open through UNC's Office of Technology Commercialization and OSP.`, boldUrl: "https://otc.unc.edu/" });
  }
  // Concrete scale — capacity to fund.
  if (revenue) tp.push({ bold: `${revenue} in revenue`, rest: `At ${name}'s scale, even a small research carve-out funds a serious UNC collaboration.`, boldUrl: edgar });
  if (papers > 0 && !usedPapers) tp.push({ bold: `${papers} UNC co-authored paper${papers === 1 ? "" : "s"}`, rest: `Published research links ${name} to UNC investigators in PubMed.`, boldUrl: pubmed });
  if (secMentions > 0 && !usedSec) tp.push({ bold: `${secMentions} UNC mention${secMentions === 1 ? "" : "s"} in SEC filings`, rest: `${name} references UNC verbatim in its filings — an acknowledged connection.`, boldUrl: edgar });
  if (partner?.nc_based) tp.push({ bold: "NC-headquartered", rest: `In-state presence supports in-person engagement and a state economic-development framing.`, boldUrl: edgar });
  const talkingPoints = tp.slice(0, 4);

  return {
    name, metaLine, tier: "Translational", uncStatus, pills, stats, links,
    company, problem, goal, solution, contacts: contactsFinal, assets, trials: trialsList,
    rdPeers: [], talkingPoints,
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
