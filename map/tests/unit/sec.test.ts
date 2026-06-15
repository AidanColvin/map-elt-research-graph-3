import { describe, it, expect } from "vitest";
import { findLatest10K } from "@/lib/sec";
import type { FilingRef } from "@/lib/types";

/**
 * sec.ts is almost entirely network-bound (EDGAR fetches) or relies on
 * module-private string helpers (htmlToText/excerpt/reformatOwnerName/etc.)
 * that are intentionally NOT exported. findLatest10K is the one exported,
 * pure, deterministic function, so that's what we cover here.
 */

const ref = (form: string): FilingRef => ({
  form,
  date: "2024-01-01",
  accession: "0000000000-00-000000",
  primaryDoc: "doc.htm",
});

describe("findLatest10K", () => {
  it("prefers a 10-K over everything else", () => {
    const filings = [ref("8-K"), ref("10-K"), ref("20-F")];
    expect(findLatest10K(filings)?.form).toBe("10-K");
  });

  it("returns the first 10-K (list is newest-first)", () => {
    const a = ref("10-K");
    const b = ref("10-K");
    const result = findLatest10K([ref("8-K"), a, b]);
    expect(result).toBe(a);
  });

  it("falls back to 10-K/A when no plain 10-K exists", () => {
    const filings = [ref("8-K"), ref("10-K/A"), ref("20-F")];
    expect(findLatest10K(filings)?.form).toBe("10-K/A");
  });

  it("falls back to 20-F when no 10-K or 10-K/A exists", () => {
    const filings = [ref("8-K"), ref("4"), ref("20-F")];
    expect(findLatest10K(filings)?.form).toBe("20-F");
  });

  it("returns null when no annual report is present", () => {
    expect(findLatest10K([ref("8-K"), ref("4"), ref("DEF 14A")])).toBeNull();
  });

  it("returns null for an empty list", () => {
    expect(findLatest10K([])).toBeNull();
  });
});
