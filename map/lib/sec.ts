/**
 * SEC EDGAR client — free, no API key
 * resolves a company to its CIK, then pulls profile + XBRL financials
 */

import { getJson, getText } from "./http";
import type {
  Executive,
  Financials,
  FilingRef,
  SecProfile,
  Subsidiary,
  TenKSections,
  YearValue,
} from "./types";

interface TickerRow {
  cik_str: number;
  ticker: string;
  title: string;
}

// common spoken names that differ from the SEC registered title, or short
// names that collide with an unrelated ticker (e.g. "HP" is Helmerich & Payne)
const NAME_ALIASES: Record<string, string> = {
  google: "Alphabet Inc.",
  alphabet: "Alphabet Inc.",
  facebook: "Meta Platforms, Inc.",
  meta: "Meta Platforms, Inc.",
  "amazon web services": "Amazon.com, Inc.",
  aws: "Amazon.com, Inc.",
  amazon: "Amazon.com, Inc.",
  hp: "HP Inc",
  "hewlett packard": "HP Inc",
  tsmc: "Taiwan Semiconductor Manufacturing",
  "arm holdings": "Arm Holdings",
};

/**
 * given a free-text company name or ticker
 * return the matching SEC CIK record, or null if not found
 */
export async function resolveCik(
  query: string,
): Promise<{ cik: string; ticker: string; title: string } | null> {
  const data = await getJson<Record<string, TickerRow>>(
    "https://www.sec.gov/files/company_tickers.json",
    { revalidate: 86400 },
  );
  if (!data) return null;

  const rows = Object.values(data);
  const raw = query.trim().toLowerCase();
  const aliased = NAME_ALIASES[raw];
  const q = aliased ? aliased.toLowerCase() : raw;

  // an exact ticker match wins — but skip it for aliased queries, since the
  // alias is a name and the raw text may collide with an unrelated ticker
  if (!aliased) {
    const tickerHit = rows.find((r) => r.ticker.toLowerCase() === raw);
    if (tickerHit) return format(tickerHit);
  }

  // otherwise score every candidate and take the best. titles are
  // normalized (lowercase, no leading "the", punctuation -> spaces) so
  // "Coca-Cola" matches the SEC title "COCA COLA CO". shorter titles break
  // ties, so it lands on "The Coca-Cola Company", not a bottler subsidiary.
  const nq = normalizeName(q);
  const word = new RegExp(`\\b${escapeRegExp(nq)}\\b`);

  let best: TickerRow | null = null;
  let bestScore = -1;
  for (const r of rows) {
    const nt = normalizeName(r.title);
    let score = -1;
    if (nt === nq) score = 1000 - nt.length;
    else if (nt.startsWith(nq)) score = 600 - nt.length;
    else if (word.test(nt)) score = 300 - nt.length;
    else if (nt.includes(nq)) score = 100 - nt.length;
    if (score > bestScore) {
      bestScore = score;
      best = r;
    }
  }

  if (!best || bestScore < 0) return null;
  return format(best);
}

function format(row: TickerRow): { cik: string; ticker: string; title: string } {
  return {
    cik: String(row.cik_str).padStart(10, "0"),
    ticker: row.ticker,
    title: row.title,
  };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * given a company name or SEC title
 * return it lowercased, without a leading "the", with punctuation collapsed
 * to single spaces — so hyphen/comma/period differences don't block matches
 */
function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/^the\s+/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * given a 10-digit CIK
 * return the raw EDGAR submissions document (cached), or null
 */
export async function fetchSubmissions(cik: string): Promise<any | null> {
  return getJson<any>(`https://data.sec.gov/submissions/CIK${cik}.json`, {
    revalidate: 3600,
  });
}

/**
 * given a 10-digit CIK
 * return the company filing profile (HQ, industry, exchange, fiscal year)
 */
export async function fetchProfile(
  cik: string,
  ticker?: string,
  title?: string,
): Promise<SecProfile | null> {
  const data = await fetchSubmissions(cik);
  if (!data) return null;
  const addr = data.addresses?.business ?? {};
  return {
    cik,
    name: data.name ?? title ?? "",
    ticker: data.tickers?.[0] ?? ticker,
    exchange: data.exchanges?.[0],
    sicDescription: data.sicDescription,
    hqCity: addr.city,
    hqState: addr.stateOrCountry,
    fiscalYearEnd: data.fiscalYearEnd,
    formerNames: (data.formerNames ?? []).map((f: any) => f.name),
  };
}

/**
 * given a 10-digit CIK
 * return its recent filings as a flat list (newest first)
 */
export async function fetchRecentFilings(cik: string): Promise<FilingRef[]> {
  const data = await fetchSubmissions(cik);
  const r = data?.filings?.recent;
  if (!r?.form) return [];
  const out: FilingRef[] = [];
  for (let i = 0; i < r.form.length; i++) {
    out.push({
      form: r.form[i],
      date: r.filingDate[i],
      accession: r.accessionNumber[i],
      primaryDoc: r.primaryDocument[i],
    });
  }
  return out;
}

/**
 * given a list of filings
 * return the most recent annual report (10-K), or null
 */
export function findLatest10K(filings: FilingRef[]): FilingRef | null {
  return (
    filings.find((f) => f.form === "10-K") ??
    filings.find((f) => f.form === "10-K/A") ??
    filings.find((f) => f.form === "20-F") ??
    null
  );
}

/**
 * given a CIK and a 10-K filing reference
 * fetch the filing and extract its key narrative sections
 * (Business, Competition, Risk Factors, MD&A) plus the employee count
 */
export async function fetch10KSections(
  cik: string,
  ref: FilingRef,
): Promise<TenKSections | null> {
  const cikInt = parseInt(cik, 10);
  const acc = ref.accession.replace(/-/g, "");
  const url = `https://www.sec.gov/Archives/edgar/data/${cikInt}/${acc}/${ref.primaryDoc}`;
  const html = await getText(url, { revalidate: 86400 });
  if (!html) return null;

  const text = htmlToText(html);
  const items = sliceItems(text);

  const businessSeg = items["1"];
  const riskSeg = items["1A"];
  const mdaSeg = items["7"];

  const competition = businessSeg ? competitionExcerpt(businessSeg) : undefined;

  return {
    url,
    fiscalYear: ref.date?.slice(0, 4),
    business: businessSeg ? excerpt(businessSeg, 1700) : undefined,
    competition,
    competitors: competition ? extractCompetitors(competition) : [],
    products: businessSeg ? subsectionExcerpt(businessSeg, "Products") : undefined,
    productList: businessSeg ? extractProductList(businessSeg) : [],
    customers: businessSeg ? subsectionExcerpt(businessSeg, "Customers") : undefined,
    customerFacts: businessSeg ? extractCustomerFacts(businessSeg) : [],
    risks: riskSeg ? excerpt(riskSeg, 1100) : undefined,
    riskHeadlines: riskSeg ? riskHeadlines(riskSeg) : [],
    mda: mdaSeg ? excerpt(mdaSeg, 1100) : undefined,
    employees: extractEmployees(text),
    executives: extractExecutives(text),
  };
}

/**
 * given a CIK and the company's filing list
 * return the legal subsidiaries disclosed in the latest filing that carries
 * an Exhibit 21 ("Subsidiaries of the Registrant"). free, structured-ish data
 * straight from EDGAR. returns [] if no Ex-21 is found or it can't be parsed.
 */
export async function fetchSubsidiaries(
  cik: string,
  filings: FilingRef[],
): Promise<Subsidiary[]> {
  const cikInt = parseInt(cik, 10);
  // Ex-21 ships with annual reports; check the few most recent
  const annuals = filings
    .filter((f) => ["10-K", "10-K/A", "20-F"].includes(f.form))
    .slice(0, 3);

  for (const ref of annuals) {
    const acc = ref.accession.replace(/-/g, "");
    const base = `https://www.sec.gov/Archives/edgar/data/${cikInt}/${acc}`;
    const index = await getJson<any>(`${base}/index.json`, { revalidate: 86400 });
    const items: any[] = index?.directory?.item ?? [];
    // match ex-21, ex21, exhibit21, exhibit_21, ...exhibit211.htm, etc.,
    // without matching ex-32.1 certs or material contracts like ex-10.21
    const ex21 = items.find((it) => /ex(?:hibit)?[\s._-]*21/i.test(it.name ?? ""));
    if (!ex21) continue;
    const html = await getText(`${base}/${ex21.name}`, { revalidate: 86400 });
    if (!html) continue;
    const subs = parseSubsidiaries(html);
    if (subs.length >= 2) return subs;
  }
  return [];
}

/* ------------------------- subsidiary extraction ------------------------- */

// US states/territories + common subsidiary jurisdictions, used to split a
// "Name ......... Jurisdiction" row and to group subsidiaries on the map.
const JURISDICTIONS: string[] = [
  "Delaware", "California", "Nevada", "New York", "Texas", "Washington",
  "Massachusetts", "Florida", "Illinois", "Virginia", "Colorado", "Georgia",
  "Arizona", "Oregon", "Pennsylvania", "Michigan", "Ohio", "New Jersey",
  "Maryland", "Minnesota", "Connecticut", "North Carolina", "Wisconsin",
  "United States", "Ireland", "United Kingdom", "England", "Scotland",
  "Netherlands", "Luxembourg", "Switzerland", "Germany", "France", "Spain",
  "Italy", "Sweden", "Norway", "Denmark", "Finland", "Belgium", "Austria",
  "Canada", "Mexico", "Brazil", "Bermuda", "Cayman Islands", "British Virgin Islands",
  "Singapore", "Hong Kong", "China", "Japan", "South Korea", "Korea", "Taiwan",
  "India", "Australia", "New Zealand", "Israel", "United Arab Emirates",
  "Mauritius", "Jersey", "Guernsey", "Gibraltar", "Malta", "Cyprus",
  "Poland", "Czech Republic", "Hungary", "Romania", "Portugal", "Greece",
  "Indonesia", "Malaysia", "Thailand", "Vietnam", "Philippines", "South Africa",
];

const JUR_RE = new RegExp(
  `[\\s,(–—-]+(${JURISDICTIONS.map((j) => j.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")).join("|")})\\.?\\s*$`,
  "i",
);

/**
 * given raw Exhibit-21 HTML
 * return a de-duplicated list of subsidiaries with their jurisdiction
 */
function parseSubsidiaries(html: string): Subsidiary[] {
  const text = htmlToText(html);
  const out: Subsidiary[] = [];
  const seen = new Set<string>();

  for (const raw of text.split("\n")) {
    let line = raw.replace(/\s+/g, " ").trim();
    // drop list numbering and leading bullets
    line = line.replace(/^\s*(\d{1,3}[.)]|[•·*-])\s*/, "");
    if (line.length < 3 || line.length > 120) continue;
    // skip headers, page furniture, and the exhibit title line
    if (/^(exhibit|subsidiar|name\b|entity\b|jurisdiction|state |country|page\b|table of|incorporation|organization|state or other)/i.test(line))
      continue;
    if (/\b(jurisdiction|incorporation|organization)\b/i.test(line) && !/(inc|llc|ltd|corp|gmbh|holdings|limited)\b/i.test(line))
      continue;
    if (!/[A-Za-z]/.test(line) || !/[A-Z]/.test(line)) continue;

    const jm = line.match(JUR_RE);
    const jurisdiction = jm ? canonicalJurisdiction(jm[1]) : undefined;
    let name = jm ? line.slice(0, jm.index).trim() : line;
    // trim trailing dotted leaders / stray separators left from the table
    name = name.replace(/[.\s,;:–—-]+$/, "").trim();
    if (name.length < 3 || name.length > 90) continue;
    // a real entity name usually carries a corporate suffix or several words
    if (!/(inc|llc|ltd|corp|company|co|gmbh|s\.?a\.?|b\.?v\.?|plc|holdings|group|kk|pty|ag|nv|sarl|limited|technologies|labs|ventures|capital|services|international)\b/i.test(name) &&
        name.split(" ").length < 2)
      continue;

    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name: sanitizeMd(name), jurisdiction });
    if (out.length >= 80) break;
  }
  return out;
}

function canonicalJurisdiction(j: string): string {
  const t = j.trim();
  if (/^(england|scotland|wales)$/i.test(t)) return "United Kingdom";
  if (/^korea$/i.test(t)) return "South Korea";
  return t.replace(/\b\w/g, (c) => c.toUpperCase());
}

/* ----------------------- business-subsection helpers ---------------------- */

/**
 * given the Business section and a subsection name (e.g. "Customers")
 * return a clean prose excerpt of that subsection if it appears as a header
 */
function subsectionExcerpt(business: string, label: string): string | undefined {
  const re = new RegExp(`\\n[ \\t]*${label}\\b`, "i");
  const at = business.search(re);
  if (at < 0) return undefined;
  const sub = business.slice(at).replace(new RegExp(`^\\s*${label}\\b[.:\\s\\-—]*`, "i"), "");
  const out = excerpt(sub, 900);
  return out.length > 120 ? out : undefined;
}

/**
 * given a body of prose and a lead-in pattern, pull the trailing list of
 * proper-noun items it introduces (e.g. "compete with A, B, and C")
 */
function clauseList(text: string, lead: RegExp): string[] {
  const m = text.match(lead);
  if (!m) return [];
  // take from the end of the lead-in up to the next sentence stop
  const after = text.slice((m.index ?? 0) + m[0].length);
  const clause = after.split(/(?<=[a-z0-9)])\.\s|[.;]\s/)[0] ?? after;
  const parts = clause
    .split(/,| and | & |\/|;/)
    .map((s) => s.replace(/^(the|other|various|certain|many|its|our|a|an)\s+/i, "").trim())
    // drop a trailing category noun left dangling on the last item
    // (e.g. "Converse brands" → "Converse", "cloud services" → "cloud")
    .map((s) => s.replace(/\s+(brands?|products?|services|segments?|divisions?|businesses)$/i, "").trim())
    .map((s) => s.replace(/\\([*_`|])/g, "$1").replace(/[*_`|]/g, "").trim());

  const out: string[] = [];
  const seen = new Set<string>();
  for (const p of parts) {
    // keep short, proper-noun-ish names; drop generic words and long phrases
    if (p.length < 2 || p.length > 40) continue;
    if (!/^[A-Z0-9]/.test(p)) continue;
    const words = p.split(/\s+/);
    if (words.length > 5) continue;
    const key = p.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
    if (out.length >= 12) break;
  }
  return out;
}

/**
 * given the Competition prose
 * return named competitor companies, if the text lists them
 */
function extractCompetitors(competition: string): string[] {
  for (const lead of [
    /compet(?:e|es|ing)\s+(?:primarily\s+)?with\s+(?:companies\s+such\s+as\s+|such\s+as\s+|firms\s+(?:such\s+as\s+|including\s+)|including\s+)?/i,
    /competitors?\s+(?:include|are|such as)\s+/i,
    /(?:such as|including)\s+/i,
  ]) {
    const list = clauseList(competition, lead);
    if (list.length >= 2) return list;
  }
  return [];
}

/**
 * given the Business section
 * return named products & services, if the text lists them
 */
function extractProductList(business: string): string[] {
  // only trust phrasings that explicitly introduce a product/brand list —
  // looser verb patterns ("sells … in Brazil, China") grab geography, not products
  for (const lead of [
    /(?:products?|services|offerings|brands)\s+(?:and\s+services\s+)?(?:include|are|such as|consist of)\s+/i,
    /(?:products?|brands?)\s+(?:are\s+sold\s+)?under\s+(?:the\s+)?/i,
  ]) {
    const list = clauseList(business, lead).filter((p) => !isGeography(p));
    if (list.length >= 3) return list;
  }
  return [];
}

const GEO = new Set(
  [
    ...JURISDICTIONS,
    "Russia", "Turkey", "Ukraine", "Egypt", "Nigeria", "Kenya", "Argentina",
    "Chile", "Colombia", "Peru", "Saudi Arabia", "Qatar", "Pakistan", "Bangladesh",
    "Europe", "Asia", "Africa", "Americas", "Latin America", "North America",
    "EMEA", "APAC", "U.S.", "US", "USA", "U.K.", "UK", "EU",
  ].map((s) => s.toLowerCase()),
);

/** given a candidate name, return true if it is a country/region, not a product */
function isGeography(name: string): boolean {
  return GEO.has(name.toLowerCase().replace(/\.$/, "").trim());
}

/**
 * given the Business section
 * return short customer-concentration facts, if disclosed
 */
function extractCustomerFacts(business: string): string[] {
  const facts: string[] = [];
  const seen = new Set<string>();
  const patterns = [
    /[^.]*\bno\s+(?:single\s+)?customer\s+account(?:ed|s)?\s+for\s+(?:more than\s+)?\d+%[^.]*\./i,
    /[^.]*\b(?:one|two|a single)\s+customer[s]?\s+account(?:ed|s)?\s+for[^.]*\./i,
    /[^.]*\baccounted\s+for\s+(?:approximately\s+)?\d+%\s+of\s+(?:our\s+)?(?:net\s+)?(?:revenue|sales)[^.]*\./i,
  ];
  for (const re of patterns) {
    const m = business.match(re);
    if (!m) continue;
    const fact = sanitizeMd(m[0].replace(/\s+/g, " ").trim());
    if (fact.length < 25 || fact.length > 220) continue;
    const key = fact.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    facts.push(fact);
    if (facts.length >= 3) break;
  }
  return facts;
}

/**
 * given a CIK and its filing list
 * return current executive officers parsed from recent Form 4 (insider) XML.
 * Form 4 raw XML carries each reporting owner's name plus their officer title,
 * which is far more reliable than parsing the 10-K's officer table.
 */
export async function fetchExecutives(
  cik: string,
  filings: FilingRef[],
): Promise<Executive[]> {
  const form4 = filings.filter((f) => f.form === "4").slice(0, 10);
  if (!form4.length) return [];
  const cikInt = parseInt(cik, 10);

  const docs = await Promise.all(
    form4.map((f) => {
      const raw = f.primaryDoc.split("/").pop(); // strip the xsl render prefix
      const acc = f.accession.replace(/-/g, "");
      return getText(`https://www.sec.gov/Archives/edgar/data/${cikInt}/${acc}/${raw}`, {
        revalidate: 86400,
      });
    }),
  );

  const byName = new Map<string, { title: string; rank: number }>();
  for (const xml of docs) {
    if (!xml || !/<isOfficer>\s*(1|true)\s*<\/isOfficer>/i.test(xml)) continue;
    const name = xml.match(/<rptOwnerName>([^<]+)<\/rptOwnerName>/i)?.[1]?.trim();
    const title = xml.match(/<officerTitle>([^<]+)<\/officerTitle>/i)?.[1]?.trim();
    if (!name || !title) continue;
    const display = reformatOwnerName(name);
    if (!byName.has(display))
      byName.set(display, { title: tidyTitle(title), rank: seniority(title) });
  }

  return [...byName.entries()]
    .map(([name, v]) => ({ name, title: v.title, rank: v.rank }))
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 6)
    .map(({ name, title }) => ({ name, title }));
}

/**
 * given an SEC reporting-owner name ("Last First Middle [Suffix]")
 * return a normal "First Middle Last [Suffix]", title-cased
 */
function reformatOwnerName(s: string): string {
  const parts = s.replace(/\s+/g, " ").trim().split(" ");
  if (parts.length < 2) return titleCaseName(s);
  let suffix = "";
  if (/^(jr|sr|ii|iii|iv|v)\.?$/i.test(parts[parts.length - 1])) {
    suffix = normSuffix(parts.pop() as string);
  }
  const lastName = parts.shift() as string;
  const out = titleCaseName(`${parts.join(" ")} ${lastName}`);
  return suffix ? `${out} ${suffix}` : out;
}

function titleCaseName(s: string): string {
  return s
    .toLowerCase()
    .replace(/(^|[\s'’-])([a-z])/g, (_, p, c) => p + c.toUpperCase());
}

function normSuffix(s: string): string {
  const t = s.replace(/\./g, "");
  return /^(ii|iii|iv|v)$/i.test(t)
    ? t.toUpperCase()
    : t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

/**
 * given a raw officer title (may be ALL CAPS, all lower, or contain entities)
 * return a tidy, consistently-cased title
 */
function tidyTitle(title: string): string {
  let t = title
    .replace(/&amp;/gi, "&")
    .replace(/&#39;|&apos;|&rsquo;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
  const letters = t.replace(/[^a-zA-Z]/g, "");
  const upper = (t.match(/[A-Z]/g) ?? []).length;
  const allCaps = letters.length > 1 && upper / letters.length > 0.8;
  const allLower = letters.length > 1 && upper === 0;
  if (allCaps || allLower) {
    t = t.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase());
  }
  // restore common business acronyms (any case -> upper)
  return t.replace(
    /\b(ceo|cfo|coo|cto|cmo|cio|clo|cpo|cao|cso|evp|svp|vp|aws|ai)\b/gi,
    (m) => m.toUpperCase(),
  );
}

/**
 * given an officer title
 * return a sort rank (lower = more senior)
 */
function seniority(title: string): number {
  const s = title.toLowerCase();
  if (/(chief executive|ceo|chair|founder|technoking)/.test(s)) return 0;
  if (/president/.test(s)) return 1;
  if (/(chief financial|cfo)/.test(s)) return 2;
  if (/(chief operating|coo)/.test(s)) return 3;
  if (/chief/.test(s)) return 4;
  if (/(evp|executive vice president)/.test(s)) return 5;
  if (/(svp|senior vice president)/.test(s)) return 6;
  return 7;
}

/* --------------------------- 10-K text helpers --------------------------- */

/**
 * given raw filing HTML
 * return readable plain text with block boundaries preserved as newlines
 */
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/(p|div|tr|h[1-6]|li)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, n) => safeCodePoint(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => safeCodePoint(parseInt(n, 16)))
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&rsquo;|&lsquo;|&apos;/gi, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/gi, '"')
    .replace(/&mdash;/gi, "—")
    .replace(/&ndash;/gi, "–")
    .replace(/&[a-z]+;/gi, " ")
    // Drop list-bullet glyphs and zero-width chars: once tags are gone these
    // leave orphaned markers ("• W …") in extracted prose. Turning them into
    // spaces lets the whitespace collapse below clean them up.
    .replace(/[•▪●◦‣⁃∙·■○‧]/g, " ")
    .replace(/[​‌‍﻿]/g, "")
    .replace(/[ \t ]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * given a unicode code point
 * return the character, or a space if the value is invalid
 */
function safeCodePoint(n: number): string {
  try {
    return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : " ";
  } catch {
    return " ";
  }
}

/**
 * given the full 10-K text
 * return the longest text block for each "Item N" section, keyed by item
 * number (the longest block is the real section, not the table-of-contents line)
 */
function sliceItems(text: string): Record<string, string> {
  const re = /\bItem\s+(\d{1,2}[A-C]?)\b[.:\s\-—]/gi;
  const marks: { item: string; idx: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) marks.push({ item: m[1].toUpperCase(), idx: m.index });

  const groups: Record<string, string[]> = {};
  for (let i = 0; i < marks.length; i++) {
    const seg = text.slice(marks[i].idx, marks[i + 1]?.idx ?? text.length);
    (groups[marks[i].item] ||= []).push(seg);
  }

  const out: Record<string, string> = {};
  for (const k of Object.keys(groups)) {
    const segs = groups[k];
    // The same "Item N" string appears in the table of contents (a short line
    // ending in a page number) and again at the real section. Drop the ToC /
    // index entries, then take the longest remaining block — the actual body.
    const body = segs.filter((s) => !isIndexBoilerplate(s));
    const pick = (body.length ? body : segs).reduce((a, b) => (b.length > a.length ? b : a), "");
    out[k] = stripIndexLines(pick);
  }
  return out;
}

// takes: a candidate "Item N" segment
// does: detects table-of-contents / index boilerplate — short blocks that name
//       the ToC/index or end in dotted leaders or a page number
// returns: true when the segment is index boilerplate, not real section prose
function isIndexBoilerplate(seg: string): boolean {
  const s = seg.trim();
  if (s.length > 600) return false; // real Item bodies are long
  if (/table of contents|index to (the\s+)?(consolidated\s+)?financial statements/i.test(s)) return true;
  if (/\.{2,}\s*\d{1,4}\s*$/.test(s)) return true; // "Risk Factors ......... 15"
  if (/^\s*Item\s+\d{1,2}[A-C]?\b[^.]*\s\d{1,4}\s*$/i.test(s) && s.length < 200) return true;
  return false;
}

// takes: a section body
// does: removes any leftover "Table of Contents" / "Index to Financial
//       Statements" boilerplate lines so the section anchors to real prose
// returns: the body with index boilerplate stripped
function stripIndexLines(seg: string): string {
  // Anchor to line starts (m flag) so we only remove boilerplate *headers*, not
  // a legitimate sentence that happens to mention these phrases mid-prose.
  return seg
    .replace(/^[ \t]*(Table of Contents|Index to (the\s+)?(Consolidated\s+)?Financial Statements)\b[^.\n]*/gim, " ")
    .replace(/[ \t]{2,}/g, " ");
}

/**
 * given a section segment
 * return a clean prose excerpt up to max chars, ending on a sentence boundary
 */
function excerpt(seg: string, max: number): string {
  let head = seg.replace(/^\s*Item\s+\d{1,2}[A-C]?\b[.:\s\-—]*/i, "");
  // Strip consecutive leading section/subsection labels — a 10-K Item 1 often
  // reads "Business" then "General" before the real prose, so one pass leaves
  // an orphaned "General" at the front.
  const label =
    /^(Business|Risk Factors|Management['’]s Discussion and Analysis[^.]*\.?|Overview|General|Introduction|Background|The Company|Our Company|Company Overview|About(?: the Company| Us)?)\b[.:\s\-—]*/i;
  // Safety net for other filers' headers (e.g. "INTRODUCTION", "BACKGROUND"):
  // a single leading ALL-CAPS word immediately followed by Title-case prose.
  const capsHeader = /^[A-Z]{4,20}\s+(?=[A-Z][a-z])/;
  for (let i = 0; i < 4; i++) {
    let next = head.replace(label, "");
    if (next === head) next = head.replace(capsHeader, "");
    if (next === head) break;
    head = next;
  }
  const t = stripArtifacts(head.replace(/\s+/g, " ").trim());
  let out: string;
  if (t.length <= max) {
    out = t;
  } else {
    const cut = t.slice(0, max + 1);
    // Prefer a hard sentence boundary so the excerpt never ends mid-clause.
    const stop = Math.max(
      cut.lastIndexOf(". "),
      cut.lastIndexOf("? "),
      cut.lastIndexOf("! "),
    );
    if (stop > max * 0.5) {
      out = cut.slice(0, stop + 1);
    } else {
      // No nearby boundary: cut on a whole word and drop the orphaned fragment.
      out = cut.slice(0, max).replace(/\s+\S*$/, "").replace(/[\s,;:•\-–—]+$/, "") + " …";
    }
  }
  return sanitizeMd(stripArtifacts(out));
}

// takes: a prose string
// does: removes stray list-bullet glyphs and the orphaned single-letter
//       fragments HTML→text conversion can leave, then collapses whitespace
// returns: the cleaned prose
function stripArtifacts(s: string): string {
  return s
    .replace(/[•▪●◦‣⁃∙·■○]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+([.,;:])/g, "$1")
    .trim();
}

/**
 * given raw filing prose
 * return it with markdown-significant characters neutralized so it can't
 * break the rendered report (stray emphasis, links, or raw HTML)
 */
function sanitizeMd(s: string): string {
  return s.replace(/[<>[\]]/g, "").replace(/([*_`|])/g, "\\$1");
}

/**
 * given the Business section
 * return an excerpt of its Competition subsection, if present
 */
function competitionExcerpt(business: string): string | undefined {
  // prefer a real "Competition" subsection header on its own line
  const header = business.search(/\n[ \t]*Competition\b/i);
  if (header >= 0) {
    const sub = business.slice(header).replace(/^\s*Competition\b[.:\s\-—]*/i, "");
    const out = excerpt(sub, 800);
    if (out.length > 120) return out;
  }
  // otherwise fall back to the first contextual mention of competition
  const any = business.search(/\bcompetit(ion|ive|ors)\b/i);
  if (any < 0) return undefined;
  const out = excerpt(business.slice(any), 800);
  return out.length > 120 ? out : undefined;
}

/**
 * given the Risk Factors section
 * return up to 8 short risk-factor headlines (heuristic: short header lines)
 */
function riskHeadlines(riskSeg: string): string[] {
  const lines = riskSeg.split("\n").map((l) => l.trim());
  const heads: string[] = [];
  const seen = new Set<string>();
  // A real risk header is risk-flavoured. Requiring this signal drops the
  // wrong-content lines other 10-K subsections produce — corporate values
  // ("Leaders Who Listen"), cost line items, product names, financial tables.
  const riskSignal =
    /\b(risk|adversel|could|may|uncertain|fail|harm|decline|disrupt|competit|regulat|complian|litigat|legal proceed|cyber|security|breach|privacy|data|supply|depend|fluctuat|volatil|intellectual property|infring|pandemic|macroeconomic|geopolit|tariff|interest rate|currency|liquidit|debt|impair|tax|climate|talent|personnel|acquisition|integration|reputation|liabilit|recall|catastroph|insur|disaster)\b/i;
  // Lines that look like other 10-K sections / financial line items, not risks.
  const notRisk =
    /\b(research and development|sales and marketing|general and administrative|cost of (revenue|sales|goods)|gross (profit|margin)|net (income|sales|revenue)|operating (income|expenses?|margin)|cash (flow|and cash)|total (assets|liabilities|revenue|equity)|balance sheet|stockholders.? equity|properties|legal proceedings|mine safety|exhibits|signatures|our (people|values|culture|mission|purpose)|making a difference|leaders who)\b/i;
  for (const line of lines) {
    if (line.length < 16 || line.length > 130) continue;
    if (/[.;:]$/.test(line)) continue; // headers usually don't end in punctuation
    if (/table of contents|index to (the\s+)?(consolidated\s+)?financial statements/i.test(line)) continue;
    if (/^(item|index|table of contents|page|part [ivx]+|form 10-k|annual report|the following|see )/i.test(line)) continue;
    if (/\.{2,}\s*\d{1,4}\s*$/.test(line) || /\s\d{1,4}\s*$/.test(line)) continue; // ToC page-number lines
    if (!/[a-z]/.test(line)) continue; // skip ALL-CAPS noise / numbers
    if (notRisk.test(line)) continue; // not a risk — another section's header
    if (!riskSignal.test(line)) continue; // must read like a risk
    const words = line.split(/\s+/);
    if (words.length < 3 || words.length > 18) continue;
    if (!/^[A-Z“"]/.test(line)) continue;
    const clean = sanitizeMd(line.replace(/\s+/g, " "));
    const key = clean.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
    if (seen.has(key)) continue; // dedupe repeated category headers
    seen.add(key);
    heads.push(clean);
    if (heads.length >= 8) break;
  }
  return heads;
}

/**
 * given the full 10-K text
 * return the disclosed employee count phrase, if found
 */
function extractEmployees(text: string): string | undefined {
  const m = text.match(
    /(?:had|employed|approximately|of)\s+([\d,]{4,})\s+(?:full-?\s?time\s+)?(?:employees|people|persons)/i,
  );
  return m ? m[1].replace(/,/g, ",") : undefined;
}

const NAME = "[A-Z][A-Za-z.'’-]+(?:\\s+[A-Z][A-Za-z.'’-]+){1,3}";
const EXEC_AGE = new RegExp(`^(${NAME})\\s+(\\d{2})\\s+(.{4,90})$`);
const EXEC_COMMA = new RegExp(`^(${NAME})\\s*[,—–-]\\s*(.{4,90})$`);

/**
 * given a string
 * return true if it reads like an executive title
 */
function looksLikeTitle(s: string): boolean {
  return (
    s.length <= 90 &&
    /\b(chief|president|chair(man|woman)?|vice\s+president|general counsel|treasurer|secretary|officer|controller|principal)\b/i.test(
      s,
    )
  );
}

const EXEC_NAME_ONLY = new RegExp(`^${NAME}$`);

/**
 * given a candidate string
 * return true if it reads like a real person's name (not a title, header, or
 * bio sentence) — used to validate the executive-officers table
 */
function isExecName(s: string): boolean {
  if (!EXEC_NAME_ONLY.test(s)) return false;
  const words = s.split(/\s+/);
  if (words.length < 2 || words.length > 4) return false;
  if (/^(mr|ms|mrs|dr|messrs)\b/i.test(s)) return false; // bio honorific, not the roster name
  // A leading word ending in a period that isn't an initial ("Directors.",
  // "Palantir.", "Inc.") is document chrome bleeding into the name.
  const first = words[0];
  if (/\.$/.test(first) && first.replace(/\./g, "").length > 1) return false;
  // Reject strings that are actually titles, table headers, or document chrome.
  if (
    /\b(name|office|offices|age|position|title|officer|officers|chief|president|vice|chair|directors?|executive|senior|treasurer|secretary|counsel|controller|principal|department|division|board|since|proxy|statement|ownership|requirement|current|general|manager|experience|compensation|table|summary|annual|report|notice|meeting|committee|founder|former|independent|remarks|named|continued|nominee|elected)\b/i.test(
      s,
    )
  )
    return false;
  return true;
}

const PROXY_TITLE =
  "(?:Chair(?:man|woman)?(?: and| &) )?(?:President(?: and| &) )?Chief (?:Executive|Financial|Operating(?: and Financial)?|Technology|Legal|Product|Revenue|Accounting|Marketing) Officer";
// A company name immediately after a title => a director's role at ANOTHER firm.
const COMPANY_AFTER =
  /^\s*,?\s*(of\s+)?[A-Z][A-Za-z.&,'\- ]*?\b(Inc|Corp|Corporation|Company|Co|LLC|L\.P|Ltd|plc|Group|Holdings|Technologies|Systems|Bancorp|Airlines|Stores|Bank|Partners|Capital|Ventures|Foundation|University)\b/;

// takes: a raw matched name span (which may carry leading document noise)
// does: returns the cleanest trailing person-name (full, last-3, or last-2 words)
//       that validates as a real name
// returns: the person name, or null
function bestExecName(raw: string): string | null {
  const w = raw.split(/\s+/);
  const candidates = w.length >= 3 ? [raw, w.slice(-3).join(" "), w.slice(-2).join(" ")] : [raw];
  for (const c of candidates) if (isExecName(c)) return c;
  return null;
}

// takes: proxy (or 10-K) plain text
// does: extracts the company's OWN executive officers via "<Name>, <C-suite
//       title>", guarded against former officers and directors who hold exec
//       roles at OTHER companies, and requiring the surname to recur (real
//       officers are cited many times; a one-off director mention is dropped)
// returns: validated executives, most senior first
function extractExecsByTitle(text: string): Executive[] {
  const re = new RegExp(`(${NAME})\\s*,?\\s+(?:our |the )?(${PROXY_TITLE})\\b`, "g");
  const cand = new Map<string, { name: string; title: string }>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const pre = text.slice(Math.max(0, m.index - 14), m.index);
    const post = text.slice(re.lastIndex, re.lastIndex + 60);
    if (/former/i.test(pre)) continue; // former officer
    if (/^\s+of\b/.test(post) || COMPANY_AFTER.test(post)) continue; // role at another company
    const name = bestExecName(m[1].trim());
    if (!name) continue;
    const surname = name.split(/\s+/).pop() as string;
    const freq = (text.match(new RegExp("\\b" + escapeRegExp(surname), "g")) || []).length;
    const title = m[2].trim();
    // Officers recur throughout the filing; the CEO/Chair slot is the one a
    // board member who runs ANOTHER company can spoof, and that director is
    // mentioned far less than the real CEO — so demand pervasive mentions for
    // a top-rank title (real CEOs score 48-148; a one-off director ~14).
    const minFreq = seniority(title) === 0 ? 25 : 3;
    if (freq < minFreq) continue;
    const key = name.toLowerCase();
    const prev = cand.get(key);
    if (!prev || seniority(title) < seniority(prev.title)) cand.set(key, { name, title });
  }
  return [...cand.values()]
    .map((c) => ({ name: c.name, title: cleanTitle(c.title) }))
    .sort((a, b) => seniority(a.title) - seniority(b.title))
    .slice(0, 6);
}

/**
 * given a CIK and the recent filing list
 * return executive officers parsed from the latest DEF 14A proxy — the fallback
 * for companies that omit the officer table from their 10-K (incorporating it by
 * reference). Returns [] on any failure.
 */
export async function fetchProxyExecutives(
  cik: string,
  filings: FilingRef[],
): Promise<Executive[]> {
  try {
    const proxy = filings.find((f) => f.form === "DEF 14A");
    if (!proxy?.primaryDoc) return [];
    const cikInt = parseInt(cik, 10);
    const acc = proxy.accession.replace(/-/g, "");
    const url = `https://www.sec.gov/Archives/edgar/data/${cikInt}/${acc}/${proxy.primaryDoc}`;
    const html = await getText(url, { revalidate: 86400 });
    if (!html) return [];
    return extractExecsByTitle(htmlToText(html));
  } catch (e) {
    console.error("proxy exec fetch error", e);
    return [];
  }
}

/**
 * given the full 10-K text
 * return the executive officers (name + title) from the
 * "Information about our Executive Officers" section, if present.
 * Handles two common layouts: a single line ("Name Age Title" / "Name, Title")
 * and a two-line table where the name and the office sit on adjacent lines.
 */
function extractExecutives(text: string): Executive[] {
  const idx = text.search(
    /(Information about our Executive Officers|Executive Officers of (the |our )?(Registrant|Company)|Our Executive Officers)/i,
  );
  if (idx < 0) return [];
  const section = text.slice(idx, idx + 6000);
  const lines = section.split("\n").map((l) => l.trim()).filter(Boolean);

  const out: Executive[] = [];
  const seen = new Set<string>();
  const add = (name: string, title: string) => {
    const clean = name.replace(/\s+/g, " ").trim();
    if (!isExecName(clean)) return;
    const key = clean.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ name: clean, title: cleanTitle(title) });
  };

  // Pass A — two-line table: a name line immediately followed by a title line.
  // This is the most common modern layout (e.g. Oracle's "Name / Office(s)").
  for (let i = 0; i < lines.length - 1 && out.length < 8; i++) {
    const a = lines[i];
    const b = lines[i + 1];
    if (isExecName(a) && looksLikeTitle(b) && !isExecName(b)) add(a, b);
  }

  // Pass B — single-line layouts, as a fallback when the table isn't present.
  if (out.length < 3) {
    for (const line of lines) {
      if (out.length >= 8) break;
      let m = line.match(EXEC_AGE);
      if (m && looksLikeTitle(m[3])) {
        add(m[1], m[3]);
        continue;
      }
      m = line.match(EXEC_COMMA);
      if (m && looksLikeTitle(m[2])) add(m[1], m[2]);
    }
  }

  return out.slice(0, 8);
}

/**
 * given a raw title string
 * return it trimmed to the title itself (drop trailing tenure/bio sentences)
 */
function cleanTitle(t: string): string {
  return t
    .split(/\s+(?:Since|since|Mr\.|Ms\.|Mrs\.|Dr\.|He |She |Prior |From |has |joined)/)[0]
    .replace(/\s+/g, " ")
    .replace(/[.;,]+\s*$/, "")
    .trim();
}

// XBRL concept candidates, in priority order
// each metric lists candidate concepts in two taxonomies: US GAAP (domestic
// filers) and IFRS (foreign private issuers filing 20-F under ifrs-full).
const CONCEPTS = {
  revenue: {
    gaap: [
      "RevenueFromContractWithCustomerExcludingAssessedTax",
      "Revenues",
      "RevenueFromContractWithCustomerIncludingAssessedTax",
      "SalesRevenueNet",
    ],
    ifrs: ["Revenue", "RevenueFromContractsWithCustomers"],
  },
  netIncome: { gaap: ["NetIncomeLoss"], ifrs: ["ProfitLoss", "ProfitLossAttributableToOwnersOfParent"] },
  grossProfit: { gaap: ["GrossProfit"], ifrs: ["GrossProfit"] },
  rnd: { gaap: ["ResearchAndDevelopmentExpense"], ifrs: ["ResearchAndDevelopmentExpense"] },
  opIncome: { gaap: ["OperatingIncomeLoss"], ifrs: ["ProfitLossFromOperatingActivities"] },
  assets: { gaap: ["Assets"], ifrs: ["Assets"] },
  liabilities: { gaap: ["Liabilities"], ifrs: ["Liabilities"] },
  equity: {
    gaap: ["StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"],
    ifrs: ["Equity", "EquityAttributableToOwnersOfParent"],
  },
  buybacks: { gaap: ["PaymentsForRepurchaseOfCommonStock"], ifrs: ["PaymentsToAcquireOrRedeemEntitysShares"] },
};

type Concept = { gaap: string[]; ifrs: string[] };

/**
 * given the facts root, determine the reporting currency: USD if present,
 * otherwise the first ISO currency the revenue concept reports in (EUR, JPY…)
 */
function detectCurrency(f: any): string {
  const sources: [string, string[]][] = [
    ["us-gaap", CONCEPTS.revenue.gaap],
    ["ifrs-full", CONCEPTS.revenue.ifrs],
  ];
  for (const [ns, names] of sources) {
    for (const name of names) {
      const units = f[ns]?.[name]?.units;
      if (units) {
        if (units.USD) return "USD";
        const cur = Object.keys(units).find((k) => /^[A-Z]{3}$/.test(k));
        if (cur) return cur;
      }
    }
  }
  return "USD";
}

/**
 * given the facts root, a namespace, concept names, currency, and period type
 * return one merged annual series, filling each fiscal year from the
 * highest-priority concept that reports it.
 */
function mergedAnnualNs(
  f: any,
  ns: string,
  names: string[],
  currency: string,
  instant: boolean,
): YearValue[] {
  const root = f?.[ns];
  if (!root) return [];
  const byFy = new Map<number, number>();
  for (const name of names) {
    const units = root[name]?.units?.[currency];
    if (!Array.isArray(units)) continue;
    for (const yv of toAnnual(units, instant)) {
      if (!byFy.has(yv.fy)) byFy.set(yv.fy, yv.val);
    }
  }
  return [...byFy.entries()]
    .map(([fy, val]) => ({ fy, val }))
    .sort((a, b) => a.fy - b.fy);
}

/**
 * given a metric concept, try US GAAP then IFRS and return the first that
 * yields a series, in the detected reporting currency
 */
function seriesFor(
  f: any,
  concept: Concept,
  currency: string,
  instant: boolean,
): YearValue[] {
  const gaap = mergedAnnualNs(f, "us-gaap", concept.gaap, currency, instant);
  if (gaap.length) return gaap;
  return mergedAnnualNs(f, "ifrs-full", concept.ifrs, currency, instant);
}

/**
 * given raw XBRL USD entries
 * return one clean annual value per fiscal year (10-K full-year periods)
 * instant=true for balance-sheet items (point in time); false for flows
 */
function toAnnual(entries: any[] | null, instant: boolean): YearValue[] {
  if (!entries) return [];
  const byFy = new Map<number, { val: number; end: string }>();
  for (const e of entries) {
    if (e.fp !== "FY" || !e.fy) continue;
    if (!instant) {
      if (!e.start || !e.end) continue;
      const days =
        (new Date(e.end).getTime() - new Date(e.start).getTime()) / 86_400_000;
      if (days < 350 || days > 380) continue; // keep only full-year durations
    }
    const prev = byFy.get(e.fy);
    if (!prev || e.end > prev.end) byFy.set(e.fy, { val: e.val, end: e.end });
  }
  return [...byFy.entries()]
    .map(([fy, v]) => ({ fy, val: v.val }))
    .sort((a, b) => a.fy - b.fy);
}

/**
 * given a CIK
 * return multi-year financial series pulled from XBRL company facts
 */
export async function fetchFinancials(cik: string): Promise<Financials | null> {
  const facts = await getJson<any>(
    `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`,
  );
  if (!facts?.facts) return null;
  const f = facts.facts;
  const currency = detectCurrency(f);
  return {
    currency,
    revenue: seriesFor(f, CONCEPTS.revenue, currency, false),
    netIncome: seriesFor(f, CONCEPTS.netIncome, currency, false),
    grossProfit: seriesFor(f, CONCEPTS.grossProfit, currency, false),
    rnd: seriesFor(f, CONCEPTS.rnd, currency, false),
    opIncome: seriesFor(f, CONCEPTS.opIncome, currency, false),
    assets: seriesFor(f, CONCEPTS.assets, currency, true),
    liabilities: seriesFor(f, CONCEPTS.liabilities, currency, true),
    equity: seriesFor(f, CONCEPTS.equity, currency, true),
    buybacks: seriesFor(f, CONCEPTS.buybacks, currency, false),
  };
}
