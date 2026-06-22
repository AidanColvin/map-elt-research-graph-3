import { describe, it, expect } from "vitest";
import { detectSubjectKind } from "@/components/workspace/sectors";

describe("detectSubjectKind", () => {
  it("recognizes sectors", () => {
    for (const s of ["Health Tech", "health tech", "Oncology", "AI", "artificial intelligence",
                     "fintech", "Clean Energy", "defense", "Semiconductors", "biotech"]) {
      expect(detectSubjectKind(s), s).toBe("sector");
    }
  });
  it("treats plain company names as companies", () => {
    // "Intel" / "Arm" are substrings of "Artificial Intelligence" / "Pharmaceutical"
    // respectively — they must NOT be read as sectors (regression: sectors.ts
    // no longer matches when a sector name merely contains the typed text).
    for (const c of ["Apple", "Bandwidth", "Lockheed Martin", "Moderna", "Epic Games", "Intel", "Arm"]) {
      expect(detectSubjectKind(c), c).toBe("company");
    }
  });
  it("defaults empty to company", () => {
    expect(detectSubjectKind("")).toBe("company");
  });
});
