"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Report, { type ReportData } from "@/components/Report";
import MarkdownArticle from "@/app/components/MarkdownArticle";
import { useDeepDive } from "./useDeepDive";
import { useSectorScan } from "./useSectorScan";
import { buildPartnershipMarkdown, type PartnerData } from "./PartnershipsView";
import { detectSubjectKind } from "./sectors";
import CompanyReportCard from "./CompanyReportCard";
import SectorReportHeader from "./SectorReportHeader";
import { buildCardData, buildCompanyCard, cardToMarkdown, type CompanyCardData } from "@/lib/companyCard";
import { buildSectorReport, type SectorReportModel } from "@/lib/sectorReport";
import { mergeCompaniesIntoDB, validateIncomingCompany } from "@/lib/dedup";
import { ACCOUNTS, getUniqueAccounts } from "./accountsData";
import type { AccountProfile } from "./accountProfile";
import {
  downloadMarkdownPdf, downloadMarkdownDocx, downloadMarkdownText,
  downloadPdf, downloadDocx, downloadPartnershipPdf,
} from "@/lib/report-export";
import { downloadExcel } from "@/lib/report-excel";
import { downloadAccountsExcel } from "./accountsExport";
import {
  createProject, listProjects, saveProfileToProject, listSavedProfiles, deleteProject,
  type Project, type SavedProfile,
} from "@/src/firebase/db";
import { getFirebaseAuth } from "@/lib/firebase";
import { getSession } from "@/components/AuthGate";
import { authFetch } from "@/lib/authFetch";
import { CanvasCard, FONT } from "./ui";

const BUNDLE_TICKER = "project-bundle";

// takes: nothing
// does: resolves the signed-in Firebase uid, or "" for guests
// returns: the uid string
function currentUid(): string {
  try { return getFirebaseAuth()?.currentUser?.uid ?? ""; } catch { return ""; }
}

// One saved pipeline run, serialized into a project's SavedProfile record.
interface RunBundle {
  subject: string;
  mode?: "company" | "sector";
  companyMd: string;
  uncMd: string;
  // Raw UNC partnership payload, kept so a reopened company run can rebuild its
  // rich card (older bundles without it fall back to the markdown panels only).
  partnerData?: PartnerData | null;
  sectorData: ReportData | null;
  savedAt: number;
}

const pill =
  "rounded-full border border-black/[0.08] bg-white/80 hover:bg-white hover:shadow-sm transition-all cursor-pointer disabled:opacity-60";
const pillStyle = { padding: "5px 13px", fontSize: 12.5, fontWeight: 500, color: "#1d1d1f" } as const;

// takes: a label and a list of { label, fn } download actions
// does: renders a titled row of download buttons (guards double-clicks)
// returns: the download-row element
function DownloadRow({ actions }: { actions: { label: string; fn: () => void | Promise<void> }[] }) {
  const [busy, setBusy] = useState<string | null>(null);
  async function run(label: string, fn: () => void | Promise<void>) {
    if (busy) return;
    setBusy(label);
    try { await fn(); } finally { setBusy(null); }
  }
  return (
    <div style={{ display: "flex", gap: 7, flexShrink: 0, flexWrap: "wrap" }}>
      {actions.map((a, i) => (
        <button
          key={a.label}
          disabled={!!busy}
          onClick={() => run(a.label, a.fn)}
          style={{
            fontSize: 12, fontWeight: 600, padding: "6px 13px", borderRadius: 999,
            cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1,
            border: i === 0 ? "none" : "1px solid #ececf0",
            background: i === 0 ? "#1d1d1f" : "#fff",
            color: i === 0 ? "#fff" : "#1d1d1f",
          }}
        >
          {busy === a.label ? "Building…" : `↓ ${a.label}`}
        </button>
      ))}
    </div>
  );
}

// takes: a section title, an optional status note, downloads, and children
// does: renders one artifact panel (Company / UNC / Sector / Database)
// returns: the panel element
function Panel({ title, note, actions, children }: {
  title: string; note?: string; actions?: { label: string; fn: () => void | Promise<void> }[]; children: React.ReactNode;
}) {
  return (
    <section style={{ background: "rgba(255,255,255,0.62)", border: "1px solid rgba(0,0,0,0.06)", borderRadius: 18, padding: 22, boxShadow: "0 8px 30px rgba(0,0,0,0.04)" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <div>
          <h3 style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.01em", margin: 0 }}>{title}</h3>
          {note && <p style={{ fontSize: 12.5, color: "#9a9aa2", margin: "4px 0 0" }}>{note}</p>}
        </div>
        {actions && actions.length > 0 && <DownloadRow actions={actions} />}
      </div>
      {children}
    </section>
  );
}

// takes: an optional new-Database-rows sink and an optional initial query from
//        the Dashboard search bar
// does: renders the Projects workspace — create/open projects, run the full
//       pipeline (Company Profile + UNC Profile + Sector Scan + Database) on a
//       typed subject, view each artifact, download as PDF/DOCX/Excel, and save
//       the run into the project (reopen rehydrates everything offline).
// returns: the Projects canvas element
export default function ProjectsCanvas({
  onNewRows,
  initialQuery,
  onQueryConsumed,
}: {
  onNewRows?: (rows: AccountProfile[]) => void;
  initialQuery?: string;
  onQueryConsumed?: () => void;
}) {
  const dive = useDeepDive();
  const scan = useSectorScan();

  const [projects, setProjects] = useState<Project[]>([]);
  const [current, setCurrent] = useState<Project | null>(null);
  const [savedRuns, setSavedRuns] = useState<SavedProfile[]>([]);
  const [newName, setNewName] = useState("");
  const [newVisibility, setNewVisibility] = useState<"public" | "private">("private");

  const [subject, setSubject] = useState("");
  // `mode` is what the user picked: "auto" (detect from the text) or a forced
  // "company"/"sector". `resolvedMode` is what the most recent run actually used
  // — the panels render off this so a result is never mislabeled mid-edit.
  const [mode, setMode] = useState<"auto" | "company" | "sector">("auto");
  const [resolvedMode, setResolvedMode] = useState<"company" | "sector">("company");
  const [runStatus, setRunStatus] = useState<"idle" | "running" | "done">("idle");
  const [companyMd, setCompanyMd] = useState("");
  const [uncMd, setUncMd] = useState("");
  const [partnerData, setPartnerData] = useState<PartnerData | null>(null);
  const [uncStatus, setUncStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [sectorData, setSectorData] = useState<ReportData | null>(null);
  const [saveMsg, setSaveMsg] = useState("");

  // ── Project list / persistence ─────────────────────────────────────────
  async function refreshProjects() {
    setProjects(await listProjects(currentUid()));
  }
  useEffect(() => {
    (async () => {
      const uid = currentUid();
      const isGuest = getSession()?.guest ?? true;
      // The fixed demo set every guest sees. Signed-in users get their own
      // starter set, seeded once, and keep anything they create afterwards.
      const guestSeeds = ["Information Technology", "Financials", "Healthcare"];
      const userSeeds = ["Streaming", "Artificial Intelligence"];

      if (isGuest) {
        // Guests get a deterministic, self-healing demo workspace: exactly the
        // three curated example projects, every load. This both enforces the
        // "guests only see these three" rule and auto-clears any stale projects
        // left in a shared guest browser. (Guests have no account to persist to;
        // signed-in users are the ones whose created projects are saved.)
        const want = guestSeeds.map((n) => n.toLowerCase());
        const existing = await listProjects(uid);
        const byName = new Map<string, Project>();
        for (const p of existing) {
          const key = p.name.trim().toLowerCase();
          // Remove anything that isn't a wanted seed, and any duplicate seed.
          if (!want.includes(key) || byName.has(key)) {
            await deleteProject(uid, p.id);
          } else {
            byName.set(key, p);
          }
        }
        for (const n of guestSeeds) {
          if (!byName.has(n.toLowerCase())) await createProject(uid, n);
        }
      } else {
        // Signed-in users: seed the starter set once. Bump SEED_VERSION to
        // re-seed. We also remove the PREVIOUS pristine auto-seeds (no saved
        // runs) so old starters don't pile up — never touching a project the
        // user ran or created by hand.
        const SEED_VERSION = "v5";
        const ALL_SEED_NAMES = [
          "technology", "healthcare", "artificial intelligence",   // v1–v3
          "information technology", "financials", "streaming",      // v4–v5
        ];
        const seedKey = `map_seeded_examples_${SEED_VERSION}_${uid}`;
        if (!localStorage.getItem(seedKey)) {
          localStorage.setItem(seedKey, "1");
          const existing = await listProjects(uid);
          for (const p of existing) {
            if (!ALL_SEED_NAMES.includes(p.name.trim().toLowerCase())) continue;
            const runs = await listSavedProfiles(uid, p.id);
            if (runs.length === 0) await deleteProject(uid, p.id);
          }
          const remaining = (await listProjects(uid)).map((p) => p.name.trim().toLowerCase());
          const toSeed = userSeeds.filter((n) => !remaining.includes(n.toLowerCase()));
          for (const n of toSeed) await createProject(uid, n);
        }
      }
      await refreshProjects();
    })();
  }, []);

  async function openProject(p: Project) {
    setCurrent(p);
    resetRun();
    const profiles = await listSavedProfiles(currentUid(), p.id);
    const runs = profiles.filter((s) => s.ticker === BUNDLE_TICKER);
    setSavedRuns(runs);
    // Auto-load the most recent saved run, or kick off a fresh pipeline run for
    // brand-new projects — either way the user never has to click Run manually.
    if (runs.length > 0) {
      openSavedRun(runs[runs.length - 1]);
    } else if (p.name.trim()) {
      runSubject(p.name.trim(), "auto");
    }
  }

  async function createNew() {
    const name = newName.trim();
    if (!name) return;
    const id = await createProject(currentUid(), name, newVisibility);
    setNewName("");
    setNewVisibility("private");
    await refreshProjects();
    const fresh = (await listProjects(currentUid())).find((p) => p.id === id);
    if (fresh) await openProject(fresh);
  }

  // takes: the project to delete and the originating click event
  // does: confirms, then permanently removes the project (and its saved runs);
  //       if it's the open one, returns to the picker. Stops propagation so the
  //       card's open-on-click doesn't fire.
  async function removeProject(p: Project, e: React.MouseEvent) {
    e.stopPropagation();
    if (!window.confirm(`Delete project "${p.name}"? This also removes its saved runs and can't be undone.`)) return;
    await deleteProject(currentUid(), p.id);
    if (current?.id === p.id) setCurrent(null);
    await refreshProjects();
  }

  function resetRun() {
    setSubject(""); setMode("auto"); setResolvedMode("company"); setRunStatus("idle");
    setCompanyMd(""); setUncMd(""); setPartnerData(null); setUncStatus("idle"); setSectorData(null); setSaveMsg("");
  }

  // ── Pipeline run ───────────────────────────────────────────────────────
  async function runUNC(name: string) {
    setUncStatus("loading"); setUncMd(""); setPartnerData(null);
    try {
      const res = await authFetch("/api/partnerships", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: name, type: "company" }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.data) { setUncStatus("error"); return; }
      const data = json.data as PartnerData;
      setPartnerData(data);
      setUncMd(buildPartnershipMarkdown(data));
      setUncStatus("done");
    } catch { setUncStatus("error"); }
  }

  function runAll() {
    runSubject(subject.trim(), mode);
  }

  // takes: a subject string and the chosen mode ("auto" detects)
  // does: kicks off the matching pipeline (company profile + UNC, or sector
  //       scan + database). Used by the Run button and by auto-run on open.
  function runSubject(s: string, chosen: "auto" | "company" | "sector") {
    if (!s) return;
    setSubject(s);
    // In "auto" mode, decide company vs sector from the text (e.g. "health
    // tech" → sector); otherwise honor the user's forced choice.
    const eff: "company" | "sector" = chosen === "auto" ? detectSubjectKind(s) : chosen;
    setResolvedMode(eff);
    setCompanyMd(""); setUncMd(""); setPartnerData(null); setSectorData(null); setSaveMsg("");
    setRunStatus("running");
    if (eff === "company") {
      dive.run(s);   // Company Profile
      runUNC(s);     // UNC Partnership Profile
    } else {
      scan.run(s);   // Sector Scan + Database
    }
  }

  // Live preview of what "auto" will run, shown under the search bar.
  const detected: "company" | "sector" = subject.trim() ? detectSubjectKind(subject) : "company";

  // Sync live hook output into local state only while a run is in flight, so
  // reopening a saved run is never clobbered by stale hook state.
  useEffect(() => { if (runStatus === "running") setCompanyMd(dive.markdown); }, [dive.markdown, runStatus]);
  useEffect(() => { if (runStatus === "running" && scan.data) setSectorData(scan.data); }, [scan.data, runStatus]);

  const liveDone = resolvedMode === "company"
    ? (dive.status === "done" || dive.status === "error") &&
      (uncStatus === "done" || uncStatus === "error")
    : (scan.status === "done" || scan.status === "error");
  useEffect(() => { if (runStatus === "running" && liveDone) setRunStatus("done"); }, [runStatus, liveDone]);

  // When the Dashboard search bar sends a query here, open (or create) a project
  // named after that text and auto-run the pipeline inside it — so the searched
  // text becomes a real project page with a freshly generated report, not an
  // invisible run behind the project picker.
  const lastInitialQuery = useRef("");
  useEffect(() => {
    const q = initialQuery?.trim();
    if (!q || initialQuery === lastInitialQuery.current) return;
    lastInitialQuery.current = initialQuery!;
    onQueryConsumed?.();
    (async () => {
      const uid = currentUid();
      // Reuse a same-named project if one already exists (case-insensitive);
      // openProject then loads its latest saved run or runs fresh as needed.
      const existing = (await listProjects(uid)).find(
        (p) => p.name.trim().toLowerCase() === q.toLowerCase(),
      );
      let proj = existing;
      if (!proj) {
        const id = await createProject(uid, q);
        proj = (await listProjects(uid)).find((p) => p.id === id);
      }
      await refreshProjects();
      if (proj) await openProject(proj);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery]);

  // ── Database rows derived from the sector scan ─────────────────────────
  // Every company from the run is validated (legal name + identifier + citable
  // source, revenue coerced to a number or blank) and then de-duplicated
  // against the existing Database before it can reach onNewRows — invalid and
  // duplicate companies are dropped, never shown.
  const dbRows = useMemo<AccountProfile[]>(() => {
    if (!sectorData) return [];
    const date = new Date().toISOString().split("T")[0];
    const sector = sectorData.report_meta?.sector || subject;
    const validated = (sectorData.section4_profiles || [])
      .map((p) => validateIncomingCompany(p, sector, date))
      .filter((r): r is AccountProfile => r !== null);
    const merged = mergeCompaniesIntoDB(ACCOUNTS, validated);
    // The additions are everything mergeCompaniesIntoDB appended past ACCOUNTS.
    return merged.slice(ACCOUNTS.length);
  }, [sectorData, subject]);

  useEffect(() => { if (dbRows.length && onNewRows) onNewRows(dbRows); }, [dbRows, onNewRows]);

  // ── Per-company partnership report cards (sector runs) ─────────────────
  // Built entirely from the sector scan's already-fetched, double-sourced data
  // — no extra API calls, no LLM, every line links to a primary source.
  const cards = useMemo<CompanyCardData[]>(() => {
    if (!sectorData) return [];
    const profiles: any[] = (sectorData as any).section4_profiles || [];
    return profiles.slice(0, 10).map((p) => buildCardData(p, sectorData));
  }, [sectorData]);

  const sectorModel = useMemo<SectorReportModel | null>(() => {
    if (!sectorData) return null;
    return buildSectorReport(sectorData);
  }, [sectorData]);

  // ── Rich card for company runs ─────────────────────────────────────────
  // Mirrors the sector report's per-company card: financial stat tiles parsed
  // from the Company Profile prose + UNC ties from the partnership payload.
  const companyCard = useMemo<CompanyCardData | null>(() => {
    if (resolvedMode === "sector") return null;
    if (!companyMd && !partnerData) return null;
    return buildCompanyCard(subject, companyMd, partnerData);
  }, [resolvedMode, subject, companyMd, partnerData]);

  // ── Save / reopen a run ────────────────────────────────────────────────
  async function saveRun() {
    if (!current) return;
    const bundle: RunBundle = { subject, mode: resolvedMode, companyMd, uncMd, partnerData, sectorData, savedAt: Date.now() };
    setSaveMsg("Saving…");
    await saveProfileToProject(currentUid(), current.id, {
      companyName: subject || "Pipeline run",
      ticker: BUNDLE_TICKER,
      reportMarkdown: JSON.stringify(bundle),
      filingDate: "",
    });
    const profiles = await listSavedProfiles(currentUid(), current.id);
    setSavedRuns(profiles.filter((s) => s.ticker === BUNDLE_TICKER));
    setSaveMsg("Saved to project");
    window.setTimeout(() => setSaveMsg(""), 2600);
  }

  function openSavedRun(sp: SavedProfile) {
    try {
      const b = JSON.parse(sp.reportMarkdown) as RunBundle;
      setRunStatus("done");
      setSubject(b.subject || "");
      const savedMode = b.mode ?? (b.sectorData ? "sector" : "company");
      setMode(savedMode);
      setResolvedMode(b.sectorData ? "sector" : savedMode);
      setCompanyMd(b.companyMd || "");
      setUncMd(b.uncMd || "");
      setPartnerData(b.partnerData ?? null);
      setUncStatus(b.uncMd ? "done" : "idle");
      setSectorData(b.sectorData || null);
      setSaveMsg("");
    } catch { /* corrupt bundle — ignore */ }
  }

  const dateStamp = new Date().toISOString().split("T")[0];
  const subjTitle = subject.trim() || "Untitled";

  // ── Project picker (no project open) ───────────────────────────────────
  if (!current) {
    return (
      <CanvasCard title="Projects">
        <div style={{ padding: "24px 28px 36px", fontFamily: FONT, maxWidth: 880, margin: "0 auto" }}>
          <h1 style={{ fontSize: 32, fontWeight: 700, letterSpacing: "-0.025em", margin: "0 0 6px" }}>Projects</h1>
          <p style={{ fontSize: 15, color: "#6b6b73", margin: "0 0 22px", maxWidth: 560 }}>
            A project bundles a full pipeline run — Company Profile, UNC Profile, Sector Scan, and Database — for one subject. Create a new project or open an existing one.
          </p>

          <div style={{ display: "flex", gap: 10, marginBottom: 26, flexWrap: "wrap" }}>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") createNew(); }}
              placeholder="New project name…"
              aria-label="New project name"
              style={{ flex: 1, minWidth: 240, border: "1px solid rgba(0,0,0,0.12)", borderRadius: 12, padding: "11px 15px", fontSize: 15, outline: "none", background: "#fff", fontFamily: FONT }}
            />
            <div role="group" aria-label="Visibility" style={{ display: "inline-flex", background: "#ececf0", borderRadius: 999, padding: 3, flexShrink: 0 }}>
              {(["private", "public"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setNewVisibility(v)}
                  style={{
                    border: "none", cursor: "pointer", borderRadius: 999, padding: "7px 14px",
                    fontSize: 13, fontWeight: 600, textTransform: "capitalize",
                    background: newVisibility === v ? "#fff" : "transparent",
                    color: newVisibility === v ? "#1d1d1f" : "#8a8a92",
                    boxShadow: newVisibility === v ? "0 1px 4px rgba(0,0,0,0.1)" : "none",
                  }}
                >
                  {v === "private" ? "🔒 Private" : "🌐 Public"}
                </button>
              ))}
            </div>
            <button
              data-testid="create-project"
              onClick={createNew}
              disabled={!newName.trim()}
              style={{ border: "none", cursor: "pointer", borderRadius: 12, padding: "11px 22px", fontSize: 14, fontWeight: 600, color: "#fff", background: "#1d1d1f", whiteSpace: "nowrap" }}
            >
              New project
            </button>
          </div>

          {projects.length === 0 ? (
            <p style={{ fontSize: 13.5, color: "#9a9aa2" }}>No projects yet. Create one above to get started.</p>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
              {projects.map((p) => (
                <div key={p.id} style={{ position: "relative" }}>
                  <button
                    data-testid="project-card"
                    onClick={() => openProject(p)}
                    style={{ width: "100%", textAlign: "left", cursor: "pointer", background: "#fff", border: "1px solid rgba(0,0,0,0.07)", borderRadius: 14, padding: "16px 36px 16px 18px", fontFamily: FONT }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <p style={{ fontSize: 15, fontWeight: 600, margin: 0, color: "#1d1d1f" }}>{p.name}</p>
                      <span style={{ fontSize: 11, fontWeight: 500, padding: "2px 7px", borderRadius: 999, background: p.visibility === "public" ? "#eef5ff" : "#f2f2f7", color: p.visibility === "public" ? "#3b6fd4" : "#8a8a92" }}>
                        {p.visibility === "public" ? "🌐 Public" : "🔒 Private"}
                      </span>
                    </div>
                    <p style={{ fontSize: 12, color: "#9a9aa2", margin: "4px 0 0" }}>
                      Created {new Date(p.createdAt).toLocaleDateString()}
                    </p>
                  </button>
                  <button
                    data-testid="delete-project"
                    onClick={(e) => removeProject(p, e)}
                    aria-label={`Delete project ${p.name}`}
                    title="Delete project"
                    style={{ position: "absolute", top: 10, right: 10, width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center", border: "none", background: "transparent", color: "#c7c7cc", fontSize: 16, lineHeight: 1, cursor: "pointer", borderRadius: 6 }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = "#ff3b30"; e.currentTarget.style.background = "#fff0ef"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = "#c7c7cc"; e.currentTarget.style.background = "transparent"; }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </CanvasCard>
    );
  }

  // ── Open project — run + artifacts ─────────────────────────────────────
  const companyActions = companyMd
    ? [
        { label: "PDF", fn: () => downloadMarkdownPdf(companyMd, `${subjTitle} — Company Profile`) },
        { label: "DOCX", fn: () => downloadMarkdownDocx(companyMd, `${subjTitle} — Company Profile`) },
        { label: "Markdown", fn: () => downloadMarkdownText(companyMd, `${subjTitle} — Company Profile`) },
      ]
    : [];
  const uncActions = uncMd
    ? [
        { label: "PDF", fn: () => downloadMarkdownPdf(uncMd, `${subjTitle} — UNC Profile`) },
        { label: "DOCX", fn: () => downloadMarkdownDocx(uncMd, `${subjTitle} — UNC Profile`) },
        { label: "Markdown", fn: () => downloadMarkdownText(uncMd, `${subjTitle} — UNC Profile`) },
      ]
    : [];
  // The backend attaches the condensed 18–22 page brief as an extra field on
  // the report payload; it rides along on sectorData untouched by the renderer.
  const condensedMd = (sectorData as { condensed_report_markdown?: string } | null)
    ?.condensed_report_markdown || "";
  // The full partnership report: condensed 2-page overview first, then one
  // section per company. Detailed sector scan stays on its own page/full report.
  const partnershipReportMd = [
    condensedMd,
    ...cards.map((c) => cardToMarkdown(c)),
  ].filter(Boolean).join("\n\n---\n\n");
  const sectorActions = sectorData
    ? [
        ...(partnershipReportMd
          ? [
              { label: "Partnership Report (PDF)", fn: () => sectorModel
                ? downloadPartnershipPdf(sectorModel, cards.map(cardToMarkdown), `${subjTitle} — Partnership Report`)
                : downloadMarkdownPdf(partnershipReportMd, `${subjTitle} — Partnership Report`) },
              { label: "Partnership Report (DOCX)", fn: () => downloadMarkdownDocx(partnershipReportMd, `${subjTitle} — Partnership Report`) },
            ]
          : []),
        { label: "Full Report (PDF)", fn: () => downloadPdf(sectorData) },
        { label: "Full Report (DOCX)", fn: () => downloadDocx(sectorData) },
        { label: "Excel", fn: () => downloadExcel(sectorData) },
      ]
    : [];
  const dbActions = [
    { label: "Excel", fn: () => downloadAccountsExcel(getUniqueAccounts(ACCOUNTS, dbRows)) },
  ];

  return (
    <CanvasCard title={`Project — ${current.name}`}>
      <div style={{ padding: "20px 28px 36px", fontFamily: FONT, maxWidth: 1040, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
          <button
            onClick={() => { setCurrent(null); refreshProjects(); }}
            style={{ border: "none", background: "none", cursor: "pointer", fontSize: 13, color: "#5b6cff", padding: 0 }}
          >
            ← All projects
          </button>
          <button
            data-testid="delete-current-project"
            onClick={(e) => current && removeProject(current, e)}
            title="Delete this project"
            style={{ border: "1px solid #f0d2d0", background: "#fff", cursor: "pointer", fontSize: 12.5, color: "#ff3b30", padding: "5px 12px", borderRadius: 999, fontWeight: 500 }}
          >
            ✕ Delete project
          </button>
        </div>

        {/* Run bar */}
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
          {/* Auto / Company / Sector toggle — Auto detects from the text */}
          <div role="tablist" aria-label="Pipeline mode" style={{ display: "inline-flex", background: "#ececf0", borderRadius: 999, padding: 3, flexShrink: 0 }}>
            {(["auto", "company", "sector"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                data-testid={`mode-tab-${m}`}
                onClick={() => setMode(m)}
                disabled={runStatus === "running"}
                style={{
                  border: "none", cursor: "pointer", borderRadius: 999, padding: "7px 16px",
                  fontSize: 13, fontWeight: 600, textTransform: "capitalize",
                  background: mode === m ? "#fff" : "transparent",
                  color: mode === m ? "#1d1d1f" : "#8a8a92",
                  boxShadow: mode === m ? "0 1px 4px rgba(0,0,0,0.1)" : "none",
                }}
              >
                {m}
              </button>
            ))}
          </div>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") runAll(); }}
            placeholder="Company or sector — e.g. Apple, Health Tech…"
            aria-label="Pipeline subject"
            style={{ flex: 1, minWidth: 200, border: "1px solid rgba(0,0,0,0.12)", borderRadius: 12, padding: "11px 15px", fontSize: 15, outline: "none", background: "#fff", fontFamily: FONT }}
          />
          <button
            data-testid="run-pipeline"
            onClick={runAll}
            disabled={!subject.trim() || runStatus === "running"}
            style={{ border: "none", cursor: "pointer", borderRadius: 12, padding: "11px 24px", fontSize: 14, fontWeight: 600, color: "#fff", background: "#1d1d1f", whiteSpace: "nowrap" }}
          >
            {runStatus === "running" ? "Running…" : "Run pipeline"}
          </button>
          {runStatus === "done" && (
            <button data-testid="save-run" onClick={saveRun} className={pill} style={pillStyle}>Save to project</button>
          )}
          {saveMsg && <span style={{ fontSize: 12, color: "#5b6cff" }}>{saveMsg}</span>}
        </div>
        <p style={{ fontSize: 12, color: "#9a9aa2", margin: "0 0 22px" }}>
          {mode === "auto"
            ? (subject.trim()
                ? `Auto-detected: ${detected === "company"
                    ? `Company “${subject.trim()}” → Company Profile + UNC Partnership Profile.`
                    : `Sector “${subject.trim()}” → Sector Scan + Database.`} Use the toggle to override.`
                : "Auto mode: detects whether you typed a company or a sector. Use the toggle to force one.")
            : mode === "company"
              ? "Company mode: runs Company Profile + UNC Partnership Profile."
              : "Sector mode: runs Sector Scan + Database."}
        </p>

        {/* Saved runs in this project */}
        {savedRuns.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: "#9a9aa2", margin: "0 0 10px" }}>Saved runs</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {savedRuns.map((s) => (
                <button key={s.id} data-testid="saved-run" onClick={() => openSavedRun(s)} className={pill} style={pillStyle}>
                  {s.companyName} · {new Date(s.lastUpdated).toLocaleDateString()}
                </button>
              ))}
            </div>
          </div>
        )}

        {runStatus === "idle" ? (
          <p style={{ fontSize: 13.5, color: "#9a9aa2" }}>Type a subject and run the pipeline, or open a saved run above.</p>
        ) : (
          <div data-testid="pipeline-results" style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            {/* Partnership Report — shown first for sector runs so it's the primary output */}
            {resolvedMode === "sector" && cards.length > 0 && (
              <section style={{ background: "rgba(255,255,255,0.62)", border: "1px solid rgba(0,0,0,0.06)", borderRadius: 18, padding: "22px 26px", boxShadow: "0 8px 30px rgba(0,0,0,0.04)" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 4 }}>
                  <div>
                    <h3 style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.01em", margin: 0 }}>Partnership Report</h3>
                    <p style={{ fontSize: 12.5, color: "#9a9aa2", margin: "4px 0 0" }}>
                      Sector overview then one sourced card per company. Every claim links to a primary public source.
                    </p>
                  </div>
                  {partnershipReportMd && (
                    <div style={{ display: "flex", gap: 7, flexShrink: 0 }}>
                      <button onClick={() => sectorModel
                        ? downloadPartnershipPdf(sectorModel, cards.map(cardToMarkdown), `${subjTitle} — Partnership Report`)
                        : downloadMarkdownPdf(partnershipReportMd, `${subjTitle} — Partnership Report`)} style={{ fontSize: 12, fontWeight: 600, padding: "6px 13px", borderRadius: 999, cursor: "pointer", border: "none", background: "#1d1d1f", color: "#fff" }}>↓ PDF</button>
                      <button onClick={() => downloadMarkdownText(partnershipReportMd, `${subjTitle} — Partnership Report`)} style={{ fontSize: 12, fontWeight: 600, padding: "6px 13px", borderRadius: 999, cursor: "pointer", border: "1px solid #ececf0", background: "#fff", color: "#1d1d1f" }}>↓ Markdown</button>
                      <button onClick={() => downloadMarkdownDocx(partnershipReportMd, `${subjTitle} — Partnership Report`)} style={{ fontSize: 12, fontWeight: 600, padding: "6px 13px", borderRadius: 999, cursor: "pointer", border: "1px solid #ececf0", background: "#fff", color: "#1d1d1f" }}>↓ DOCX</button>
                    </div>
                  )}
                </div>
                {sectorModel && (
                  <div style={{ borderTop: "1px solid #ececf0", marginTop: 14, paddingTop: 22 }}>
                    <SectorReportHeader m={sectorModel} />
                  </div>
                )}
                {cards.map((c, i) => (
                  <CompanyReportCard
                    key={`${c.name}-${i}`}
                    data={c}
                    onDownloadPDF={() => downloadMarkdownPdf(cardToMarkdown(c), `${c.name} — UNC Partnership`)}
                    onDownloadDOCX={() => downloadMarkdownDocx(cardToMarkdown(c), `${c.name} — UNC Partnership`)}
                  />
                ))}
              </section>
            )}

            {resolvedMode !== "sector" && <>
              {/* Partnership Report — the board-ready card, shown first so a
                  company run reads like the sector report's per-company cards. */}
              {companyCard && (companyMd || uncMd) && (
                <section style={{ background: "rgba(255,255,255,0.62)", border: "1px solid rgba(0,0,0,0.06)", borderRadius: 18, padding: "22px 26px", boxShadow: "0 8px 30px rgba(0,0,0,0.04)" }}>
                  <div>
                    <h3 style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.01em", margin: 0 }}>Partnership Report</h3>
                    <p style={{ fontSize: 12.5, color: "#9a9aa2", margin: "4px 0 0" }}>
                      Board-ready summary sourced to SEC EDGAR, NIH RePORTER, PubMed, and ClinicalTrials.gov. Full profile below.
                    </p>
                  </div>
                  <CompanyReportCard
                    data={companyCard}
                    onDownloadPDF={() => downloadMarkdownPdf(cardToMarkdown(companyCard), `${subjTitle} — Partnership Report`)}
                    onDownloadDOCX={() => downloadMarkdownDocx(cardToMarkdown(companyCard), `${subjTitle} — Partnership Report`)}
                  />
                </section>
              )}

              <Panel
                title="Company Profile"
                note={dive.status === "streaming" || (runStatus === "running" && !companyMd) ? "Generating…" : undefined}
                actions={companyActions}
              >
                {companyMd
                  ? <div className="workspace-md"><MarkdownArticle markdown={companyMd.replace(/^[\s\S]*?\n(?=## )/, "") || companyMd.replace(/^#\s+.*\n?/, "")} /></div>
                  : <p style={{ fontSize: 13, color: "#9a9aa2", margin: 0 }}>No company profile yet.</p>}
              </Panel>

              <Panel
                title="UNC Partnership Profile"
                note={uncStatus === "loading" ? "Generating…" : uncStatus === "error" ? "Partnership data unavailable." : undefined}
                actions={uncActions}
              >
                {uncMd
                  ? <div className="workspace-md"><MarkdownArticle markdown={uncMd.replace(/^#\s+.*\n?/, "")} /></div>
                  : <p style={{ fontSize: 13, color: "#9a9aa2", margin: 0 }}>No UNC profile yet.</p>}
              </Panel>
            </>}

          </div>
        )}
      </div>
    </CanvasCard>
  );
}
