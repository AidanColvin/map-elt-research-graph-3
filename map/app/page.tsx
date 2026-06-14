"use client";

import { useState } from "react";
import Intro from "@/components/Intro";
import AuthGate, { clearSession, type MapUser } from "@/components/AuthGate";
import CompanyCanvas from "@/components/workspace/CompanyCanvas";
import SectorCanvas from "@/components/workspace/SectorCanvas";
import AccountsCanvas from "@/components/workspace/AccountsCanvas";
import AccountView from "@/components/workspace/AccountView";
import DashboardHome from "@/components/workspace/DashboardHome";
import PartnershipsView from "@/components/workspace/PartnershipsView";
import { useDeepDive } from "@/components/workspace/useDeepDive";
import { useSectorScan } from "@/components/workspace/useSectorScan";
import { useSavedReports } from "@/components/workspace/useSavedReports";
import type { SavedReport } from "@/lib/savedReports";
import type { ReportData } from "@/components/Report";
import { FONT } from "@/components/workspace/ui";

// Single Apple-style nav bar: the logo, the view tabs, and the Profile button
// all sit on one horizontal axis (no separate stacked sub-nav).
const HEADER_H = 54;

type View = "dashboard" | "company" | "sector" | "accounts" | "partnerships" | "account";

// The sub-nav routes (the "account" view is reached via the Profile button,
// not the sub-nav, so it's intentionally not listed here). Display text for
// the accounts route is "Companies"; its view key stays "accounts" so nothing
// that references the route breaks.
const VIEWS: { key: View; label: string }[] = [
  { key: "company", label: "Company Profile" },
  { key: "sector", label: "Sector Scan" },
  // DEACTIVATED — hidden from the public app. The "Companies" (accounts) and
  // "Partnerships" views are intentionally removed from the sub-nav so they
  // are unreachable in the live build. All of their code (the render blocks
  // below, AccountsCanvas, PartnershipsView, and the /api routes) is kept in
  // the repo. To REACTIVATE, uncomment the two lines below:
  // { key: "accounts", label: "Companies" },
  // { key: "partnerships", label: "Partnerships" },
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

// takes: the signed-in user, the active view, an onHome handler (logo → home),
//        an onChange(view) for the inline tabs, and an onProfile handler
//        (Profile button → account view)
// does: renders the single fixed glassmorphism nav bar, Apple-style — the
//       clickable logo + wordmark anchored left (returns to the Dashboard),
//       the view tabs centered on the SAME horizontal axis, and the Profile
//       button anchored right. Left and right zones are equal-width so the
//       tab group stays optically centered like apple.com.
// returns: the global header element
function GlobalHeader({
  user,
  view,
  onHome,
  onChange,
  onProfile,
}: {
  user: MapUser;
  view: View;
  onHome: () => void;
  onChange: (v: View) => void;
  onProfile: () => void;
}) {
  // Equal-width flank zones keep the centered tab group from drifting when the
  // logo and Profile button differ in width.
  const flank = {
    flex: 1,
    display: "flex",
    alignItems: "center",
    minWidth: 0,
  } as const;
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
        padding: "0 22px",
        background: "rgba(250,249,247,0.82)",
        backdropFilter: "saturate(180%) blur(20px)",
        WebkitBackdropFilter: "saturate(180%) blur(20px)",
        borderBottom: "1px solid rgba(0,0,0,0.05)",
        fontFamily: FONT,
      }}
    >
      {/* Left zone — logo + wordmark is the home link. It uses in-app
          navigation (no full reload) so the session and intro aren't
          re-triggered, and lands on the Dashboard. */}
      <div style={{ ...flank, justifyContent: "flex-start" }}>
        <button
          onClick={onHome}
          aria-label="Map home — Dashboard"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            border: "none",
            background: "none",
            cursor: "pointer",
            padding: 0,
          }}
        >
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
        </button>
      </div>

      {/* Center zone — view tabs on the same axis as the logo. */}
      <nav
        aria-label="Workspace views"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          flexShrink: 0,
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

      {/* Right zone — Profile button → account view. */}
      <div style={{ ...flank, justifyContent: "flex-end" }}>
        <button
          onClick={onProfile}
          aria-label="Open account"
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
      </div>
    </header>
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
  const [sectorDraft, setSectorDraft] = useState("");
  const dive = useDeepDive();
  const scan = useSectorScan();
  // Per-user saved reports (Firestore for signed-in accounts, device-local for
  // guests). Lives at the page level so every view shares one synced list.
  const saved = useSavedReports(user);

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

  // takes: a saved report opened from the Projects section of the profile
  // does: loads the saved copy instantly into the matching tool (no regenerate)
  //       and focuses that view, so a user can pick a project back up to review
  // returns: nothing
  function openProject(r: SavedReport) {
    if (r.kind === "company") {
      setCompanyDraft(r.query);
      dive.loadSaved(r.query, r.content);
      setView("company");
    } else {
      setSectorDraft(r.query);
      try {
        scan.loadSaved(r.query, JSON.parse(r.content) as ReportData);
      } catch {
        // content unparseable — fall back to a fresh run for the subject
        scan.run(r.query);
      }
      setView("sector");
    }
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
  const canvasMax = `calc(100vh - ${HEADER_H + 48}px)`;

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
        view={view}
        onHome={() => setView("dashboard")}
        onChange={setView}
        onProfile={() => setView("account")}
      />

      {/* All three views stay mounted; toggling display from none re-runs the
          .ws-view opacity/transform entrance without unmounting anything, so
          component state and scroll positions survive every switch. */}
      <main style={{ padding: `${HEADER_H + 24}px 28px 36px` }}>
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
            onOpenCompanyView={() => setView("company")}
            onPrefillSector={(name) => {
              setSectorDraft(name);
              setView("sector");
            }}
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
          <CompanyCanvas dive={dive} draft={companyDraft} onDraftChange={setCompanyDraft} saved={saved} />
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
            saved={saved}
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

        {/* Partnerships is an in-app view (not a route), so switching to it
            never reloads the page — the intro splash only plays on a genuine
            page load (first open / hard refresh), never on navigation. */}
        <div
          className="ws-view"
          style={{
            display: view === "partnerships" ? "block" : "none",
            maxWidth: 1100,
            margin: "0 auto",
          }}
        >
          <PartnershipsView />
        </div>

        <div
          className="ws-view"
          style={{
            display: view === "account" ? "block" : "none",
            maxWidth: 560,
            margin: "0 auto",
          }}
        >
          <AccountView
            user={user}
            saved={saved}
            onOpenProject={openProject}
            onSignOut={() => {
              clearSession();
              setUser(null);
              setView("dashboard");
            }}
          />
        </div>
      </main>
    </div>
  );
}
