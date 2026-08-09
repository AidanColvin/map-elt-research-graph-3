"use client";

import type { ProvenanceLayout } from "./provenanceLayout";
import { PROVENANCE_SOURCES, diagramDescription, pathState } from "./provenanceSources";

/**
 * takes a geometry, the index being highlighted, and a handler for that index
 * draws the five records, the lines into the assembled brief, and the dashed
 * trace from citation one back to a single filing
 * returns the SVG element
 */
export default function ProvenanceFigure({
  layout,
  active,
  onActiveChange,
}: {
  layout: ProvenanceLayout;
  active: number | null;
  onActiveChange: (index: number | null) => void;
}) {
  const { nodes, paths, doc, docLabel, bars, citeMark, tracePath } = layout;
  return (
    <svg
      className="v4-diagram"
      viewBox={layout.viewBox}
      role="img"
      aria-labelledby="provenance-title provenance-desc"
      preserveAspectRatio="xMidYMid meet"
    >
      <title id="provenance-title">Five public records assembled into one cited brief</title>
      <desc id="provenance-desc">{diagramDescription()}</desc>

      {/* Lines first, so a highlighted node's tinted fill sits over them. */}
      {paths.map((d, i) => (
        <path
          key={`path-${i}`}
          className="v4-path"
          data-state={pathState(i, active)}
          data-testid={`provenance-path-${i}`}
          d={d}
        />
      ))}

      {/* The assembled brief. */}
      <rect
        className="v4-doc-box"
        x={doc.x}
        y={doc.y}
        width={doc.w}
        height={doc.h}
      />
      <text className="v4-doc-label" x={docLabel.x} y={docLabel.y}>
        Assembled brief
      </text>
      {bars.map((bar, i) => (
        <rect
          key={`bar-${i}`}
          className="v4-doc-bar"
          x={bar.x}
          y={bar.y}
          width={bar.w}
          height={6}
        />
      ))}
      <text className="v4-cite-mark" x={citeMark.x} y={citeMark.y}>
        1
      </text>

      {/* Claim 1, traced back to the filing it came from. */}
      <path className="v4-trace-line" d={tracePath} />
      <text
        className="v4-trace-label"
        x={layout.traceLabel.x}
        y={layout.traceLabel.y}
      >
        sec.gov/Archives/…
      </text>
      <text
        className="v4-doc-label"
        x={layout.traceCaption.x}
        y={layout.traceCaption.y}
      >
        Claim 1 traces to one filing.
      </text>

      {/* The five records. Each is focusable and tappable, so hover is never the
          only way to read what a record contributes. */}
      {nodes.map((node, i) => (
        <g
          key={PROVENANCE_SOURCES[i].name}
          className="v4-node"
          data-active={active === i}
          data-testid={`provenance-node-${i}`}
          tabIndex={0}
          role="button"
          aria-pressed={active === i}
          aria-label={`${PROVENANCE_SOURCES[i].name} — what it contributes`}
          onMouseEnter={() => onActiveChange(i)}
          onMouseLeave={() => onActiveChange(null)}
          onFocus={() => onActiveChange(i)}
          onBlur={() => onActiveChange(null)}
          onClick={() => onActiveChange(active === i ? null : i)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onActiveChange(active === i ? null : i);
            }
          }}
        >
          <rect
            className="v4-node-box"
            x={node.x}
            y={node.y}
            width={node.w}
            height={node.h}
            rx={4}
          />
          <text className="v4-node-label" x={node.labelX} y={node.labelY}>
            {PROVENANCE_SOURCES[i].name}
          </text>
        </g>
      ))}
    </svg>
  );
}
