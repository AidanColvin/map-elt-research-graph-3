"use client";

import { useState } from "react";
import AccountsTable from "./AccountsTable";
import { ACCOUNTS } from "./accountsData";
import {
  downloadAccountsExcel,
  downloadAccountsPdf,
  downloadAccountsMarkdown,
} from "./accountsExport";
import { CanvasCard, FONT } from "./ui";

// takes: nothing
// does: renders the Accounts toolbar — the row count on the left and the
//       Excel / PDF / Markdown download triggers on the right; guards
//       against double-clicks while an async export is generating
// returns: the accounts toolbar element
function AccountsToolbar() {
  const [busy, setBusy] = useState<string | null>(null);

  // takes: a format key and its (possibly async) export function
  // does: runs the export once, holding a busy flag so a second click
  //       cannot start a duplicate generation
  // returns: nothing
  async function run(key: string, fn: () => void | Promise<void>) {
    if (busy) return;
    setBusy(key);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  }

  const buttons: [string, () => void | Promise<void>][] = [
    ["Excel", () => downloadAccountsExcel(ACCOUNTS)],
    ["PDF", () => downloadAccountsPdf(ACCOUNTS)],
    ["Markdown", () => downloadAccountsMarkdown(ACCOUNTS)],
  ];

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "12px 24px 14px",
        fontFamily: FONT,
      }}
    >
      <span style={{ fontSize: 13, color: "#86868b" }}>
        {ACCOUNTS.length} partner accounts · UNC Innovate Carolina industry database
      </span>
      <span style={{ display: "flex", gap: 8 }}>
        {buttons.map(([label, fn]) => (
          <button
            key={label}
            className="ws-btn"
            style={{ padding: "7px 16px", fontSize: 13 }}
            disabled={!!busy}
            onClick={() => run(label, fn)}
          >
            {busy === label ? "Preparing…" : `↓ ${label}`}
          </button>
        ))}
      </span>
    </div>
  );
}

// takes: nothing
// does: renders the Accounts module — the shared glassmorphic card shell with
//       the download toolbar pinned up top and the native data table inside
//       its own two-axis scroll region (scroll position persists while the
//       view stays mounted)
// returns: the accounts canvas card element
export default function AccountsCanvas() {
  return (
    <CanvasCard title="Accounts" toolbar={<AccountsToolbar />}>
      <div style={{ height: "100%", overflow: "auto" }}>
        <AccountsTable accounts={ACCOUNTS} />
      </div>
    </CanvasCard>
  );
}
