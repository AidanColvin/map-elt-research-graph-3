/** Curated sector list mirroring the backend's known sector seeds. */
export const SECTORS = [
  "Oncology",
  "Biotech",
  "Pharmaceutical",
  "Medtech",
  "Healthcare",
  "Health IT",
  "Rural Health",
  "Ag-Bio",
  "Technology",
  "Software",
  "Artificial Intelligence",
  "Semiconductors",
  "Cybersecurity",
  "Cloud Computing",
  "Fintech",
  "Quantum Computing",
  "Robotics",
  "Telecom",
  "Climate Tech",
  "Energy",
  "Automotive",
  "Aerospace",
  "Consumer",
  "Retail",
  "Finance",
  "Financials",
  "Information Technology",
  "Insurance",
  "Industrial",
  "Social Media",
  "Consumer Electronics",
  "Gaming",
  "Streaming",
  // S&P 500 GICS sectors
  "Consumer Discretionary",
  "Consumer Staples",
  "Communication Services",
  "Utilities",
  "Materials",
  "Real Estate",
];

// Sector signal words. If a typed subject contains any of these (as a whole
// word, or as a multi-word phrase), it reads as an industry/sector rather than
// a single company — e.g. "health tech", "AI", "clean energy", "defense".
const SECTOR_KEYWORDS = [
  "tech", "technology", "health", "healthcare", "bio", "biotech", "biotechnology",
  "pharma", "pharmaceutical", "pharmaceuticals", "medtech", "medical", "medicine",
  "software", "hardware", "ai", "artificial intelligence", "machine learning", "ml",
  "data", "analytics", "cloud", "cyber", "cybersecurity", "security",
  "semiconductor", "semiconductors", "chips", "fintech", "finance", "financial",
  "banking", "insurance", "insurtech", "quantum", "robotic", "robotics",
  "telecom", "telecommunications", "climate", "energy", "renewable", "solar",
  "automotive", "mobility", "aerospace", "defense", "defence", "space",
  "consumer", "retail", "ecommerce", "e-commerce", "industrial", "manufacturing",
  "logistics", "supply chain", "agriculture", "agtech", "ag-bio", "gaming",
  "entertainment", "media", "social media", "social network",
  "oncology", "cardiology", "neurology", "genomics",
  "gene therapy", "diagnostics", "devices", "sector", "industry", "services",
  "platforms", "saas", "edtech", "proptech", "foodtech", "nanotech",
  // Product / lifestyle categories — prevent Wikipedia-style company misclassification
  "shoes", "footwear", "apparel", "fashion", "clothing", "sportswear",
  "alcohol", "beer", "wine", "spirits", "beverage", "beverages",
  "food", "snacks", "candy", "confectionery", "dairy",
  "furniture", "home goods", "cosmetics", "beauty", "skincare",
  "jewelry", "luxury", "hotel", "hospitality", "travel", "airlines",
  "streaming", "music", "publishing", "advertising",
  // Electronics & gaming product categories
  "laptop", "laptops", "computer", "computers", "personal computer", "pc", "pcs",
  "smartphone", "smartphones", "phone", "phones", "mobile phone",
  "tablet", "tablets", "wearable", "wearables", "smartwatch",
  "television", "televisions", "tv", "tvs", "monitor",
  "gaming", "video game", "video games", "esports", "game console", "console",
  "consumer electronics", "electronics",
  // Automotive / mobility
  "electric vehicle", "electric vehicles", "ev", "evs", "car", "cars", "truck", "trucks",
  // Food & beverage
  "coffee", "restaurant", "restaurants", "fast food", "grocery",
  // S&P GICS sector names + variants
  "consumer discretionary", "discretionary", "consumer staples", "staples",
  "communication services", "communications", "utilities", "utility",
  "materials", "chemicals", "chemical", "mining", "metals",
  "real estate", "reit", "reits",
];

// takes: a free-text subject typed into the unified Projects search
// does: decides whether the subject reads as an industry/sector or a single
//       company — checks the curated SECTORS list (exact/substring), then
//       sector signal words and phrases; defaults to company when ambiguous
// returns: "sector" or "company"
export function detectSubjectKind(text: string): "company" | "sector" {
  const v = (text || "").trim().toLowerCase();
  if (!v) return "company";
  // Curated sector list — exact match, or the typed text contains a full
  // sector name. We deliberately do NOT match when a sector name merely
  // contains the typed text (the old `ls.includes(v)` branch): that misread
  // short company names embedded in a sector word as sectors — "Intel" inside
  // "Artificial Intelligence", "Arm" inside "Pharmaceutical".
  for (const s of SECTORS) {
    const ls = s.toLowerCase();
    if (ls === v || v.includes(ls)) return "sector";
  }
  // Multi-word sector phrases anywhere in the text (e.g. "artificial intelligence").
  for (const kw of SECTOR_KEYWORDS) {
    if (kw.includes(" ") && v.includes(kw)) return "sector";
  }
  // Whole-word sector keywords (so a company like "Apple" never matches "ml").
  const words = v.split(/[^a-z0-9+]+/).filter(Boolean);
  for (const w of words) {
    if (SECTOR_KEYWORDS.includes(w)) return "sector";
  }
  return "company";
}

// takes: a free-text subject typed into the unified Projects search
// does: returns the AUTHORITATIVE company-vs-sector kind. The synchronous
//       detectSubjectKind heuristic is a fast first pass; when it reads
//       "company" we confirm against the backend's curated sector resolver
//       (the same canonical_sector the Sectors page uses), which recognizes the
//       24 NAICS supersectors ("Hospitals", "Federal Government", …), their
//       abbreviations, and misspellings the client keyword list can't know.
//       We only ever UPGRADE company → sector: a query the heuristic already
//       reads as a sector stays a sector, and a backend outage falls back to
//       the heuristic, so a single-company lookup is never wrongly forced.
// returns: "sector" or "company"
export async function resolveSubjectKind(text: string): Promise<"company" | "sector"> {
  const heuristic = detectSubjectKind(text);
  if (heuristic === "sector") return "sector";
  const q = (text || "").trim();
  if (!q) return "company";
  try {
    const res = await fetch(`/api/resolve-kind?q=${encodeURIComponent(q)}`, { cache: "no-store" });
    if (res.ok) {
      const json = await res.json().catch(() => null);
      if (json?.is_sector) return "sector";
    }
  } catch {
    /* backend unreachable — fall back to the heuristic's "company" verdict */
  }
  return "company";
}

// takes: the text currently typed into a sector input
// does: finds the first sector (by list order) that begins with what was
//       typed (case-insensitive), ignoring an already-complete exact match
// returns: the full suggested sector name, or null when nothing predicts
export function getSectorSuggestion(typed: string): string | null {
  const v = typed.trim().toLowerCase();
  if (!v) return null;
  for (const s of SECTORS) {
    const lower = s.toLowerCase();
    if (lower === v) return null;
    if (lower.startsWith(v)) return s;
  }
  return null;
}
