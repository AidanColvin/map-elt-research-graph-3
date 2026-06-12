"use client";

import { useEffect, useRef, useState } from "react";
import Intro from "@/components/Intro";
import AuthGate, { clearSession, type MapUser } from "@/components/AuthGate";
import CompanyCanvas from "@/components/workspace/CompanyCanvas";
import SectorCanvas from "@/components/workspace/SectorCanvas";
import AccountsCanvas from "@/components/workspace/AccountsCanvas";
import DashboardHome from "@/components/workspace/DashboardHome";
import { SECTORS } from "@/components/workspace/sectors";
import { useDeepDive } from "@/components/workspace/useDeepDive";
import { useSectorScan } from "@/components/workspace/useSectorScan";
import { FONT } from "@/components/workspace/ui";

const HEADER_H = 52;
const SUBNAV_H = 44;

type View = "dashboard" | "company" | "sector" | "accounts";

const VIEWS: { key: View; label: string }[] = [
  { key: "dashboard", label: "Dashboard" },
  { key: "company", label: "Company Profile" },
  { key: "sector", label: "Sector Scan" },
  { key: "accounts", label: "Accounts" },
];

// takes: an optional pixel size
// does: draws the node-graph brand glyph used in the header
// returns: the logo SVG element
function LogoMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden style={{ flexShrink: 0 }}>
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
  );
}

// takes: the signed-in user and an onSignOut callback
// does: owns the profile dropdown — trigger button, outside-click dismissal,
//       account summary, and the sign-out action
// returns: the profile menu element
function ProfileMenu({ user, onSignOut }: { user: MapUser; onSignOut: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // takes: nothing (effect)
  // does: registers a document listener that closes the menu on outside click
  // returns: a cleanup function removing the listener
  useEffect(() => {
    if (!open) return;
    // takes: a document mousedown event
    // does: closes the menu when the click landed outside the menu subtree
    // returns: nothing
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          border: "1px solid rgba(0,0,0,0.08)",
          borderRadius: 999,
          padding: "5px 14px 5px 6px",
          background: "rgba(255,255,255,0.8)",
          cursor: "pointer",
          fontFamily: FONT,
          fontSize: 13.5,
          color: "#1d1d1f",
        }}
      >
        <span
          style={{
            width: 26,
            height: 26,
            borderRadius: "50%",
            background: "#1d1d1f",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          {user.guest ? "G" : user.email[0].toUpperCase()}
        </span>
        Profile
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 8px)",
            width: 240,
            background: "#ffffff",
            borderRadius: 16,
            boxShadow: "0 1px 2px rgba(0,0,0,0.06), 0 16px 40px rgba(0,0,0,0.14)",
            padding: 8,
          }}
        >
          <div style={{ padding: "10px 12px", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>
              {user.guest ? "Guest" : user.email}
            </div>
            <div style={{ fontSize: 12, color: "#86868b", marginTop: 2 }}>
              {user.guest
                ? "Browsing without an account"
                : "Signed in · account stored in this browser"}
            </div>
          </div>
          <button
            onClick={onSignOut}
            style={{
              width: "100%",
              textAlign: "left",
              border: "none",
              background: "none",
              padding: "10px 12px",
              fontSize: 14,
              color: "#dc2626",
              cursor: "pointer",
              fontFamily: FONT,
              borderRadius: 8,
            }}
          >
            {user.guest ? "Exit guest mode" : "Sign out"}
          </button>
        </div>
      )}
    </div>
  );
}

// takes: the signed-in user and an onSignOut callback
// does: renders the fixed glassmorphism header chrome — logo + wordmark on
//       the left, the extracted ProfileMenu on the right
// returns: the global header element
function GlobalHeader({ user, onSignOut }: { user: MapUser; onSignOut: () => void }) {
  return (
    <header
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: HEADER_H,
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 20px",
        background: "rgba(255,255,255,0.66)",
        backdropFilter: "saturate(180%) blur(20px)",
        WebkitBackdropFilter: "saturate(180%) blur(20px)",
        borderBottom: "1px solid rgba(0,0,0,0.05)",
        fontFamily: FONT,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <LogoMark />
        <span
          style={{
            fontSize: 16,
            fontWeight: 600,
            letterSpacing: "0.32em",
            color: "#1d1d1f",
            userSelect: "none",
          }}
        >
          map
        </span>
      </div>
      <ProfileMenu user={user} onSignOut={onSignOut} />
    </header>
  );
}

// takes: the active view key and an onChange(view) callback
// does: renders the elegant horizontal sub-navigation bar fixed just below
//       the global header — Dashboard, Company Profile, Sector Scan
// returns: the sub-nav element
function SubNav({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  return (
    <nav
      aria-label="Workspace views"
      style={{
        position: "fixed",
        top: HEADER_H,
        left: 0,
        right: 0,
        height: SUBNAV_H,
        zIndex: 90,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        background: "rgba(255,255,255,0.55)",
        backdropFilter: "saturate(180%) blur(14px)",
        WebkitBackdropFilter: "saturate(180%) blur(14px)",
        borderBottom: "1px solid rgba(0,0,0,0.04)",
        fontFamily: FONT,
      }}
    >
      {VIEWS.map((v) => (
        <button
          key={v.key}
          className={`ws-nav-item ${view === v.key ? "active" : ""}`}
          onClick={() => onChange(v.key)}
          aria-current={view === v.key ? "page" : undefined}
        >
          {v.label}
        </button>
      ))}
    </nav>
  );
}

// takes: nothing (page component)
// does: orchestrates the whole program — intro → auth gate → the workspace
//       with flexible focus: an integrated Dashboard plus dedicated focused
//       views per tool. Engine state AND input drafts live here; all three
//       views stay mounted (display toggling re-runs the entrance animation),
//       so reports, drafts, exports, and scroll positions all survive switches
// returns: the Map page element
export default function MapHome() {
  const [showIntro, setShowIntro] = useState(true);
  const [user, setUser] = useState<MapUser | null>(null);
  const [view, setView] = useState<View>("dashboard");
  const [companyDraft, setCompanyDraft] = useState("");
  const [sectorDraft, setSectorDraft] = useState(SECTORS[0]);
  const dive = useDeepDive();
  const scan = useSectorScan();

  // takes: a company name selected from a sector ticker card
  // does: triggers a deep dive and mirrors the choice into the draft input;
  //       in the focused Sector Scan view it also moves focus to the
  //       Company Profile view so the result is on screen
  // returns: nothing
  function selectCompany(company: string) {
    setCompanyDraft(company);
    dive.run(company);
    if (view === "sector") setView("company");
  }

  // The auth gate shows on every hard refresh / first load by design: the
  // session lives only in React state for this page load.
  if (showIntro) {
    return <Intro onDone={() => setShowIntro(false)} />;
  }
  if (!user) {
    return <AuthGate onDone={setUser} />;
  }

  // The card body is always the scroll container — in every view the canvas
  // is capped to the viewport, which keeps Report's sticky download bar and
  // in-page citation anchors working identically everywhere.
  const canvasMax = `calc(100vh - ${HEADER_H + SUBNAV_H + 48}px)`;

  return (
    <div
      style={{
        fontFamily: FONT,
        minHeight: "100vh",
        color: "#1d1d1f",
        // Ultra-soft tinted washes give the glass panels something to refract.
        background:
          "radial-gradient(1100px 520px at 12% -8%, rgba(120,140,255,0.07), transparent 60%)," +
          "radial-gradient(900px 480px at 95% 4%, rgba(255,150,120,0.05), transparent 55%)," +
          "#f5f5f7",
      }}
    >
      <GlobalHeader
        user={user}
        onSignOut={() => {
          clearSession();
          setUser(null);
        }}
      />
      <SubNav view={view} onChange={setView} />

      {/* All three views stay mounted; toggling display from none re-runs the
          .ws-view opacity/transform entrance without unmounting anything, so
          component state and scroll positions survive every switch. */}
      <main style={{ padding: `${HEADER_H + SUBNAV_H + 24}px 28px 36px` }}>
        <div
          className="ws-view"
          style={{ display: view === "dashboard" ? "block" : "none" }}
        >
          <DashboardHome
            onRunCompany={(name) => {
              setCompanyDraft(name);
              dive.run(name);
              setView("company");
            }}
            onRunSector={(name) => {
              setSectorDraft(name);
              scan.run(name);
              setView("sector");
            }}
            quick={[
              { label: "Recent Scan: Oncology", onClick: () => { setSectorDraft("Oncology"); scan.run("Oncology"); setView("sector"); } },
              { label: "Top Account: Apple", onClick: () => { setCompanyDraft("Apple"); dive.run("Apple"); setView("company"); } },
              { label: "Browse Accounts →", onClick: () => setView("accounts") },
            ]}
          />
        </div>

        <div
          className="ws-view"
          style={{
            display: view === "company" ? "flex" : "none",
            height: canvasMax,
            maxWidth: 1100,
            margin: "0 auto",
          }}
        >
          <CompanyCanvas dive={dive} draft={companyDraft} onDraftChange={setCompanyDraft} />
        </div>

        <div
          className="ws-view"
          style={{
            display: view === "sector" ? "flex" : "none",
            height: canvasMax,
            maxWidth: 1100,
            margin: "0 auto",
          }}
        >
          <SectorCanvas
            scan={scan}
            draft={sectorDraft}
            onDraftChange={setSectorDraft}
            onSelectCompany={selectCompany}
            activeCompany={dive.company}
          />
        </div>

        <div
          className="ws-view"
          style={{
            display: view === "accounts" ? "flex" : "none",
            height: canvasMax,
            maxWidth: 1680,
            margin: "0 auto",
          }}
        >
          <AccountsCanvas />
        </div>
      </main>
    </div>
  );
}
