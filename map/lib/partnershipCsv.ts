// Client-side CSV export of the resolved partnership signals, for dropping into
// a CRM. Pure string assembly — no library, no network. Each public signal
// (paper, grant, trial, patent, SEC mention, COI disclosure) becomes one row
// with a recency-weighted score reusing the talking-point decay model.

import { recencyWeight, yearOf } from '@/lib/talkingPoints';
import type { PartnerData } from '@/components/workspace/PartnershipsView';

// Base weight per signal type, before recency decay multiplies it. Structured
// public records (grants, trials, filings) outweigh softer co-authorship.
export const SIGNAL_WEIGHT: Record<string, number> = {
  'NIH grant': 3,
  'Clinical trial': 3,
  'SEC filing mention': 3,
  'Co-authored paper': 2,
  'COI disclosure': 2,
  'UNC patent': 2,
};

export const CSV_COLUMNS = ['company', 'signal_type', 'unc_contact', 'date', 'score', 'source_url'] as const;

export interface SignalRow {
  company: string;
  signal_type: string;
  unc_contact: string;
  date: string;
  score: number;
  source_url: string;
}

// takes: a signal type and its year (or null), plus the current year
// does: weights the signal type by recency decay
// returns: a rounded rank score
function rowScore(type: string, year: number | null, nowYear: number): number {
  const base = SIGNAL_WEIGHT[type] ?? 1;
  return Math.round(base * recencyWeight(year, nowYear) * 1000) / 1000;
}

// takes: the resolved partnership payload, the company label, and the year
// does: flattens every public signal into CRM rows, scored and sorted
// returns: the signal rows (highest score first)
export function buildSignalRows(
  data: PartnerData,
  company: string,
  nowYear: number,
): SignalRow[] {
  const rows: SignalRow[] = [];
  const add = (signal_type: string, unc_contact: string, dateRaw: string | number | undefined | null, source_url: string | undefined) => {
    const year = yearOf(dateRaw ?? null);
    rows.push({
      company,
      signal_type,
      unc_contact: unc_contact || '',
      date: dateRaw != null && String(dateRaw).trim() ? String(dateRaw) : '',
      score: rowScore(signal_type, year, nowYear),
      source_url: source_url || '',
    });
  };

  for (const g of data.nih_grants ?? []) add('NIH grant', g.pi || '', g.fiscal_year, g.url);
  for (const t of data.trials ?? []) add('Clinical trial', typeof t.unc_signal === 'string' ? t.unc_signal : '', '', t.url);
  for (const p of data.unc_patents ?? []) add('UNC patent', p.school || '', p.date, p.patent_id ? `https://search.patentsview.org/patent/${p.patent_id}` : '');
  for (const raw of data.financial?.quotes ?? []) {
    const q = typeof raw === 'string' ? { text: raw } : raw;
    add('SEC filing mention', '', '', q.filing_url || data.financial?.filing_url);
  }
  for (const p of data.clinical?.papers ?? []) add('Co-authored paper', p.authors?.[0] || '', p.year, p.url);
  for (const p of data.coi?.papers ?? []) add('COI disclosure', p.authors?.[0] || '', p.year, p.url);

  return rows.sort((a, b) => b.score - a.score);
}

// takes: a single CSV field value
// does: escapes per RFC 4180 — quotes fields containing comma, quote, or newline
// returns: the safe field string
export function csvField(value: string | number): string {
  const s = String(value ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// takes: the signal rows
// does: serializes them to an RFC-4180 CSV with the fixed CRM header
// returns: the CSV text
export function toCsv(rows: SignalRow[]): string {
  const lines = [CSV_COLUMNS.join(',')];
  for (const r of rows) {
    lines.push(CSV_COLUMNS.map((c) => csvField(r[c])).join(','));
  }
  return lines.join('\r\n');
}

// takes: the resolved payload, the company label, and the current year
// does: end-to-end convenience — rows then CSV text
// returns: the CSV text
export function partnershipCsv(data: PartnerData, company: string, nowYear: number): string {
  return toCsv(buildSignalRows(data, company, nowYear));
}
