import { describe, it, expect, vi } from "vitest";
import {
  isAcceptableSource, parseRevenueToNumber, normalizeLegalName, tickerOf,
  validateIncomingCompany, mergeCompaniesIntoDB,
} from "@/lib/dedup";
import type { AccountProfile } from "@/components/workspace/accountProfile";

// Minimal AccountProfile factory (all-empty defaults + overrides).
function acct(p: Partial<AccountProfile>): AccountProfile {
  return {
    account: "", founded: "", companyAliases: "", parentAccount: "",
    topIndustrySectorProfile: "", secondaryIndustrySectorProfile: "", description: "",
    website: "", companyStructure: "", ownership: "", streetAddress: "", city: "",
    state: "", zipCode: "", country: "", approximateEmployees: "", approximateRevenue: "",
    keyProducts: "", businessSplit: "", researchBy: "", dateOfResearch: "",
    resources: "", linkToReport: "", homepage: "", employees: null,
    uncPartner: { status: "none" }, uncAngle: "", ...p,
  };
}

// A pipeline sector-profile shaped like report_builder._profile output.
function profile(over: any = {}): any {
  return {
    company_name: "Newco Therapeutics",
    sector_tag: "Oncology",
    overview: { text: "A company.", sources: ["https://www.sec.gov/x"] },
    facts: { ticker: { value: "NWCO" }, cik: { value: "12345" }, revenue: { value: "$4.2B (FY2025)" } },
    pipeline: [],
    ...over,
  };
}

describe("isAcceptableSource", () => {
  it("accepts SEC EDGAR and other primary URLs", () => {
    expect(isAcceptableSource("https://www.sec.gov/x")).toBe(true);
    expect(isAcceptableSource("https://clinicaltrials.gov/y")).toBe(true);
  });
  it("rejects blocklisted, empty, and non-http sources", () => {
    expect(isAcceptableSource("https://en.wikipedia.org/wiki/X")).toBe(false);
    expect(isAcceptableSource("https://www.linkedin.com/company/x")).toBe(false);
    expect(isAcceptableSource("")).toBe(false);
    expect(isAcceptableSource("not a url")).toBe(false);
  });
});

describe("parseRevenueToNumber", () => {
  it("parses numbers and B/M/K strings", () => {
    expect(parseRevenueToNumber(1234)).toBe(1234);
    expect(parseRevenueToNumber("$4.2B (FY2025)")).toBe(4.2e9);
    expect(parseRevenueToNumber("$716.9B")).toBeCloseTo(716.9e9);
  });
  it("returns null for placeholders", () => {
    expect(parseRevenueToNumber("N/A")).toBeNull();
    expect(parseRevenueToNumber("Not disclosed")).toBeNull();
    expect(parseRevenueToNumber(null)).toBeNull();
  });
});

describe("normalizeLegalName", () => {
  it("collapses suffixes and punctuation", () => {
    expect(normalizeLegalName("Apple Inc.")).toBe("apple");
    expect(normalizeLegalName("Apple")).toBe("apple");
    expect(normalizeLegalName("Bristol-Myers Squibb Company")).toBe("bristol myers squibb");
  });
});

describe("tickerOf", () => {
  it("extracts a bare alias ticker, then an exchange-tagged one", () => {
    expect(tickerOf(acct({ companyAliases: "Apple Inc., AAPL" }))).toBe("AAPL");
    expect(tickerOf(acct({ ownership: "Public (NASDAQ: CSCO)" }))).toBe("CSCO");
    expect(tickerOf(acct({ companyAliases: "no ticker here" }))).toBe("");
  });
});

describe("validateIncomingCompany", () => {
  it("maps a valid profile, sanitizes revenue, stamps provenance", () => {
    const row = validateIncomingCompany(profile(), "Oncology", "2026-06-15");
    expect(row).not.toBeNull();
    expect(row!.account).toBe("Newco Therapeutics");
    expect(row!.companyAliases).toBe("NWCO");
    expect(row!.researchBy).toBe("Pipeline — Oncology — 2026-06-15");
  });
  it("rejects a company with no legal name", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(validateIncomingCompany(profile({ company_name: "" }), "S", "d")).toBeNull();
    warn.mockRestore();
  });
  it("rejects a company with neither ticker nor CIK", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(validateIncomingCompany(profile({ facts: {} }), "S", "d")).toBeNull();
    warn.mockRestore();
  });
  it("rejects a company with no acceptable source", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const p = profile({ overview: { text: "x", sources: ["https://wikipedia.org/x"] } });
    expect(validateIncomingCompany(p, "S", "d")).toBeNull();
    warn.mockRestore();
  });
  it("blanks an unparseable revenue rather than keeping a string placeholder", () => {
    const p = profile({ facts: { cik: { value: "1" }, revenue: { value: "N/A" } } });
    const row = validateIncomingCompany(p, "S", "d");
    expect(row!.approximateRevenue).toBe("");
  });
});

describe("mergeCompaniesIntoDB", () => {
  it("adds exactly the new company from a dup/new/invalid trio", () => {
    const existing = [acct({ account: "Apple Inc.", companyAliases: "AAPL" })];
    // 1 duplicate (Apple, by name), 1 new, 1 with no identity (dropped).
    const incoming = [
      acct({ account: "Apple", companyAliases: "AAPL" }),
      acct({ account: "Newco Therapeutics", companyAliases: "NWCO" }),
      acct({ account: "", companyAliases: "" }),
    ];
    const merged = mergeCompaniesIntoDB(existing, incoming);
    const added = merged.slice(existing.length);
    expect(added).toHaveLength(1);
    expect(added[0].account).toBe("Newco Therapeutics");
  });
  it("never overwrites an existing curated record on ticker match", () => {
    const existing = [acct({ account: "Cisco Systems, Inc.", ownership: "Public (NASDAQ: CSCO)" })];
    const incoming = [acct({ account: "Cisco", companyAliases: "CSCO" })];
    expect(mergeCompaniesIntoDB(existing, incoming)).toHaveLength(1);
  });
});
