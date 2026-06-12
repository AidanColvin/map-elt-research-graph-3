"use client";

/**
 * Shared primitives for the unified Map workspace — one typography scale,
 * one glassmorphic card treatment, one loading state, used identically by
 * both workflows.
 */

export const FONT =
  "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Helvetica, Arial, sans-serif";

// Rich glass module: translucent fill, backdrop blur, an incredibly light
// white border for the floating edge, and a soft diffuse shadow for depth.
export const cardStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.62)",
  backdropFilter: "saturate(180%) blur(14px)",
  WebkitBackdropFilter: "saturate(180%) blur(14px)",
  borderRadius: 22,
  border: "1px solid rgba(255,255,255,0.1)",
  boxShadow: "0 1px 1px rgba(0,0,0,0.03), 0 16px 48px rgba(0,0,0,0.055)",
  overflow: "hidden",
};

// takes: label string and an optional live detail string
// does: renders the single standardized loading state (pulsing dot + label)
//       shared by both workflows so they look identical while working
// returns: a small inline loading row element
export function Loading({ label, detail }: { label: string; detail?: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "40px 28px",
        color: "#86868b",
        fontSize: 14,
        fontFamily: FONT,
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: "#1d1d1f",
          animation: "pulse 1.1s ease-in-out infinite",
          flexShrink: 0,
        }}
      />
      {label}
      {detail && <span style={{ color: "#b6b6bc" }}>{detail}</span>}
    </div>
  );
}

// takes: a title string, an optional toolbar node, and the card's children
// does: renders a canvas module — thin uppercase eyebrow, an optional pinned
//       command toolbar beneath it, then the scrollable content area
// returns: a floating glass card section element
export function CanvasCard({
  title,
  toolbar,
  children,
}: {
  title: string;
  toolbar?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section style={{ ...cardStyle, display: "flex", flexDirection: "column", minHeight: 0, flex: 1 }}>
      <div
        style={{
          padding: "16px 24px 0",
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "#a8a8ad",
          fontFamily: FONT,
          flexShrink: 0,
        }}
      >
        {title}
      </div>
      {toolbar && <div style={{ flexShrink: 0 }}>{toolbar}</div>}
      <div
        style={{
          overflowY: "auto",
          minHeight: 0,
          flex: 1,
          borderTop: "1px solid rgba(0,0,0,0.04)",
        }}
      >
        {children}
      </div>
    </section>
  );
}

// takes: nothing
// does: renders the faint node-graph glyph centered in a spacious container,
//       used as the intentional empty state of a canvas
// returns: a balanced placeholder element
export function EmptyGlyph() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: 280,
        padding: "48px 0",
        opacity: 0.12,
      }}
    >
      <svg width="56" height="56" viewBox="0 0 24 24" aria-hidden>
        <circle cx="12" cy="12" r="3.2" fill="#1d1d1f" />
        {[0, 60, 120, 180, 240, 300].map((deg) => {
          const r = (deg * Math.PI) / 180;
          const x = 12 + 8.5 * Math.cos(r);
          const y = 12 + 8.5 * Math.sin(r);
          return (
            <g key={deg}>
              <line x1="12" y1="12" x2={x} y2={y} stroke="#1d1d1f" strokeWidth="1.1" />
              <circle cx={x} cy={y} r="1.9" fill="#1d1d1f" />
            </g>
          );
        })}
      </svg>
    </div>
  );
}
