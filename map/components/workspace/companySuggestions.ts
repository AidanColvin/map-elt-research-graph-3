import { ACCOUNTS } from "./accountsData";

/**
 * The pool of company names the Company Profile input predicts from, ordered
 * by prominence so a short prefix resolves to the best-known match first. It
 * blends well-known public companies, the curated deep-dive set, and every
 * Account name, deduplicated case-insensitively.
 */

// Prominent public companies first — a short prefix resolves to these.
const PROMINENT = [
  "Apple",
  "Microsoft",
  "Amazon",
  "Alphabet (Google)",
  "NVIDIA",
  "Meta",
  "Tesla",
  "Netflix",
  "Anthropic",
  "OpenAI",
  "Adobe",
  "Salesforce",
  "Oracle",
  "Intel",
  "AMD",
  "Qualcomm",
  "Broadcom",
  "Cisco",
  "IBM",
  "Palantir",
  "Snowflake",
  "Databricks",
  "ServiceNow",
  "Workday",
  "Shopify",
  "Uber",
  "Airbnb",
  "PayPal",
  "Visa",
  "Mastercard",
  "JPMorgan Chase",
  "Bank of America",
  "Goldman Sachs",
  "Morgan Stanley",
  "BlackRock",
  "Berkshire Hathaway",
  "Walmart",
  "Costco",
  "Target",
  "Home Depot",
  "Nike",
  "Starbucks",
  "McDonald's",
  "Coca-Cola",
  "PepsiCo",
  "Procter & Gamble",
  "Johnson & Johnson",
  "Pfizer",
  "Merck",
  "Eli Lilly",
  "AbbVie",
  "Bristol Myers Squibb",
  "Moderna",
  "Amgen",
  "Gilead Sciences",
  "Regeneron",
  "Vertex Pharmaceuticals",
  "AstraZeneca",
  "Novartis",
  "Roche",
  "Bayer",
  "GSK",
  "Sanofi",
  "Medtronic",
  "Abbott Laboratories",
  "Boston Scientific",
  "Stryker",
  "Intuitive Surgical",
  "Thermo Fisher Scientific",
  "Danaher",
  "Labcorp",
  "IQVIA",
  "UnitedHealth Group",
  "Exxon Mobil",
  "Chevron",
  "NextEra Energy",
  "First Solar",
  "Enphase Energy",
  "General Motors",
  "Ford Motor",
  "Rivian",
  "Lucid Group",
  "Boeing",
  "Lockheed Martin",
  "RTX",
  "Northrop Grumman",
  "General Dynamics",
  "Caterpillar",
  "Honeywell",
  "General Electric",
  "3M",
  "Deere & Company",
  "CrowdStrike",
  "Palo Alto Networks",
  "Fortinet",
  "Zscaler",
  "Okta",
  "Datadog",
  "MongoDB",
  "Twilio",
  "Block",
  "Coinbase",
  "Robinhood",
  "Spotify",
  "Disney",
  "Comcast",
  "Verizon",
  "AT&T",
  "T-Mobile",
  "IonQ",
  "Rigetti Computing",
  "D-Wave Quantum",
  "Teladoc Health",
  "Doximity",
  "Hims & Hers Health",
  "Veeva Systems",
];

// takes: nothing
// does: builds the deduplicated suggestion pool (prominent names + Account
//       names), keeping the first (most prominent) casing of any duplicate
// returns: the ordered array of unique company names
function buildPool(): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of [...PROMINENT, ...ACCOUNTS.map((a) => a.account)]) {
    const key = name.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

const POOL = buildPool();

// takes: the text currently typed into the company input
// does: finds the highest-priority pool name that begins with what was typed
//       (case-insensitive), ignoring an already-complete exact match
// returns: the full suggested company name, or null when nothing predicts
export function getCompanySuggestion(typed: string): string | null {
  const v = typed.trim().toLowerCase();
  if (!v) return null;
  for (const name of POOL) {
    const lower = name.toLowerCase();
    if (lower === v) return null; // already complete — no ghost
    if (lower.startsWith(v)) return name;
  }
  return null;
}
