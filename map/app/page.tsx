"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import Intro, { hasSeenIntro } from "@/components/Intro";
import AuthModal, { type AuthContext } from "@/components/workspace/AuthModal";
import AuthGate, { clearSession, getSession, type MapUser } from "@/components/AuthGate";
import HomePage from "@/components/home/HomePage";
import SiteNav from "@/components/home/SiteNav";
import SignInRequired from "@/components/workspace/SignInRequired";
import PendingApproval from "@/components/workspace/PendingApproval";
import { useDeepDive } from "@/components/workspace/useDeepDive";
import { useSectorScan } from "@/components/workspace/useSectorScan";
import { useSavedReports } from "@/components/workspace/useSavedReports";
import type { SavedReport } from "@/lib/savedReports";
import type { ReportData } from "@/components/Report";
import { FONT, cardStyle } from "@/components/workspace/ui";
import type { AccountProfile } from "@/components/workspace/accountProfile";
import { getUniqueAccounts } from "@/components/workspace/accountsData";
import { resolveSubjectKind } from "@/components/workspace/sectors";

// The workspace canvases carry the report renderer and every export format —
// xlsx, pptx, pdf, docx. A visitor who only reads the homepage should never
// download any of it, so each one is fetched on the first visit to its view and
// stays mounted from then on (see `visited` below), which keeps the "state
// survives switching views" behaviour intact.
const CompanyCanvas = dynamic(() => import("@/components/workspace/CompanyCanvas"), { ssr: false });
const SectorCanvas = dynamic(() => import("@/components/workspace/SectorCanvas"), { ssr: false });
const AccountsCanvas = dynamic(() => import("@/components/workspace/AccountsCanvas"), { ssr: false });
const AccountView = dynamic(() => import("@/components/workspace/AccountView"), { ssr: false });
const PartnershipInventoryView = dynamic(
  () => import("@/components/workspace/PartnershipInventoryView"),
  { ssr: false },
);
const ProjectsCanvas = dynamic(() => import("@/components/workspace/ProjectsCanvas"), { ssr: false });

// The fixed v4 bar's height (components/home/SiteNav.tsx). Every view below it
// clears this much, and the homepage hero adds its own padding on top.
const HEADER_H = 64;

type View = "dashboard" | "company" | "sector" | "accounts" | "partnerships" | "projects" | "account";

// The nav routes (the "account" view is reached from the bar's right-hand
// button, so it's intentionally not listed here). The "accounts" route shows
// the big company table; the singular "company" route is the one-company
// report generator and reads "Companies". The view keys stay "accounts" and
// "company" so nothing that references the routes breaks.
//
// `requiresAccount` marks the views whose contents name real people or list the
// full partner table. With GUEST_FIRST_ENTRY on, these tabs are simply not
// rendered for a guest — asking at the moment of need beats showing a tab that
// only turns them away. With it off, the tab shows and the view asks them to
// sign in (components/workspace/SignInRequired.tsx), as it always did.

// The single switch for guest-first entry. Set to false to restore the original
// flow exactly: every visitor lands on the full-page auth screen, the sign-in
// modal is never used, and all six tabs render for everyone.
const GUEST_FIRST_ENTRY = true;

const VIEWS: { key: View; label: string; requiresAccount?: boolean }[] = [
  { key: "company", label: "Companies" },   // single-company report generator
  { key: "sector", label: "Sectors" },
  { key: "accounts", label: "Accounts" },   // the big company table
  { key: "partnerships", label: "Partnerships", requiresAccount: true },
  { key: "projects", label: "Projects" },
];

// The three the homepage's bar leads with. Everywhere else the bar carries the
// full set (see barViews), and the homepage's own footer lists them all, so a
// shorter bar there costs the visitor nothing.
const BAR_KEYS: View[] = ["company", "sector", "accounts"];

// Base document title (mirrors the static metadata in layout.tsx) and the
// per-view suffix the active tab appends, so the browser tab reflects the page.
const BASE_TITLE = "Map — Every sentence has a source.";
const VIEW_TITLES: Record<View, string> = {
  dashboard: BASE_TITLE,
  company: "Companies — Map",
  sector: "Sectors — Map",
  partnerships: "Partnerships — Map",
  accounts: "Accounts — Map",
  projects: "Projects — Map",
  account: "Account — Map",
};

// takes: nothing
// does: decides where signing out lands. With guest-first entry there is no
//       sign-in wall to fall back to, so it lands on the guest session the
//       visitor would have had on arrival.
// returns: the guest user, or null to fall back to the full-page auth gate
function signedOutUser(): MapUser | null {
  return GUEST_FIRST_ENTRY ? { email: "guest", guest: true, role: "user" } : null;
}

// takes: the current user
// does: keeps only the destinations this visitor can actually open — a guest is
//       never offered one that would only turn them away
// returns: the destinations to list
function visibleViews(user: MapUser | null) {
  if (!GUEST_FIRST_ENTRY) return VIEWS;
  const isGuest = !user || user.guest;
  return isGuest ? VIEWS.filter((v) => !v.requiresAccount) : VIEWS;
}

// takes: the current user and the active view
// does: picks what the top bar carries. The homepage leads with three
//       destinations and nothing else, because its footer lists them all a
//       screen below. Every other view has no such footer, so the bar there
//       carries the full set and stays the way back to any of them.
// returns: the bar's links
function barViews(user: MapUser | null, view: View) {
  const visible = visibleViews(user);
  if (view === "dashboard") return visible.filter((v) => BAR_KEYS.includes(v.key));
  return [{ key: "dashboard" as View, label: "Home" }, ...visible];
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
  // Which views have been opened at least once. A canvas is not rendered until
  // its view is first visited — that is what keeps its bundle off the
  // homepage's critical path — and once rendered it stays mounted, so reports,
  // drafts, exports, and scroll positions still survive every later switch.
  const [visited, setVisited] = useState<Set<View>>(() => new Set<View>(["dashboard"]));
  const [companyDraft, setCompanyDraft] = useState("");
  const [sectorDraft, setSectorDraft] = useState("");
  const [projectsQuery, setProjectsQuery] = useState("");
  // Companies added to the Database this session by a sector Package run.
  const [packageRows, setPackageRows] = useState<AccountProfile[]>([]);
  // The signed inventory token minted by /api/inventory/unlock after a correct
  // password entry. It is the credential the gated data API actually honors —
  // holding it (not a local flag) is what "unlocked" means. Persisted per
  // browser so the code isn't re-asked on every refresh.
  const [pwToken, setPwToken] = useState<string | null>(null);
  // Which reason the sign-in modal is open for, or null when it is closed.
  const [authContext, setAuthContext] = useState<AuthContext | null>(null);
  const dive = useDeepDive();
  const scan = useSectorScan();
  // Per-user saved reports (Firestore for signed-in accounts, device-local for
  // guests). Lives at the page level so every view shares one synced list.
  const saved = useSavedReports(user);

  // takes: nothing
  // does: asks for identity. With guest-first entry that means opening the
  //       sign-in modal over the page the visitor is already on; without it,
  //       the original behaviour of dropping back to the full-page auth gate.
  // returns: nothing
  const handleSignInFromGuest = () => {
    if (GUEST_FIRST_ENTRY) {
      setAuthContext(view === "partnerships" || view === "accounts" ? view : "save");
      return;
    }
    clearSession();
    setUser(null);
  };

  // takes: the completed sign-in
  // does: adopts the account and dismisses the modal
  // returns: nothing
  const handleAuthDone = (next: MapUser) => {
    setUser(next);
    setAuthContext(null);
  };

  // Two test escape hatches, read only after mount to avoid a hydration
  // mismatch (the server always renders with showIntro = true and no user):
  //
  //   ?screenshot=1 — dismiss the intro AND seed the guest session, so the
  //                   dashboard renders immediately for the screenshot harness.
  //   ?skipIntro=1  — dismiss the intro ONLY, leaving the visitor signed out so
  //                   the real sign-in and approval flow can be exercised.
  useEffect(() => {
    // Restore a previous password unlock first — it must apply on EVERY load
    // path, including the ?screenshot short-circuit below. The stored value is
    // the server-minted token; if it has expired the data API returns 401 and
    // the views re-show the gate on their own.
    try {
      localStorage.removeItem("map.pwUnlock"); // pre-token flag, now meaningless
      const stored = localStorage.getItem("map.pwToken");
      if (stored) setPwToken(stored);
    } catch {
      // storage unavailable — the guest can re-enter the code
    }

    const params = new URLSearchParams(window.location.search);
    if (params.has("screenshot")) {
      setShowIntro(false);
      setUser({ email: "guest", guest: true, role: "user" });
      return;
    }
    if (params.has("skipIntro")) setShowIntro(false);
    // The intro is a first-impression, not a toll booth: play it once per
    // browser and never again. (This deliberately replaces the previous
    // "shows on every hard refresh by design" behavior.)
    else if (hasSeenIntro()) setShowIntro(false);

    // Restore a previous session. Without this the session was written on
    // sign-in but never read back, so every refresh silently signed the user
    // out and their saved projects looked as though they had vanished.
    const stored = getSession();
    if (stored) {
      setUser(stored);
      return;
    }
    // Nobody is signed in: land as a guest in the workspace rather than at a
    // sign-in wall. Identity gets asked for later, when something needs it.
    if (GUEST_FIRST_ENTRY) setUser({ email: "guest", guest: true, role: "user" });
  }, []);

  // takes: the token minted by the server after a correct password entry
  // does: stores it as this browser's inventory credential
  // returns: nothing
  const handlePasswordUnlock = (token: string) => {
    setPwToken(token);
    try {
      localStorage.setItem("map.pwToken", token);
    } catch {
      // storage unavailable — the unlock still holds for this page load
    }
  };

  // Keep the browser tab title in step with the active view (this is an SPA, so
  // there is one document; the title is updated client-side per tab).
  useEffect(() => {
    document.title = VIEW_TITLES[view];
  }, [view]);

  // Note the view as opened, so its canvas mounts and then stays mounted.
  useEffect(() => {
    setVisited((prev) => (prev.has(view) ? prev : new Set(prev).add(view)));
  }, [view]);

  // The homepage is full-bleed paper, so the document behind it has to be paper
  // too — otherwise an overscroll bounce reveals the workspace's warmer canvas
  // as a band at the top or bottom, which is exactly the floating-card edge the
  // redesign removes.
  useEffect(() => {
    document.body.style.background =
      view === "dashboard" ? "var(--paper)" : "var(--bg)";
  }, [view]);

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
      // Saved UNC reports predate the inventory table; just focus the view.
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

  // takes: a free-text subject typed into the Dashboard search bar
  // does: runs the report directly instead of opening a new Project. It resolves
  //       whether the text reads as a single company or a sector — the SAME
  //       resolver the Sectors page and the Projects "auto" mode use — then
  //       streams the matching report into the shared Company or Sector view
  //       (these are the same dive/scan hook instances those tabs render) and
  //       focuses that tab. This makes the home search behave like the in-tool
  //       search bars: type a name, get a report.
  // returns: nothing
  async function runFromDashboard(name: string) {
    const q = name.trim();
    if (!q) return;
    // resolveSubjectKind returns instantly for anything the client heuristic
    // already reads as a sector, and only calls the backend to UPGRADE a
    // company-looking query to a recognized sector — so a single-company lookup
    // is never wrongly forced, and a backend outage falls back to "company".
    const kind = await resolveSubjectKind(q);
    if (kind === "sector") {
      setSectorDraft(q);
      setView("sector");
      scan.run(q);
    } else {
      setCompanyDraft(q);
      setView("company");
      dive.run(q);
    }
  }

  // The auth gate shows on every hard refresh / first load by design: the
  // session lives only in React state for this page load.
  if (showIntro) {
    return <Intro onDone={() => setShowIntro(false)} />;
  }
  // A registered account that the owner has not approved never reaches the
  // workspace. Guests are exempt: they were never in the queue, and the views
  // that carry identifiable data already turn them away on their own.
  if (user && !user.guest && user.status && user.status !== "approved") {
    return (
      <PendingApproval
        user={user}
        onSignOut={() => {
          clearSession();
          setUser(signedOutUser());
        }}
      />
    );
  }

  if (!user) {
    return <AuthGate onDone={setUser} />;
  }

  // The card body is always the scroll container — in every view the canvas
  // is capped to the viewport, which keeps Report's sticky download bar and
  // in-page citation anchors working identically everywhere.
  // dvh (not vh) so the canvas matches the *visible* area on iOS Safari, whose
  // collapsing toolbar otherwise pushes the canvas bottom (and the sticky
  // download bar) off-screen.
  const canvasMax = `calc(100dvh - ${HEADER_H + 48}px)`;

  return (
    <div
      style={{
        fontFamily: FONT,
        minHeight: "100dvh",
        color: "var(--ink)",
        background: view === "dashboard" ? "var(--paper)" : "var(--bg)",
      }}
    >
      <SiteNav
        links={barViews(user, view)}
        active={view}
        // Only the homepage has a hero for the bar to sit over transparently;
        // every other view starts with content, so the bar keeps its surface.
        alwaysSolid={view !== "dashboard"}
        signedIn={!user.guest}
        onHome={() => setView("dashboard")}
        onNavigate={(key) => setView(key as View)}
        onSignIn={() => setAuthContext("header")}
        onAccount={() => setView("account")}
      />

      {authContext && (
        <AuthModal
          context={authContext}
          onClose={() => setAuthContext(null)}
          onDone={handleAuthDone}
        />
      )}

      {/* The homepage is the page: full-bleed paper, its own rhythm, no gutter
          from the workspace shell and no card floating on a tinted backdrop.
          That is why it sits outside <main> rather than inside its padding. */}
      <div style={{ display: view === "dashboard" ? "block" : "none" }}>
        <HomePage
          onSubmit={runFromDashboard}
          links={visibleViews(user)}
          onNavigate={(key) => setView(key as View)}
        />
      </div>

      {/* Every other view stays mounted; toggling display from none re-runs the
          .ws-view opacity/transform entrance without unmounting anything, so
          component state and scroll positions survive every switch. */}
      <main
        className="ws-main"
        style={{
          // Nothing in here is active on the homepage, and an empty <main> would
          // still contribute its padding as blank space under the footer.
          display: view === "dashboard" ? "none" : "block",
          // Top clears the fixed header; bottom adds the home-indicator inset
          // so content isn't hidden behind it on gesture-nav iPhones.
          paddingTop: HEADER_H + 24,
          paddingRight: "max(28px, env(safe-area-inset-right))",
          paddingBottom: "calc(36px + env(safe-area-inset-bottom))",
          paddingLeft: "max(28px, env(safe-area-inset-left))",
        }}
      >
        <div
          className="ws-view"
          style={{
            display: view === "company" ? "flex" : "none",
            height: canvasMax,
            maxWidth: 1100,
            margin: "0 auto",
          }}
        >
          {visited.has("company") && (
            <CompanyCanvas dive={dive} draft={companyDraft} onDraftChange={setCompanyDraft} saved={saved} />
          )}
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
          {visited.has("sector") && (
          <SectorCanvas
            scan={scan}
            draft={sectorDraft}
            onDraftChange={setSectorDraft}
            onSelectCompany={selectCompany}
            activeCompany={dive.company}
            saved={saved}
            onNewRows={(rows) => setPackageRows((prev) => getUniqueAccounts(prev, rows))}
          />
          )}
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
          {!visited.has("accounts") ? null : user.guest && !pwToken ? (
            <SignInRequired
              viewLabel="Accounts"
              onSignIn={handleSignInFromGuest}
              onUnlock={handlePasswordUnlock}
            />
          ) : (
            <AccountsCanvas
              extraRows={packageRows}
              pwToken={pwToken}
              onSignIn={handleSignInFromGuest}
              onUnlock={handlePasswordUnlock}
              onRunDeepDive={(name) => {
                setCompanyDraft(name);
                dive.run(name);
                setView("company");
              }}
            />
          )}
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
            {!visited.has("partnerships") ? null : user.guest && !pwToken ? (
              <SignInRequired
                viewLabel="Partnerships"
                onSignIn={handleSignInFromGuest}
                onUnlock={handlePasswordUnlock}
              />
            ) : (
              <PartnershipInventoryView
                pwToken={pwToken}
                onSignIn={handleSignInFromGuest}
                onUnlock={handlePasswordUnlock}
              />
            )}
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
          {visited.has("projects") && (
            <ProjectsCanvas
              onNewRows={(rows) => setPackageRows((prev) => getUniqueAccounts(prev, rows))}
              initialQuery={projectsQuery}
              onQueryConsumed={() => setProjectsQuery("")}
            />
          )}
        </div>

        <div
          className="ws-view"
          style={{
            display: view === "account" ? "block" : "none",
            maxWidth: 560,
            margin: "0 auto",
          }}
        >
          {visited.has("account") && (
            <AccountView
              user={user}
              saved={saved}
              onOpenProject={openProject}
              onSignOut={() => {
                clearSession();
                setUser(signedOutUser());
                setView("dashboard");
              }}
            />
          )}
        </div>
      </main>
    </div>
  );
}
