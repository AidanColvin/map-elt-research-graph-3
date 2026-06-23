import { describe, it, expect } from 'vitest';
import {
  CSV_COLUMNS,
  csvField,
  buildSignalRows,
  toCsv,
  partnershipCsv,
} from '@/lib/partnershipCsv';
import type { PartnerData } from '@/components/workspace/PartnershipsView';

const NOW = 2026;

// Minimal structurally-valid payload exercising every signal type.
const DATA = {
  query: 'Acme',
  type: 'company',
  clinical: {
    count: 1,
    top_authors: ['Smith J'],
    papers: [{ pmid: '1', title: 'Paper, with comma', authors: ['Smith J'], year: '2023', url: 'https://pubmed/1' }],
  },
  coi: { count: 1, papers: [{ pmid: '2', title: 'COI', authors: ['Doe A'], year: '2018', url: 'https://pubmed/2' }], window_years: 5 },
  financial: { quotes: [{ text: 'UNC tie', filing_url: 'https://sec/x' }], filing_url: 'https://sec/x' },
  ecosystem: [],
  nih_grants: [{ project_num: 'R01', title: 'Grant', pi: 'Rowe S', department: 'Pharm', fiscal_year: '2024', url: 'https://nih/1' }],
  trials: [{ nct_id: 'NCT1', title: 'Trial', phase: '2', status: 'Recruiting', lead_sponsor: 'Acme', collaborators: [], unc_signal: 'UNC', url: 'https://ct/1' }],
  unc_patents: [{ patent_id: 'US9', title: 'IP', date: '2010-01-01', school: 'Pharmacy' }],
} as unknown as PartnerData;

describe('csvField — RFC 4180 escaping', () => {
  it('quotes fields with commas, quotes, or newlines and doubles inner quotes', () => {
    expect(csvField('plain')).toBe('plain');
    expect(csvField('a,b')).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField('line\nbreak')).toBe('"line\nbreak"');
    expect(csvField(3.5)).toBe('3.5');
  });
});

describe('buildSignalRows', () => {
  it('emits one row per signal across all types, highest score first', () => {
    const rows = buildSignalRows(DATA, 'Acme', NOW);
    const types = rows.map((r) => r.signal_type);
    expect(types).toContain('NIH grant');
    expect(types).toContain('Clinical trial');
    expect(types).toContain('UNC patent');
    expect(types).toContain('SEC filing mention');
    expect(types).toContain('Co-authored paper');
    expect(types).toContain('COI disclosure');
    // Recent, high-weight signals (2024 grant) outrank the 2010 patent.
    const grant = rows.find((r) => r.signal_type === 'NIH grant')!;
    const patent = rows.find((r) => r.signal_type === 'UNC patent')!;
    expect(grant.score).toBeGreaterThan(patent.score);
    expect(rows[0].score).toBeGreaterThanOrEqual(rows[rows.length - 1].score);
    // Contact + source columns populated from the underlying records.
    expect(grant.unc_contact).toBe('Rowe S');
    expect(grant.source_url).toBe('https://nih/1');
  });
});

describe('toCsv / partnershipCsv', () => {
  it('writes the fixed CRM header and one CRLF line per signal', () => {
    const csv = partnershipCsv(DATA, 'Acme', NOW);
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe(CSV_COLUMNS.join(','));
    expect(lines.length).toBe(buildSignalRows(DATA, 'Acme', NOW).length + 1);
    // Plain rows (no special chars) stay unquoted: company,type,contact,...
    expect(lines.some((l) => l.startsWith('Acme,NIH grant,Rowe S,2024,'))).toBe(true);
  });
});
