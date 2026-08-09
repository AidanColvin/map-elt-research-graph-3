"use client";

import { useEffect, useRef, useState } from "react";
import ExampleChips from "./ExampleChips";
import { checkQuery, isEditableElement, isSearchShortcut } from "./searchQuery";

/** The two examples offered as a way out of the not-found state. */
const RECOVERY_EXAMPLES = ["PFE", "Oncology"];

/**
 * takes nothing
 * draws the magnifier that sits at the left of the field
 * returns the icon element
 */
function SearchIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <circle cx="11" cy="11" r="7" stroke="var(--ink-3)" strokeWidth="2" />
      <line
        x1="16.5"
        y1="16.5"
        x2="21"
        y2="21"
        stroke="var(--ink-3)"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** A chip's pick, carrying a counter so the same chip can be clicked twice. */
export type FieldPick = { query: string; n: number };

/**
 * takes a submit handler and a chip pick to adopt from elsewhere on the page
 * owns the one search input — its five states, its two keyboard shortcuts, and
 * the recovery chips it offers when a query cannot be read
 * returns the field element with its error region beneath it
 */
export default function SearchField({
  onSubmit,
  pick,
}: {
  onSubmit: (query: string) => void;
  pick: FieldPick | null;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const submitRef = useRef<(raw: string) => void>(() => {});

  // A chip in the hero fills the field and reads it, in that order, so the
  // visitor sees what was asked for before the report replaces the page.
  useEffect(() => {
    if (!pick) return;
    setValue(pick.query);
    submitRef.current(pick.query);
  }, [pick]);

  // `/` focuses the field from anywhere on the page, unless the visitor is
  // already typing into something.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isSearchShortcut(e.key, isEditableElement(document.activeElement))) return;
      e.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // takes: a query string
  // does: checks it reads as a subject and hands it on, or shows why it does not
  // returns: nothing
  function submit(raw: string) {
    const checked = checkQuery(raw);
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    setError(null);
    // Repeated submits collapse into the first one: the report is already on
    // its way and a second run would only race it.
    if (submitting) return;
    setSubmitting(true);
    onSubmit(checked.query);
    // The homepage stays mounted behind the report view, so clear the flag on a
    // timer rather than leaving the field stuck for a visitor who comes back.
    window.setTimeout(() => setSubmitting(false), 2000);
  }
  // The chip effect above must call the current submit, not the one captured on
  // the render that first saw the pick.
  submitRef.current = submit;

  // takes: a recovery example
  // does: puts it in the field and reads it, so the error state always has an exit
  // returns: nothing
  function recoverWith(example: string) {
    setValue(example);
    submit(example);
  }

  // takes: a keyboard event from the input
  // does: submits on Enter and drops focus on Escape
  // returns: nothing
  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      submit(value);
    } else if (e.key === "Escape") {
      inputRef.current?.blur();
    }
  }

  return (
    <div>
      <div className="v4-field">
        <SearchIcon />
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Pfizer"
          aria-label="Read a company or a research area"
          aria-invalid={error !== null}
          aria-describedby={error ? "search-error" : undefined}
          autoComplete="off"
          spellCheck={false}
        />
        <button
          type="button"
          className="v4-field-submit"
          onClick={() => submit(value)}
          disabled={submitting}
        >
          {submitting ? (
            <>
              <span className="v4-spinner" aria-hidden="true" />
              <span className="v4-sr-only">Reading</span>
            </>
          ) : (
            "Read"
          )}
        </button>
      </div>

      {/* The error region is always in the tree so a screen reader announces
          the message when it appears, rather than the whole region arriving. */}
      <div id="search-error" role="status" aria-live="polite" style={{ marginTop: 12 }}>
        {error && (
          <>
            <p className="v4-small" style={{ color: "var(--ink-2)" }}>
              {error}
            </p>
            <div style={{ marginTop: 10 }}>
              <ExampleChips
                examples={RECOVERY_EXAMPLES}
                label="Try one of these instead"
                onPick={recoverWith}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
