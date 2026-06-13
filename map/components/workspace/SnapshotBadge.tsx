"use client";

import { FONT } from "./ui";

// takes: an epoch-ms timestamp
// does: formats it as a readable snapshot date (e.g. "Oct 12, 2025")
// returns: the formatted date string
export function snapshotDate(ts: number): string {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "an earlier date";
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

// takes: the snapshot's lastUpdated timestamp, a busy flag, and an onRerun handler
// does: renders the "Freeze & Flag" badge shown atop a loaded saved snapshot —
//       it states the data's age (static, not auto-updated) and offers a
//       [Rerun Analysis] button that fetches fresh data to overwrite the canvas
// returns: the snapshot badge element
export function SnapshotBadge({
  lastUpdated,
  busy,
  onRerun,
}: {
  lastUpdated: number;
  busy: boolean;
  onRerun: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap",
        fontFamily: FONT,
        background: "#fff7ed",
        border: "1px solid #fed7aa",
        borderRadius: 12,
        padding: "8px 14px",
        margin: "0 0 14px",
      }}
    >
      <span style={{ fontSize: 13, color: "#9a3412" }}>
        📌 Snapshot from {snapshotDate(lastUpdated)} — static copy, not auto-updated.
      </span>
      <button
        onClick={onRerun}
        disabled={busy}
        className="rounded-full bg-orange-600 hover:bg-orange-700 text-white transition-colors cursor-pointer disabled:opacity-60"
        style={{ padding: "5px 13px", fontSize: 12.5, fontWeight: 600 }}
      >
        {busy ? "Rerunning…" : "Rerun Analysis"}
      </button>
    </div>
  );
}
