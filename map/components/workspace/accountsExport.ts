"use client";

import type { AccountProfile } from "./accountProfile";
import { ACCOUNT_COLUMNS } from "./accountProfile";

/**
 * Accounts download formats — Excel, PDF, and raw Markdown. Pure export
 * logic, kept separate from the table rendering and canvas state. The heavy
 * libraries (xlsx, jspdf) are dynamically imported so they never weigh down
 * the initial page load.
 */

// takes: a filename and a Blob/data URL trigger
// does: clicks a temporary anchor to start a browser download
// returns: nothing
function triggerDownload(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// takes: the account rows
// does: builds a full 22-column worksheet and downloads it as .xlsx
// returns: a promise that resolves when the download has been triggered
export async function downloadAccountsExcel(accounts: AccountProfile[]): Promise<void> {
  const XLSX = await import("xlsx");
  const header = ACCOUNT_COLUMNS.map((c) => c.label);
  const rows = accounts.map((a) => ACCOUNT_COLUMNS.map((c) => a[c.key]));
  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  ws["!cols"] = ACCOUNT_COLUMNS.map((c) =>
    c.kind === "wide" || c.kind === "link" ? { wch: 50 } : { wch: 22 },
  );
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Accounts");
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  triggerDownload("map-accounts.xlsx", new Blob([out], { type: "application/octet-stream" }));
}

// takes: the account rows
// does: builds a landscape PDF — a scannable summary table of the key
//       columns (the Excel and Markdown exports carry every field)
// returns: a promise that resolves when the download has been triggered
export async function downloadAccountsPdf(accounts: AccountProfile[]): Promise<void> {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Map — Accounts Database", 40, 40);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(
    `${accounts.length} partner accounts · UNC Innovate Carolina industry database · generated ${new Date().toLocaleDateString()}`,
    40,
    56,
  );

  autoTable(doc, {
    startY: 72,
    head: [["Account", "Parent", "Top Sector", "Ownership", "City, State", "Employees", "Revenue", "Key Products"]],
    body: accounts.map((a) => [
      a.account,
      a.parentAccount || "—",
      a.topIndustrySectorProfile || "—",
      a.ownership || "—",
      [a.city, a.state].filter(Boolean).join(", ") || "—",
      a.approximateEmployees || "—",
      a.approximateRevenue || "—",
      a.keyProducts || "—",
    ]),
    styles: { fontSize: 7, cellPadding: 4, overflow: "linebreak", textColor: 40 },
    headStyles: { fillColor: [29, 29, 31], textColor: 255, fontSize: 7.5 },
    alternateRowStyles: { fillColor: [248, 248, 250] },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 90 }, 7: { cellWidth: 170 } },
    margin: { left: 40, right: 40 },
  });

  doc.save("map-accounts.pdf");
}

// takes: the account rows
// does: serializes every account as a markdown property list (the same
//       format as ACCOUNTS_DATA.md) and downloads it as a .md file
// returns: nothing
export function downloadAccountsMarkdown(accounts: AccountProfile[]): void {
  const lines: string[] = [
    "# Map — Accounts Database",
    "",
    `${accounts.length} partner accounts · UNC Innovate Carolina industry database`,
    "",
  ];
  for (const a of accounts) {
    lines.push(`## ${a.account}`);
    for (const col of ACCOUNT_COLUMNS) {
      if (col.key === "account") continue;
      lines.push(`* **${col.label}:** ${a[col.key] || "—"}`);
    }
    lines.push("");
  }
  triggerDownload(
    "map-accounts.md",
    new Blob([lines.join("\n")], { type: "text/markdown" }),
  );
}
