"use client";

export type NavItem<K extends string> = { key: K; label: string };

export type NavBarProps<K extends string> = {
  items: NavItem<K>[];
  active: K;
  onChange: (key: K) => void;
  top?: number;
  height?: number;
};

// takes: typed nav items, the active key, an onChange, and layout offsets
// does: renders the sticky frosted navigation bar (blur 20px, translucent
//       white); every item supports the active pill highlight
// returns: the nav element
export default function NavBar<K extends string>({
  items,
  active,
  onChange,
  top = 0,
  height = 44,
}: NavBarProps<K>) {
  return (
    <nav
      aria-label="Workspace views"
      style={{
        position: "fixed",
        top,
        left: 0,
        right: 0,
        height,
        zIndex: 90,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        background: "rgba(255,255,255,0.66)",
        backdropFilter: "saturate(180%) blur(20px)",
        WebkitBackdropFilter: "saturate(180%) blur(20px)",
        borderBottom: "1px solid var(--hairline)",
        fontFamily: "var(--font)",
      }}
    >
      {items.map((item) => (
        <button
          key={item.key}
          className={`ws-nav-item ${active === item.key ? "active" : ""}`}
          onClick={() => onChange(item.key)}
          aria-current={active === item.key ? "page" : undefined}
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}
