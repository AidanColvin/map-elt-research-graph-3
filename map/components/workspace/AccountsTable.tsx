"use client";

import type { AccountProfile, AccountColumn } from "./accountProfile";
import { ACCOUNT_COLUMNS } from "./accountProfile";

// takes: a website-or-link string (one full URL, or domains split by " / ")
// does: turns it into clickable anchors — splitting only on a space-padded
//       slash so full URLs stay intact; bare domains are normalized to https
// returns: an array of anchor elements, or a muted dash when empty
function renderLinks(value: string) {
  if (!value.trim()) return <span className="acct-empty">—</span>;
  return value
    .split(/\s+\/\s+|\s+/)
    .filter(Boolean)
    .map((raw, i) => {
      const href = raw.startsWith("http") ? raw : `https://${raw}`;
      const label = raw.startsWith("http") ? "Report ↗" : raw;
      return (
        <a key={i} href={href} target="_blank" rel="noopener noreferrer" style={{ marginRight: 8 }}>
          {label}
        </a>
      );
    });
}

// takes: one cell value and its column definition
// does: renders the cell — links for link columns, a clamped tooltip block for
//       wide text columns, a muted dash for empties, plain text otherwise
// returns: the cell's inner React content
function renderCell(value: string, col: AccountColumn) {
  if (col.kind === "link") return renderLinks(value);
  if (!value.trim()) return <span className="acct-empty">—</span>;
  if (col.kind === "wide") return <span title={value}>{value}</span>;
  return value;
}

// takes: one AccountProfile row and the column order
// does: renders a single table row, pinning the Account name cell
// returns: a <tr> element for the account
function AccountRow({ account, columns }: { account: AccountProfile; columns: AccountColumn[] }) {
  return (
    <tr>
      {columns.map((col) => (
        <td
          key={col.key}
          className={[
            col.kind === "account" ? "acct-name" : "",
            col.kind === "wide" ? "acct-wide" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {renderCell(account[col.key], col)}
        </td>
      ))}
    </tr>
  );
}

// takes: the array of account rows to display
// does: renders the full native data table (sticky frosted header, pinned
//       Account column) — pure presentation, no data or state logic
// returns: the accounts <table> element
export default function AccountsTable({ accounts }: { accounts: AccountProfile[] }) {
  return (
    <table className="acct-table">
      <thead>
        <tr>
          {ACCOUNT_COLUMNS.map((col) => (
            <th key={col.key} className={col.kind === "account" ? "acct-name" : ""}>
              {col.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {accounts.map((a) => (
          <AccountRow key={a.account} account={a} columns={ACCOUNT_COLUMNS} />
        ))}
      </tbody>
    </table>
  );
}
