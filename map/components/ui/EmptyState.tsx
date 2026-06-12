"use client";

import ExampleChips from "./ExampleChips";

export type EmptyStateProps = {
  title: string;
  subtitle: string;
  chips: string[];
  onPick: (item: string) => void;
  previewLine: string;
};

// takes: a title, a what-you-get subtitle, example chips with their onPick,
//        and a one-line output preview
// does: renders the no-input state for a tool canvas; no spinner, just an
//       invitation with clickable examples
// returns: the empty-state element
export default function EmptyState({
  title,
  subtitle,
  chips,
  onPick,
  previewLine,
}: EmptyStateProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 14,
        padding: "64px 28px 48px",
        textAlign: "center",
        fontFamily: "var(--font)",
      }}
    >
      <div
        style={{
          fontSize: 21,
          fontWeight: 650,
          letterSpacing: "var(--tracking-tight)",
          color: "var(--text)",
        }}
      >
        {title}
      </div>
      <div style={{ fontSize: 14.5, color: "var(--text-2)", maxWidth: 440, lineHeight: 1.55 }}>
        {subtitle}
      </div>
      <div style={{ marginTop: 6 }}>
        <ExampleChips items={chips} onPick={onPick} />
      </div>
      <div style={{ fontSize: 12.5, color: "var(--text-2)", opacity: 0.8, marginTop: 10 }}>
        {previewLine}
      </div>
    </div>
  );
}
