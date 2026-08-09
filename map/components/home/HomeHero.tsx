"use client";

import { useState } from "react";
import ExampleChips from "./ExampleChips";
import Reveal from "./Reveal";
import SearchField, { type FieldPick } from "./SearchField";

/** The three subjects offered under the field. */
const HERO_EXAMPLES = ["Pfizer", "Oncology", "Semiconductors"];

/**
 * takes a submit handler for a company or research area
 * renders the first screen — the headline, the one sentence under it, the one
 * search field, the example chips, and the two lines of microcopy
 * returns the hero element
 */
export default function HomeHero({ onSubmit }: { onSubmit: (query: string) => void }) {
  const [pick, setPick] = useState<FieldPick | null>(null);

  // takes: an example chip's text
  // does: hands it to the field, counting the pick so the same chip can be
  //       clicked twice in a row and still read
  // returns: nothing
  function pickExample(example: string) {
    setPick((prev) => ({ query: example, n: (prev?.n ?? 0) + 1 }));
  }

  return (
    <div style={{ textAlign: "left" }}>
      <Reveal order={0}>
        <h1 className="v4-display-1">Every sentence has a source.</h1>
      </Reveal>

      <Reveal order={1}>
        <p className="v4-lead" style={{ maxWidth: "52ch", marginTop: 24 }}>
          Map reads the filings, the trials, the papers, and the grants, and
          assembles a cited brief. No model writes a word of it.
        </p>
      </Reveal>

      <Reveal order={2}>
        <div style={{ marginTop: 40 }}>
          <SearchField onSubmit={onSubmit} pick={pick} />
        </div>
      </Reveal>

      <Reveal order={3}>
        <div style={{ marginTop: 20 }}>
          <ExampleChips
            examples={HERO_EXAMPLES}
            label="Example subjects"
            onPick={pickExample}
          />
        </div>
      </Reveal>

      <Reveal order={4}>
        <p className="v4-small" style={{ color: "var(--ink-3)", marginTop: 24 }}>
          No account. No cost. Nothing to install.
        </p>
        <p className="v4-small" style={{ color: "var(--ink-3)", marginTop: 4 }}>
          Press <span className="v4-mono">/</span> to search.
        </p>
      </Reveal>
    </div>
  );
}
