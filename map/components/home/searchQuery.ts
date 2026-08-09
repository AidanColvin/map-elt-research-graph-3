/**
 * Pure query helpers for the homepage search field.
 *
 * Nothing here touches the DOM, state, or the network — the field imports these
 * to decide what to do, and the unit tests exercise them directly.
 */

/** Longer than any real company or subject name; past this the field objects. */
export const MAX_QUERY_LENGTH = 200;

export type QueryCheck =
  | { ok: true; query: string }
  | { ok: false; message: string };

/**
 * takes a raw string
 * tests whether it contains at least one letter or digit
 * returns true when there is something in it to look up
 */
export function hasSearchableCharacter(raw: string): boolean {
  return /[\p{Letter}\p{Number}]/u.test(raw);
}

/**
 * takes a raw string typed into the field
 * collapses its runs of whitespace and trims the ends
 * returns the query as it should be submitted
 */
export function normalizeQuery(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

/**
 * takes a raw string typed into the field
 * normalizes it and checks it reads as a company or a subject
 * returns the query to submit, or the plain-language reason it cannot be read
 */
export function checkQuery(raw: string): QueryCheck {
  const query = normalizeQuery(raw);
  if (!query) {
    return { ok: false, message: "Type a company or a research area to read." };
  }
  if (query.length > MAX_QUERY_LENGTH) {
    return {
      ok: false,
      message: `That is ${query.length} characters. A company or subject name fits in ${MAX_QUERY_LENGTH} — shorten it and read again.`,
    };
  }
  if (!hasSearchableCharacter(query)) {
    return {
      ok: false,
      message: "That has no letters or numbers to look up. Try one of these.",
    };
  }
  return { ok: true, query };
}

/**
 * takes a keyboard event's key, and whether an editable element already has focus
 * decides whether this keystroke is the page-wide shortcut that focuses the field
 * returns true when the field should take focus
 */
export function isSearchShortcut(key: string, editableFocused: boolean): boolean {
  return key === "/" && !editableFocused;
}

/**
 * takes an element, or null
 * tests whether typing into it would go somewhere other than the page
 * returns true for inputs, textareas, selects, and contenteditable regions
 */
export function isEditableElement(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return (el as HTMLElement).isContentEditable === true;
}
