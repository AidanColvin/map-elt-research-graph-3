"use client";

import { useCallback, useEffect, useState } from "react";
import type { MapUser } from "@/components/AuthGate";
import {
  listSaved,
  saveReport,
  removeSaved,
  type SavedReport,
} from "@/lib/savedReports";

export type SavedReportsState = {
  saved: SavedReport[];
  ready: boolean;
  save: (r: SavedReport) => Promise<void>;
  remove: (id: string) => Promise<void>;
  reload: () => void;
};

// takes: the current MapUser (or null)
// does: owns the per-user saved-reports list, loading it on mount / when the
//       user changes and exposing save/remove that keep the list in sync
// returns: { saved, ready, save, remove, reload }
export function useSavedReports(user: MapUser | null): SavedReportsState {
  const [saved, setSaved] = useState<SavedReport[]>([]);
  const [ready, setReady] = useState(false);
  // identity key so the effect reloads when the signed-in user changes
  const identity = user ? `${user.guest ? "guest" : user.email}` : "none";

  const reload = useCallback(() => {
    let cancelled = false;
    setReady(false);
    listSaved(user)
      .then((list) => {
        if (!cancelled) {
          setSaved(list);
          setReady(true);
        }
      })
      .catch(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity]);

  useEffect(() => reload(), [reload]);

  const save = useCallback(
    async (r: SavedReport) => {
      const next = await saveReport(user, r);
      setSaved(next);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [identity],
  );

  const remove = useCallback(
    async (id: string) => {
      const next = await removeSaved(user, id);
      setSaved(next);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [identity],
  );

  return { saved, ready, save, remove, reload };
}
