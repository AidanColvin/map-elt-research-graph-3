"use client";

/**
 * takes a list of example queries, a label for the group, and a submit handler
 * renders them as outlined pills that fill the field and read on click
 * returns the chip list element
 */
export default function ExampleChips({
  examples,
  label,
  onPick,
}: {
  examples: string[];
  label: string;
  onPick: (example: string) => void;
}) {
  return (
    <ul className="v4-chips" aria-label={label}>
      {examples.map((example) => (
        <li key={example}>
          <button type="button" className="v4-chip" onClick={() => onPick(example)}>
            {example}
          </button>
        </li>
      ))}
    </ul>
  );
}
