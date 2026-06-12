"use client";

import { useMemo, useState } from "react";
import AccountsTable from "./AccountsTable";
import { ACCOUNTS } from "./accountsData";
import type { AccountProfile } from "./accountProfile";
import {
  downloadAccountsExcel,
  downloadAccountsPdf,
  downloadAccountsMarkdown,
} from "./accountsExport";
import { CanvasCard } from "./ui";

type SortKey = "nameAsc" | "nameDesc" | "sector" | "state";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "nameAsc", label: "Name A to Z" },
  { key: "nameDesc", label: "Name Z to A" },
  { key: "sector", label: "Sector" },
  { key: "state", label: "State" },
];

// takes: the full account list, the filter text, and the sort key
// does: filters by name, alias, sector, or state (case-insensitive), then
//       sorts by the chosen field with name as the tiebreaker
// returns: the rows to display
function selectRows(accounts: AccountProfile[], filter: string, sort: SortKey): AccountProfile[] {
  const q = filter.trim().toLowerCase();
  const rows = q
    ? accounts.filter((a) =>
        [a.account, a.companyAliases, a.topIndustrySectorProfile, a.state]
          .join(" ")
          .toLowerCase()
          .includes(q),
      )
    : [...accounts];
  const byName = (a: AccountProfile, b: AccountProfile) => a.account.localeCompare(b.account);
  if (sort === "nameAsc") rows.sort(byName);
  if (sort === "nameDesc") rows.sort((a, b) => byName(b, a));
  if (sort === "sector")
    rows.sort(
      (a, b) =>
        a.topIndustrySectorProfile.localeCompare(b.topIndustrySectorProfile) || byName(a, b),
    );
  if (sort === "state") rows.sort((a, b) => a.state.localeCompare(b.state) || byName(a, b));
  return rows;
}

// takes: the visible row count, the controlled filter/sort, and their setters
// does: renders the Companies toolbar: filter input and sort select on the
//       left, the Excel / PDF / Markdown download triggers on the right;
//       guards against double-clicks while an async export is generating
// returns: the toolbar element
function AccountsToolbar({
  shown,
  filter,
  onFilter,
  sort,
  onSort,
}: {
  shown: number;
  filter: string;
  onFilter: (v: string) => void;
  sort: SortKey;
  onSort: (v: SortKey) => void;
}) {
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
        flexWrap: "wrap",
        gap: 12,
        padding: "12px 24px 14px",
        fontFamily: "var(--font)",
      }}
    >
      <span style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 320 }}>
        <input
          className="ws-input"
          style={{ maxWidth: 280, padding: "9px 14px", fontSize: 13.5 }}
          value={filter}
          onChange={(e) => onFilter(e.target.value)}
          placeholder="Filter by name, sector, or state"
          aria-label="Filter companies"
        />
        <select
          className="ws-input"
          style={{ width: 170, padding: "9px 14px", fontSize: 13.5 }}
          value={sort}
          onChange={(e) => onSort(e.target.value as SortKey)}
          aria-label="Sort companies"
        >
          {SORTS.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
        <span style={{ fontSize: 13, color: "var(--text-2)", whiteSpace: "nowrap" }}>
          {shown} of {ACCOUNTS.length} companies
        </span>
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
// does: renders the Companies module: the shared card shell with filter and
//       sort controls pinned up top and the data table inside its own
//       two-axis scroll region (downloads always export the full set)
// returns: the companies canvas card element
export default function AccountsCanvas() {
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<SortKey>("nameAsc");
  const rows = useMemo(() => selectRows(ACCOUNTS, filter, sort), [filter, sort]);

  return (
    <CanvasCard
      title="Companies"
      toolbar={
        <AccountsToolbar
          shown={rows.length}
          filter={filter}
          onFilter={setFilter}
          sort={sort}
          onSort={setSort}
        />
      }
    >
      <div style={{ height: "100%", overflow: "auto" }}>
        <AccountsTable accounts={rows} />
      </div>
    </CanvasCard>
  );
}
