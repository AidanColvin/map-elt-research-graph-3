import { describe, it, expect } from 'vitest';
import {
  RECENCY_DECAY_K,
  MAX_TALKING_POINTS,
  yearOf,
  recencyWeight,
  scoreTalkingPoint,
  assembleTalkingPoints,
  type TalkingPointsRequest,
} from '@/lib/talkingPoints';

const NOW = 2026;

describe('yearOf', () => {
  it('extracts a 4-digit year from dates, fiscal years, and numbers', () => {
    expect(yearOf('2024-03-01')).toBe(2024);
    expect(yearOf('FY2019')).toBe(2019);
    expect(yearOf(2015)).toBe(2015);
    expect(yearOf('no year here')).toBeNull();
    expect(yearOf(undefined)).toBeNull();
  });
});

describe('recencyWeight', () => {
  it('is 1 for a current-year signal and decays with age', () => {
    expect(recencyWeight(NOW, NOW)).toBeCloseTo(1, 10);
    expect(recencyWeight(NOW - 1, NOW)).toBeCloseTo(Math.exp(-RECENCY_DECAY_K), 10);
  });

  it('strictly decreases as a signal gets older', () => {
    const w2024 = recencyWeight(2024, NOW);
    const w2015 = recencyWeight(2015, NOW);
    expect(w2024).toBeGreaterThan(w2015);
  });

  it('never goes negative and treats future years as current', () => {
    expect(recencyWeight(2100, NOW)).toBeCloseTo(1, 10); // age clamped at 0
    expect(recencyWeight(1990, NOW)).toBeGreaterThan(0);
  });
});

describe('scoreTalkingPoint — recency dominates stale strength', () => {
  it('ranks a recent signal above an older one of equal strength', () => {
    expect(scoreTalkingPoint('high', 2024, NOW)).toBeGreaterThan(
      scoreTalkingPoint('high', 2015, NOW),
    );
  });

  it('lets a recent medium signal outrank a stale high signal', () => {
    // 2024 medium = 2·e^(-0.3) ≈ 1.48  vs  2015 high = 3·e^(-1.65) ≈ 0.58
    expect(scoreTalkingPoint('medium', 2024, NOW)).toBeGreaterThan(
      scoreTalkingPoint('high', 2015, NOW),
    );
  });
});

describe('assembleTalkingPoints', () => {
  it('a 2024 trial outranks a 2015 patent (the core requirement)', () => {
    const body: TalkingPointsRequest = {
      company_name: 'Acme',
      unc_trials: [
        { nct_id: 'NCT01', title: 'Joint study', is_joint: true, start_date: '2024-01-01' },
      ],
      unc_patents: [
        { patent_id: 'US1', title: 'Old IP', date: '2015-06-01', school: 'Pharmacy' },
      ],
    };
    const points = assembleTalkingPoints(body, NOW);
    const trialIdx = points.findIndex((p) => p.category === 'Research Overlap');
    const patentIdx = points.findIndex((p) => p.category === 'Partnership Opportunity');
    expect(trialIdx).toBeGreaterThanOrEqual(0);
    expect(patentIdx).toBeGreaterThanOrEqual(0);
    expect(trialIdx).toBeLessThan(patentIdx);
    expect(points[trialIdx].score!).toBeGreaterThan(points[patentIdx].score!);
  });

  it('sorts a recent confirmed filing above an older faculty grant', () => {
    const body: TalkingPointsRequest = {
      company_name: 'Acme',
      relationship_signals: [
        { strength: 'confirmed', filing_type: '10-K', date: '2024-02-01', excerpt: 'UNC tie', source_url: 'https://sec.gov/x' },
      ],
      unc_faculty_leads: [
        { pi_name: 'Dr. Old', department: 'Pharmacology', grant_number: 'R01', project_title: 'Legacy', fiscal_year: 2014, award_amount: 100 },
      ],
    };
    const points = assembleTalkingPoints(body, NOW);
    expect(points[0].category).toBe('Existing Relationship');
    expect(points[0].year).toBe(2024);
    expect(points[0].score!).toBeGreaterThan(points[1].score!);
  });

  it('always surfaces both an R&D and a talent angle, even with no signals', () => {
    const fallback = assembleTalkingPoints({ company_name: 'Nobody' }, NOW);
    expect(fallback.some((p) => p.angle === 'R&D')).toBe(true);
    expect(fallback.some((p) => p.angle === 'Talent')).toBe(true);
    // R&D fallback prompt is present, talent pipeline pitch is present.
    expect(fallback.some((p) => /No existing UNC relationship/.test(p.headline))).toBe(true);
    expect(fallback.some((p) => /talent pipeline for Nobody/.test(p.headline))).toBe(true);
  });

  it('keeps a talent point even when many high-strength R&D signals compete', () => {
    const many: TalkingPointsRequest = {
      company_name: 'Acme',
      unc_faculty_leads: Array.from({ length: 12 }, (_, i) => ({
        pi_name: `PI ${i}`,
        department: 'Pharmacology',
        fiscal_year: 2024,
        award_amount: 1,
      })),
    };
    const points = assembleTalkingPoints(many, NOW);
    expect(points.length).toBeLessThanOrEqual(MAX_TALKING_POINTS);
    expect(points.some((p) => p.angle === 'Talent')).toBe(true);
    expect(points.some((p) => p.angle === 'R&D')).toBe(true);
  });
});
