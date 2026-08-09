'use client';

import React from 'react';

/**
 * Animated network-graph intro that plays once on load, then hands off to the
 * main app via onDone(). Builds outward from a center "map" node: spokes draw
 * to an inner ring of 8 nodes, each of those branches to small leaf nodes, and
 * faint orbital curves fade in behind. The whole thing fades out and calls
 * onDone() so the original first page takes over unchanged.
 */

const CX = 500;
const CY = 400;
const INNER_N = 8;
const INNER_R = 200;
const LEAF_R = 150;

const SEEN_KEY = 'map_seen_intro';
// Every original delay and duration is multiplied by this, so the drawing keeps
// its exact choreography while finishing inside the shorter hold below.
const SPEED = 0.5;
// Total time on screen before the fade begins, and the fade itself. Together
// they stay under the 900ms budget for the whole first impression.
const HOLD_MS = 520;
const FADE_MS = 360;

// takes: nothing
// does: checks whether this browser has already been shown the intro
// returns: true if the intro has played before
export function hasSeenIntro(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    // Storage unavailable (private mode, blocked cookies) — treat as unseen
    // and simply play the short intro again.
    return false;
  }
}

// takes: nothing
// does: records that this browser has now been shown the intro
// returns: nothing
function markIntroSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, '1');
  } catch {}
}

// takes: a number of seconds from the original choreography
// does: scales it by SPEED and formats it for a CSS time value
// returns: a CSS duration string, e.g. "0.28s"
function t(seconds: number): string {
  return `${(seconds * SPEED).toFixed(3)}s`;
}

// takes: nothing
// does: reads the OS reduced-motion preference at call time
// returns: true if the visitor asked for reduced motion
function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

type Node = { x: number; y: number; r: number; delay: number };
type Edge = { x1: number; y1: number; x2: number; y2: number; delay: number };

function buildGraph() {
  const inner: Node[] = [];
  const spokes: Edge[] = [];
  const leaves: Node[] = [];
  const branches: Edge[] = [];

  for (let i = 0; i < INNER_N; i++) {
    const ang = ((-90 + (360 / INNER_N) * i) * Math.PI) / 180;
    const x = CX + INNER_R * Math.cos(ang);
    const y = CY + INNER_R * Math.sin(ang);
    const spokeDelay = 0.08 + i * 0.01;
    spokes.push({ x1: CX, y1: CY, x2: x, y2: y, delay: spokeDelay });
    inner.push({ x, y, r: 26, delay: spokeDelay + 0.06 });

    // 2–4 leaf nodes fanning out from each inner node
    const count = 2 + (i % 3);
    const spread = 52; // total degrees of fan
    for (let j = 0; j < count; j++) {
      const off = count === 1 ? 0 : -spread / 2 + (spread / (count - 1)) * j;
      const la = ang + (off * Math.PI) / 180;
      const lr = INNER_R + LEAF_R + (j % 2) * 26;
      const lx = CX + lr * Math.cos(la);
      const ly = CY + lr * Math.sin(la);
      const bDelay = 0.18 + i * 0.01 + j * 0.01;
      branches.push({ x1: x, y1: y, x2: lx, y2: ly, delay: bDelay });
      leaves.push({ x: lx, y: ly, r: 8 + (j % 2) * 5, delay: bDelay + 0.05 });
    }
  }

  // Faint orbital ellipses for the "interconnected" feel
  const orbits = [
    { rx: 200, ry: 120, rot: 0 },
    { rx: 200, ry: 120, rot: 60 },
    { rx: 200, ry: 120, rot: 120 },
  ];

  return { inner, spokes, leaves, branches, orbits };
}

export default function Intro({ onDone }: { onDone: () => void }) {
  const g = React.useMemo(buildGraph, []);
  const [fading, setFading] = React.useState(false);
  const reduced = React.useMemo(prefersReducedMotion, []);

  // takes: nothing (closure over onDone)
  // does: records the intro as seen, fades it out, then hands off to the app
  // returns: nothing
  const finish = React.useCallback(() => {
    markIntroSeen();
    setFading(true);
    window.setTimeout(onDone, FADE_MS);
  }, [onDone]);

  React.useEffect(() => {
    // Show the graph briefly, then hand off to the app. Under reduced motion
    // the drawing animations are suppressed in CSS, so the completed graph is
    // simply held for a beat instead.
    //
    // The hold counts from navigation, not from this effect: the splash is
    // server-rendered and therefore already on screen while the bundle
    // hydrates. Charging that wait against the hold keeps a slow load from
    // stacking a full hold on top of it.
    const target = reduced ? 600 : HOLD_MS;
    const alreadyOnScreen = performance.now();
    const remaining = Math.max(0, target - alreadyOnScreen);
    const timer = window.setTimeout(finish, remaining);
    return () => window.clearTimeout(timer);
  }, [finish, reduced]);

  return (
    <main
      style={{ ...styles.wrap, opacity: fading ? 0 : 1 }}
      onClick={finish}
      title="Click to skip"
    >
      <svg className="intro-svg" viewBox="-90 -90 1180 980" style={styles.svg} role="img" aria-label="map">
        {/* Faint orbital interconnections */}
        {g.orbits.map((o, i) => (
          <ellipse
            key={`o${i}`}
            cx={CX}
            cy={CY}
            rx={o.rx}
            ry={o.ry}
            transform={`rotate(${o.rot} ${CX} ${CY})`}
            fill="none"
            stroke="#c9c7c1"
            strokeWidth={1}
            style={reduced ? { opacity: 1 } : {
              opacity: 0,
              animation: `introFade ${t(0.5)} ease forwards`,
              animationDelay: t(0.3),
            }}
          />
        ))}

        {/* Spokes: center → inner ring */}
        {g.spokes.map((e, i) => (
          <line
            key={`s${i}`}
            x1={e.x1}
            y1={e.y1}
            x2={e.x2}
            y2={e.y2}
            pathLength={1}
            stroke="#1a1a1a"
            strokeWidth={1.3}
            style={reduced ? undefined : {
              strokeDasharray: 1,
              strokeDashoffset: 1,
              animation: `introDraw ${t(0.55)} ease forwards`,
              animationDelay: t(e.delay),
            }}
          />
        ))}

        {/* Branches: inner ring → leaves */}
        {g.branches.map((e, i) => (
          <line
            key={`b${i}`}
            x1={e.x1}
            y1={e.y1}
            x2={e.x2}
            y2={e.y2}
            pathLength={1}
            stroke="#9a988f"
            strokeWidth={1}
            style={reduced ? undefined : {
              strokeDasharray: 1,
              strokeDashoffset: 1,
              animation: `introDraw ${t(0.5)} ease forwards`,
              animationDelay: t(e.delay),
            }}
          />
        ))}

        {/* Leaf nodes */}
        {g.leaves.map((n, i) => (
          <circle
            key={`l${i}`}
            cx={n.x}
            cy={n.y}
            r={n.r}
            fill="#faf9f5"
            stroke="#2a2a2a"
            strokeWidth={1.2}
            style={reduced ? { opacity: 1 } : { ...styles.popNode, animationDelay: t(n.delay) }}
          />
        ))}

        {/* Inner ring nodes */}
        {g.inner.map((n, i) => (
          <circle
            key={`i${i}`}
            cx={n.x}
            cy={n.y}
            r={n.r}
            fill="#faf9f5"
            stroke="#1a1a1a"
            strokeWidth={2}
            style={reduced ? { opacity: 1 } : { ...styles.popNode, animationDelay: t(n.delay) }}
          />
        ))}

        {/* Center node */}
        <circle
          cx={CX}
          cy={CY}
          r={70}
          fill="#faf9f5"
          stroke="#0a0a0a"
          strokeWidth={3}
          style={reduced ? { opacity: 1 } : { ...styles.popNode, animationDelay: t(0.05) }}
        />
        <text
          x={CX}
          y={CY}
          textAnchor="middle"
          dominantBaseline="central"
          style={reduced ? { ...styles.centerText, opacity: 1, animation: 'none' } : styles.centerText}
        >
          map
        </text>
      </svg>

      <div className="intro-caption" style={styles.footer}>
        Research, written for you.
      </div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    minHeight: '100dvh',
    width: '100%',
    // Same canvas as the workspace, so the hand-off is a dissolve with no
    // colour jump.
    background: 'var(--bg)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: `opacity ${FADE_MS}ms ease`,
    padding: '24px',
  },
  svg: {
    width: '100%',
    maxWidth: 860,
    height: 'auto',
  },
  popNode: {
    opacity: 0,
    transformBox: 'fill-box',
    transformOrigin: 'center',
    animation: `introPop ${t(0.3)} cubic-bezier(0.34, 1.56, 0.64, 1) forwards`,
  },
  centerText: {
    fontSize: 40,
    fontWeight: 700,
    letterSpacing: '-0.02em',
    fill: '#0a0a0a',
    opacity: 0,
    animation: `introFade ${t(0.4)} ease forwards`,
    animationDelay: t(0.08),
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Helvetica Neue', Helvetica, Arial, sans-serif",
  },
  footer: {
    marginTop: 36,
    fontSize: 13,
    letterSpacing: '0.02em',
    // The old #bbb failed contrast against the canvas; --ink-secondary
    // (#6e6e73 on #faf9f7) clears AA for normal text.
    color: 'var(--ink-secondary)',
    opacity: 0,
    animation: `introFade ${t(0.5)} ease forwards`,
    animationDelay: t(0.45),
  },
};
