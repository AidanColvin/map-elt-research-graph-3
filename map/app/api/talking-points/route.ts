import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// ── Types ────────────────────────────────────────────────────────────────────

interface UNCFacultyLead {
  pi_name: string;
  pi_email?: string;
  department?: string;
  grant_number?: string;
  project_title?: string;
  fiscal_year?: string | number;
  award_amount?: number | null;
}

interface RelationshipSignal {
  strength: 'confirmed' | 'probable';
  filing_type?: string;
  date?: string;
  excerpt?: string;
  source_url?: string;
  nct_id?: string;
}

interface UNCTrial {
  nct_id: string;
  title: string;
  phase?: string;
  status?: string;
  lead_sponsor?: string;
  is_joint?: boolean;
  url?: string;
}

interface UNCPatent {
  patent_id: string;
  title: string;
  date?: string;
  school?: string;
}

interface TalkingPoint {
  category: 'Research Overlap' | 'Existing Relationship' | 'Partnership Opportunity' | 'Contact';
  headline: string;
  detail: string;
  strength: 'high' | 'medium' | 'low';
}

interface TalkingPointsRequest {
  company_name: string;
  unc_faculty_leads?: UNCFacultyLead[];
  relationship_signals?: RelationshipSignal[];
  unc_trials?: UNCTrial[];
  unc_patents?: UNCPatent[];
  company_summary?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function trunc(s: string | undefined | null, max: number): string {
  if (!s) return '';
  return s.length <= max ? s : s.slice(0, max - 1) + '…';
}

function isUrl(s: string): boolean {
  return s.startsWith('http://') || s.startsWith('https://');
}

// ── Assembly ─────────────────────────────────────────────────────────────────

function assembleTalkingPoints(body: TalkingPointsRequest): TalkingPoint[] {
  const {
    company_name,
    unc_faculty_leads = [],
    relationship_signals = [],
    unc_trials = [],
    unc_patents = [],
  } = body;

  const points: TalkingPoint[] = [];

  // 1. Confirmed relationship signals
  for (const sig of relationship_signals.filter(s => s.strength === 'confirmed')) {
    const datePart = sig.date ? `, ${sig.date}` : '';
    const headline = trunc(
      `${company_name} has a documented relationship with UNC (${sig.filing_type || 'filing'}${datePart})`,
      120,
    );
    const excerpt = trunc(sig.excerpt, 197);
    const detail = sig.source_url
      ? `${excerpt} — ${sig.source_url}`
      : excerpt;
    points.push({ category: 'Existing Relationship', headline, detail: trunc(detail, 200), strength: 'high' });
  }

  // 2. Probable relationship signals
  for (const sig of relationship_signals.filter(s => s.strength === 'probable')) {
    const headline = trunc(`Possible prior UNC connection: ${sig.excerpt || ''}`, 120);
    const detail = sig.source_url || sig.nct_id || '';
    points.push({ category: 'Existing Relationship', headline, detail: trunc(detail, 200), strength: 'medium' });
  }

  // 3. Faculty leads — most recent fiscal year first, up to 3
  const sortedLeads = [...unc_faculty_leads].sort((a, b) => {
    const ay = Number(a.fiscal_year) || 0;
    const by = Number(b.fiscal_year) || 0;
    return by - ay;
  }).slice(0, 3);

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
    const strength: 'high' | 'medium' = lead.award_amount != null ? 'high' : 'medium';
    points.push({ category: 'Contact', headline, detail, strength });
  }

  // 4. Joint trials (is_joint=true), up to 3
  for (const trial of unc_trials.filter(t => t.is_joint).slice(0, 3)) {
    const headline = trunc(
      `UNC and ${company_name} are co-investigators on an active clinical trial`,
      120,
    );
    const titlePart = trunc(trial.title, 100);
    const meta = [trial.nct_id, trial.status].filter(Boolean).join(' · ');
    const detail = trunc(`${titlePart} — ${meta}`, 200);
    points.push({ category: 'Research Overlap', headline, detail, strength: 'high' });
  }

  // 5. UNC patents — most recent date first, up to 2
  const sortedPatents = [...unc_patents].sort((a, b) => {
    return (b.date || '').localeCompare(a.date || '');
  }).slice(0, 2);

  for (const patent of sortedPatents) {
    const school = patent.school || 'UNC';
    const headline = trunc(
      `UNC holds patents in ${school} relevant to ${company_name}'s sector`,
      120,
    );
    const titlePart = trunc(patent.title, 100);
    const meta = [patent.patent_id, patent.date].filter(Boolean).join(' · ');
    const detail = trunc(`${titlePart} — Patent ${meta}`, 200);
    points.push({ category: 'Partnership Opportunity', headline, detail, strength: 'medium' });
  }

  // 6. Empty fallback
  if (points.length === 0) {
    points.push({
      category: 'Research Overlap',
      headline: `No existing UNC relationship found in public records for ${company_name}`,
      detail: 'Recommend manual outreach to UNC Office of Technology Commercialization',
      strength: 'low',
    });
  }

  // Sort: high → medium → low, cap at 8
  const order = { high: 0, medium: 1, low: 2 } as const;
  points.sort((a, b) => order[a.strength] - order[b.strength]);
  return points.slice(0, 8);
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let body: TalkingPointsRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.company_name || typeof body.company_name !== 'string') {
    return NextResponse.json({ error: 'company_name is required' }, { status: 400 });
  }

  const talking_points = assembleTalkingPoints(body);
  return NextResponse.json({ talking_points });
}

// Export isUrl so tests can import it without bundling the full route handler.
export { isUrl };
