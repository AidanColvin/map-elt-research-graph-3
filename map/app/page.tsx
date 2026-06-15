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
import ProjectsCanvas from "@/components/workspace/ProjectsCanvas";
import { useDeepDive } from "@/components/workspace/useDeepDive";
import { useSectorScan } from "@/components/workspace/useSectorScan";
import { useSavedReports } from "@/components/workspace/useSavedReports";
import type { SavedReport } from "@/lib/savedReports";
import type { ReportData } from "@/components/Report";
import { FONT, cardStyle } from "@/components/workspace/ui";
import type { AccountProfile } from "@/components/workspace/accountProfile";
import { getUniqueAccounts } from "@/components/workspace/accountsData";

// Single Apple-style nav bar: the logo, the view tabs, and the Profile button
// all sit on one horizontal axis (no separate stacked sub-nav).
const HEADER_H = 54;

type View = "dashboard" | "company" | "sector" | "accounts" | "partnerships" | "projects" | "account";

// The sub-nav routes (the "account" view is reached via the Profile button,
// not the sub-nav, so it's intentionally not listed here). Display text for
// the accounts route is "Companies"; its view key stays "accounts" so nothing
// that references the route breaks.
const VIEWS: { key: View; label: string }[] = [
  { key: "dashboard", label: "Dashboard" },
  { key: "company", label: "Company" },
  { key: "sector", label: "Sector" },
  { key: "partnerships", label: "UNC" },
  { key: "accounts", label: "Database" },
  { key: "projects", label: "Projects" },
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
  view,
  onHome,
  onChange,
  onProfile,
}: {
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
      className="ws-header"
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
        background: "#ffffff",
        borderBottom: "1px solid #e5e5ea",
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
            className="ws-wordmark"
            style={{
              fontSize: 15,
              fontWeight: 600,
              letterSpacing: 0,
              color: "#1d1d1f",
              userSelect: "none",
            }}
          >
            Map 3
          </span>
        </button>
      </div>

      {/* Center zone — view tabs on the same axis as the logo. */}
      <nav
        className="ws-nav"
        aria-label="Workspace views"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
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

      {/* Right zone — Account link. */}
      <div style={{ ...flank, justifyContent: "flex-end" }}>
        <button
          onClick={onProfile}
          className="ws-account-btn"
          aria-label="Account"
          aria-current={view === "account" ? "page" : undefined}
          style={{
            display: "flex", alignItems: "center", gap: 7,
            border: "1px solid #e5e5ea", borderRadius: 999,
            padding: "5px 14px 5px 8px", fontSize: 13.5,
            color: view === "account" ? "#007aff" : "#1d1d1f",
            background: "#fff", cursor: "pointer",
            fontFamily: FONT, fontWeight: 500,
          }}
        >
          <span style={{
            width: 22, height: 22, borderRadius: "50%",
            background: view === "account" ? "#007aff" : "#1d1d1f",
            color: "#fff", display: "flex", alignItems: "center",
            justifyContent: "center", fontSize: 12, fontWeight: 600,
            flexShrink: 0,
          }}>A</span>
          <span className="ws-account-label">Account</span>
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
  const [partnershipDraft, setPartnershipDraft] = useState("");
  // Companies added to the Database this session by a sector Package run.
  const [packageRows, setPackageRows] = useState<AccountProfile[]>([]);
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
    if (r.kind === "partnership") {
      // Re-open a saved UNC report in the UNC view; PartnershipsView re-runs the
      // live lookup for the subject so the evidence is current.
      setPartnershipDraft(r.query);
      setView("partnerships");
    } else if (r.kind === "company") {
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
        view={view}
        onHome={() => setView("dashboard")}
        onChange={setView}
        onProfile={() => setView("account")}
      />

      {/* All three views stay mounted; toggling display from none re-runs the
          .ws-view opacity/transform entrance without unmounting anything, so
          component state and scroll positions survive every switch. */}
      <main className="ws-main" style={{ padding: `${HEADER_H + 24}px 28px 36px` }}>
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
            onNewRows={(rows) => setPackageRows((prev) => getUniqueAccounts(prev, rows))}
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
          <AccountsCanvas extraRows={packageRows} />
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
          {/* White canvas panel — matches the Company view so the UNC page reads
              on white, not the grey page background. */}
          <section style={{ ...cardStyle, padding: "26px 28px 36px" }}>
            <PartnershipsView saved={saved} initialQuery={partnershipDraft} />
          </section>
        </div>

        <div
          className="ws-view"
          style={{
            display: view === "projects" ? "flex" : "none",
            height: canvasMax,
            maxWidth: 1100,
            margin: "0 auto",
          }}
        >
          <ProjectsCanvas onNewRows={(rows) => setPackageRows((prev) => getUniqueAccounts(prev, rows))} />
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
