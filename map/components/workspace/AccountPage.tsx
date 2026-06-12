"use client";

import { useState } from "react";
import type { MapUser } from "@/components/AuthGate";
import { CanvasCard } from "./ui";

const USERS_KEY = "map.users";

// takes: the signed-in user
// does: looks up the user's stored password in the browser's local account
//       store (the auth gate keeps email → password in localStorage)
// returns: the password string, or null for guests / missing entries
function lookupPassword(user: MapUser): string | null {
  if (user.guest) return null;
  try {
    const users = JSON.parse(localStorage.getItem(USERS_KEY) || "{}");
    return typeof users[user.email] === "string" ? users[user.email] : null;
  } catch {
    return null;
  }
}

// takes: an email address
// does: derives a display name from the local part — splits on dots,
//       underscores, and digits, then capitalizes each piece
// returns: the friendly name string
function nameFromEmail(email: string): string {
  const local = email.split("@")[0] || "";
  const parts = local.split(/[._\-\d]+/).filter(Boolean);
  if (!parts.length) return email;
  return parts.map((p) => p[0].toUpperCase() + p.slice(1)).join(" ");
}

// takes: a label and a value element
// does: renders one labeled row of the account card
// returns: the row element
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        padding: "16px 4px",
        borderBottom: "1px solid rgba(0,0,0,0.06)",
      }}
    >
      <div style={{ fontSize: 13, color: "#86868b", minWidth: 90 }}>{label}</div>
      <div
        style={{
          fontSize: 15,
          color: "#1d1d1f",
          display: "flex",
          alignItems: "center",
          gap: 10,
          textAlign: "right",
        }}
      >
        {children}
      </div>
    </div>
  );
}

// takes: the signed-in user and an onSignOut callback
// does: renders the Account page — name, email, and the masked password with
//       a one-click copy button (copies the real password to the clipboard),
//       plus the sign-out action that used to live in the profile dropdown
// returns: the account canvas card element
export default function AccountPage({
  user,
  onSignOut,
}: {
  user: MapUser;
  onSignOut: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const password = lookupPassword(user);

  // takes: nothing (click handler)
  // does: writes the unmasked password to the clipboard, with a hidden
  //       textarea fallback for browsers without the async clipboard API,
  //       then shows a brief "Copied" confirmation
  // returns: nothing
  async function copyPassword() {
    if (!password) return;
    try {
      await navigator.clipboard.writeText(password);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = password;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    <CanvasCard title="Account">
      <div style={{ maxWidth: 560, margin: "0 auto", padding: "28px 28px 36px", width: "100%" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "8px 4px 18px" }}>
          <span
            style={{
              width: 48,
              height: 48,
              borderRadius: "50%",
              background: "#1d1d1f",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 20,
              fontWeight: 600,
            }}
          >
            {user.guest ? "G" : user.email[0].toUpperCase()}
          </span>
          <div>
            <div style={{ fontSize: 18, fontWeight: 600 }}>
              {user.guest ? "Guest" : nameFromEmail(user.email)}
            </div>
            <div style={{ fontSize: 13, color: "#86868b" }}>
              {user.guest ? "Browsing without an account" : "Account stored in this browser"}
            </div>
          </div>
        </div>

        <Row label="Name">{user.guest ? "Guest" : nameFromEmail(user.email)}</Row>
        <Row label="Email">{user.guest ? "—" : user.email}</Row>
        <Row label="Password">
          {password ? (
            <>
              <span style={{ letterSpacing: 3, fontSize: 17, lineHeight: 1 }} aria-label="Hidden password">
                {"•".repeat(Math.min(password.length, 12))}
              </span>
              <button
                onClick={copyPassword}
                style={{
                  border: "1px solid rgba(0,0,0,0.12)",
                  borderRadius: 999,
                  padding: "5px 14px",
                  background: copied ? "#1d1d1f" : "rgba(255,255,255,0.8)",
                  color: copied ? "#fff" : "#1d1d1f",
                  fontSize: 12.5,
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </>
          ) : (
            <span style={{ color: "#86868b", fontSize: 13.5 }}>No password — guest session</span>
          )}
        </Row>

        <button
          onClick={onSignOut}
          style={{
            marginTop: 28,
            width: "100%",
            border: "1px solid rgba(220,38,38,0.25)",
            borderRadius: 12,
            padding: "12px 0",
            background: "rgba(255,255,255,0.8)",
            color: "#dc2626",
            fontSize: 14.5,
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          {user.guest ? "Exit guest mode" : "Sign out"}
        </button>
      </div>
    </CanvasCard>
  );
}
