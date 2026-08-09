"use client";

import { useScrolledPast } from "./homeHooks";

/** How far the page scrolls before the bar earns a surface of its own. */
const STICK_AT = 40;

export type NavLink = { key: string; label: string };

/**
 * takes an optional pixel size
 * draws the node-graph brand glyph that sits beside the wordmark
 * returns the logo SVG element
 */
function LogoMark({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="3.2" fill="currentColor" />
      {[0, 60, 120, 180, 240, 300].map((deg) => {
        const r = (deg * Math.PI) / 180;
        const x = 12 + 8.5 * Math.cos(r);
        const y = 12 + 8.5 * Math.sin(r);
        return (
          <g key={deg}>
            <line x1="12" y1="12" x2={x} y2={y} stroke="currentColor" strokeWidth="1.1" />
            <circle cx={x} cy={y} r="1.9" fill="currentColor" />
          </g>
        );
      })}
    </svg>
  );
}

/**
 * takes the nav links, the active one, whether the bar must always carry a
 * surface, whether the visitor is signed in, and handlers for home, a link,
 * sign-in, and the account
 * renders the fixed top bar — transparent over the hero, on paper once the page
 * has scrolled, and wordmark-plus-sign-in only below 768px
 * returns the header element
 */
export default function SiteNav({
  links,
  active,
  alwaysSolid,
  signedIn,
  onHome,
  onNavigate,
  onSignIn,
  onAccount,
}: {
  links: NavLink[];
  active: string;
  alwaysSolid: boolean;
  signedIn: boolean;
  onHome: () => void;
  onNavigate: (key: string) => void;
  onSignIn: () => void;
  onAccount: () => void;
}) {
  const scrolled = useScrolledPast(STICK_AT);
  const solid = alwaysSolid || scrolled;

  return (
    <header className={`v4 v4-nav${solid ? " v4-nav-stuck" : ""}`}>
      <button className="v4-nav-wordmark" onClick={onHome} aria-label="Map home">
        <LogoMark />
        <span>Map</span>
      </button>

      <nav className="v4-nav-links" aria-label="Workspace views">
        {links.map((link) => (
          <button
            key={link.key}
            className="v4-nav-link"
            onClick={() => onNavigate(link.key)}
            aria-current={active === link.key ? "page" : undefined}
          >
            {link.label}
          </button>
        ))}
      </nav>

      {/* A logged-out visitor gets a text link, never an avatar chip. */}
      {signedIn ? (
        <button
          className="v4-nav-signin"
          onClick={onAccount}
          aria-current={active === "account" ? "page" : undefined}
        >
          Account
        </button>
      ) : (
        <button className="v4-nav-signin" onClick={onSignIn}>
          Sign in
        </button>
      )}
    </header>
  );
}
