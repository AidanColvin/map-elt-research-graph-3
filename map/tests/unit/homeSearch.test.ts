import { describe, it, expect } from "vitest";
import {
  MAX_QUERY_LENGTH,
  checkQuery,
  hasSearchableCharacter,
  isEditableElement,
  isSearchShortcut,
  normalizeQuery,
} from "@/components/home/searchQuery";
import { hasReachedViewport } from "@/components/home/homeHooks";

describe("normalizeQuery", () => {
  it("trims the ends", () => {
    expect(normalizeQuery("  Pfizer  ")).toBe("Pfizer");
  });

  it("collapses internal whitespace", () => {
    expect(normalizeQuery("gene   therapy\n\tresearch")).toBe("gene therapy research");
  });

  it("returns an empty string for whitespace only", () => {
    expect(normalizeQuery(" \n\t ")).toBe("");
  });
});

describe("hasSearchableCharacter", () => {
  it("accepts letters", () => {
    expect(hasSearchableCharacter("Pfizer")).toBe(true);
  });

  it("accepts digits", () => {
    expect(hasSearchableCharacter("3M")).toBe(true);
  });

  it("accepts non-latin letters", () => {
    expect(hasSearchableCharacter("ノバルティス")).toBe(true);
  });

  it("rejects emoji only", () => {
    expect(hasSearchableCharacter("🎉🎉🎉")).toBe(false);
  });

  it("rejects punctuation only", () => {
    expect(hasSearchableCharacter("...---...")).toBe(false);
  });
});

describe("checkQuery", () => {
  it("passes an ordinary company name through trimmed", () => {
    const result = checkQuery("  Pfizer ");
    expect(result).toEqual({ ok: true, query: "Pfizer" });
  });

  it("refuses an empty query and says what to do", () => {
    const result = checkQuery("   ");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/type a company/i);
  });

  it("refuses a query past the length ceiling", () => {
    const result = checkQuery("a".repeat(500));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("500");
  });

  it("accepts a query exactly at the ceiling", () => {
    const result = checkQuery("a".repeat(MAX_QUERY_LENGTH));
    expect(result.ok).toBe(true);
  });

  it("refuses emoji with nothing to look up", () => {
    const result = checkQuery("🎉 🎉");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/letters or numbers/i);
  });

  it("treats markup as ordinary text rather than rejecting it", () => {
    // The field must not special-case HTML; React escapes it on render, and a
    // company name is allowed to contain angle brackets.
    const result = checkQuery("<script>alert(1)</script>");
    expect(result).toEqual({ ok: true, query: "<script>alert(1)</script>" });
  });

  it("never carries an apology or an Error prefix", () => {
    for (const raw of ["", "🎉", "a".repeat(500)]) {
      const result = checkQuery(raw);
      if (!result.ok) {
        expect(result.message).not.toMatch(/sorry|error:|oops|!/i);
      }
    }
  });
});

describe("isSearchShortcut", () => {
  it("claims / when nothing editable has focus", () => {
    expect(isSearchShortcut("/", false)).toBe(true);
  });

  it("leaves / alone while the visitor is typing", () => {
    expect(isSearchShortcut("/", true)).toBe(false);
  });

  it("ignores every other key", () => {
    expect(isSearchShortcut("k", false)).toBe(false);
    expect(isSearchShortcut("Enter", false)).toBe(false);
  });
});

describe("isEditableElement", () => {
  // Minimal stand-ins: the function only reads tagName and isContentEditable.
  const el = (tagName: string, isContentEditable = false) =>
    ({ tagName, isContentEditable }) as unknown as Element;

  it("counts inputs, textareas, and selects", () => {
    expect(isEditableElement(el("INPUT"))).toBe(true);
    expect(isEditableElement(el("TEXTAREA"))).toBe(true);
    expect(isEditableElement(el("SELECT"))).toBe(true);
  });

  it("counts contenteditable regions", () => {
    expect(isEditableElement(el("DIV", true))).toBe(true);
  });

  it("does not count ordinary elements or null", () => {
    expect(isEditableElement(el("DIV"))).toBe(false);
    expect(isEditableElement(el("BUTTON"))).toBe(false);
    expect(isEditableElement(null)).toBe(false);
  });
});

describe("hasReachedViewport", () => {
  it("holds an element that is still below the fold", () => {
    expect(hasReachedViewport(1200, 900)).toBe(false);
  });

  it("reveals an element as its top edge comes into view", () => {
    expect(hasReachedViewport(700, 900)).toBe(true);
  });

  it("reveals an element the page jumped straight past", () => {
    // A jump to the end of the document leaves a middle section above the
    // viewport, having never intersected it.
    expect(hasReachedViewport(-4000, 900)).toBe(true);
  });
});
