"use client";

import { useState } from "react";
import {
  downloadMarkdownPdf,
  downloadMarkdownDocx,
  downloadMarkdownText,
} from "@/lib/report-export";
import { FONT } from "./ui";

// takes: the report's final Markdown and the company title
// does: renders a clean, minimalist button row (Download PDF / DOCX / Markdown)
//       that exports the current Company Deep Dive via the generic Markdown
//       renderers in lib/report-export.ts; disables itself while a file builds
// returns: the export button-row element
export function CompanyExportBar({
  markdown,
  title,
}: {
  markdown: string;
  title: string;
}) {
  const [busy, setBusy] = useState<null | "pdf" | "docx" | "md">(null);

  // takes: the format key and the matching export function
  // does: runs the export with a busy guard so double-clicks can't overlap
  // returns: nothing
  async function run(kind: "pdf" | "docx" | "md", fn: () => void | Promise<void>) {
    if (busy) return;
    setBusy(kind);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  }

  const btn =
    "rounded-full border border-black/[0.08] bg-white/80 hover:bg-white hover:shadow-sm transition-all cursor-pointer disabled:opacity-60";
  const style = { padding: "5px 13px", fontSize: 12.5, fontWeight: 500, color: "#1d1d1f" } as const;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: FONT }}>
      <button
        className={btn}
        style={style}
        disabled={!!busy}
        onClick={() => run("pdf", () => downloadMarkdownPdf(markdown, title))}
      >
        {busy === "pdf" ? "Building…" : "Download PDF"}
      </button>
      <button
        className={btn}
        style={style}
        disabled={!!busy}
        onClick={() => run("docx", () => downloadMarkdownDocx(markdown, title))}
      >
        {busy === "docx" ? "Building…" : "Download DOCX"}
      </button>
      <button
        className={btn}
        style={style}
        disabled={!!busy}
        onClick={() => run("md", () => downloadMarkdownText(markdown, title))}
      >
        Markdown
      </button>
    </div>
  );
}
