"use client";

export type CardProps = {
  title: string;
  icon?: React.ReactNode;
  value?: string;
  preview?: string;
  href?: string;
  onClick?: () => void;
};

// takes: title, optional icon / value / preview line, and href or onClick
// does: renders one token-driven surface card; clickable cards lift 2px and
//       deepen their shadow on hover (see .tk-card in globals.css)
// returns: an anchor, button, or static card element
export default function Card({ title, icon, value, preview, href, onClick }: CardProps) {
  const clickable = Boolean(href || onClick);
  const inner = (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 13,
          fontWeight: 500,
          color: "var(--text-2)",
        }}
      >
        {icon}
        {title}
      </div>
      {value && (
        <div
          style={{
            fontSize: 19,
            fontWeight: 650,
            letterSpacing: "var(--tracking-tight)",
            color: "var(--text)",
            marginTop: 8,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {value}
        </div>
      )}
      {preview && (
        <div style={{ fontSize: 13, color: "var(--text-2)", marginTop: 4 }}>{preview}</div>
      )}
    </>
  );

  const base: React.CSSProperties = {
    display: "block",
    width: "100%",
    padding: "18px 20px",
    textDecoration: "none",
  };

  if (href) {
    return (
      <a className="tk-card tk-clickable" style={base} href={href}>
        {inner}
      </a>
    );
  }
  if (onClick) {
    return (
      <button className="tk-card tk-clickable" style={base} onClick={onClick}>
        {inner}
      </button>
    );
  }
  return (
    <div className={`tk-card${clickable ? " tk-clickable" : ""}`} style={base}>
      {inner}
    </div>
  );
}
