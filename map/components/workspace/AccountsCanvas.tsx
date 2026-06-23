"use client";

import { useState } from "react";
import InteractiveAccountsTable from "./InteractiveAccountsTable";
import { ACCOUNTS, getUniqueAccounts } from "./accountsData";
import type { AccountProfile } from "./accountProfile";
import {
  downloadAccountsExcel,
  downloadAccountsPdf,
  downloadAccountsMarkdown,
} from "./accountsExport";
import { CanvasCard } from "./ui";

// takes: nothing
// does: renders the Database module — the shared glass card shell wrapping the
//       interactive table (live search, type filters, sortable columns, CSV +
//       Excel / PDF / Markdown exports of the currently filtered set)
// returns: the database canvas card element
export default function AccountsCanvas({
  extraRows = [],
  onRunDeepDive,
}: {
  extraRows?: AccountProfile[];
  onRunDeepDive?: (company: string) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  // Merge any session-added rows (e.g. from a sector Package) ahead of render,
  // deduped by company name against the static Database.
  const allAccounts = getUniqueAccounts(ACCOUNTS, extraRows);

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

  return (
    <CanvasCard title="Database">
      <InteractiveAccountsTable
        accounts={allAccounts}
        busyExport={busy}
        onRunDeepDive={onRunDeepDive}
        onExportExcel={(rows) => run("Excel", downloadAccountsExcel, rows)}
        onExportPdf={(rows) => run("PDF", downloadAccountsPdf, rows)}
        onExportMarkdown={(rows) => run("Markdown", downloadAccountsMarkdown, rows)}
      />
    </CanvasCard>
  );
}
