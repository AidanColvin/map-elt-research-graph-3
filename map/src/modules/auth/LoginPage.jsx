import { useState } from "react";
import {
  signIn,
  signUp,
  signInWithGoogle,
  signInWithMicrosoft,
} from "../../firebase/auth";

/**
 * takes: nothing
 * does: renders the minimal auth portal — email/password sign in & sign up
 *       plus Google and Microsoft OAuth buttons; surfaces auth errors inline
 * returns: the login page element
 */
export default function LoginPage() {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  /**
   * takes: action (async function returning a User)
   * does: runs an auth action with a busy flag and captures any error message
   * returns: a Promise that resolves when the action settles
   */
  async function run(action) {
    setError("");
    setBusy(true);
    try {
      await action();
    } catch (e) {
      setError(e?.message || "Authentication failed.");
    } finally {
      setBusy(false);
    }
  }

  /**
   * takes: e (form submit event)
   * does: submits the email form as a sign in or sign up depending on mode
   * returns: nothing
   */
  function onSubmit(e) {
    e.preventDefault();
    run(() => (mode === "login" ? signIn(email, password) : signUp(email, password)));
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.card}>
        <h1 style={styles.title}>Map</h1>
        <p style={styles.subtitle}>
          {mode === "login" ? "Sign in to continue" : "Create your account"}
        </p>

        <button style={styles.oauth} disabled={busy} onClick={() => run(signInWithGoogle)}>
          Continue with Google
        </button>
        <button style={styles.oauth} disabled={busy} onClick={() => run(signInWithMicrosoft)}>
          Continue with Microsoft
        </button>

        <div style={styles.divider}>or use email</div>

        <form onSubmit={onSubmit}>
          <input
            style={styles.input}
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
          <input
            style={styles.input}
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
          />
          {error && <div style={styles.error}>{error}</div>}
          <button style={styles.primary} type="submit" disabled={busy}>
            {busy ? "…" : mode === "login" ? "Sign in" : "Sign up"}
          </button>
        </form>

        <button
          style={styles.toggle}
          onClick={() => {
            setMode(mode === "login" ? "signup" : "login");
            setError("");
          }}
        >
          {mode === "login" ? "Need an account? Sign up" : "Have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}

const styles = {
  wrap: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#f5f5f7",
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Helvetica Neue', Arial, sans-serif",
  },
  card: {
    width: 360,
    background: "#fff",
    borderRadius: 16,
    padding: "32px 28px",
    boxShadow: "0 16px 40px rgba(0,0,0,0.1)",
  },
  title: { margin: 0, fontSize: 30, fontWeight: 700, textAlign: "center" },
  subtitle: { margin: "6px 0 22px", color: "#737373", fontSize: 14, textAlign: "center" },
  oauth: {
    width: "100%",
    padding: "11px 0",
    marginBottom: 10,
    borderRadius: 10,
    border: "1px solid #d4d4d4",
    background: "#fff",
    fontSize: 14.5,
    fontWeight: 500,
    cursor: "pointer",
  },
  divider: { textAlign: "center", color: "#a3a3a3", fontSize: 12, margin: "16px 0" },
  input: {
    width: "100%",
    padding: "11px 13px",
    marginBottom: 10,
    borderRadius: 10,
    border: "1px solid #d4d4d4",
    fontSize: 15,
    boxSizing: "border-box",
  },
  primary: {
    width: "100%",
    padding: "12px 0",
    borderRadius: 10,
    border: "none",
    background: "#0a0a0a",
    color: "#fff",
    fontSize: 15,
    fontWeight: 600,
    cursor: "pointer",
  },
  error: { color: "#dc2626", fontSize: 13, marginBottom: 8 },
  toggle: {
    width: "100%",
    marginTop: 14,
    border: "none",
    background: "none",
    color: "#525252",
    fontSize: 13.5,
    cursor: "pointer",
    textDecoration: "underline",
  },
};
