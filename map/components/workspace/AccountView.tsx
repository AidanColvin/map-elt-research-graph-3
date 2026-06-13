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
}: {
  user: MapUser;
  onSignOut: () => void;
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
