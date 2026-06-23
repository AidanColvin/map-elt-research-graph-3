// Deterministic BD talking-point assembly and ranking. No LLM, no network — a
// pure transform from resolved partnership signals to a ranked, capped list the
// Partnerships UI renders verbatim. Kept framework-free so it unit-tests cleanly
// and the API route stays a thin wrapper.

// ── Tunable constants (config, not inline) ────────────────────────────────────

// Exponential time-decay rate applied to each signal's age in years
// (score *= e^(-k * yearsSince)). k = 0.15 ≈ 14%/yr, so a 2024 signal clearly
// outranks a 2015 one of equal base strength.
export const RECENCY_DECAY_K = 0.15;

// Age (years) assumed for an otherwise-undated signal, so undated points sit
// mid-pack rather than being treated as brand-new or ancient.
export const DEFAULT_SIGNAL_AGE_YEARS = 3;

// Base weight per evidence strength, before recency decay multiplies it.
export const STRENGTH_WEIGHT: Record<TalkingPointStrength, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

// Hard cap on points returned to the UI.
export const MAX_TALKING_POINTS = 8;

// ── Types ─────────────────────────────────────────────────────────────────────

export type TalkingPointStrength = 'high' | 'medium' | 'low';
export type TalkingPointAngle = 'R&D' | 'Talent' | 'General';

export interface UNCFacultyLead {
  pi_name: string;
  pi_email?: string;
  department?: string;
  grant_number?: string;
  project_title?: string;
  fiscal_year?: string | number;
  award_amount?: number | null;
}

export interface RelationshipSignal {
  strength: 'confirmed' | 'probable';
  filing_type?: string;
  date?: string;
  excerpt?: string;
  source_url?: string;
  nct_id?: string;
}

export interface UNCTrial {
  nct_id: string;
  title: string;
  phase?: string;
  status?: string;
  lead_sponsor?: string;
  is_joint?: boolean;
  url?: string;
  start_date?: string;
}

export interface UNCPatent {
  patent_id: string;
  title: string;
  date?: string;
  school?: string;
}

export interface TalkingPoint {
  category: 'Research Overlap' | 'Existing Relationship' | 'Partnership Opportunity' | 'Contact' | 'Strategic Overlap';
  headline: string;
  detail: string;
  strength: TalkingPointStrength;
  // The angle this point serves — lets the UI split R&D vs talent outreach.
  angle?: TalkingPointAngle;
  // The representative year of the underlying signal (null when undated).
  year?: number | null;
  // The recency-weighted rank score (higher = surfaced first).
  score?: number;
  // Best-effort primary-source link, surfaced for one-click export.
  source_url?: string;
}

export interface TalkingPointsRequest {
  company_name: string;
  unc_faculty_leads?: UNCFacultyLead[];
  relationship_signals?: RelationshipSignal[];
  unc_trials?: UNCTrial[];
  unc_patents?: UNCPatent[];
  company_summary?: string;
}

// ── Small helpers ───────────────────────────────────────────────────────────

// takes: a string and a max length
// does: truncates to max with an ellipsis when over-long
// returns: the (possibly truncated) string
export function trunc(s: string | undefined | null, max: number): string {
  if (!s) return '';
  return s.length <= max ? s : s.slice(0, max - 1) + '…';
}

// takes: any value that may encode a year (date string, fiscal year, number)
// does: extracts the first 4-digit year in a plausible range
// returns: the year as a number, or null when none is found
export function yearOf(value: string | number | undefined | null): number | null {
  if (value == null) return null;
  const m = String(value).match(/(19|20)\d{2}/);
  if (!m) return null;
  const y = parseInt(m[0], 10);
  return y >= 1900 && y <= 2100 ? y : null;
}

// takes: a signal year (or null), the current year, and the decay rate
// does: computes the exponential recency multiplier e^(-k * age); undated
//       signals fall back to a neutral default age
// returns: a multiplier in (0, 1]
export function recencyWeight(
  year: number | null,
  nowYear: number,
  k: number = RECENCY_DECAY_K,
): number {
  const age = year == null ? DEFAULT_SIGNAL_AGE_YEARS : Math.max(0, nowYear - year);
  return Math.exp(-k * age);
}

// takes: a base strength, a year, the current year, and the decay rate
// does: multiplies the strength weight by the recency weight
// returns: the rank score (higher surfaces first)
export function scoreTalkingPoint(
  strength: TalkingPointStrength,
  year: number | null,
  nowYear: number,
  k: number = RECENCY_DECAY_K,
): number {
  return STRENGTH_WEIGHT[strength] * recencyWeight(year, nowYear, k);
}

// takes: a detail string that may contain a trailing URL
// does: extracts the first http(s) URL it finds
// returns: the URL, or undefined
function urlIn(detail: string | undefined): string | undefined {
  const m = (detail || '').match(/(https?:\/\/\S+)/);
  return m ? m[1] : undefined;
}

// ── Assembly ──────────────────────────────────────────────────────────────────

// takes: the resolved partnership payload and the current year
// does: builds every deterministic talking point, tagging each with its
//       representative year, source URL, and recency-weighted score
// returns: the unranked points (one per underlying signal)
export function buildTalkingPoints(
  body: TalkingPointsRequest,
  nowYear: number,
): TalkingPoint[] {
  const {
    company_name,
    unc_faculty_leads = [],
    relationship_signals = [],
    unc_trials = [],
    unc_patents = [],
  } = body;

  const points: TalkingPoint[] = [];
  const push = (
    p: Omit<TalkingPoint, 'score' | 'year'> & { year: number | null },
  ) => {
    points.push({
      ...p,
      source_url: p.source_url ?? urlIn(p.detail),
      score: scoreTalkingPoint(p.strength, p.year, nowYear),
    });
  };

  // 1. Confirmed relationship signals — documented, structured filings.
  for (const sig of relationship_signals.filter((s) => s.strength === 'confirmed')) {
    const datePart = sig.date ? `, ${sig.date}` : '';
    const headline = trunc(
      `${company_name} has a documented relationship with UNC (${sig.filing_type || 'filing'}${datePart})`,
      120,
    );
    const excerpt = trunc(sig.excerpt, 197);
    const detail = sig.source_url ? `${excerpt} — ${sig.source_url}` : excerpt;
    push({
      category: 'Existing Relationship',
      headline,
      detail: trunc(detail, 200),
      strength: 'high',
      angle: 'R&D',
      year: yearOf(sig.date),
      source_url: sig.source_url,
    });
  }

  // 2. Probable relationship signals — academic disclosures, weaker authority.
  for (const sig of relationship_signals.filter((s) => s.strength === 'probable')) {
    const headline = trunc(`Possible prior UNC connection: ${sig.excerpt || ''}`, 120);
    const detail = sig.source_url || sig.nct_id || '';
    push({
      category: 'Existing Relationship',
      headline,
      detail: trunc(detail, 200),
      strength: 'medium',
      angle: 'R&D',
      year: yearOf(sig.date),
      source_url: sig.source_url,
    });
  }

  // 3. Faculty leads — active NIH funding, most recent fiscal year first.
  const sortedLeads = [...unc_faculty_leads]
    .sort((a, b) => (Number(b.fiscal_year) || 0) - (Number(a.fiscal_year) || 0))
    .slice(0, 3);
  for (const lead of sortedLeads) {
    if (!lead.pi_name) continue;
    const dept = lead.department ? ` (${lead.department})` : '';
    const headline = trunc(
      `${lead.pi_name}${dept} has active NIH funding relevant to ${company_name}`,
      120,
    );
    const grantPart = lead.grant_number ? `Grant ${lead.grant_number}: ` : '';
    const titlePart = trunc(lead.project_title, 100);
    const yearPart = lead.fiscal_year ? ` (${lead.fiscal_year})` : '';
    const detail = trunc(`${grantPart}${titlePart}${yearPart}`, 200);
    const strength: TalkingPointStrength = lead.award_amount != null ? 'high' : 'medium';
    push({
      category: 'Contact',
      headline,
      detail,
      strength,
      angle: 'R&D',
      year: yearOf(lead.fiscal_year),
    });
  }

  // 4. Joint trials (is_joint), up to 3.
  for (const trial of unc_trials.filter((t) => t.is_joint).slice(0, 3)) {
    const headline = trunc(
      `UNC and ${company_name} are co-investigators on an active clinical trial`,
      120,
    );
    const titlePart = trunc(trial.title, 100);
    const meta = [trial.nct_id, trial.status].filter(Boolean).join(' · ');
    const detail = trunc(`${titlePart} — ${meta}`, 200);
    push({
      category: 'Research Overlap',
      headline,
      detail,
      strength: 'high',
      angle: 'R&D',
      year: yearOf(trial.start_date),
      source_url: trial.url,
    });
  }

  // 5. UNC patents — most recent date first, up to 2.
  const sortedPatents = [...unc_patents]
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .slice(0, 2);
  for (const patent of sortedPatents) {
    const school = patent.school || 'UNC';
    const headline = trunc(
      `UNC holds patents in ${school} relevant to ${company_name}'s sector`,
      120,
    );
    const titlePart = trunc(patent.title, 100);
    const meta = [patent.patent_id, patent.date].filter(Boolean).join(' · ');
    const detail = trunc(`${titlePart} — Patent ${meta}`, 200);
    push({
      category: 'Partnership Opportunity',
      headline,
      detail,
      strength: 'medium',
      angle: 'R&D',
      year: yearOf(patent.date),
    });
  }

  return points;
}

// takes: the unranked points
// does: sorts by recency-weighted score (desc), strength as a stable tiebreak,
//       and caps the list
// returns: the ranked, capped points
export function rankTalkingPoints(points: TalkingPoint[]): TalkingPoint[] {
  const strengthOrder = { high: 0, medium: 1, low: 2 } as const;
  return [...points]
    .sort((a, b) => {
      const sa = a.score ?? 0;
      const sb = b.score ?? 0;
      if (sb !== sa) return sb - sa;
      return strengthOrder[a.strength] - strengthOrder[b.strength];
    })
    .slice(0, MAX_TALKING_POINTS);
}

// takes: the resolved partnership payload and the current year
// does: builds, recency-ranks, and caps the talking points; falls back to a
//       single low-strength outreach prompt when no signals exist
// returns: the final ranked points for the UI
export function assembleTalkingPoints(
  body: TalkingPointsRequest,
  nowYear: number,
): TalkingPoint[] {
  const points = buildTalkingPoints(body, nowYear);
  if (points.length === 0) {
    return [
      {
        category: 'Research Overlap',
        headline: `No existing UNC relationship found in public records for ${body.company_name}`,
        detail: 'Recommend manual outreach to UNC Office of Technology Commercialization',
        strength: 'low',
        angle: 'General',
        year: null,
        score: 0,
      },
    ];
  }
  return rankTalkingPoints(points);
}
