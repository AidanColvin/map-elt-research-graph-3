"use client";

import { useState } from "react";
import Intro from "@/components/Intro";
import AuthGate, { clearSession, type MapUser } from "@/components/AuthGate";
import NavBar from "@/components/ui/NavBar";
import AccountPage, { nameFromEmail } from "@/components/workspace/AccountPage";
import CompanyCanvas from "@/components/workspace/CompanyCanvas";
import SectorCanvas from "@/components/workspace/SectorCanvas";
import AccountsCanvas from "@/components/workspace/AccountsCanvas";
import DashboardHome from "@/components/workspace/DashboardHome";
import { ACCOUNTS } from "@/components/workspace/accountsData";
import { SECTORS } from "@/components/workspace/sectors";
import { useDeepDive } from "@/components/workspace/useDeepDive";
import { useSectorScan } from "@/components/workspace/useSectorScan";
import { FONT } from "@/components/workspace/ui";

const HEADER_H = 52;
const SUBNAV_H = 44;

type View = "dashboard" | "company" | "sector" | "accounts" | "account";

// "accounts" keeps its key/route so existing handlers stay intact; only the
// display label changed to "Companies".
const VIEWS: { key: View; label: string }[] = [
  { key: "dashboard", label: "Dashboard" },
  { key: "company", label: "Company Profile" },
  { key: "sector", label: "Sector Scan" },
  { key: "accounts", label: "Companies" },
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

// takes: the signed-in user and an onOpen callback
// does: renders the Profile button as a direct link to the Account page —
//       the previous dropdown menu is gone; sign-out lives on that page now
// returns: the profile button element
function ProfileButton({ user, onOpen }: { user: MapUser; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
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
  );
}

// takes: the signed-in user, an onHome callback, and an onProfile callback
// does: renders the fixed glassmorphism header chrome — a clickable logo +
//       wordmark routing home on the left, the Profile link on the right
// returns: the global header element
function GlobalHeader({
  user,
  onHome,
  onProfile,
}: {
  user: MapUser;
  onHome: () => void;
  onProfile: () => void;
}) {
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
      <button
        onClick={onHome}
        title="Home"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          border: "none",
          background: "none",
          padding: 0,
          cursor: "pointer",
          fontFamily: FONT,
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
      <ProfileButton user={user} onOpen={onProfile} />
    </header>
  );
}

// The dashboard's Top Account card: prefer Apple (curated, resolves
// instantly), else the first account in the database.
const TOP_ACCOUNT =
  ACCOUNTS.find((a) => a.account.toLowerCase().startsWith("apple")) ?? ACCOUNTS[0];

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
  const [scansRun, setScansRun] = useState(0);
  const [recentScan, setRecentScan] = useState<{ sector: string; date: string } | null>(null);
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

  // takes: a sector name
  // does: runs the scan, records it for the Recent Scan card and the session
  //       stat row, and focuses the Sector Scan view
  // returns: nothing
  function runSector(name: string) {
    setSectorDraft(name);
    scan.run(name);
    setScansRun((c) => c + 1);
    setRecentScan({
      sector: name,
      date: new Date().toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
    });
    setView("sector");
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
        onHome={() => setView("dashboard")}
        onProfile={() => setView("account")}
      />
      <NavBar items={VIEWS} active={view} onChange={setView} top={HEADER_H} height={SUBNAV_H} />

      {/* All three views stay mounted; toggling display from none re-runs the
          .ws-view opacity/transform entrance without unmounting anything, so
          component state and scroll positions survive every switch. */}
      <main style={{ padding: `${HEADER_H + SUBNAV_H + 24}px 28px 36px` }}>
        <div
          className="ws-view"
          style={{ display: view === "dashboard" ? "block" : "none" }}
        >
          <DashboardHome
            userName={user.guest ? "Guest" : nameFromEmail(user.email)}
            onRunCompany={(name) => {
              setCompanyDraft(name);
              dive.run(name);
              setView("company");
            }}
            onRunSector={runSector}
            onBrowseAccounts={() => setView("accounts")}
            recentScan={recentScan}
            topAccount={{
              name: TOP_ACCOUNT.account,
              metric:
                TOP_ACCOUNT.approximateRevenue || TOP_ACCOUNT.topIndustrySectorProfile,
            }}
            accountsCount={ACCOUNTS.length}
            scansRun={scansRun}
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
            onRun={runSector}
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

        <div
          className="ws-view"
          style={{
            display: view === "account" ? "flex" : "none",
            height: canvasMax,
            maxWidth: 720,
            margin: "0 auto",
          }}
        >
          <AccountPage
            user={user}
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
