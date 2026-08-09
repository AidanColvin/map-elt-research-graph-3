"use client";

import Reveal from "./Reveal";

/** What a finished report can be taken away as. */
const FORMATS = [
  { extension: ".pdf", label: "Report" },
  { extension: ".docx", label: "Report" },
  { extension: ".xlsx", label: "18 sheets" },
  { extension: ".pptx", label: "Deck" },
  { extension: ".md", label: "Source" },
];

/**
 * takes nothing
 * renders the headline and the five file-format tiles
 * returns the formats section's contents
 */
export default function FormatsSection() {
  return (
    <>
      <Reveal order={0}>
        <h2 className="v4-display-2">Leave with a file.</h2>
      </Reveal>
      <Reveal order={1}>
        <ul className="v4-formats" style={{ marginTop: 48 }}>
          {FORMATS.map((format) => (
            <li key={format.extension} className="v4-format-tile">
              <p className="v4-mono" style={{ color: "var(--ink)" }}>
                {format.extension}
              </p>
              <p className="v4-small" style={{ color: "var(--ink-3)", marginTop: 8 }}>
                {format.label}
              </p>
            </li>
          ))}
        </ul>
      </Reveal>
    </>
  );
}
