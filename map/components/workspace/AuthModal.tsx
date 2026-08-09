"use client";

import { useEffect, useRef } from "react";
import AuthGate, { type MapUser } from "@/components/AuthGate";

export type AuthContext = "header" | "partnerships" | "accounts" | "save";

// Why the sign-in is being asked for, in the product's own voice. The header
// case has no context of its own, so it gets the reassurance line instead.
const REASONS: Record<AuthContext, string> = {
  header: "Log in or create your account",
  partnerships: "Partnerships lists named people and partner records, so it needs an account.",
  accounts: "The directory lists named people, so it needs an account.",
  save: "Saving needs an account so your reports follow you.",
};

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

// takes: the reason the modal opened, a close handler, and a handler for a
//        completed sign-in
// does: houses the existing auth card in a focus-trapped modal, so identity is
//       asked for at the moment it is needed instead of on arrival. The card's
//       own behaviour — providers, errors, approval flow — is untouched.
// returns: the modal element
export default function AuthModal({
  context,
  onClose,
  onDone,
}: {
  context: AuthContext;
  onClose: () => void;
  onDone: (user: MapUser) => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreTo = useRef<HTMLElement | null>(null);

  // takes: nothing (closure over onClose/panelRef)
  // does: traps Tab inside the modal and closes it on Escape, restoring focus
  //       to whatever opened it
  // returns: nothing
  useEffect(() => {
    restoreTo.current = document.activeElement as HTMLElement | null;
    panelRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const items = Array.from(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])
        .filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      restoreTo.current?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Sign in to Map"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        background: "rgba(0,0,0,0.28)",
        backdropFilter: "blur(2px)",
        WebkitBackdropFilter: "blur(2px)",
      }}
    >
      <div
        ref={panelRef}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "relative",
          width: "100%",
          maxWidth: 440,
          maxHeight: "92dvh",
          overflowY: "auto",
          background: "var(--panel)",
          borderRadius: "var(--r-card)",
          boxShadow: "var(--shadow-3)",
        }}
      >
        <button
          onClick={onClose}
          aria-label="Close and keep browsing as a guest"
          style={{
            position: "absolute",
            top: 10,
            right: 10,
            zIndex: 1,
            width: 44,
            height: 44,
            border: "none",
            background: "none",
            cursor: "pointer",
            color: "var(--ink-tertiary)",
            fontSize: 20,
            lineHeight: 1,
          }}
        >
          ×
        </button>

        <div style={{ padding: "22px 24px 0" }}>
          {context === "header" && (
            <p style={{ fontSize: 12, color: "var(--ink-secondary)", margin: "0 0 6px" }}>
              You&apos;re browsing as a guest — Map knows nothing about you.
            </p>
          )}
          <p style={{ fontSize: 14, color: "var(--ink)", margin: 0, lineHeight: 1.5 }}>
            {REASONS[context]}
          </p>
        </div>

        {/* The auth card is reused verbatim. Only its full-page framing is
            overridden, in CSS, so none of its own behaviour is touched. */}
        <div className="auth-in-modal">
          <AuthGate onDone={onDone} />
        </div>
      </div>
    </div>
  );
}
