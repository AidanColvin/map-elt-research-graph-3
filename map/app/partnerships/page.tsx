"use client";

import Link from "next/link";
import PartnershipsView from "@/components/workspace/PartnershipsView";
import { FONT } from "@/components/workspace/ui";

const HEADER_H = 52;
const SUBNAV_H = 44;

// The workspace tabs. Partnerships is the active route here; the others return
// to the single-page workspace at "/". (In normal use the in-app Partnerships
// view is reached without a route change — this standalone page exists for
// direct deep-links to /partnerships.)
const TABS = [
  { label: "Dashboard", href: "/" },
  { label: "Company Profile", href: "/" },
  { label: "Sector Scan", href: "/" },
  { label: "Companies", href: "/" },
  { label: "Partnerships", href: "/partnerships", active: true },
];

// takes: nothing
// does: renders the fixed header + workspace sub-navigation, reusing the same
//       glass chrome as the main workspace so Partnerships feels native
// returns: the page chrome element
function Chrome() {
  return (
    <>
      <header
        style={{
          position: "fixed", top: 0, left: 0, right: 0, height: HEADER_H, zIndex: 100,
          display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px",
          background: "rgba(255,255,255,0.66)", backdropFilter: "saturate(180%) blur(20px)",
          borderBottom: "1px solid rgba(0,0,0,0.05)", fontFamily: FONT,
        }}
      >
        <Link href="/" aria-label="Map home" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
          <svg width={22} height={22} viewBox="0 0 24 24" aria-hidden>
            <circle cx="12" cy="12" r="3.2" fill="#1d1d1f" />
            {[0, 60, 120, 180, 240, 300].map((deg) => {
              const r = (deg * Math.PI) / 180;
              const x = 12 + 8.5 * Math.cos(r), y = 12 + 8.5 * Math.sin(r);
              return (
                <g key={deg}>
                  <line x1="12" y1="12" x2={x} y2={y} stroke="#1d1d1f" strokeWidth="1.1" />
                  <circle cx={x} cy={y} r="1.9" fill="#1d1d1f" />
                </g>
              );
            })}
          </svg>
          <span style={{ fontSize: 16, fontWeight: 600, letterSpacing: "0.32em", color: "#1d1d1f" }}>map</span>
        </Link>
      </header>
      <nav
        aria-label="Workspace views"
        style={{
          position: "fixed", top: HEADER_H, left: 0, right: 0, height: SUBNAV_H, zIndex: 90,
          display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          background: "rgba(255,255,255,0.55)", backdropFilter: "saturate(180%) blur(14px)",
          borderBottom: "1px solid rgba(0,0,0,0.04)", fontFamily: FONT,
        }}
      >
        {TABS.map((t) => (
          <Link key={t.label} href={t.href} className={`ws-nav-item ${t.active ? "active" : ""}`}
            aria-current={t.active ? "page" : undefined}>
            {t.label}
          </Link>
        ))}
      </nav>
    </>
  );
}

// takes: nothing (route component)
// does: renders the standalone /partnerships deep-link page — workspace chrome
//       plus the shared PartnershipsView content
// returns: the Partnerships page element
export default function PartnershipsPage() {
  return (
    <div style={{ fontFamily: FONT, minHeight: "100vh", color: "#1d1d1f", background: "#f5f5f7" }}>
      <Chrome />
      <main style={{ padding: `${HEADER_H + SUBNAV_H + 32}px 28px 48px` }}>
        <PartnershipsView />
      </main>
    </div>
  );
}
