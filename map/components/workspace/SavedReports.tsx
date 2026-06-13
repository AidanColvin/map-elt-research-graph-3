"use client";

import { useState } from "react";
import type { SavedReportsState } from "./useSavedReports";
import {
  savedId,
  fetchSignature,
  type SavedKind,
  type SavedReport,
} from "@/lib/savedReports";
import { FONT } from "./ui";

// takes: an epoch-ms timestamp
// does: formats it as a short relative time ("just now", "3h ago", "2d ago")
// returns: the relative-time string
export function relativeTime(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 45) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

// takes: the saved store, the kind/query/title, and a getter for the current
//        report content
// does: renders the Save control for a freshly generated report — saving
//       captures the content plus a current freshness signature so it can be
//       re-verified later; re-saving updates in place
// returns: the save control element
export function SaveControl({
  saved,
  kind,
  query,
  title,
  getContent,
}: {
  saved: SavedReportsState;
  kind: SavedKind;
  query: string;
  title: string;
  getContent: () => string;
}) {
  const [busy, setBusy] = useState(false);
  const id = savedId(kind, query);
  const existing = saved.saved.find((r) => r.id === id);

  async function onSave() {
    if (busy) return;
    setBusy(true);
    try {
      const now = Date.now();
      const sig = await fetchSignature(kind, query);
      const r: SavedReport = {
        id,
        kind,
        query,
        title,
        content: getContent(),
        sig,
        savedAt: existing?.savedAt ?? now,
        verifiedAt: now,
      };
      await saved.save(r);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: FONT }}>
      <button
        onClick={onSave}
        disabled={busy}
        className="rounded-full border border-black/[0.08] bg-white/80 hover:bg-white hover:shadow-sm transition-all cursor-pointer disabled:opacity-60"
        style={{ padding: "5px 13px", fontSize: 12.5, fontWeight: 500, color: "#1d1d1f" }}
      >
        {busy ? "Saving…" : existing ? "Update saved" : "Save report"}
      </button>
      {existing && (
        <span style={{ fontSize: 11.5, color: "#9a9aa2" }}>
          Saved · verified {relativeTime(existing.verifiedAt)}
        </span>
      )}
    </div>
  );
}

// takes: the saved items for one kind, plus open/remove handlers
// does: renders the "Saved" strip — clickable rows that reopen a saved report
//       (the opener re-verifies freshness), each with a remove control
// returns: the saved-strip element, or null when there's nothing saved
export function SavedStrip({
  items,
  onOpen,
  onRemove,
  label = "Saved",
}: {
  items: SavedReport[];
  onOpen: (r: SavedReport) => void;
  onRemove: (id: string) => void;
  label?: string;
}) {
  if (!items.length) return null;
  return (
    <div style={{ fontFamily: FONT }}>
      <p className="text-[11px] font-semibold tracking-[0.18em] text-gray-500 uppercase mb-3">
        {label}
      </p>
      <div className="flex flex-wrap gap-2">
        {items.map((r) => (
          <div
            key={r.id}
            className="group flex items-center gap-2 rounded-full bg-white/80 border border-black/[0.06] hover:shadow-md transition-all"
            style={{ padding: "4px 6px 4px 13px" }}
          >
            <button
              onClick={() => onOpen(r)}
              className="cursor-pointer text-left"
              style={{ fontSize: 13, fontWeight: 500, color: "#1d1d1f" }}
              title={`Open — verified ${relativeTime(r.verifiedAt)}`}
            >
              {r.title}
            </button>
            <button
              onClick={() => onRemove(r.id)}
              aria-label={`Remove saved ${r.title}`}
              className="cursor-pointer rounded-full hover:bg-black/[0.06] transition-colors"
              style={{
                width: 18,
                height: 18,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#a0a0a8",
                fontSize: 14,
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// takes: a short note string (or empty)
// does: renders the small freshness pill shown while/after re-verifying a
//       reopened report
// returns: the pill element, or null when there's no note
export function VerifyPill({ note }: { note: string }) {
  if (!note) return null;
  return (
    <span
      style={{
        fontFamily: FONT,
        fontSize: 11.5,
        fontWeight: 500,
        color: "#5b6cff",
        background: "#eef0ff",
        borderRadius: 999,
        padding: "3px 10px",
      }}
    >
      {note}
    </span>
  );
}
