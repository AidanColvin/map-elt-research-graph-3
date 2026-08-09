"use client";

import { useEffect, useRef, useState } from "react";
import { PFIZER_DEMO as D } from "./pfizerDemoData";

// Cumulative millisecond thresholds at which each step becomes visible.
// A single elapsed-time counter drives every step (instead of chained
// setTimeout calls per step), so there's one timer to reason about and no
// risk of two chains racing each other after a re-render.
const T_TITLE = 0;
const T_TYPE_START = 400;
const T_TYPE_END = 2400;
// One threshold per report line, in the order they appear in PFIZER_DEMO.lines.
const LINE_TIMES = [2800, 3200, 3600, 4000];
const T_FORMATS = 4400;
const T_FADE_START = 8600;
const T_LOOP = 9000;
const TICK_MS = 80;

// takes: nothing
// does: reads the OS-level reduced-motion preference and keeps it in sync
// returns: true if the user has requested reduced motion
function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

// takes: an onFocusSearch callback fired when the panel is clicked
// does: renders a self-assembling sample Pfizer brief on a looping timeline,
//       standing in for a real report so visitors see the product work
//       before typing anything themselves
// returns: the demo panel element
export default function DemoPanel({ onFocusSearch }: { onFocusSearch: () => void }) {
  const reducedMotion = useReducedMotion();
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);
  const elapsedRef = useRef(0);

  // takes: nothing (closure over paused/reducedMotion)
  // does: ticks a single elapsed-time counter forward on an interval, looping
  //       back to 0 once the sequence's hold finishes; frozen while paused or
  //       under reduced motion. Deliberately NOT gated on viewport
  //       intersection: an IntersectionObserver here reported a stale
  //       "off-screen" during hydration and never fired again, leaving the
  //       panel permanently blank. Browsers already throttle interval timers
  //       in background tabs, which is the case that actually matters.
  // returns: nothing
  useEffect(() => {
    if (reducedMotion || paused) return;
    const id = window.setInterval(() => {
      elapsedRef.current = elapsedRef.current + TICK_MS >= T_LOOP ? 0 : elapsedRef.current + TICK_MS;
      setElapsed(elapsedRef.current);
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [paused, reducedMotion]);

  // takes: nothing (closure over setElapsed)
  // does: resets the panel to the beginning of the sequence
  // returns: nothing
  function replay() {
    elapsedRef.current = 0;
    setElapsed(0);
  }

  const t = reducedMotion ? T_LOOP : elapsed;
  const typedLen = t < T_TYPE_START
    ? 0
    : t >= T_TYPE_END
      ? D.overview.length
      : Math.floor(((t - T_TYPE_START) / (T_TYPE_END - T_TYPE_START)) * D.overview.length);
  const typed = D.overview.slice(0, typedLen);
  const restarting = !reducedMotion && t >= T_FADE_START;
  const show = (threshold: number) => reducedMotion || t >= threshold;

  return (
    <div
      role="group"
      aria-label="Sample company brief for Pfizer assembling with cited sources."
      onClick={onFocusSearch}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      tabIndex={0}
      style={{
        maxWidth: 720,
        width: "100%",
        background: "var(--panel)",
        border: "1px solid var(--line)",
        borderRadius: "var(--r-card)",
        padding: 24,
        cursor: "pointer",
        position: "relative",
        // Same rest elevation as the search field, so the two objects on the
        // page read as the same material.
        boxShadow: "var(--shadow-rest)",
      }}
    >
      {!reducedMotion && (
        <button
          aria-label="Replay demo"
          onClick={(e) => {
            e.stopPropagation();
            replay();
          }}
          className="demo-replay"
          style={{
            position: "absolute",
            top: 14,
            right: 14,
            width: 28,
            height: 28,
            borderRadius: "50%",
            border: "1px solid var(--line)",
            background: "var(--panel)",
            color: "var(--ink-tertiary)",
            fontSize: 13,
            cursor: "pointer",
            opacity: paused ? 1 : 0,
            transition: "opacity 150ms ease-out",
          }}
        >
          ↺
        </button>
      )}

      <div aria-hidden="true" className="demo-fade" style={{ opacity: restarting ? 0 : 1 }}>
        <p
          className="demo-fade"
          style={{ opacity: show(T_TITLE) ? 1 : 0, fontSize: 17, fontWeight: 600, color: "var(--ink-secondary)", marginBottom: 12, letterSpacing: "-0.01em" }}
        >
          {D.title}
        </p>

        <p data-demo-overview style={{ fontSize: "var(--text-body)", color: "var(--ink)", lineHeight: 1.6, marginBottom: 16, minHeight: reducedMotion ? undefined : 66 }}>
          {typed}
          {!reducedMotion && t >= T_TYPE_START && t < T_TYPE_END && (
            <span className="demo-caret" aria-hidden="true">|</span>
          )}
        </p>

        {D.lines.map((line, i) => (
          <DemoLine
            key={line.chip}
            visible={show(LINE_TIMES[i])}
            text={line.text}
            chip={line.chip}
            last={i === D.lines.length - 1}
          />
        ))}

        <div
          data-demo-formats
          className="demo-fade"
          style={{ opacity: show(T_FORMATS) ? 1 : 0, display: "flex", gap: 8, marginTop: 18, flexWrap: "wrap" }}
        >
          {D.formats.map((f) => (
            <span key={f} style={chipStyle}>{f}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

// takes: whether this line should be visible yet, its sentence, and its
//        source chip label
// does: renders one fade+rise report line with a trailing source chip
// returns: the line element
function DemoLine({ visible, text, chip, last }: { visible: boolean; text: string; chip: string; last?: boolean }) {
  return (
    <div
      className="demo-fade demo-rise"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "10px 0",
        borderBottom: last ? "none" : "1px solid var(--bg-sunken)",
      }}
    >
      <span style={{ fontSize: "var(--text-body)", color: "var(--ink)" }}>{text}</span>
      <span style={{ ...chipStyle, flexShrink: 0 }}>{chip}</span>
    </div>
  );
}

const chipStyle: React.CSSProperties = {
  fontSize: "var(--text-caption)",
  color: "var(--ink-secondary)",
  background: "var(--bg-sunken)",
  borderRadius: "var(--r-pill)",
  padding: "4px 10px",
  whiteSpace: "nowrap",
};
