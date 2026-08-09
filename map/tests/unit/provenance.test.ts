import { describe, it, expect } from "vitest";
import {
  PROVENANCE_SOURCES,
  RESTING_CAPTION,
  captionFor,
  diagramDescription,
  pathState,
} from "@/components/home/provenanceSources";
import { narrowLayout, wideLayout, layoutFor } from "@/components/home/provenanceLayout";

describe("PROVENANCE_SOURCES", () => {
  it("names exactly the five records the brief is allowed to cite", () => {
    expect(PROVENANCE_SOURCES.map((s) => s.name)).toEqual([
      "SEC EDGAR",
      "ClinicalTrials.gov",
      "PubMed",
      "NIH RePORTER",
      "OpenAlex",
    ]);
  });

  it("gives every record a live https home to link to", () => {
    for (const source of PROVENANCE_SOURCES) {
      expect(source.url).toMatch(/^https:\/\//);
    }
  });
});

describe("captionFor", () => {
  it("returns the resting line when nothing is highlighted", () => {
    expect(captionFor(null)).toBe(RESTING_CAPTION);
  });

  it("returns each record's own contribution", () => {
    PROVENANCE_SOURCES.forEach((source, i) => {
      expect(captionFor(i)).toBe(source.contribution);
    });
  });

  it("falls back to the resting line for an index out of range", () => {
    expect(captionFor(9)).toBe(RESTING_CAPTION);
  });
});

describe("pathState", () => {
  it("rests every path when nothing is highlighted", () => {
    expect(pathState(0, null)).toBe("resting");
    expect(pathState(4, null)).toBe("resting");
  });

  it("activates the highlighted path and dims the rest", () => {
    expect(pathState(2, 2)).toBe("active");
    expect(pathState(0, 2)).toBe("dimmed");
    expect(pathState(4, 2)).toBe("dimmed");
  });
});

describe("diagramDescription", () => {
  it("names all five records in words, for readers who cannot see the drawing", () => {
    const description = diagramDescription();
    for (const source of PROVENANCE_SOURCES) {
      expect(description).toContain(source.name);
    }
  });
});

describe("layouts", () => {
  const layouts = { wide: wideLayout(), narrow: narrowLayout() };

  for (const [name, layout] of Object.entries(layouts)) {
    describe(name, () => {
      it("draws one node and one path per record", () => {
        expect(layout.nodes).toHaveLength(PROVENANCE_SOURCES.length);
        expect(layout.paths).toHaveLength(PROVENANCE_SOURCES.length);
      });

      it("keeps every node inside the viewBox", () => {
        const [, , width, height] = layout.viewBox.split(" ").map(Number);
        for (const node of layout.nodes) {
          expect(node.x).toBeGreaterThanOrEqual(0);
          expect(node.x + node.w).toBeLessThanOrEqual(width);
          expect(node.y).toBeGreaterThanOrEqual(0);
          expect(node.y + node.h).toBeLessThanOrEqual(height);
        }
      });

      it("keeps the document and its trace captions inside the viewBox", () => {
        const [, , width, height] = layout.viewBox.split(" ").map(Number);
        expect(layout.doc.x + layout.doc.w).toBeLessThanOrEqual(width);
        expect(layout.doc.y + layout.doc.h).toBeLessThanOrEqual(height);
        expect(layout.traceCaption.y).toBeLessThanOrEqual(height);
        expect(layout.traceLabel.y).toBeLessThanOrEqual(height);
      });

      it("keeps every text bar inside the document", () => {
        for (const bar of layout.bars) {
          expect(bar.x).toBeGreaterThanOrEqual(layout.doc.x);
          expect(bar.x + bar.w).toBeLessThanOrEqual(layout.doc.x + layout.doc.w);
          expect(bar.y).toBeGreaterThanOrEqual(layout.doc.y);
          expect(bar.y).toBeLessThanOrEqual(layout.doc.y + layout.doc.h);
        }
      });

      it("hangs the citation mark off one of the bars", () => {
        const marked = layout.bars.some(
          (bar) => Math.abs(bar.x + bar.w + 5 - layout.citeMark.x) < 0.01,
        );
        expect(marked).toBe(true);
      });

      it("starts every path at its own node's edge", () => {
        layout.paths.forEach((d, i) => {
          const [x, y] = d.slice(2).split(" ").map(Number);
          const node = layout.nodes[i];
          expect(x).toBeCloseTo(node.x + node.w, 1);
          expect(y).toBeCloseTo(node.y + node.h / 2, 1);
        });
      });
    });
  }

  it("labels each arrangement, rather than leaving it to be guessed from geometry", () => {
    expect(wideLayout().mode).toBe("wide");
    expect(narrowLayout().mode).toBe("narrow");
  });

  it("does not let node width stand in for the arrangement", () => {
    // Both arrangements use node widths under 260, so any threshold on width
    // classifies them the same way. That mistake capped the wide diagram at the
    // narrow arrangement's max-width in production.
    const wide = wideLayout().nodes[0].w;
    const narrow = narrowLayout().nodes[0].w;
    expect(wide).toBeLessThan(260);
    expect(narrow).toBeLessThan(260);
    expect(wideLayout().mode).not.toBe(narrowLayout().mode);
  });

  it("picks the narrow arrangement on a phone and the wide one otherwise", () => {
    expect(layoutFor(true).viewBox).toBe(narrowLayout().viewBox);
    expect(layoutFor(false).viewBox).toBe(wideLayout().viewBox);
  });

  it("gives the narrow arrangement a taller-than-wide box, so a phone never scrolls sideways", () => {
    const [, , width, height] = narrowLayout().viewBox.split(" ").map(Number);
    expect(height).toBeGreaterThan(width);
  });
});
