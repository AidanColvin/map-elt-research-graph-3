"use client";

export type SearchBarProps = {
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  onSubmit: (v: string) => void;
  buttonLabel: string;
  busy?: boolean;
  listId?: string;
  ariaLabel?: string;
};

// takes: controlled value/onChange, an onSubmit(value), the placeholder and
//        button label, plus optional busy flag and datalist id
// does: renders the one shared search bar style: a token input and a full
//       pill submit button that presses to 0.97 scale
// returns: the search form element
export default function SearchBar({
  placeholder,
  value,
  onChange,
  onSubmit,
  buttonLabel,
  busy = false,
  listId,
  ariaLabel,
}: SearchBarProps) {
  // takes: the form submit event
  // does: blocks the default post and hands the trimmed value to onSubmit
  // returns: nothing
  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!busy && value.trim()) onSubmit(value.trim());
  }

  return (
    <form
      onSubmit={submit}
      style={{ display: "flex", gap: 10, alignItems: "center", width: "100%" }}
    >
      <input
        className="ws-input"
        style={{ flex: 1 }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        autoComplete="off"
        spellCheck={false}
        list={listId}
      />
      <button type="submit" className="ws-btn" disabled={busy || !value.trim()}>
        {buttonLabel}
      </button>
    </form>
  );
}
