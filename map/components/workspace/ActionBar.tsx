"use client";

import { SECTORS } from "./sectors";
import { getCompanySuggestion } from "./companySuggestions";

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
// does: renders the Company Profile command row — an expansive ticker/company
//       input with an inline gray ghost-text prediction and a tinted trigger
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
  // The predicted full name; the ghost shows only the part not yet typed,
  // preserving the user's exact characters so the cursor never jumps.
  const suggestion = getCompanySuggestion(value);
  const ghostSuffix = suggestion ? suggestion.slice(value.length) : "";

  // takes: a form submit event
  // does: submits the completed suggestion if one is showing, else the typed
  //       text — so pressing Enter on "anth" runs the full "Anthropic"
  // returns: nothing
  function submit(e: React.FormEvent) {
    e.preventDefault();
    const target = suggestion ?? value;
    if (!busy && target.trim()) {
      if (suggestion) onChange(suggestion);
      onRun(target);
    }
  }

  // takes: a keydown event on the input
  // does: accepts the ghost (without submitting) on Tab or Right-arrow-at-end
  // returns: nothing
  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!suggestion) return;
    const atEnd = e.currentTarget.selectionStart === value.length;
    if (e.key === "Tab" || (e.key === "ArrowRight" && atEnd)) {
      e.preventDefault();
      onChange(suggestion);
    }
  }

  return (
    <form style={rowStyle} onSubmit={submit}>
      <div
        style={{
          position: "relative",
          flex: 1,
          background: "rgba(255,255,255,0.85)",
          borderRadius: 14,
        }}
      >
        {/* Ghost overlay sits on top of the input; the typed span is invisible
            so the gray suffix begins exactly where the real text ends. */}
        {ghostSuffix && (
          <div className="ws-ghost" aria-hidden>
            <span style={{ color: "transparent" }}>{value}</span>
            <span style={{ color: "#b6b6bc" }}>{ghostSuffix}</span>
          </div>
        )}
        <input
          className="ws-input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Search any public company or ticker"
          aria-label="Company or ticker"
          autoComplete="off"
          spellCheck={false}
          style={{ position: "relative", background: "transparent", width: "100%" }}
        />
      </div>
      <button type="submit" className="ws-btn" disabled={busy || !value.trim()}>
        {busy ? "Analyzing…" : "Analyze"}
      </button>
    </form>
  );
}

// takes: controlled value/onChange for the chosen sector, onRun(sector), busy
// does: renders the Sector Scan command row: a free-text sector input with a
//       datalist of curated sectors and the pill action trigger
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
    if (!busy && value.trim()) onRun(value.trim());
  }

  return (
    <form style={rowStyle} onSubmit={submit}>
      <input
        className="ws-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search any sector: Technology, Oncology, Fintech"
        aria-label="Sector"
        autoComplete="off"
        spellCheck={false}
        list="ws-sectors"
        style={{ flex: 1 }}
      />
      <datalist id="ws-sectors">
        {SECTORS.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <button type="submit" className="ws-btn" disabled={busy || !value.trim()}>
        {busy ? "Scanning…" : "Scan"}
      </button>
    </form>
  );
}
