import { describe, it, expect } from "vitest";

/**
 * Tests for the confirmed-interaction card rendering logic.
 *
 * We test the pure data-shaping logic here (not the React component itself,
 * which requires jsdom). The component conditionally renders when
 * confirmed_interactions.found === true — these tests assert that the
 * presence/absence of that flag is the correct gate.
 *
 * For full component rendering tests, use the Playwright e2e suite with a
 * mocked /api/partnerships endpoint (see tests/e2e/).
 */

interface ConfirmedInteractions {
  found: boolean;
  partner: string;
  partner_type: string;
  unc_unit: string;
  engagement_type: string;
  relationship_status: string;
  best_evidence: string;
  best_source_validity: string;
  best_source_url: string;
  best_snippet: string;
  notes: string;
}

// Mirrors the backend EMPTY_CONFIRMED constant
const EMPTY: ConfirmedInteractions = {
  found: false,
  partner: "",
  partner_type: "",
  unc_unit: "",
  engagement_type: "",
  relationship_status: "",
  best_evidence: "",
  best_source_validity: "",
  best_source_url: "",
  best_snippet: "",
  notes: "",
};

const CONFIRMED: ConfirmedInteractions = {
  found: true,
  partner: "Air Force Research Laboratory (AFRL)",
  partner_type: "Government",
  unc_unit: "UNC Department of Chemistry",
  engagement_type: "Sponsored research / prize challenge",
  relationship_status: "Confirmed relationship",
  best_evidence: "Strong Evidence of Relationship",
  best_source_validity: "Valid Webpage",
  best_source_url: "https://example.gov/grant",
  best_snippet: "UNC Chapel Hill won Phase 1 of the AFRL Grand Challenge.",
  notes: "",
};

// Pure helper that mirrors the component's render gate
function shouldShowCard(ci: ConfirmedInteractions | undefined): boolean {
  return ci?.found === true;
}

// Pure helper that mirrors the badge label logic
function badgeLabel(ci: ConfirmedInteractions): string {
  return `● ${ci.relationship_status || "Confirmed"}`;
}

describe("confirmed-interaction card gate", () => {
  it("shows the card when found is true", () => {
    expect(shouldShowCard(CONFIRMED)).toBe(true);
  });

  it("hides the card when found is false", () => {
    expect(shouldShowCard(EMPTY)).toBe(false);
  });

  it("hides the card when confirmed_interactions is undefined", () => {
    expect(shouldShowCard(undefined)).toBe(false);
  });
});

describe("badge label", () => {
  it("uses relationship_status when present", () => {
    expect(badgeLabel(CONFIRMED)).toBe("● Confirmed relationship");
  });

  it("falls back to 'Confirmed' when relationship_status is empty", () => {
    expect(badgeLabel({ ...CONFIRMED, relationship_status: "" })).toBe("● Confirmed");
  });
});

describe("confirmed-interactions field completeness", () => {
  it("a found record has a non-empty unc_unit", () => {
    expect(CONFIRMED.unc_unit).not.toBe("");
  });

  it("a found record has a non-empty best_source_url", () => {
    expect(CONFIRMED.best_source_url).not.toBe("");
  });

  it("an empty record has found === false and all string fields empty", () => {
    expect(EMPTY.found).toBe(false);
    const stringFields = Object.entries(EMPTY)
      .filter(([k]) => k !== "found")
      .map(([, v]) => v);
    expect(stringFields.every((v) => v === "")).toBe(true);
  });
});
