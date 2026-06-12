"use client";

import { SECTORS } from "./sectors";

/**
 * Expansive command inputs that live natively at the top of each canvas —
 * replacing the old stacked left control box. Both bars are fully controlled:
 * draft values live in MapHome, so nothing a user typed or chose is ever
 * lost when shifting focus between views.
 */

const rowStyle: React.CSSProperties = {
  display: "flex",
  gap: 10,
  padding: "16px 24px 18px",
  alignItems: "center",
};

// takes: controlled value/onChange for the draft company, onRun(company), busy
// does: renders the Company Profile command row — one expansive ticker/company
//       input with a refined tinted action trigger
// returns: the company action-bar element
export function CompanyActionBar({
  value,
  onChange,
  onRun,
  busy,
}: {
  value: string;
  onChange: (v: string) => void;
  onRun: (company: string) => void;
  busy: boolean;
}) {
  // takes: a form submit event
  // does: prevents the default post and hands the trimmed company to onRun
  // returns: nothing
  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!busy && value.trim()) onRun(value);
  }

  return (
    <form style={rowStyle} onSubmit={submit}>
      <input
        className="ws-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search any public company or ticker"
        aria-label="Company or ticker"
        style={{ flex: 1 }}
      />
      <button type="submit" className="ws-btn" disabled={busy || !value.trim()}>
        {busy ? "Analyzing…" : "Analyze"}
      </button>
    </form>
  );
}

// takes: controlled value/onChange for the chosen sector, onRun(sector), busy
// does: renders the Sector Scan command row — a clean sector dropdown with a
//       refined tinted action trigger
// returns: the sector action-bar element
export function SectorActionBar({
  value,
  onChange,
  onRun,
  busy,
}: {
  value: string;
  onChange: (v: string) => void;
  onRun: (sector: string) => void;
  busy: boolean;
}) {
  // takes: a form submit event
  // does: prevents the default post and hands the chosen sector to onRun
  // returns: nothing
  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!busy) onRun(value);
  }

  return (
    <form style={rowStyle} onSubmit={submit}>
      <select
        className="ws-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Sector"
        style={{ flex: 1 }}
      >
        {SECTORS.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <button type="submit" className="ws-btn" disabled={busy}>
        {busy ? "Scanning…" : "Scan"}
      </button>
    </form>
  );
}
