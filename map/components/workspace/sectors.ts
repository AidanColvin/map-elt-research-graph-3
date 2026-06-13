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
