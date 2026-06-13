/**
 * One-off generator: pulls real, current structured data for the new
 * Companies-page accounts straight from the app's own live pipeline
 * (SEC EDGAR FY financials + 10-K employee count, Wikipedia overview).
 * Run: npx tsx scripts/fetch-accounts.mts > scripts/accounts-out.json
 */

import {
  resolveCik,
  fetchProfile,
  fetchFinancials,
  fetchRecentFilings,
  findLatest10K,
  fetch10KSections,
} from "../lib/sec";
import { fetchWikiSummary } from "../lib/wikipedia";
import { usd, latest } from "../lib/format";

// The genuinely-new accounts (everything else on the list already has a row).
// domain + category are stable facts we supply; everything financial/locational
// is pulled live below.
const NEW = [
  { ticker: "AMZN", name: "Amazon", domain: "amazon.com", top: "Technology", sec: "Retail" },
  { ticker: "BKNG", name: "Booking Holdings", domain: "bookingholdings.com", top: "Technology", sec: "Travel" },
  { ticker: "EXPE", name: "Expedia Group", domain: "expediagroup.com", top: "Technology", sec: "Travel" },
  { ticker: "ABNB", name: "Airbnb", domain: "airbnb.com", top: "Technology", sec: "Hospitality" },
  { ticker: "DASH", name: "DoorDash", domain: "doordash.com", top: "Technology", sec: "Logistics" },
  { ticker: "EBAY", name: "eBay", domain: "ebay.com", top: "Technology", sec: "Retail" },
  { ticker: "HPQ", name: "HP Inc.", domain: "hp.com", top: "Technology", sec: "Hardware" },
  { ticker: "AMAT", name: "Applied Materials", domain: "appliedmaterials.com", top: "Technology", sec: "Semiconductors" },
  { ticker: "CDW", name: "CDW", domain: "cdw.com", top: "Technology", sec: "IT Services" },
  { ticker: "CTSH", name: "Cognizant", domain: "cognizant.com", top: "Technology", sec: "IT Services" },
  { ticker: "KD", name: "Kyndryl", domain: "kyndryl.com", top: "Technology", sec: "IT Services" },
  { ticker: "MSI", name: "Motorola Solutions", domain: "motorolasolutions.com", top: "Technology", sec: "Networking" },
];

async function one(c: (typeof NEW)[number]) {
  const hit = await resolveCik(c.ticker);
  if (!hit) return { ...c, error: "no CIK" };

  const [profile, fin, filings, wiki] = await Promise.all([
    fetchProfile(hit.cik, hit.ticker, hit.title),
    fetchFinancials(hit.cik),
    fetchRecentFilings(hit.cik),
    fetchWikiSummary(hit.title),
  ]);

  const ref = filings.length ? findLatest10K(filings) : null;
  const tenk = ref ? await fetch10KSections(hit.cik, ref) : null;

  const rev = fin ? latest(fin.revenue) : undefined;
  const ni = fin ? latest(fin.netIncome) : undefined;

  return {
    ticker: hit.ticker,
    name: c.name,
    domain: c.domain,
    top: c.top,
    sec: c.sec,
    sicDescription: profile?.sicDescription ?? "",
    city: profile?.hqCity ?? "",
    state: profile?.hqState ?? "",
    exchange: profile?.exchange ?? "",
    revenueFy: rev?.fy ?? null,
    revenue: rev ? usd(rev.val) : "",
    netIncome: ni ? usd(ni.val) : "",
    employees: tenk?.employees ?? "",
    products: (tenk?.productList ?? []).slice(0, 5).join(", "),
    wikiDescription: wiki?.description ?? "",
    wikiExtract: wiki?.extract ?? "",
    wikiUrl: wiki?.url ?? "",
    tenkUrl: tenk?.url ?? "",
  };
}

const out: any[] = [];
for (const c of NEW) {
  try {
    const r = await one(c);
    out.push(r);
    process.stderr.write(`✓ ${c.name} (${c.ticker})\n`);
  } catch (e: any) {
    out.push({ ...c, error: String(e?.message ?? e) });
    process.stderr.write(`✗ ${c.name}: ${e?.message ?? e}\n`);
  }
}
process.stdout.write(JSON.stringify(out, null, 2));
