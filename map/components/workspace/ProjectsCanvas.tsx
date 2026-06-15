"use client";

import { useEffect, useMemo, useState } from "react";
import Report, { type ReportData } from "@/components/Report";
import MarkdownArticle from "@/app/components/MarkdownArticle";
import { useDeepDive } from "./useDeepDive";
import { useSectorScan } from "./useSectorScan";
import { buildPartnershipMarkdown, type PartnerData } from "./PartnershipsView";
import { sectorProfileToAccountRow, type UNCSignals } from "@/lib/sector-package";
import { ACCOUNTS, getUniqueAccounts } from "./accountsData";
import type { AccountProfile } from "./accountProfile";
import {
  downloadMarkdownPdf, downloadMarkdownDocx, downloadMarkdownText,
  downloadPdf, downloadDocx,
} from "@/lib/report-export";
import { downloadExcel } from "@/lib/report-excel";
import { downloadAccountsExcel } from "./accountsExport";
import {
  createProject, listProjects, saveProfileToProject, listSavedProfiles,
  type Project, type SavedProfile,
} from "@/src/firebase/db";
import { getFirebaseAuth } from "@/lib/firebase";
import { CanvasCard, FONT } from "./ui";

const EMPTY_SIGNALS: UNCSignals = {
  paperCount: 0, secMentions: 0, nihGrants: 0, uncTrials: 0, topSchools: [], isPartner: false,
};
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
  companyMd: string;
  uncMd: string;
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
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {actions.map((a) => (
        <button key={a.label} className={pill} style={pillStyle} disabled={!!busy} onClick={() => run(a.label, a.fn)}>
          {busy === a.label ? "Building…" : a.label}
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

// takes: an optional new-Database-rows sink (merged into the Database tab)
// does: renders the Projects workspace — create/open projects, run the full
//       pipeline (Company Profile + UNC Profile + Sector Scan + Database) on a
//       typed subject, view each artifact, download as PDF/DOCX/Excel, and save
//       the run into the project (reopen rehydrates everything offline).
// returns: the Projects canvas element
export default function ProjectsCanvas({ onNewRows }: { onNewRows?: (rows: AccountProfile[]) => void }) {
  const dive = useDeepDive();
  const scan = useSectorScan();

  const [projects, setProjects] = useState<Project[]>([]);
  const [current, setCurrent] = useState<Project | null>(null);
  const [savedRuns, setSavedRuns] = useState<SavedProfile[]>([]);
  const [newName, setNewName] = useState("");

  const [subject, setSubject] = useState("");
  const [runStatus, setRunStatus] = useState<"idle" | "running" | "done">("idle");
  const [companyMd, setCompanyMd] = useState("");
  const [uncMd, setUncMd] = useState("");
  const [uncStatus, setUncStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [sectorData, setSectorData] = useState<ReportData | null>(null);
  const [saveMsg, setSaveMsg] = useState("");

  // ── Project list / persistence ─────────────────────────────────────────
  async function refreshProjects() {
    setProjects(await listProjects(currentUid()));
  }
  useEffect(() => { refreshProjects(); }, []);

  async function openProject(p: Project) {
    setCurrent(p);
    resetRun();
    const profiles = await listSavedProfiles(currentUid(), p.id);
    setSavedRuns(profiles.filter((s) => s.ticker === BUNDLE_TICKER));
  }

  async function createNew() {
    const name = newName.trim();
    if (!name) return;
    const id = await createProject(currentUid(), name);
    setNewName("");
    await refreshProjects();
    const fresh = (await listProjects(currentUid())).find((p) => p.id === id);
    if (fresh) await openProject(fresh);
  }

  function resetRun() {
    setSubject(""); setRunStatus("idle"); setCompanyMd(""); setUncMd("");
    setUncStatus("idle"); setSectorData(null); setSaveMsg("");
  }

  // ── Pipeline run ───────────────────────────────────────────────────────
  async function runUNC(name: string) {
    setUncStatus("loading"); setUncMd("");
    try {
      const res = await fetch("/api/partnerships", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: name, type: "company" }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.data) { setUncStatus("error"); return; }
      setUncMd(buildPartnershipMarkdown(json.data as PartnerData));
      setUncStatus("done");
    } catch { setUncStatus("error"); }
  }

  function runAll() {
    const s = subject.trim();
    if (!s) return;
    setCompanyMd(""); setUncMd(""); setSectorData(null); setSaveMsg("");
    setRunStatus("running");
    dive.run(s);   // Company Profile (subject as company)
    scan.run(s);   // Sector Scan (subject as sector)
    runUNC(s);     // UNC Partnership Profile
  }

  // Sync live hook output into local state only while a run is in flight, so
  // reopening a saved run is never clobbered by stale hook state.
  useEffect(() => { if (runStatus === "running") setCompanyMd(dive.markdown); }, [dive.markdown, runStatus]);
  useEffect(() => { if (runStatus === "running" && scan.data) setSectorData(scan.data); }, [scan.data, runStatus]);

  const liveDone =
    (dive.status === "done" || dive.status === "error") &&
    (scan.status === "done" || scan.status === "error") &&
    (uncStatus === "done" || uncStatus === "error");
  useEffect(() => { if (runStatus === "running" && liveDone) setRunStatus("done"); }, [runStatus, liveDone]);

  // ── Database rows derived from the sector scan ─────────────────────────
  const dbRows = useMemo<AccountProfile[]>(() => {
    if (!sectorData) return [];
    const date = new Date().toISOString().split("T")[0];
    const rows = (sectorData.section4_profiles || []).map((p) =>
      sectorProfileToAccountRow(p, sectorData.report_meta?.sector || subject, EMPTY_SIGNALS, date),
    );
    const existing = new Set(ACCOUNTS.map((a) => a.account.toLowerCase().trim()));
    return rows.filter((r) => r.account && !existing.has(r.account.toLowerCase().trim()));
  }, [sectorData, subject]);

  useEffect(() => { if (dbRows.length && onNewRows) onNewRows(dbRows); }, [dbRows, onNewRows]);

  // ── Save / reopen a run ────────────────────────────────────────────────
  async function saveRun() {
    if (!current) return;
    const bundle: RunBundle = { subject, companyMd, uncMd, sectorData, savedAt: Date.now() };
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
      setCompanyMd(b.companyMd || "");
      setUncMd(b.uncMd || "");
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
                <button
                  key={p.id}
                  data-testid="project-card"
                  onClick={() => openProject(p)}
                  style={{ textAlign: "left", cursor: "pointer", background: "#fff", border: "1px solid rgba(0,0,0,0.07)", borderRadius: 14, padding: "16px 18px", fontFamily: FONT }}
                >
                  <p style={{ fontSize: 15, fontWeight: 600, margin: 0, color: "#1d1d1f" }}>{p.name}</p>
                  <p style={{ fontSize: 12, color: "#9a9aa2", margin: "4px 0 0" }}>
                    Created {new Date(p.createdAt).toLocaleDateString()}
                  </p>
                </button>
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
  const sectorActions = sectorData
    ? [
        { label: "PDF", fn: () => downloadPdf(sectorData) },
        { label: "DOCX", fn: () => downloadDocx(sectorData) },
        { label: "Excel", fn: () => downloadExcel(sectorData) },
      ]
    : [];
  const dbActions = [
    { label: "Excel", fn: () => downloadAccountsExcel(getUniqueAccounts(ACCOUNTS, dbRows)) },
  ];

  return (
    <CanvasCard title={`Project — ${current.name}`}>
      <div style={{ padding: "20px 28px 36px", fontFamily: FONT, maxWidth: 1040, margin: "0 auto" }}>
        <button
          onClick={() => { setCurrent(null); refreshProjects(); }}
          style={{ border: "none", background: "none", cursor: "pointer", fontSize: 13, color: "#5b6cff", padding: 0, marginBottom: 14 }}
        >
          ← All projects
        </button>

        {/* Run bar */}
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") runAll(); }}
            placeholder="Company or sector name — e.g. Apple, Oncology…"
            aria-label="Pipeline subject"
            style={{ flex: 1, minWidth: 260, border: "1px solid rgba(0,0,0,0.12)", borderRadius: 12, padding: "11px 15px", fontSize: 15, outline: "none", background: "#fff", fontFamily: FONT }}
          />
          <button
            data-testid="run-pipeline"
            onClick={runAll}
            disabled={!subject.trim() || runStatus === "running"}
            style={{ border: "none", cursor: "pointer", borderRadius: 12, padding: "11px 24px", fontSize: 14, fontWeight: 600, color: "#fff", background: "#1d1d1f", whiteSpace: "nowrap" }}
          >
            {runStatus === "running" ? "Running…" : "Run full pipeline"}
          </button>
          {runStatus === "done" && (
            <button data-testid="save-run" onClick={saveRun} className={pill} style={pillStyle}>Save to project</button>
          )}
          {saveMsg && <span style={{ fontSize: 12, color: "#5b6cff" }}>{saveMsg}</span>}
        </div>
        <p style={{ fontSize: 12, color: "#9a9aa2", margin: "0 0 22px" }}>
          Runs all four — Company Profile, UNC Profile, Sector Scan, and Database — for the subject. Each is downloadable below.
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
            <Panel
              title="Company Profile"
              note={dive.status === "streaming" || (runStatus === "running" && !companyMd) ? "Generating…" : undefined}
              actions={companyActions}
            >
              {companyMd
                ? <div className="workspace-md"><MarkdownArticle markdown={companyMd.replace(/^#\s+.*\n?/, "")} /></div>
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

            <Panel
              title="Sector Scan"
              note={scan.status === "running" ? "Generating…" : scan.status === "error" ? (scan.error || "Sector scan unavailable.") : undefined}
              actions={sectorActions}
            >
              {sectorData
                ? <Report data={sectorData} hideToc />
                : <p style={{ fontSize: 13, color: "#9a9aa2", margin: 0 }}>No sector scan yet.</p>}
            </Panel>

            <Panel
              title="Database"
              note={`${dbRows.length} new ${dbRows.length === 1 ? "company" : "companies"} from this run · merged into the Database tab`}
              actions={dbActions}
            >
              {dbRows.length > 0 ? (
                <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {dbRows.slice(0, 30).map((r) => (
                    <li key={r.account} style={{ fontSize: 12.5, background: "#eef0ff", color: "#4451c8", borderRadius: 999, padding: "3px 10px" }}>{r.account}</li>
                  ))}
                </ul>
              ) : (
                <p style={{ fontSize: 13, color: "#9a9aa2", margin: 0 }}>
                  No new companies{sectorData ? " — all already in the Database." : " yet."} Excel export still includes the full Database{` (${dateStamp}).`}
                </p>
              )}
            </Panel>
          </div>
        )}
      </div>
    </CanvasCard>
  );
}
