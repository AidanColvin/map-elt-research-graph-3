import { describe, it, expect } from "vitest";
import { safeUrl } from "@/lib/markdownSafe";

/**
 * Standalone unit version of the safeUrl assertions that also live in
 * tests/e2e/security.spec.ts — runs without a browser.
 */
describe("safeUrl markdown link allowlist", () => {
  describe("blocks dangerous schemes", () => {
    it("blocks javascript:", () => {
      expect(safeUrl("javascript:alert(1)")).toBe("");
    });

    it("blocks JavaScript: regardless of case", () => {
      expect(safeUrl("JavaScript:alert(1)")).toBe("");
    });

    it("blocks leading-space-obfuscated javascript:", () => {
      expect(safeUrl("  javascript:alert(1)")).toBe("");
    });

    it("blocks tab-obfuscated java\\tscript:", () => {
      expect(safeUrl("java\tscript:alert(1)")).toBe("");
    });

    it("blocks data:text/html URLs", () => {
      expect(safeUrl("data:text/html,<script>alert(1)</script>")).toBe("");
    });

    it("blocks vbscript:", () => {
      expect(safeUrl("vbscript:msgbox(1)")).toBe("");
    });

    it("blocks protocol-relative //evil.com", () => {
      expect(safeUrl("//evil.example.com")).toBe("");
    });
  });

  describe("allows the link types reports actually use", () => {
    it("allows https://", () => {
      expect(safeUrl("https://www.sec.gov/x")).toBe("https://www.sec.gov/x");
    });

    it("allows http://", () => {
      expect(safeUrl("http://example.com")).toBe("http://example.com");
    });

    it("allows mailto:", () => {
      expect(safeUrl("mailto:a@b.com")).toBe("mailto:a@b.com");
    });

    it("allows in-page anchors (#...)", () => {
      expect(safeUrl("#sources")).toBe("#sources");
    });

    it("allows same-origin root paths (/...)", () => {
      expect(safeUrl("/local/path")).toBe("/local/path");
    });

    it("returns '' for the empty string", () => {
      expect(safeUrl("")).toBe("");
    });
  });
});
