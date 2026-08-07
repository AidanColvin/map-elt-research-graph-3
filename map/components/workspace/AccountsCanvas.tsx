"use client";

import { useState } from "react";
import InteractiveAccountsTable from "./InteractiveAccountsTable";
import { getUniqueAccounts } from "./accountsData";
import type { AccountProfile } from "./accountProfile";
import {
  downloadAccountsExcel,
  downloadAccountsPdf,
  downloadAccountsMarkdown,
} from "./accountsExport";
import { CanvasCard } from "./ui";
import { useInventoryData } from "./useInventoryData";
import SignInRequired from "./SignInRequired";

// takes: session-added rows, the deep-dive handler, the inventory token, and
//        the sign-in / unlock handlers for the inline gate
// does: fetches the Directory rows through the gated inventory API (they are
//       not bundled client-side), then renders the Database module — the
//       shared glass card shell wrapping the interactive table (live search,
//       type filters, sortable columns, CSV + Excel / PDF / Markdown exports
//       of the currently filtered set). Renders the gate instead whenever the
//       server refuses the caller.
// returns: the database canvas card element
export default function AccountsCanvas({
  extraRows = [],
  onRunDeepDive,
  pwToken,
  onSignIn,
  onUnlock,
}: {
  extraRows?: AccountProfile[];
  onRunDeepDive?: (company: string) => void;
  pwToken: string | null;
  onSignIn: () => void;
  onUnlock: (token: string) => void;
}) {
  const { phase, data } = useInventoryData<AccountProfile>("accounts", pwToken);
  const [busy, setBusy] = useState<string | null>(null);
  // Merge any session-added rows (e.g. from a sector Package) ahead of render,
  // deduped by company name against the server-fetched Directory.
  const allAccounts = getUniqueAccounts(data, extraRows);

  // takes: a format key, its async export function, and the rows to export
  // does: runs the export once, holding a busy flag so a second click cannot
  //       start a duplicate generation
  // returns: nothing
  async function run(key: string, fn: (rows: AccountProfile[]) => void | Promise<void>, rows: AccountProfile[]) {
    if (busy) return;
    setBusy(key);
    try {
      await fn(rows);
    } finally {
      setBusy(null);
    }
  }

  // The server said no — show the same gate a guest sees. This is the path a
  // signed-in visitor without an approved account or token lands on.
  if (phase === "locked") {
    return <SignInRequired viewLabel="Directory" onSignIn={onSignIn} onUnlock={onUnlock} />;
  }

  return (
    <CanvasCard title="Directory" subtitle="Every company you research, with all the details.">
      {phase === "loading" ? (
        <div style={{ padding: "72px 24px", textAlign: "center", color: "#6b7280", fontSize: 15 }}>
          Loading the directory…
        </div>
      ) : phase === "error" ? (
        <div style={{ padding: "72px 24px", textAlign: "center", color: "#6b7280", fontSize: 15 }}>
          Couldn&rsquo;t load the directory. Refresh to try again.
        </div>
      ) : (
        <InteractiveAccountsTable
          accounts={allAccounts}
          busyExport={busy}
          onRunDeepDive={onRunDeepDive}
          onExportExcel={(rows) => run("Excel", downloadAccountsExcel, rows)}
          onExportPdf={(rows) => run("PDF", downloadAccountsPdf, rows)}
          onExportMarkdown={(rows) => run("Markdown", downloadAccountsMarkdown, rows)}
        />
      )}
    </CanvasCard>
  );
}
