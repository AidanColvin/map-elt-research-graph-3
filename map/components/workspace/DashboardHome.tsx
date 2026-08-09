"use client";

import { useState, useRef, useEffect } from "react";
import { getCompanySuggestion } from "./companySuggestions";
import DemoPanel from "./DemoPanel";
import HomeFooter from "./HomeFooter";

const PLACEHOLDER_PHRASES = [
  'Try "Pfizer"',
  'Try "oncology"',
  'Try "gene therapy"',
  'Try "Duke Energy"',
  'Try "medical devices"',
];
const REDUCED_MOTION_PLACEHOLDER = 'Try "Pfizer" — or any company or topic';
const CTA_PLACEHOLDER = "Your turn — try any company or topic";

export default function DashboardHome({
  onRunProject,
  onOpenCompanyView,
  onOpenSectorView,
  onPrefillSector,
}: {
  onRunProject:      (name: string) => void;
  onOpenCompanyView: () => void;
  onOpenSectorView:  () => void;
  onPrefillSector:   (name: string) => void;
}) {
  const [query, setQuery] = useState("");
  // Which of the two bars (hero / closing CTA) currently has focus. A single
  // boolean would ring BOTH bars at once, since they share this state.
  const [focusedBar, setFocusedBar] = useState<"hero" | "cta" | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [hasTyped, setHasTyped] = useState(false);
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const [placeholderVisible, setPlaceholderVisible] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);

  // Autofocus the search bar on desktop only when the home page mounts, so a
  // mouse-and-keyboard visitor can start typing immediately. Mobile keyboards
  // popping open unprompted is disorienting, so guests on a narrow viewport
  // get no autofocus at all.
  useEffect(() => {
    const isDesktop = window.matchMedia("(min-width: 768px)").matches;
    if (isDesktop) inputRef.current?.focus();
  }, []);

  // takes: nothing
  // does: reads the reduced-motion preference once and stays in sync with it
  // returns: nothing (sets reducedMotion state)
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const onChange = () => setReducedMotion(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // takes: nothing (closure over hasTyped/reducedMotion)
  // does: cycles the hero placeholder phrase every 3.5s until the visitor
  //       types their first character, permanently stopping after that. The
  //       crossfade dips opacity to 0, swaps the text, then restores it —
  //       driven by state (not a CSS animation) so the phrase always ends up
  //       visible even if the transition never runs.
  // returns: nothing
  useEffect(() => {
    if (reducedMotion || hasTyped) return;
    const t = window.setInterval(() => {
      setPlaceholderVisible(false);
      window.setTimeout(() => {
        setPlaceholderIdx((i) => (i + 1) % PLACEHOLDER_PHRASES.length);
        setPlaceholderVisible(true);
      }, 200);
    }, 3500);
    return () => window.clearInterval(t);
  }, [reducedMotion, hasTyped]);

  const suggestion = query.trim() ? getCompanySuggestion(query) : null;
  const ghost = suggestion && suggestion.toLowerCase().startsWith(query.toLowerCase())
    ? suggestion.slice(query.length)
    : null;

  function acceptSuggestion() {
    if (suggestion) setQuery(suggestion);
  }

  // takes: nothing (closure over query/onRunProject)
  // does: submits whatever text is in the field — arbitrary input included,
  //       not only autocomplete matches — and flips a brief local "generating"
  //       state; the destination view takes over from there
  // returns: nothing
  function submit() {
    const q = query.trim();
    if (!q) return;
    setSubmitting(true);
    onRunProject(q);
    // Home stays mounted (display:none) behind the destination view, so clear
    // the local loading flag on a timer rather than leaving it stuck for
    // whenever the visitor navigates back here.
    window.setTimeout(() => setSubmitting(false), 2000);
  }

  function handleChange(v: string) {
    if (!hasTyped && v.length > 0) setHasTyped(true);
    setQuery(v);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if ((e.key === "Tab" || e.key === "ArrowRight") && ghost) {
      e.preventDefault();
      acceptSuggestion();
    } else if (e.key === "Enter") {
      if (ghost) acceptSuggestion();
      submit();
    }
  }

  // takes: whether to attach the autofocus ref, the static placeholder to
  //        fall back to, and whether the cycling hero phrases should show
  // does: renders the controlled search bar — extracted so the hero and the
  //       closing CTA render the SAME bar bound to the same query state and
  //       submit() handler (no duplicated state, no second handler); only one
  //       instance ever carries the ref so autofocus can't jump between them
  // returns: the search bar element
  function SearchBar({ id, withRef, placeholder, cyclePlaceholder }: {
    id: "hero" | "cta";
    withRef: boolean;
    placeholder: string;
    cyclePlaceholder?: boolean;
  }) {
    const showOverlay = cyclePlaceholder && !query;
    const overlayText = reducedMotion ? REDUCED_MOTION_PLACEHOLDER : PLACEHOLDER_PHRASES[placeholderIdx];
    const focused = focusedBar === id;
    return (
      <div>
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          background: "var(--panel)", borderRadius: "var(--r-card)",
          border: `1.5px solid ${focused ? "var(--accent)" : "var(--line)"}`,
          boxShadow: focused ? "var(--ring)" : "none",
          padding: "4px 4px 4px 16px", transition: "all 150ms var(--ease)",
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
            <circle cx="11" cy="11" r="7" stroke="var(--ink-tertiary)" strokeWidth="2" />
            <line x1="16.5" y1="16.5" x2="21" y2="21" stroke="var(--ink-tertiary)" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <div style={{ flex: 1, position: "relative" }}>
            {ghost && (
              <div
                aria-hidden="true"
                style={{
                  position: "absolute", inset: 0,
                  display: "flex", alignItems: "center",
                  fontSize: 16, fontFamily: "inherit",
                  whiteSpace: "pre", pointerEvents: "none", overflow: "hidden",
                  padding: "10px 0",
                }}
              >
                <span style={{ color: "transparent" }}>{query}</span>
                <span style={{ color: "var(--ink-tertiary)" }}>{ghost}</span>
              </div>
            )}
            {showOverlay && (
              <div
                aria-hidden="true"
                className="home-placeholder-cycle"
                style={{
                  position: "absolute", inset: 0,
                  display: "flex", alignItems: "center",
                  fontSize: 16, fontFamily: "inherit", color: "var(--ink-tertiary)",
                  whiteSpace: "pre", pointerEvents: "none", overflow: "hidden",
                  padding: "10px 0",
                  opacity: reducedMotion || placeholderVisible ? 1 : 0,
                }}
              >
                {overlayText}
              </div>
            )}
            <input
              ref={withRef ? inputRef : undefined}
              value={query}
              onChange={(e) => handleChange(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setFocusedBar(id)}
              onBlur={() => setFocusedBar((f) => (f === id ? null : f))}
              placeholder={showOverlay ? "" : placeholder}
              aria-label="Search for a company or research area"
              autoComplete="off"
              spellCheck={false}
              style={{
                width: "100%", border: "none", outline: "none",
                background: "transparent", position: "relative",
                fontSize: 16, color: "var(--ink)", padding: "10px 0",
              }}
            />
          </div>
          <button onClick={submit} disabled={!query.trim() || submitting} style={{
            padding: "10px 22px", fontSize: 14.5, fontWeight: 500,
            border: "none", borderRadius: "var(--r-control)",
            cursor: query.trim() && !submitting ? "pointer" : "default",
            background: query.trim() ? "var(--accent)" : "var(--line)",
            color: query.trim() ? "var(--accent-ink)" : "var(--ink-tertiary)",
            transition: "background 150ms var(--ease)", flexShrink: 0,
          }}>
            {submitting ? "Generating…" : "Generate report"}
          </button>
        </div>
        {ghost && (
          <p style={{ fontSize: "var(--text-caption)", color: "var(--ink-tertiary)", marginTop: 6, marginLeft: 4 }}>
            press Tab to complete · Enter to generate
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="dash-home" style={{
      maxWidth: 720,
      margin: "0 auto",
      padding: "48px 32px 64px",
      minHeight: "calc(100dvh - 54px)",
      display: "flex",
      flexDirection: "column",
      background: "var(--panel)",
    }}>

      {/* Hero — one idea, flat color */}
      <h1 style={{ fontSize: "var(--text-hero)", fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1.06, color: "var(--ink)", marginBottom: 16 }}>
        Research, written for you.
      </h1>
      <p style={{ fontSize: "var(--text-sub)", fontWeight: 400, color: "var(--ink-secondary)", lineHeight: 1.55, marginBottom: 32, maxWidth: 540 }}>
        Type a company or a research area. Map reads the public record — SEC filings, grants, papers, trials — and writes you a cited brief.
      </p>

      {/* Search */}
      <div ref={heroRef} style={{ marginBottom: 64 }}>
        <SearchBar id="hero" withRef placeholder='Start a project, e.g. Pfizer or oncology' cyclePlaceholder />
      </div>

      {/* Show, don't tell: a sample brief assembling itself in place of the
          old "problem" / "how it works" marketing copy. */}
      <DemoPanel onFocusSearch={() => inputRef.current?.focus()} />

      <div style={{ marginTop: 28, marginBottom: 48 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.01em", color: "var(--ink)", marginBottom: 8 }}>
          Partnership research takes days. Map takes 60 seconds.
        </h2>
        <p style={{ fontSize: "var(--text-sub)", color: "var(--ink-secondary)", lineHeight: 1.55 }}>
          No AI-generated facts — every sentence traces to a primary source, and the sources come with it.
        </p>
      </div>

      <SearchBar id="cta" withRef={false} placeholder={CTA_PLACEHOLDER} />

      <HomeFooter />
    </div>
  );
}
