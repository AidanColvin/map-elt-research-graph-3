"use client";

/**
 * useInventoryData — the one client door to the server-held workbook data.
 * Fetches /api/inventory/data with whatever credentials the visitor has (the
 * inventory token from the password unlock, plus the Firebase Bearer token
 * authFetch attaches for signed-in accounts) and reports one of four phases:
 * loading → ready | locked (server said 401) | error. Re-runs whenever the
 * token changes, so entering the password immediately loads the data.
 */
import { useEffect, useState } from "react";
import { authFetch } from "@/lib/authFetch";

export type InventoryPhase = "loading" | "ready" | "locked" | "error";

// takes: which dataset to load and the current inventory token (or null)
// does: fetches the set through the gated API, tracking phase transitions;
//       ignores responses that arrive after the effect re-ran
// returns: { phase, data } — data is [] except in the ready phase
export function useInventoryData<T>(
  set: "partnerships" | "accounts",
  pwToken: string | null,
): { phase: InventoryPhase; data: T[] } {
  const [state, setState] = useState<{ phase: InventoryPhase; data: T[] }>({
    phase: "loading",
    data: [],
  });

  useEffect(() => {
    let cancelled = false;
    setState({ phase: "loading", data: [] });
    (async () => {
      try {
        const res = await authFetch(`/api/inventory/data?set=${set}`, {
          headers: pwToken ? { "X-Inventory-Token": pwToken } : {},
        });
        if (cancelled) return;
        if (res.status === 401) {
          setState({ phase: "locked", data: [] });
          return;
        }
        if (!res.ok) {
          setState({ phase: "error", data: [] });
          return;
        }
        const json = await res.json();
        if (cancelled) return;
        setState({
          phase: "ready",
          data: Array.isArray(json?.data) ? (json.data as T[]) : [],
        });
      } catch {
        if (!cancelled) setState({ phase: "error", data: [] });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [set, pwToken]);

  return state;
}
