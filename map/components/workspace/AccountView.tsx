"use client";

/*
 * AccountView — the /account page (reached via the Profile button).
 * # takes: { user: MapUser; onSignOut: () => void }
 * # does: shows the signed-in account's Name, Email, Role and password
 *         (masked by default, with a one-click copy), plus sign out
 * # returns: JSX for the account page
 */

import { useState } from "react";
import type { MapUser } from "@/components/AuthGate";
import type { SavedReportsState } from "./useSavedReports";
import type { SavedReport } from "@/lib/savedReports";
import { relativeTime } from "./SavedReports";
import { CanvasCard, FONT } from "./ui";

// takes: a MapUser
// does: derives a display name — the profile name, else the email's local
//       part title-cased, else "Guest"
// returns: the display name string
function displayName(user: MapUser): string {
  if (user.guest) return "Guest";
  if (user.name) return user.name;
  const local = (user.email || "").split("@")[0] || "Account";
  return local.charAt(0).toUpperCase() + local.slice(1);
}

// takes: { user, onSignOut }
// does: renders the account page UI (single component; the copy handler is its
//       own single-responsibility function)
// returns: the account view element
export default function AccountView({
  user,
  onSignOut,
  saved,
  onOpenProject,
}: {
  user: MapUser;
  onSignOut: () => void;
  saved: SavedReportsState;
  onOpenProject: (r: SavedReport) => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  const hasPassword = Boolean(user.password);

  // takes: nothing
  // does: copies the unmasked password to the clipboard via the Clipboard API,
  //       then briefly flips the button label to "Copied"
  // returns: nothing (async)
  async function copyPassword() {
    if (!user.password) return;
    try {
      await navigator.clipboard.writeText(user.password);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — no-op */
    }
  }

  return (
    <CanvasCard title="Account">
      <div style={{ padding: "24px 28px 32px", fontFamily: FONT }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 24 }}>
          <span
            style={{
              width: 52,
              height: 52,
              borderRadius: "50%",
              background: "#1d1d1f",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 22,
              fontWeight: 600,
            }}
          >
            {user.guest ? "G" : (user.email[0] || "?").toUpperCase()}
          </span>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{displayName(user)}</div>
            <span
              style={{
                display: "inline-block",
                marginTop: 4,
                fontSize: 10.5,
                fontWeight: 600,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                padding: "2px 8px",
                borderRadius: 999,
                color: user.role === "developer" ? "#fff" : "#525252",
                background: user.role === "developer" ? "#0a0a0a" : "rgba(0,0,0,0.06)",
              }}
            >
              {user.role}
            </span>
          </div>
        </div>

        <Field label="Name" value={displayName(user)} />
        <Field label="Email" value={user.guest ? "—" : user.email} />

        {/* Password row — masked by default, with reveal + copy. */}
        <div style={{ padding: "12px 0", borderTop: "1px solid rgba(0,0,0,0.06)" }}>
          <div style={{ fontSize: 12, color: "#a3a3a3", marginBottom: 6 }}>Password</div>
          {hasPassword ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                readOnly
                type={revealed ? "text" : "password"}
                value={user.password}
                style={{
                  flex: 1,
                  border: "1px solid rgba(0,0,0,0.1)",
                  borderRadius: 10,
                  padding: "9px 12px",
                  fontSize: 14,
                  fontFamily: FONT,
                  background: "#fafafa",
                  color: "#1d1d1f",
                }}
              />
              <button className="ws-btn" style={btn} onClick={() => setRevealed((r) => !r)}>
                {revealed ? "Hide" : "Show"}
              </button>
              <button className="ws-btn" style={btn} onClick={copyPassword}>
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          ) : (
            <div style={{ fontSize: 13.5, color: "#86868b", lineHeight: 1.5 }}>
              {user.guest
                ? "Guests don't have a password."
                : "Signed in with Google — there's no password to display. Passwords are managed securely by Firebase and are never stored by this app."}
            </div>
          )}
        </div>

        {/* Projects — the reports this account has saved to review later.
            Reopening shows the saved copy instantly (it re-verifies freshness
            in the originating view); removing deletes it from the saved store. */}
        <Projects saved={saved} onOpenProject={onOpenProject} />

        <button
          onClick={onSignOut}
          style={{
            marginTop: 22,
            width: "100%",
            border: "none",
            borderRadius: 12,
            padding: "12px 0",
            fontSize: 14.5,
            fontWeight: 600,
            fontFamily: FONT,
            color: "#fff",
            background: "#dc2626",
            cursor: "pointer",
          }}
        >
          {user.guest ? "Exit guest mode" : "Sign out"}
        </button>
      </div>
    </CanvasCard>
  );
}

const btn: React.CSSProperties = { padding: "9px 16px", fontSize: 13 };

// takes: { saved, onOpenProject }
// does: renders the "Projects" section — the account's saved company profiles
//       and sector scans, newest first, each row reopening the saved report or
//       removing it. Shows an empty-state hint when nothing is saved yet.
// returns: the projects section element
function Projects({
  saved,
  onOpenProject,
}: {
  saved: SavedReportsState;
  onOpenProject: (r: SavedReport) => void;
}) {
  const items = [...saved.saved].sort((a, b) => b.verifiedAt - a.verifiedAt);
  return (
    <div style={{ padding: "18px 0 4px", borderTop: "1px solid rgba(0,0,0,0.06)" }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <div style={{ fontSize: 12, color: "#a3a3a3" }}>Projects</div>
        <div style={{ fontSize: 11.5, color: "#c0c0c5" }}>
          {items.length ? `${items.length} saved` : ""}
        </div>
      </div>

      {!saved.ready ? (
        <div style={{ fontSize: 13.5, color: "#86868b" }}>Loading saved projects…</div>
      ) : items.length === 0 ? (
        <div style={{ fontSize: 13.5, color: "#86868b", lineHeight: 1.5 }}>
          No saved projects yet. Run a Company Profile or Sector Scan and tap{" "}
          <b style={{ fontWeight: 600 }}>Save report</b> to keep it here for later.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {items.map((r) => (
            <ProjectRow
              key={r.id}
              report={r}
              onOpen={() => onOpenProject(r)}
              onRemove={() => {
                void saved.remove(r.id);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// takes: { report, onOpen, onRemove }
// does: renders one saved-project row — kind pill, title, last-verified time,
//       a clickable surface that reopens it, and a remove control
// returns: the project row element
function ProjectRow({
  report,
  onOpen,
  onRemove,
}: {
  report: SavedReport;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const isCompany = report.kind === "company";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        border: "1px solid rgba(0,0,0,0.07)",
        borderRadius: 12,
        padding: "9px 10px 9px 12px",
        background: "#fafafa",
      }}
    >
      <button
        onClick={onOpen}
        title={`Open — verified ${relativeTime(report.verifiedAt)}`}
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          alignItems: "center",
          gap: 10,
          border: "none",
          background: "none",
          cursor: "pointer",
          textAlign: "left",
          fontFamily: FONT,
          padding: 0,
        }}
      >
        <span
          style={{
            flexShrink: 0,
            fontSize: 9.5,
            fontWeight: 600,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            padding: "3px 7px",
            borderRadius: 999,
            color: isCompany ? "#3730a3" : "#9a3412",
            background: isCompany ? "rgba(99,102,241,0.12)" : "rgba(249,115,22,0.12)",
          }}
        >
          {isCompany ? "Company" : "Sector"}
        </span>
        <span style={{ minWidth: 0 }}>
          <span
            style={{
              display: "block",
              fontSize: 14,
              fontWeight: 500,
              color: "#1d1d1f",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {report.title}
          </span>
          <span style={{ display: "block", fontSize: 11.5, color: "#9a9aa2", marginTop: 1 }}>
            Verified {relativeTime(report.verifiedAt)}
          </span>
        </span>
      </button>
      <button
        onClick={onRemove}
        aria-label={`Remove saved ${report.title}`}
        title="Remove"
        style={{
          flexShrink: 0,
          width: 22,
          height: 22,
          borderRadius: "50%",
          border: "none",
          background: "transparent",
          color: "#a0a0a8",
          fontSize: 16,
          lineHeight: 1,
          cursor: "pointer",
        }}
      >
        ×
      </button>
    </div>
  );
}

// takes: { label, value }
// does: renders one read-only labelled account field row
// returns: the field row element
function Field({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: "12px 0", borderTop: "1px solid rgba(0,0,0,0.06)" }}>
      <div style={{ fontSize: 12, color: "#a3a3a3", marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 14.5, color: "#1d1d1f", wordBreak: "break-all" }}>{value}</div>
    </div>
  );
}
