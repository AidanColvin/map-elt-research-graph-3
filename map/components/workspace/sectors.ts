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
  "Insurance",
  "Industrial",
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
  "entertainment", "media", "oncology", "cardiology", "neurology", "genomics",
  "gene therapy", "diagnostics", "devices", "sector", "industry", "services",
  "platforms", "saas", "edtech", "proptech", "foodtech", "nanotech",
];

// takes: a free-text subject typed into the unified Projects search
// does: decides whether the subject reads as an industry/sector or a single
//       company — checks the curated SECTORS list (exact/substring), then
//       sector signal words and phrases; defaults to company when ambiguous
// returns: "sector" or "company"
export function detectSubjectKind(text: string): "company" | "sector" {
  const v = (text || "").trim().toLowerCase();
  if (!v) return "company";
  // Curated sector list — exact, or one contained in the other.
  for (const s of SECTORS) {
    const ls = s.toLowerCase();
    if (ls === v || v.includes(ls) || ls.includes(v)) return "sector";
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
