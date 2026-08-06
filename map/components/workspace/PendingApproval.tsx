"use client";

import type { MapUser } from "@/components/AuthGate";

/**
 * PendingApproval.tsx
 * What a newly registered account sees while it waits on the owner.
 *
 * A signup creates the account but not access. Rather than dropping the person
 * into a workspace with every panel greyed out — which reads as broken — the app
 * says one true thing and stops. No spinner, no progress bar, nothing implying
 * the wait is measurable in seconds.
 *
 * A denied account gets the same screen with different words. It never explains
 * why, because that is between the person and the owner, not something an
 * interface should improvise.
 */

// takes: the signed-in user awaiting a decision and a sign-out handler
// does: renders the waiting (or declined) screen with a single way forward
// returns: the screen element
export default function PendingApproval({
  user,
  onSignOut,
}: {
  user: MapUser;
  onSignOut: () => void;
}) {
  const denied = user.status === "denied";

  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "48px 24px",
        background: "var(--bg, #faf9f7)",
        color: "var(--ink, #1d1d1f)",
        fontFamily: "var(--sans)",
      }}
    >
      <div style={{ maxWidth: 380, display: "flex", flexDirection: "column", gap: 14 }}>
        <h1 style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.02em", margin: 0 }}>
          {denied ? "This account wasn't approved" : "Waiting on approval"}
        </h1>
        <p style={{ fontSize: 15, lineHeight: 1.55, color: "#6b7280", margin: 0 }}>
          {denied
            ? "Your request was reviewed and declined. If you think that's a mistake, reach out to whoever runs this workspace."
            : "Your account was created. Someone who runs this workspace has to approve it before you can open the data. You'll get in as soon as they do."}
        </p>
        <p style={{ fontSize: 13.5, color: "#9ca3af", margin: 0 }}>
          Signed in as {user.email}
        </p>
        <button
          onClick={onSignOut}
          style={{
            marginTop: 8,
            padding: "11px 22px",
            borderRadius: 999,
            border: "1px solid #d4d4d4",
            background: "#fff",
            fontSize: 15,
            cursor: "pointer",
          }}
        >
          Sign out
        </button>
      </div>
    </main>
  );
}
