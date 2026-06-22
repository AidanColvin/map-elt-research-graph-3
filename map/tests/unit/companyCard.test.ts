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
      net_income: { value: "$77.67B (FY2025)" },
      total_assets: { value: "$818.04B" },
    },
    pipeline: [
      { program: "Hemodynamic Repercussions in Different Therapeutic Positions in Premature Newborn", stage: "completed", sources: [] },
      { program: "Plasma Therapy of COVID-19 in Severely Ill Patients", stage: "phase 2", sources: [] },
    ],
    unc_alignment: [
      { company_program: "Hemodynamic Repercussions in Different Therapeutic Positions in Premature Newborn", unc_unit: "UNC Chapel Hill", rationale: "Overlaps a UNC clinical trial.", sources: [] },
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

  it("shows zero active trials (clinical rows are collisions)", () => {
    const trials = card.stats.find((s) => /trial/i.test(s.label));
    expect(trials?.value).toBe("0");
  });

  it("omits the clinical-pipeline company bullet", () => {
    expect(card.company.some((b) => /clinical pipeline/i.test(b.text))).toBe(false);
  });

  it("keeps clinical study titles out of the Focus line", () => {
    const focus = card.company.find((b) => /^Focus/.test(b.text));
    expect(focus?.text || "").not.toMatch(/hemodynamic|plasma therapy/i);
  });

  it("drops placeholder and clinical UNC overlaps from Goal", () => {
    expect(card.goal).toHaveLength(0);
  });

  it("drops 8-K filler, revenue restatement, and clinical talking points", () => {
    const texts = card.talkingPoints.map((t) => `${t.bold} ${t.rest}`);
    expect(texts.some((t) => /8-K|material event/i.test(t))).toBe(false);
    expect(texts.some((t) => /reported FY\d* revenue/i.test(t))).toBe(false);
    expect(texts.some((t) => /hemodynamic|ClinicalTrials\.gov entries/i.test(t))).toBe(false);
    // The genuine UNC hook survives.
    expect(texts.some((t) => /Deborah F\. Tate/.test(t))).toBe(true);
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
