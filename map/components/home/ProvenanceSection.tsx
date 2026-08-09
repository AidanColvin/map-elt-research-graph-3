"use client";

import { useState } from "react";
import ProvenanceFigure from "./ProvenanceFigure";
import Reveal from "./Reveal";
import { useMediaQuery } from "./homeHooks";
import { layoutFor } from "./provenanceLayout";
import { captionFor } from "./provenanceSources";

/**
 * takes nothing
 * owns which record is highlighted and pairs the diagram with the caption that
 * says what that record contributes to the brief
 * returns the provenance section's contents
 */
export default function ProvenanceSection() {
  const [active, setActive] = useState<number | null>(null);
  // The wide arrangement scales its 1000-unit drawing down to the container, so
  // its mono labels shrink with it. Past ~960px that lands under 11px — which
  // covers a landscape iPhone at 932 — so the stacked arrangement takes over
  // there, earlier than the 768px the rest of the page switches at.
  const narrow = useMediaQuery("(max-width: 959px)");

  return (
    <>
      <Reveal order={0}>
        <h2 className="v4-display-2">Five public records. One document.</h2>
        <p className="v4-body v4-measure" style={{ color: "var(--ink-2)", marginTop: 16 }}>
          Hover a record to trace what it contributes.
        </p>
      </Reveal>

      <Reveal order={1}>
        <div style={{ marginTop: 48 }}>
          <ProvenanceFigure
            layout={layoutFor(narrow)}
            active={active}
            onActiveChange={setActive}
          />
        </div>
      </Reveal>

      <Reveal order={2}>
        {/* One line that swaps in place, announced politely so a screen-reader
            user gets the same information the hover gives. */}
        <p
          className="v4-body v4-measure"
          role="status"
          aria-live="polite"
          data-testid="provenance-caption"
          style={{ color: "var(--ink-2)", marginTop: 32, minHeight: "3.2em" }}
        >
          {captionFor(active)}
        </p>
      </Reveal>
    </>
  );
}
