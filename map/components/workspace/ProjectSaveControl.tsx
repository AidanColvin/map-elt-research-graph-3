"use client";

import { useEffect, useRef, useState } from "react";
import { getFirebaseAuth } from "@/lib/firebase";
import {
  createProject,
  listProjects,
  saveProfileToProject,
  type Project,
} from "@/src/firebase/db";
import { FONT } from "./ui";

// takes: nothing
// does: resolves the current signed-in Firebase uid, if any
// returns: the uid string, or null for guests / unconfigured Firebase
function currentUid(): string | null {
  try {
    return getFirebaseAuth()?.currentUser?.uid ?? null;
  } catch {
    return null;
  }
}

// takes: the company name/ticker and a getter for the current report Markdown
// does: renders a "Save to Project" dropdown — list existing project folders to
//       save a frozen snapshot into, or open a modal to create a new one. The
//       snapshot it writes is the exact Markdown at save time (Phase 3 "freeze").
// returns: the save-to-project control element
export function ProjectSaveControl({
  companyName,
  ticker,
  getMarkdown,
  filingDate = "",
}: {
  companyName: string;
  ticker?: string;
  getMarkdown: () => string;
  filingDate?: string;
}) {
  const [open, setOpen] = useState(false);
  const [modal, setModal] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [newName, setNewName] = useState("");
  const [newVisibility, setNewVisibility] = useState<"public" | "private">("private");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // takes: nothing
  // does: refreshes the project list (device-local mirror merged with Firestore)
  // returns: nothing (updates state)
  async function refresh() {
    setProjects(await listProjects(currentUid() ?? ""));
  }

  useEffect(() => {
    if (open) refresh();
  }, [open]);

  // Close the dropdown when clicking outside it.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (open && rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // takes: the target projectId to save into
  // does: writes the current report as a frozen snapshot to that project
  // returns: nothing (updates status)
  async function saveInto(projectId: string) {
    if (busy) return;
    setBusy(true);
    setStatus("Saving…");
    // Saves to the device immediately and syncs to the cloud in the background,
    // so it works for any signed-in account and never hangs on the network.
    await saveProfileToProject(currentUid() ?? "", projectId, {
      companyName,
      ticker: ticker || "",
      reportMarkdown: getMarkdown(),
      filingDate,
    });
    setBusy(false);
    setStatus("Saved to project");
    setOpen(false);
    window.setTimeout(() => setStatus(""), 2600);
  }

  // takes: a form submit event
  // does: creates a new project, then saves the current report into it
  // returns: nothing
  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name || busy) return;
    setBusy(true);
    setStatus("Creating project…");
    const projectId = await createProject(currentUid() ?? "", name, newVisibility);
    setBusy(false);
    setModal(false);
    setNewName("");
    setNewVisibility("private");
    await saveInto(projectId);
  }

  const pill =
    "rounded-full border border-black/[0.08] bg-white/80 hover:bg-white hover:shadow-sm transition-all cursor-pointer disabled:opacity-60";

  return (
    <div ref={rootRef} style={{ position: "relative", fontFamily: FONT }}>
      <button
        aria-haspopup="menu"
        aria-expanded={open}
        className={pill}
        style={{ padding: "5px 13px", fontSize: 12.5, fontWeight: 500, color: "#1d1d1f" }}
        onClick={() => setOpen((v) => !v)}
      >
        Save to Project ▾
      </button>

      {status && (
        <span style={{ marginLeft: 10, fontSize: 11.5, color: "#5b6cff" }}>{status}</span>
      )}

      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            zIndex: 50,
            minWidth: 220,
            background: "#fff",
            border: "1px solid rgba(0,0,0,0.08)",
            borderRadius: 12,
            boxShadow: "0 12px 40px rgba(0,0,0,0.12)",
            padding: 6,
          }}
        >
          <button
            className="w-full text-left rounded-lg hover:bg-black/[0.04] transition-colors cursor-pointer"
            style={{ padding: "8px 10px", fontSize: 13, fontWeight: 600, color: "#5b6cff" }}
            onClick={() => { setOpen(false); setModal(true); }}
          >
            + New project…
          </button>
          {projects.length > 0 && (
            <div style={{ height: 1, background: "rgba(0,0,0,0.06)", margin: "4px 0" }} />
          )}
          {projects.map((p) => (
            <button
              key={p.id}
              role="menuitem"
              className="w-full text-left rounded-lg hover:bg-black/[0.04] transition-colors cursor-pointer"
              style={{ padding: "8px 10px", fontSize: 13, color: "#1d1d1f" }}
              onClick={() => saveInto(p.id)}
            >
              {p.name}
            </button>
          ))}
          {projects.length === 0 && (
            <p style={{ padding: "8px 10px", fontSize: 12, color: "#9a9aa2", margin: 0 }}>
              No projects yet.
            </p>
          )}
        </div>
      )}

      {modal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Create project"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 200,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.32)",
          }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) setModal(false); }}
        >
          <form
            onSubmit={onCreate}
            style={{
              width: 360,
              background: "#fff",
              borderRadius: 16,
              padding: 22,
              boxShadow: "0 24px 70px rgba(0,0,0,0.25)",
            }}
          >
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#1d1d1f" }}>New project</h3>
            <p style={{ margin: "6px 0 14px", fontSize: 13, color: "#6b6b73" }}>
              Group saved company snapshots into a folder.
            </p>
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Project name"
              aria-label="Project name"
              style={{
                width: "100%",
                border: "1px solid rgba(0,0,0,0.12)",
                borderRadius: 10,
                padding: "10px 12px",
                fontSize: 14,
                outline: "none",
                fontFamily: FONT,
              }}
            />
            <div role="group" aria-label="Visibility" style={{ display: "inline-flex", background: "#ececf0", borderRadius: 999, padding: 3, marginTop: 12 }}>
              {(["private", "public"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setNewVisibility(v)}
                  style={{
                    border: "none", cursor: "pointer", borderRadius: 999, padding: "6px 13px",
                    fontSize: 12.5, fontWeight: 600,
                    background: newVisibility === v ? "#fff" : "transparent",
                    color: newVisibility === v ? "#1d1d1f" : "#8a8a92",
                    boxShadow: newVisibility === v ? "0 1px 4px rgba(0,0,0,0.1)" : "none",
                  }}
                >
                  {v === "private" ? "🔒 Private" : "🌐 Public"}
                </button>
              ))}
            </div>
            <p style={{ margin: "6px 0 0", fontSize: 11.5, color: "#9a9aa2" }}>
              {newVisibility === "private" ? "Only you can see this project." : "Anyone with the link can view this project."}
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <button
                type="button"
                onClick={() => setModal(false)}
                className="rounded-full border border-black/[0.08] bg-white hover:bg-black/[0.03] transition-all cursor-pointer"
                style={{ padding: "7px 15px", fontSize: 13, color: "#1d1d1f" }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!newName.trim() || busy}
                className="rounded-full bg-gray-900 hover:bg-black text-white transition-colors cursor-pointer disabled:opacity-50"
                style={{ padding: "7px 17px", fontSize: 13, fontWeight: 500 }}
              >
                {busy ? "Creating…" : "Create & save"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
