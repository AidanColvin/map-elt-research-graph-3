"use client";

import { useState } from "react";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  OAuthProvider,
} from "firebase/auth";
import { firebaseEnabled, getFirebaseAuth } from "@/lib/firebase";

/**
 * Keyless auth gate shown after the intro animation.
 *
 * - Email/password accounts live entirely in the browser (localStorage) —
 *   no server, no database, no API keys, consistent with the project's
 *   "completely free to run" rule.
 * - Google / Microsoft buttons are present but real OAuth requires
 *   registering client IDs with those providers, so they explain that and
 *   offer guest mode instead.
 * - "Continue as guest" sets a guest session and proceeds.
 */

export type MapRole = "developer" | "user";
export type MapUser = {
  email: string;
  guest: boolean;
  role: MapRole;
  // Optional display name (e.g. from a Google profile).
  name?: string;
  // The plaintext password is held ONLY in memory for the current session so
  // the account page can show/copy it; it is never written to storage.
  password?: string;
};

const USERS_KEY = "map.users";
const SESSION_KEY = "map.session";

// Emails granted the "developer" role come from a public env var (kept out of
// the source); every other account is a "user".
const DEVELOPER_EMAILS = new Set<string>(
  (process.env.NEXT_PUBLIC_DEVELOPER_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
);

// takes: an email address (any case)
// does: classifies the account — developer for listed emails, else user
// returns: the account's MapRole
export function roleForEmail(email: string): MapRole {
  return DEVELOPER_EMAILS.has(email.trim().toLowerCase()) ? "developer" : "user";
}

export function getSession(): MapUser | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as MapUser) : null;
  } catch {
    return null;
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {}
}

function loadUsers(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(USERS_KEY) || "{}");
  } catch {
    return {};
  }
}

const S = {
  wrap: {
    minHeight: "100dvh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "max(32px, env(safe-area-inset-top)) max(20px, env(safe-area-inset-right)) max(32px, env(safe-area-inset-bottom)) max(20px, env(safe-area-inset-left))",
    background: "var(--bg, #faf9f7)",
    color: "var(--ink, #1d1d1f)",
    fontFamily: "var(--sans)",
  } as React.CSSProperties,
  card: {
    width: "100%",
    maxWidth: 400,
    border: "1px solid #e5e5e5",
    borderRadius: 16,
    padding: "32px 28px",
    background: "#fafafa",
  } as React.CSSProperties,
  input: {
    width: "100%",
    border: "1px solid #d4d4d4",
    borderRadius: 10,
    padding: "11px 13px",
    // 16px (not 15) so iOS doesn't zoom the page when the field is focused.
    fontSize: 16,
    marginBottom: 10,
    background: "#fff",
    outline: "none",
  } as React.CSSProperties,
  primary: {
    width: "100%",
    border: "none",
    borderRadius: 10,
    padding: "12px 0",
    fontSize: 15,
    fontWeight: 600,
    background: "#0a0a0a",
    color: "#fff",
    cursor: "pointer",
    marginTop: 4,
  } as React.CSSProperties,
  oauth: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    border: "1px solid #d4d4d4",
    borderRadius: 10,
    padding: "11px 0",
    fontSize: 14.5,
    fontWeight: 500,
    background: "#fff",
    cursor: "pointer",
    marginBottom: 10,
  } as React.CSSProperties,
  ghost: {
    width: "100%",
    border: "none",
    background: "none",
    color: "#525252",
    fontSize: 14,
    cursor: "pointer",
    padding: "10px 0 0",
    textDecoration: "underline",
    textUnderlineOffset: 3,
  } as React.CSSProperties,
};

function MicrosoftIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 23 23" aria-hidden>
      <path fill="#F25022" d="M1 1h10v10H1z" />
      <path fill="#7FBA00" d="M12 1h10v10H12z" />
      <path fill="#00A4EF" d="M1 12h10v10H1z" />
      <path fill="#FFB900" d="M12 12h10v10H12z" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

export default function AuthGate({ onDone }: { onDone: (user: MapUser) => void }) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  // Which action is in flight, so we can show an inline spinner and disable the
  // form instead of doing a jarring full-page redirect during Firebase calls.
  const [busy, setBusy] = useState<null | "email" | "Google" | "Microsoft">(null);

  // takes: the signed-in MapUser (may include an in-memory password)
  // does: persists a sanitized session (never the password) and hands the
  //       full in-memory user to the app
  // returns: nothing
  function finish(user: MapUser) {
    try {
      const { password, ...safe } = user;
      localStorage.setItem(SESSION_KEY, JSON.stringify(safe));
    } catch {}
    onDone(user);
  }

  // takes: a Firebase auth error
  // does: maps common Firebase error codes to a friendly message
  // returns: a human-readable error string
  function prettyError(err: any): string {
    const code = err?.code || "";
    if (code.includes("invalid-credential") || code.includes("wrong-password"))
      return "Incorrect email or password.";
    if (code.includes("email-already-in-use"))
      return "An account already exists for this email. Log in instead.";
    if (code.includes("user-not-found")) return "No account found. Create one first.";
    if (code.includes("weak-password")) return "Password must be at least 6 characters.";
    if (code.includes("popup-closed")) return "Sign-in was cancelled.";
    if (code.includes("unauthorized-domain"))
      return "This site isn't an authorized Firebase domain yet.";
    return err?.message?.replace("Firebase:", "").trim() || "Authentication failed.";
  }

  // takes: a form submit event
  // does: signs in / signs up via Firebase when configured (real, secure
  //       accounts); otherwise uses the keyless browser-local fallback where a
  //       new email registers and an existing one is password-verified
  // returns: nothing (async)
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");
    const em = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(em)) return setError("Enter a valid email address.");
    if (password.length < 6) return setError("Password must be at least 6 characters.");

    const auth = getFirebaseAuth();
    if (auth) {
      setBusy("email");
      try {
        const cred =
          mode === "signup"
            ? await createUserWithEmailAndPassword(auth, em, password)
            : await signInWithEmailAndPassword(auth, em, password);
        finish({
          email: cred.user.email || em,
          guest: false,
          role: roleForEmail(em),
          name: cred.user.displayName || undefined,
          password,
        });
      } catch (err) {
        setError(prettyError(err));
      } finally {
        setBusy(null);
      }
      return;
    }

    // Keyless browser-local fallback.
    const users = loadUsers();
    const existing = users[em];
    if (existing === undefined) {
      users[em] = password;
      try {
        localStorage.setItem(USERS_KEY, JSON.stringify(users));
      } catch {}
      finish({ email: em, guest: false, role: roleForEmail(em), password });
      return;
    }
    if (existing !== password) {
      return setError("Incorrect password for this account. Try again.");
    }
    finish({ email: em, guest: false, role: roleForEmail(em), password });
  }

  // takes: "Google" or "Microsoft"
  // does: runs the real OAuth popup for the chosen provider via Firebase when
  //       configured; otherwise shows the no-keys notice
  // returns: nothing (async)
  async function oauthSignIn(provider: "Google" | "Microsoft") {
    setError("");
    setNotice("");
    const auth = getFirebaseAuth();
    if (!auth) {
      setNotice(
        `${provider} sign-in needs Firebase configured (it isn't on this deployment yet). Use email or continue as guest.`,
      );
      return;
    }
    const p =
      provider === "Microsoft"
        ? new OAuthProvider("microsoft.com")
        : new GoogleAuthProvider();
    // Popup (not redirect) keeps the user on this page — no jarring full-page
    // navigation — while the spinner shows the sign-in is in progress.
    setBusy(provider);
    try {
      const cred = await signInWithPopup(auth, p);
      const em = (cred.user.email || "").toLowerCase();
      finish({
        email: cred.user.email || provider,
        guest: false,
        role: roleForEmail(em),
        name: cred.user.displayName || undefined,
      });
    } catch (err) {
      setError(prettyError(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <main style={S.wrap}>
      <div style={S.card}>
        <div style={{ textAlign: "center", marginBottom: 22 }}>
          <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: "-0.03em" }}>Map</div>
          <div style={{ color: "#737373", fontSize: 14, marginTop: 6 }}>
            {mode === "login" ? "Welcome back — log in to continue" : "Create your account"}
          </div>
        </div>

        <button
          style={{ ...S.oauth, opacity: busy && busy !== "Google" ? 0.55 : 1 }}
          disabled={!!busy}
          onClick={() => oauthSignIn("Google")}
        >
          {busy === "Google" ? <span className="spinner" aria-hidden /> : <GoogleIcon />} Continue with Google
        </button>

        <button
          style={{ ...S.oauth, opacity: busy && busy !== "Microsoft" ? 0.55 : 1 }}
          disabled={!!busy}
          onClick={() => oauthSignIn("Microsoft")}
        >
          {busy === "Microsoft" ? <span className="spinner" aria-hidden /> : <MicrosoftIcon />} Continue with Microsoft
        </button>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            color: "#a3a3a3",
            fontSize: 12,
            margin: "16px 0",
          }}
        >
          <span style={{ flex: 1, height: 1, background: "#e5e5e5" }} />
          or use email
          <span style={{ flex: 1, height: 1, background: "#e5e5e5" }} />
        </div>

        <form onSubmit={submit}>
          <input
            style={S.input}
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
          <input
            style={S.input}
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
          />
          {error && (
            <div style={{ color: "#dc2626", fontSize: 13, marginBottom: 8 }}>{error}</div>
          )}
          {notice && (
            <div style={{ color: "#92400e", fontSize: 13, marginBottom: 8 }}>{notice}</div>
          )}
          <button type="submit" style={{ ...S.primary, opacity: busy ? 0.7 : 1 }} disabled={!!busy}>
            {busy === "email" ? (
              <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                <span className="spinner" aria-hidden style={{ borderTopColor: "#fff", borderColor: "rgba(255,255,255,0.4)" }} />
                {mode === "login" ? "Logging in…" : "Creating account…"}
              </span>
            ) : mode === "login" ? "Log in" : "Sign up"}
          </button>
        </form>

        <div style={{ textAlign: "center", color: "#525252", fontSize: 13.5, marginTop: 14 }}>
          {mode === "login" ? (
            <>
              New here?{" "}
              <button style={{ ...S.ghost, width: "auto", padding: 0 }} onClick={() => { setMode("signup"); setError(""); }}>
                Create an account
              </button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <button style={{ ...S.ghost, width: "auto", padding: 0 }} onClick={() => { setMode("login"); setError(""); }}>
                Log in
              </button>
            </>
          )}
        </div>

        <button style={S.ghost} onClick={() => finish({ email: "guest", guest: true, role: "user" })}>
          Continue as guest →
        </button>

        <div style={{ color: "#a3a3a3", fontSize: 11.5, textAlign: "center", marginTop: 16, lineHeight: 1.5 }}>
          {firebaseEnabled
            ? "Secured by Firebase Authentication — passwords are hashed and stored by Google, never by this app."
            : "Accounts are stored only in this browser (localStorage). No server, no database, no API keys."}
        </div>
      </div>
    </main>
  );
}
