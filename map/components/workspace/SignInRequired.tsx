"use client";

import { useEffect, useRef, useState } from "react";

/**
 * SignInRequired.tsx
 * The panel a visitor sees instead of a view whose data is server-gated.
 *
 * The Directory and Partnerships views render the workbook inventory, which
 * lives server-side and is served only by /api/inventory/data. This panel
 * offers the two ways to earn access: the full sign-in flow, or the shared
 * access password. The password is NOT checked here — the entry is sent to
 * /api/inventory/unlock, which verifies it server-side (rate-limited) and
 * returns a signed, expiring token. The bundle therefore contains neither the
 * password nor the data.
 */

// takes: the view's display name, a handler that opens the sign-in screen, and
//        a handler receiving the minted inventory token after a correct entry
// does: renders a centered panel with Sign in + Password buttons; the Password
//       button opens a small centered dialog (Password label, text entry, Go)
//       that submits on Go or Enter and reports a wrong guess inline
// returns: the panel element
export default function SignInRequired({
  viewLabel,
  onSignIn,
  onUnlock,
}: {
  viewLabel: string;
  onSignIn: () => void;
  onUnlock: (token: string) => void;
}) {
  const [showDialog, setShowDialog] = useState(false);
  const [entry, setEntry] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus the entry field the moment the dialog opens.
  useEffect(() => {
    if (showDialog) inputRef.current?.focus();
  }, [showDialog]);

  // takes: nothing (reads the current entry)
  // does: sends the entry to the server-side unlock check; hands the minted
  //       token up on success, shows "Wrong password" on a 401, and a soft
  //       retry message when the check itself couldn't run
  // returns: nothing
  async function submit() {
    const attempt = entry.trim();
    if (!attempt || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/inventory/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: attempt }),
      });
      if (res.status === 401) {
        setError("Wrong password");
        return;
      }
      if (res.status === 429) {
        setError("Too many tries — wait a minute");
        return;
      }
      const token = res.ok ? (await res.json())?.token : null;
      if (typeof token === "string" && token) {
        setShowDialog(false);
        setEntry("");
        onUnlock(token);
      } else {
        setError("Couldn't check — try again");
      }
    } catch {
      setError("Couldn't check — try again");
    } finally {
      setBusy(false);
    }
  }

  const pillButton = {
    marginTop: 6,
    padding: "11px 22px",
    borderRadius: 999,
    fontSize: 15,
    fontWeight: 500,
    cursor: "pointer",
  } as const;

  return (
    <section
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "72px 24px",
        maxWidth: 420,
        margin: "0 auto",
        gap: 14,
      }}
    >
      <h2 style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em", margin: 0 }}>
        {viewLabel} needs an account
      </h2>
      <p style={{ fontSize: 15, lineHeight: 1.5, color: "#6b7280", margin: 0 }}>
        This view lists named people and partner records, so it isn&rsquo;t open to
        guests. Signing in takes a moment.
      </p>
      <div style={{ display: "flex", gap: 10 }}>
        <button
          onClick={onSignIn}
          style={{
            ...pillButton,
            border: "none",
            background: "#111",
            color: "#fff",
          }}
        >
          Sign in
        </button>
        <button
          onClick={() => {
            setShowDialog(true);
            setError(null);
            setEntry("");
          }}
          style={{
            ...pillButton,
            border: "1px solid #d1d5db",
            background: "#fff",
            color: "#111",
          }}
        >
          Password
        </button>
      </div>

      {showDialog && (
        <div
          onClick={() => setShowDialog(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 200,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            role="dialog"
            aria-label="Password"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff",
              borderRadius: 16,
              padding: "24px 26px",
              width: 300,
              boxShadow: "0 18px 50px rgba(0,0,0,0.22)",
              display: "flex",
              flexDirection: "column",
              gap: 12,
              textAlign: "left",
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 600 }}>Password</div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                ref={inputRef}
                type="password"
                value={entry}
                onChange={(e) => {
                  setEntry(e.target.value);
                  setError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submit();
                  if (e.key === "Escape") setShowDialog(false);
                }}
                aria-label="Password"
                style={{
                  flex: 1,
                  minWidth: 0,
                  padding: "9px 12px",
                  borderRadius: 10,
                  border: error ? "1px solid #dc2626" : "1px solid #d1d5db",
                  fontSize: 15,
                  outline: "none",
                }}
              />
              <button
                onClick={submit}
                disabled={busy}
                style={{
                  padding: "9px 16px",
                  borderRadius: 10,
                  border: "none",
                  background: "#111",
                  color: "#fff",
                  fontSize: 14.5,
                  fontWeight: 500,
                  cursor: busy ? "default" : "pointer",
                  opacity: busy ? 0.6 : 1,
                }}
              >
                {busy ? "…" : "Go"}
              </button>
            </div>
            {error && (
              <div style={{ fontSize: 13.5, color: "#dc2626" }}>{error}</div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
