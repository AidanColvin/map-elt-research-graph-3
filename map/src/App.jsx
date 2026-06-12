import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { subscribeToAuth } from "./firebase/auth";
import LoginPage from "./modules/auth/LoginPage";
import AccountDashboard from "./modules/auth/AccountDashboard";

/**
 * takes: nothing
 * does: tracks Firebase auth state and routes between the login portal and the
 *       account dashboard — /login when signed out, /account when signed in
 * returns: the routed app element
 */
export default function App() {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  /**
   * takes: nothing (effect; runs once on mount)
   * does: subscribes to auth state changes and records readiness once the
   *       first state has resolved
   * returns: an unsubscribe cleanup function
   */
  useEffect(() => {
    const unsub = subscribeToAuth((u) => {
      setUser(u);
      setReady(true);
    });
    return unsub;
  }, []);

  if (!ready) return null;

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={user ? <Navigate to="/account" replace /> : <LoginPage />}
        />
        <Route
          path="/account"
          element={user ? <AccountDashboard user={user} /> : <Navigate to="/login" replace />}
        />
        <Route path="*" element={<Navigate to={user ? "/account" : "/login"} replace />} />
      </Routes>
    </BrowserRouter>
  );
}
