"use client";

import { useState } from "react";

/**
 * Keyless auth gate shown after the intro animation.
 *
 * - Email/password accounts live entirely in the browser (localStorage):
 *   no server, no database, no API keys, consistent with the project's
 *   "completely free to run" rule.
 * - Google / Microsoft buttons are present but real OAuth requires
 *   registering client IDs with those providers, so they explain that and
 *   offer guest mode instead.
 * - "Continue as guest" sets a guest session and proceeds.
 */

export type MapUser = { email: string; guest: boolean };

const USERS_KEY = "map.users";
const SESSION_KEY = "map.session";

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
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "32px 20px",
    background: "#ffffff",
    color: "#0a0a0a",
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Helvetica Neue', Helvetica, Arial, sans-serif",
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
    fontSize: 15,
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

function MicrosoftIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 23 23" aria-hidden>
      <rect x="1" y="1" width="10" height="10" fill="#F25022" />
      <rect x="12" y="1" width="10" height="10" fill="#7FBA00" />
      <rect x="1" y="12" width="10" height="10" fill="#00A4EF" />
      <rect x="12" y="12" width="10" height="10" fill="#FFB900" />
    </svg>
  );
}

export default function AuthGate({ onDone }: { onDone: (user: MapUser) => void }) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  function finish(user: MapUser) {
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(user));
    } catch {}
    onDone(user);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");
    const em = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(em)) return setError("Enter a valid email address.");
    if (password.length < 6) return setError("Password must be at least 6 characters.");

    const users = loadUsers();
    if (mode === "signup") {
      if (users[em]) return setError("An account with this email already exists. Log in instead.");
      users[em] = password;
      try {
        localStorage.setItem(USERS_KEY, JSON.stringify(users));
      } catch {}
      finish({ email: em, guest: false });
    } else {
      if (!users[em]) return setError("No account found for this email. Sign up first.");
      if (users[em] !== password) return setError("Incorrect password.");
      finish({ email: em, guest: false });
    }
  }

  function oauthNotice(provider: string) {
    setError("");
    setNotice(
      `${provider} sign-in needs an OAuth app registration (client ID) to work: this deployment runs with no keys. Use email or continue as guest.`,
    );
  }

  return (
    <main style={S.wrap}>
      <div style={S.card}>
        <div style={{ textAlign: "center", marginBottom: 22 }}>
          <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: "-0.03em" }}>Map</div>
          <div style={{ color: "#737373", fontSize: 14, marginTop: 6 }}>
            {mode === "login" ? "Welcome back, log in to continue" : "Create your account"}
          </div>
        </div>

        <button style={S.oauth} onClick={() => oauthNotice("Google")}>
          <GoogleIcon /> Continue with Google
        </button>
        <button style={S.oauth} onClick={() => oauthNotice("Microsoft")}>
          <MicrosoftIcon /> Continue with Microsoft
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
          <button type="submit" style={S.primary}>
            {mode === "login" ? "Log in" : "Sign up"}
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

        <button style={S.ghost} onClick={() => finish({ email: "guest", guest: true })}>
          Continue as guest →
        </button>

        <div style={{ color: "#a3a3a3", fontSize: 11.5, textAlign: "center", marginTop: 16, lineHeight: 1.5 }}>
          Accounts are stored only in this browser (localStorage). No server,
          no database, no API keys.
        </div>
      </div>
    </main>
  );
}
