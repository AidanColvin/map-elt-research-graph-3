import { useEffect, useState } from "react";
import { signOut } from "../../firebase/auth";
import { getUserProfile } from "../../firebase/db";

/**
 * takes: user (Firebase User object)
 * does: renders the logged-in state — the user's Firestore profile summary and
 *       a sign-out button
 * returns: the account dashboard element
 */
export default function AccountDashboard({ user }) {
  const [profile, setProfile] = useState(null);

  /**
   * takes: nothing (effect; re-runs when the user id changes)
   * does: loads the signed-in user's Firestore profile document
   * returns: nothing
   */
  useEffect(() => {
    let active = true;
    getUserProfile(user.uid).then((p) => {
      if (active) setProfile(p);
    });
    return () => {
      active = false;
    };
  }, [user.uid]);

  return (
    <div style={styles.wrap}>
      <div style={styles.card}>
        <h1 style={styles.title}>Welcome back</h1>
        <p style={styles.email}>{user.email}</p>
        <div style={styles.row}>
          <span style={styles.label}>UID</span>
          <span style={styles.value}>{user.uid}</span>
        </div>
        <div style={styles.row}>
          <span style={styles.label}>Display name</span>
          <span style={styles.value}>{profile?.displayName || user.displayName || "—"}</span>
        </div>
        <button style={styles.signout} onClick={() => signOut()}>
          Sign out
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
    width: 420,
    background: "#fff",
    borderRadius: 16,
    padding: "32px 28px",
    boxShadow: "0 16px 40px rgba(0,0,0,0.1)",
  },
  title: { margin: 0, fontSize: 24, fontWeight: 700 },
  email: { margin: "4px 0 20px", color: "#737373", fontSize: 14 },
  row: {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    padding: "10px 0",
    borderTop: "1px solid #eee",
    fontSize: 13.5,
  },
  label: { color: "#a3a3a3" },
  value: { color: "#1d1d1f", wordBreak: "break-all", textAlign: "right" },
  signout: {
    width: "100%",
    marginTop: 22,
    padding: "12px 0",
    borderRadius: 10,
    border: "none",
    background: "#0a0a0a",
    color: "#fff",
    fontSize: 15,
    fontWeight: 600,
    cursor: "pointer",
  },
};
