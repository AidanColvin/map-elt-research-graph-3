"use client";

import { useEffect, useRef } from "react";
import { FONT } from "./ui";

// One deterministic radial relationship graph for the Partnerships view. The
// resolved company sits at the center; spokes branch to the real UNC entities we
// found — named investigators, shared trials, and patents. Canvas-based, no graph
// library, no animation (so screenshots are stable). A node is only ever drawn
// when the resolved data supports it; empty categories are omitted entirely.

// ── Tunable constants (named, not magic numbers) ──────────────────────────────

// Per-category cap so a heavy company stays legible; surplus is summarized in
// the legend count rather than drawn as invented nodes.
const MAX_PER_GROUP = 6;
const CANVAS_HEIGHT = 380;
const NODE_RADIUS = 5.5;
const CENTER_RADIUS = 34;
const LABEL_MARGIN = 96; // ring-to-edge gap reserved for spoke labels

// Palette — white canvas, thin dark-gray spokes, restrained accents.
const INK = "#1d1d1f";
const SPOKE = "rgba(0,0,0,0.18)";
const GROUP_COLORS = {
  investigator: "#4B9CD3", // UNC blue
  trial: "#0071e3", // accent
  patent: "#8a8a92", // muted ink
} as const;

type GroupKey = keyof typeof GROUP_COLORS;

export interface GraphInvestigator { name: string; }
export interface GraphTrial { label: string; }
export interface GraphPatent { label: string; }

export interface PartnershipGraphProps {
  company: string;
  investigators: GraphInvestigator[];
  trials: GraphTrial[];
  patents: GraphPatent[];
}

interface PlacedNode {
  label: string;
  group: GroupKey;
  angle: number; // radians, 0 = east, clockwise on screen
}

const GROUP_ORDER: { key: GroupKey; label: string }[] = [
  { key: "investigator", label: "UNC investigators" },
  { key: "trial", label: "Shared trials" },
  { key: "patent", label: "Patents" },
];

// takes: a label string and a max length
// does: truncates with an ellipsis when over-long
// returns: the (possibly truncated) label
function trunc(s: string, max: number): string {
  const t = (s || "").trim();
  return t.length <= max ? t : t.slice(0, max - 1) + "…";
}

// takes: the resolved entities for each present group
// does: lays the nodes out deterministically — each non-empty group owns an equal
//       angular wedge (starting at the top), and its nodes spread evenly inside
//       that wedge, so the same data always yields the same picture
// returns: the placed nodes plus the present-group descriptors with counts
function layout(groups: { key: GroupKey; label: string; items: string[]; total: number }[]) {
  const present = groups.filter((g) => g.items.length > 0);
  const nodes: PlacedNode[] = [];
  const wedge = present.length ? (Math.PI * 2) / present.length : 0;
  present.forEach((g, gi) => {
    // Wedge center, with the first wedge centered at the top (-90°).
    const center = -Math.PI / 2 + wedge * (gi + 0.5);
    const span = wedge * 0.74; // padding between adjacent wedges
    const k = g.items.length;
    g.items.forEach((label, i) => {
      const frac = k === 1 ? 0.5 : i / (k - 1);
      const angle = center + (frac - 0.5) * span;
      nodes.push({ label, group: g.key, angle });
    });
  });
  return { nodes, present };
}

// takes: the company name plus its resolved investigators, trials, and patents
// does: renders the radial relationship graph onto a DPR-scaled canvas, redrawing
//       on container resize; draws nothing for groups without data
// returns: the graph element (or null when there is nothing to relate)
export default function PartnershipGraph({
  company,
  investigators,
  trials,
  patents,
}: PartnershipGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const groups = [
    {
      key: "investigator" as const,
      label: "UNC investigators",
      items: investigators.map((x) => x.name).filter(Boolean).slice(0, MAX_PER_GROUP),
      total: investigators.length,
    },
    {
      key: "trial" as const,
      label: "Shared trials",
      items: trials.map((x) => x.label).filter(Boolean).slice(0, MAX_PER_GROUP),
      total: trials.length,
    },
    {
      key: "patent" as const,
      label: "Patents",
      items: patents.map((x) => x.label).filter(Boolean).slice(0, MAX_PER_GROUP),
      total: patents.length,
    },
  ];
  const present = groups.filter((g) => g.items.length > 0);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      const W = wrap.clientWidth;
      const H = CANVAS_HEIGHT;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      const cx = W / 2;
      const cy = H / 2;
      const R = Math.max(70, Math.min(W, H) / 2 - LABEL_MARGIN);

      const { nodes } = layout(groups);

      // Spokes first, so nodes sit on top.
      ctx.strokeStyle = SPOKE;
      ctx.lineWidth = 1;
      for (const n of nodes) {
        const x = cx + Math.cos(n.angle) * R;
        const y = cy + Math.sin(n.angle) * R;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(x, y);
        ctx.stroke();
      }

      // Leaf nodes + their labels.
      ctx.font = `500 11px ${FONT}`;
      ctx.textBaseline = "middle";
      for (const n of nodes) {
        const x = cx + Math.cos(n.angle) * R;
        const y = cy + Math.sin(n.angle) * R;
        ctx.beginPath();
        ctx.fillStyle = GROUP_COLORS[n.group];
        ctx.arc(x, y, NODE_RADIUS, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = "#fff";
        ctx.stroke();

        // Label sits just beyond the node, flipped to the inboard side, and is
        // truncated to the pixel space actually left to the canvas edge so it
        // never clips — critical at narrow (390px) widths.
        const onRight = Math.cos(n.angle) >= 0;
        ctx.textAlign = onRight ? "left" : "right";
        ctx.fillStyle = INK;
        const lx = x + (onRight ? NODE_RADIUS + 6 : -(NODE_RADIUS + 6));
        const avail = (onRight ? W - lx : lx) - 4;
        let label = trunc(n.label, 20);
        while (label.length > 3 && ctx.measureText(label).width > avail) {
          label = label.slice(0, -2) + "…";
        }
        if (ctx.measureText(label).width <= avail) ctx.fillText(label, lx, y);
      }

      // Center company node — auto-fit the label inside the disc so a long name
      // never spills past the circle edge.
      ctx.beginPath();
      ctx.fillStyle = INK;
      ctx.arc(cx, cy, CENTER_RADIUS, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      const maxLabel = CENTER_RADIUS * 2 - 12;
      let label = trunc(company, 14);
      let size = 12;
      ctx.font = `600 ${size}px ${FONT}`;
      while (ctx.measureText(label).width > maxLabel && size > 9) {
        size -= 1;
        ctx.font = `600 ${size}px ${FONT}`;
      }
      // Still too wide at the floor size — trim characters until it fits.
      while (label.length > 4 && ctx.measureText(label).width > maxLabel) {
        label = label.slice(0, -2) + "…";
      }
      ctx.fillText(label, cx, cy);
    };

    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(wrap);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company, investigators, trials, patents]);

  // Nothing to relate — don't render an empty frame.
  if (!present.length) return null;

  return (
    <div
      data-testid="partnership-graph"
      style={{
        background: "#fff",
        border: "1px solid rgba(0,0,0,0.06)",
        borderRadius: 18,
        padding: 22,
        boxShadow: "0 8px 30px rgba(0,0,0,0.04)",
        fontFamily: FONT,
      }}
    >
      <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.16em", textTransform: "uppercase", color: "#9a9aa2", margin: 0 }}>
        Relationship graph
      </p>
      <p style={{ fontSize: 13, color: "#6b6b73", margin: "5px 0 8px", maxWidth: 580, lineHeight: 1.5 }}>
        {company} at the center, branching to the real UNC entities we resolved — every node traces to a primary source above.
      </p>
      <div ref={wrapRef} style={{ width: "100%" }}>
        <canvas ref={canvasRef} />
      </div>
      {/* Legend — color key plus the true counts, so a capped group still reads
          honestly (the graph shows up to the cap; the count is the full total). */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 8 }}>
        {GROUP_ORDER.filter((g) => present.some((p) => p.key === g.key)).map((g) => {
          const grp = groups.find((x) => x.key === g.key)!;
          return (
            <span key={g.key} style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12, color: "#6b6b73" }}>
              <span style={{ width: 9, height: 9, borderRadius: 999, background: GROUP_COLORS[g.key] }} />
              <strong style={{ color: "#1d1d1f", fontWeight: 600 }}>{g.label}</strong>
              <span>· {grp.total}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
