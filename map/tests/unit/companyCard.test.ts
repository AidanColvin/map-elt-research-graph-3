import { describe, it, expect } from "vitest";
import { buildCardData } from "@/lib/companyCard";
import { buildSectorReport } from "@/lib/sectorReport";

// A non-health (Streaming) company whose ClinicalTrials.gov rows are
// sponsor-name-collision false positives, plus the low-signal talking points
// the backend always emits. This mirrors the real "Amazon in Streaming" card.
function streamingProfile() {
  return {
    company_name: "Amazon",
    facts: {
      ticker: { value: "AMZN (Nasdaq)" },
      hq: { value: "Seattle, WA" },
      sic: { value: "Retail-Catalog & Mail-Order Houses" },
      revenue: { value: "$716.92B (FY2025)" },
      rd_expense: { value: "$88.0B (FY2025)" },
      net_income: { value: "$77.67B (FY2025)" },
      total_assets: { value: "$818.04B" },
    },
    partnership_term_count: 21,
    collaboration_8k_count: 0,
    pipeline: [
      { program: "Hemodynamic Repercussions in Different Therapeutic Positions in Premature Newborn", stage: "completed", sources: [] },
      { program: "Plasma Therapy of COVID-19 in Severely Ill Patients", stage: "phase 2", sources: [] },
    ],
    unc_alignment: [
      // company_program is a ClinicalTrials.gov collision title (no clinical
      // keyword); rationale is clean faculty-overlap prose, as the backend emits.
      { company_program: "Hemodynamic Repercussions in Different Therapeutic Positions in Premature Newborn", unc_unit: "UNC Chapel Hill", rationale: "Deborah F. Tate is federally funded on topics that overlap Amazon's disclosed research focus.", sources: [] },
      { company_program: "(see SEC filings)", unc_unit: "UNC Chapel Hill (per PubMed)", rationale: "", sources: [] },
    ],
    partnership_type: "Strategic",
    existing_unc_tie: true,
  };
}

function streamingReport(profile: any) {
  return {
    report_meta: { sector: "Streaming" },
    section4_profiles: [profile],
    section6_talking_points: {
      companies: [{
        company: "Amazon",
        unc_hook: { text: "UNC's Deborah F. Tate (UNC Chapel Hill) holds active NIH funding directly overlapping Amazon's research focus.", sources: [] },
        know_pipeline: { text: "Amazon's lead disclosed study is Hemodynamic Repercussions in Different Therapeutic Positions in Premature Newborn (NA, status: completed).", sources: [] },
        know_moves: { text: "Amazon filed its most recent 8-K on 2026-06-12 (material event disclosure).", sources: [] },
        know_company: { text: "AMAZON COM INC (retail-catalog & mail-order houses) reported FY2025 revenue of $716.92B.", sources: [] },
      }],
    },
  };
}

describe("buildCardData — non-health sector gating", () => {
  const profile = streamingProfile();
  const card = buildCardData(profile, streamingReport(profile));

  it("replaces the dead Active-trials tile with a UNC signal", () => {
    expect(card.stats.some((s) => /active trial/i.test(s.label))).toBe(false);
    const unc = card.stats.find((s) => /UNC NIH overlap/i.test(s.label));
    expect(unc?.value).toBe("0");
  });

  it("omits the clinical-pipeline company bullet", () => {
    expect(card.company.some((b) => /clinical pipeline/i.test(b.text))).toBe(false);
  });

  it("keeps clinical study titles out of the Focus line", () => {
    const focus = card.company.find((b) => /^Focus/.test(b.text));
    expect(focus?.text || "").not.toMatch(/hemodynamic|plasma therapy/i);
  });

  it("omits Goal entirely for non-health (collision titles / SIC restatements)", () => {
    expect(card.goal).toHaveLength(0);
    // …but keeps the clean faculty-overlap rationale in Solution.
    expect(card.solution.some((b) => /federally funded on topics that overlap/i.test(b.text))).toBe(true);
  });

  it("synthesizes a logical talking-point argument and drops the weak filler", () => {
    const texts = card.talkingPoints.map((t) => `${t.bold} ${t.rest}`);
    // Junk filler is gone.
    expect(texts.some((t) => /filed its most recent 8-K|material event disclosure/i.test(t))).toBe(false);
    expect(texts.some((t) => /reported FY\d* revenue/i.test(t))).toBe(false);
    expect(texts.some((t) => /hemodynamic|ClinicalTrials\.gov entries|lead disclosed study/i.test(t))).toBe(false);
    // A real, layered argument is present.
    expect(card.talkingPoints.length).toBeGreaterThanOrEqual(3);
    expect(texts.some((t) => /Prior UNC tie/i.test(t))).toBe(true);
    expect(texts.some((t) => /Actively courting partners.*21/i.test(t))).toBe(true);
    expect(texts.some((t) => /R&D budget/i.test(t))).toBe(true);
  });
});

describe("buildCardData — health sector keeps clinical content", () => {
  const profile = streamingProfile();
  const report = streamingReport(profile);
  report.report_meta.sector = "Oncology";
  const card = buildCardData(profile, report);

  it("keeps the clinical pipeline for health sectors", () => {
    expect(card.company.some((b) => /clinical pipeline/i.test(b.text))).toBe(true);
    const trials = card.stats.find((s) => /trial/i.test(s.label));
    expect(trials?.value).toBe("2");
  });
});

describe("buildSectorReport — data-asset relevance", () => {
  it("never shows health informatics for a streaming sector", () => {
    const m = buildSectorReport({ report_meta: { sector: "Streaming" }, section4_profiles: [] });
    const names = m.dataAssets.map((a) => a.name).join(" | ");
    expect(names).not.toMatch(/health informatics/i);
    expect(names).toMatch(/RENCI/);
  });
});
