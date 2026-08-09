"use client";

import Reveal from "./Reveal";

/** The two rules the report engine holds itself to, each led by its own claim. */
const RULES = [
  {
    lead: "Two sources or it doesn't ship.",
    body: "Every sector claim needs at least two independent citable URLs. Claims that don't clear the bar are flagged for review, not guessed at.",
  },
  {
    lead: "The company's own words.",
    body: "Narrative sections are extracted from the most recent 10-K, not paraphrased.",
  },
];

/**
 * takes nothing
 * renders the two rules as bold-lead paragraphs, no icons
 * returns the rules section's contents
 */
export default function RulesSection() {
  return (
    <>
      {RULES.map((rule, i) => (
        <Reveal key={rule.lead} order={i}>
          <p
            className="v4-body v4-measure"
            style={{ color: "var(--ink-2)", marginTop: i === 0 ? 0 : 24 }}
          >
            <strong style={{ color: "var(--ink)", fontWeight: 600 }}>{rule.lead}</strong>{" "}
            {rule.body}
          </p>
        </Reveal>
      ))}
    </>
  );
}
