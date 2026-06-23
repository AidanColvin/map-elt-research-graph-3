/**
 * Optional Claude-powered partnership intelligence layer.
 * Called only when ANTHROPIC_API_KEY is set — absent key → null return,
 * report renders without this section, no errors.
 */

export interface CompanyDataForAnalysis {
  ticker: string;
  companyName: string;
  filingDate: string | null;
  businessSummary: string;
  topRisks: string;
  financialSummary: {
    revenue: (number | null)[];
    netIncome: (number | null)[];
    rAndD: (number | null)[];
    years: string[];
  };
  researchCount: number;
}

export interface AnalysisOutput {
  partnershipFit: string;
  rdTrajectory: string;
  riskRelevance: string;
  researchOverlap: string;
  confidence: 'high' | 'medium' | 'low';
}

export async function analyzeCompany(
  data: CompanyDataForAnalysis,
): Promise<AnalysisOutput | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const fmt = (vals: (number | null)[], years: string[], scale: number, unit: string) =>
    vals.map((v, i) => `${years[i]}: ${v != null ? '$' + (v / scale).toFixed(scale === 1e9 ? 2 : 0) + unit : 'N/A'}`).join(', ');

  const prompt = `You are a partnership intelligence analyst for UNC Chapel Hill, evaluating companies as candidates for academic-industry partnership (sponsored research, licensing, clinical collaboration). Respond ONLY with a JSON object — no preamble, no markdown fences.

Company: ${data.companyName} (${data.ticker})
10-K filed: ${data.filingDate ?? 'unknown'}

Business description (10-K Item 1 excerpt):
${data.businessSummary}

Key risks (10-K Item 1A excerpt):
${data.topRisks}

Financial data (most recent 3 years):
Revenue: ${fmt(data.financialSummary.revenue, data.financialSummary.years, 1e9, 'B')}
Net Income: ${fmt(data.financialSummary.netIncome, data.financialSummary.years, 1e6, 'M')}
R&D Spend: ${fmt(data.financialSummary.rAndD, data.financialSummary.years, 1e6, 'M')}

Research activity: ${data.researchCount} indexed works referencing this company (OpenAlex, since 2024)

Return a JSON object with exactly these keys:
{
  "partnershipFit": "<2-3 sentences evaluating fit for UNC academic partnership>",
  "rdTrajectory": "<1-2 sentences on R&D investment trend>",
  "riskRelevance": "<1-2 sentences on which stated risks are most relevant to academic collaboration>",
  "researchOverlap": "<1-2 sentences on research area alignment with academic medicine based on the data above>",
  "confidence": "<high|medium|low based on data completeness>"
}`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 600,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) return null;
    const result = await res.json();
    const raw = (result.content?.[0]?.text ?? '').replace(/```json|```/g, '').trim();
    return JSON.parse(raw) as AnalysisOutput;
  } catch {
    return null;
  }
}
