"use client";

import { useState } from "react";
import type { MapUser } from "@/components/AuthGate";
import { allAccounts, decide, type AccountRecord } from "@/lib/accountApproval";
import { openEmail, unlockVault } from "@/lib/ownerVault";
import { FONT } from "@/components/workspace/ui";

/**
 * ApprovalsPanel.tsx
 * The owner's queue for deciding who gets in, and the full user list.
 *
 * Shown on the Account page to developer-role accounts only. Requests come
 * first, oldest at the top, each with one obvious pair of actions.
 *
 * Addresses render MASKED by default, even here. Real addresses exist only as
 * ciphertext sealed to the owner's key, so seeing them takes the owner's
 * password — a deliberate, per-session act rather than an ambient exposure. If
 * the owner never unlocks, no real address is ever put on screen, which means a
 * shoulder-surfer or a screen share does not harvest a mailing list.
 */

const btn: React.CSSProperties = {
  borderRadius: 999,
  padding: "6px 14px",
  fontSize: 13.5,
  cursor: "pointer",
  border: "1px solid #d4d4d4",
  background: "#fff",
};

// takes: an ISO timestamp
// does: renders it as a short local date
// returns: the formatted date, or an empty string when absent
function shortDate(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString();
}

// takes: the signed-in developer
// does: lists pending signups with approve/deny actions, the full user list,
//       and an unlock control that reveals real addresses for this session only
// returns: the panel element, or null for non-developer accounts
export default function ApprovalsPanel({ user }: { user: MapUser }) {
  const [accounts, setAccounts] = useState<AccountRecord[]>(() => allAccounts());
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [password, setPassword] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState("");

  if (user.role !== "developer" || user.guest) return null;

  // takes: the fingerprint being decided and the decision
  // does: records it and refreshes the list from storage
  // returns: nothing
  function apply(fingerprint: string, status: "approved" | "denied") {
    decide(fingerprint, status, user.email);
    setAccounts(allAccounts());
  }

  // takes: a form submit event
  // does: derives the owner's private key from the password and opens every
  //       sealed address into memory for this session only — nothing is written
  //       back to storage in the clear
  // returns: nothing (async)
  async function unlock(e: React.FormEvent) {
    e.preventDefault();
    setUnlockError("");
    setUnlocking(true);
    try {
      const privateKey = await unlockVault(password);
      if (!privateKey) {
        setUnlockError("That password didn't open the vault.");
        return;
      }
      const opened: Record<string, string> = {};
      for (const a of accounts) {
        if (!a.sealed) continue;
        const email = await openEmail({ ciphertext: a.sealed }, privateKey);
        if (email) opened[a.fingerprint] = email;
      }
      setRevealed(opened);
      setPassword("");
    } finally {
      setUnlocking(false);
    }
  }

  // takes: an account record
  // does: picks the address shape to show — real only when unlocked this session
  // returns: the string to render
  function addressFor(a: AccountRecord): string {
    return revealed[a.fingerprint] ?? a.masked;
  }

  const pending = accounts.filter((a) => a.status === "pending");
  const settled = accounts.filter((a) => a.status !== "pending");
  const isUnlocked = Object.keys(revealed).length > 0;

  return (
    <div style={{ padding: "16px 0 4px", borderTop: "1px solid rgba(0,0,0,0.06)", fontFamily: FONT }}>
      <div style={{ fontSize: 12, color: "#a3a3a3", marginBottom: 10 }}>
        Access requests{pending.length > 0 ? ` · ${pending.length} waiting` : ""}
      </div>

      {pending.length === 0 ? (
        <div style={{ fontSize: 13.5, color: "#86868b" }}>Nothing waiting.</div>
      ) : (
        pending.map((a) => (
          <div
            key={a.fingerprint}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              padding: "10px 0",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14.5, overflow: "hidden", textOverflow: "ellipsis" }}>
                {addressFor(a)}
              </div>
              <div style={{ fontSize: 12, color: "#9ca3af" }}>Asked {shortDate(a.requestedAt)}</div>
            </div>
            <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
              <button
                className="ws-btn"
                style={{ ...btn, background: "#0a0a0a", color: "#fff", border: "none" }}
                onClick={() => apply(a.fingerprint, "approved")}
              >
                Approve
              </button>
              <button className="ws-btn" style={btn} onClick={() => apply(a.fingerprint, "denied")}>
                Deny
              </button>
            </div>
          </div>
        ))
      )}

      {settled.length > 0 && (
        <details style={{ marginTop: 12 }}>
          <summary style={{ fontSize: 13, color: "#86868b", cursor: "pointer" }}>
            {settled.length} decided
          </summary>
          <div style={{ paddingTop: 8 }}>
            {settled.map((a) => (
              <div
                key={a.fingerprint}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "6px 0",
                  fontSize: 13.5,
                  color: "#6b7280",
                }}
              >
                <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{addressFor(a)}</span>
                <span style={{ flexShrink: 0 }}>
                  {a.status === "approved" ? "Approved" : "Denied"} {shortDate(a.decidedAt)}
                </span>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Reveal is opt-in and per session. Masked is the resting state. */}
      {!isUnlocked && accounts.some((a) => a.sealed) && (
        <form onSubmit={unlock} style={{ marginTop: 14, display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Your password to show real addresses"
            autoComplete="current-password"
            style={{
              flex: 1,
              border: "1px solid #d4d4d4",
              borderRadius: 10,
              padding: "9px 12px",
              fontSize: 16,
              background: "#fff",
            }}
          />
          <button type="submit" className="ws-btn" style={btn} disabled={unlocking || !password}>
            {unlocking ? "Opening…" : "Show"}
          </button>
        </form>
      )}
      {unlockError && (
        <div style={{ marginTop: 8, fontSize: 13, color: "#b91c1c" }}>{unlockError}</div>
      )}
      {isUnlocked && (
        <button
          className="ws-btn"
          style={{ ...btn, marginTop: 12 }}
          onClick={() => setRevealed({})}
        >
          Hide addresses
        </button>
      )}
    </div>
  );
}
