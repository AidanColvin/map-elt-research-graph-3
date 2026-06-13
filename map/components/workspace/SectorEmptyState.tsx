"use client";

import { FONT } from "./ui";

/**
 * Sector Scan empty / idle state — Option C: "Split + output preview."
 *
 * Left column: headline + the popular-sector pills and recent-scan rows, each
 * of which re-runs the existing scan flow via onRun (the same callback the
 * command bar's Scan button uses). Right column: a purely presentational,
 * faded sample-output preview — no clicks, no data fetching.
 *
 * This component is intentionally self-contained and presentational apart from
 * the onRun handoff; it owns none of the scan lifecycle.
 */

const TEAL = "#0e7490";
const INK = "#1d1d1f";
const MUTED = "#6b6b70";
const FAINT = "#9a9a9f";
const HAIRLINE = "rgba(0,0,0,.06)";

const POPULAR = ["Oncology", "Semiconductors", "Clean Energy", "Biotech", "Quantum", "Gene Therapy"];

const RECENT = [
  { name: "Oncology", companies: 18, ties: 7 },
  { name: "Semiconductors", companies: 22, ties: 5 },
  { name: "Clean Energy", companies: 15, ties: 4 },
];

// A small node-graph glyph (central node + radiating satellites), tinted to
// the supplied color — reused for recent-scan tiles and the preview orbit.
function NodeGlyph({ size = 20, color = INK }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="3.2" fill={color} />
      {[0, 72, 144, 216, 288].map((deg) => {
        const r = (deg * Math.PI) / 180;
        const x = 12 + 8.2 * Math.cos(r);
        const y = 12 + 8.2 * Math.sin(r);
        return (
          <g key={deg}>
            <line x1="12" y1="12" x2={x} y2={y} stroke={color} strokeWidth="1.1" />
            <circle cx={x} cy={y} r="1.8" fill={color} />
          </g>
        );
      })}
    </svg>
  );
}

// takes: onRun — the same scan trigger the command bar uses
// does: renders the Option C split layout for the idle Sector Scan canvas
// returns: the empty-state element
export default function SectorEmptyState({ onRun }: { onRun: (sector: string) => void }) {
  return (
    <div className="ses-root" style={{ fontFamily: FONT, color: INK }}>
      {/* LEFT — guided launchpad */}
      <div className="ses-left">
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: FAINT,
            fontFamily:
              "ui-monospace, SFMono-Regular, Menlo, Monaco, 'Cascadia Mono', monospace",
          }}
        >
          Sector Scan
        </div>

        <h2
          style={{
            fontFamily: "var(--serif)",
            fontSize: 34,
            fontWeight: 600,
            lineHeight: 1.1,
            margin: "10px 0 0",
            letterSpacing: "-0.01em",
          }}
        >
          Scan a sector.
        </h2>

        <p style={{ fontSize: 15, lineHeight: 1.5, color: MUTED, margin: "12px 0 0", maxWidth: 440 }}>
          Public companies mapped to overlapping UNC research — scored and
          citation-checked in about a minute.
        </p>

        {/* Popular pills */}
        <div style={{ marginTop: 26 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: FAINT, marginBottom: 10 }}>Popular</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {POPULAR.map((s) => (
              <button
                key={s}
                type="button"
                className="ses-pill"
                onClick={() => onRun(s)}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Recent scans */}
        <div style={{ marginTop: 26 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: FAINT, marginBottom: 10 }}>
            Recent scans
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {RECENT.map((r) => (
              <button
                key={r.name}
                type="button"
                className="ses-recent"
                onClick={() => onRun(r.name)}
              >
                <span className="ses-recent-tile">
                  <NodeGlyph size={18} color={TEAL} />
                </span>
                <span style={{ flex: 1, textAlign: "left" }}>
                  <span style={{ display: "block", fontSize: 14, fontWeight: 600 }}>{r.name}</span>
                  <span style={{ display: "block", fontSize: 12, color: MUTED, marginTop: 2 }}>
                    {r.companies} companies · {r.ties} UNC ties
                  </span>
                </span>
                <span style={{ color: FAINT, fontSize: 16, flexShrink: 0 }}>→</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* RIGHT — sample output preview (presentational only) */}
      <div className="ses-right" aria-hidden>
        <div
          style={{
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: FAINT,
            fontFamily:
              "ui-monospace, SFMono-Regular, Menlo, Monaco, 'Cascadia Mono', monospace",
            marginBottom: 14,
          }}
        >
          Sample output
        </div>

        <div className="ses-card">
          <div
            style={{
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: TEAL,
              fontFamily:
                "ui-monospace, SFMono-Regular, Menlo, Monaco, 'Cascadia Mono', monospace",
            }}
          >
            Sector Scan · Life Sciences
          </div>
          <div
            style={{
              fontFamily: "var(--serif)",
              fontSize: 24,
              fontWeight: 600,
              margin: "6px 0 16px",
            }}
          >
            Oncology
          </div>

          {/* UNC connection orbit */}
          <div style={{ display: "flex", justifyContent: "center", margin: "4px 0 18px" }}>
            <svg width="150" height="120" viewBox="0 0 150 120" aria-hidden>
              <circle cx="75" cy="60" r="13" fill={TEAL} />
              <text
                x="75"
                y="64"
                textAnchor="middle"
                fontSize="9"
                fontWeight="700"
                fill="#fff"
              >
                UNC
              </text>
              {[0, 60, 120, 180, 240, 300].map((deg) => {
                const r = (deg * Math.PI) / 180;
                const x = 75 + 46 * Math.cos(r);
                const y = 60 + 40 * Math.sin(r);
                return (
                  <g key={deg}>
                    <line x1="75" y1="60" x2={x} y2={y} stroke={TEAL} strokeWidth="1" opacity="0.45" />
                    <circle cx={x} cy={y} r="6" fill="#fff" stroke={TEAL} strokeWidth="1.4" />
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Metric tiles */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
            {[
              ["18", "Companies"],
              ["7", "UNC ties"],
              ["64", "Claims"],
            ].map(([n, l]) => (
              <div
                key={l}
                style={{
                  background: "rgba(255,255,255,0.7)",
                  border: `1px solid ${HAIRLINE}`,
                  borderRadius: 10,
                  padding: "10px 8px",
                  textAlign: "center",
                }}
              >
                <div style={{ fontFamily: "var(--serif)", fontSize: 20, fontWeight: 600, color: TEAL }}>
                  {n}
                </div>
                <div style={{ fontSize: 10, color: MUTED, marginTop: 2 }}>{l}</div>
              </div>
            ))}
          </div>

          {/* Mini company grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 8,
              marginTop: 14,
            }}
          >
            {[
              ["Merck", true],
              ["Pfizer", false],
              ["AstraZeneca", true],
              ["Gilead", false],
            ].map(([name, tie]) => (
              <div
                key={name as string}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  background: "rgba(255,255,255,0.7)",
                  border: `1px solid ${HAIRLINE}`,
                  borderRadius: 10,
                  padding: "8px 10px",
                }}
              >
                <span
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 5,
                    background: TEAL,
                    color: "#fff",
                    fontSize: 10,
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  {(name as string)[0]}
                </span>
                <span style={{ fontSize: 12, fontWeight: 600, flex: 1 }}>{name}</span>
                {tie && (
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      color: TEAL,
                      background: "rgba(14,116,144,0.1)",
                      borderRadius: 999,
                      padding: "2px 6px",
                    }}
                  >
                    UNC
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
