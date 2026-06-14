"use client";

import { useEffect, useRef, useState } from "react";
import { firebaseEnabled, getFirebaseAuth } from "@/lib/firebase";
import { publishShare } from "@/lib/shareReport";
import type { SavedKind } from "@/lib/savedReports";
import { FONT } from "./ui";

// takes: nothing
// does: resolves whether a real signed-in Firebase account is present (only
//       those can mint a public link; guests/unconfigured Firebase cannot)
// returns: true when sharing is available
function canShare(): boolean {
  if (!firebaseEnabled) return false;
  try {
    return Boolean(getFirebaseAuth()?.currentUser?.uid);
  } catch {
    return false;
  }
}

// takes: the report kind, the subject query/title, and a getter for the frozen
//        content (company: markdown; sector: JSON.stringify(ReportData))
// does: renders a "Share" pill that publishes an immutable public copy and
//       reveals the resulting read-only link with a one-click Copy. Hidden
//       entirely when sharing isn't available (no account / no Firebase).
// returns: the share control element, or null
export function ShareControl({
  kind,
  query,
  title,
  getContent,
}: {
  kind: SavedKind;
  query: string;
  title: string;
  getContent: () => string;
}) {
  const [available, setAvailable] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  // Firebase auth resolves after mount; re-check so the button appears for
  // signed-in users without a refresh.
  useEffect(() => {
    setAvailable(canShare());
  }, []);

  // Close the popover on an outside click.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (open && rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  if (!available) return null;

  // takes: nothing
  // does: publishes the current report and opens the link popover (reusing the
  //       existing link if one was already minted this session)
  // returns: nothing
  async function onShare() {
    if (busy) return;
    setOpen(true);
    if (url) return; // already published in this session
    setBusy(true);
    setError("");
    const res = await publishShare({ kind, query, title, content: getContent() });
    setBusy(false);
    if (res) setUrl(res.url);
    else setError("Couldn't create a link. Try again.");
  }

  // takes: nothing
  // does: copies the public link to the clipboard with a brief confirmation
  // returns: nothing
  async function onCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — the field is selectable as a fallback */
    }
  }

  const pill =
    "rounded-full border border-black/[0.08] bg-white/80 hover:bg-white hover:shadow-sm transition-all cursor-pointer disabled:opacity-60";

  return (
    <div ref={rootRef} style={{ position: "relative", fontFamily: FONT }}>
      <button
        aria-haspopup="dialog"
        aria-expanded={open}
        className={pill}
        style={{ padding: "5px 13px", fontSize: 12.5, fontWeight: 500, color: "#1d1d1f" }}
        onClick={onShare}
      >
        {busy ? "Creating link…" : "Share"}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Public share link"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            zIndex: 50,
            width: 300,
            background: "#fff",
            border: "1px solid rgba(0,0,0,0.08)",
            borderRadius: 12,
            boxShadow: "0 12px 40px rgba(0,0,0,0.12)",
            padding: 14,
          }}
        >
          <p style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 600, color: "#1d1d1f" }}>
            Public link
          </p>
          <p style={{ margin: "0 0 10px", fontSize: 11.5, color: "#8a8a92" }}>
            Anyone with this link can view a read-only copy.
          </p>

          {error && <p style={{ margin: 0, fontSize: 12, color: "#c0392b" }}>{error}</p>}

          {!error && (busy || !url) && (
            <p style={{ margin: 0, fontSize: 12, color: "#8a8a92" }}>Generating…</p>
          )}

          {url && (
            <div style={{ display: "flex", gap: 6 }}>
              <input
                readOnly
                value={url}
                onFocus={(e) => e.currentTarget.select()}
                aria-label="Public link"
                style={{
                  flex: 1,
                  minWidth: 0,
                  border: "1px solid rgba(0,0,0,0.12)",
                  borderRadius: 8,
                  padding: "7px 9px",
                  fontSize: 12,
                  color: "#1d1d1f",
                  outline: "none",
                  fontFamily: FONT,
                }}
              />
              <button
                onClick={onCopy}
                className="rounded-lg bg-gray-900 hover:bg-black text-white transition-colors cursor-pointer"
                style={{ padding: "7px 12px", fontSize: 12, fontWeight: 500, flexShrink: 0 }}
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
