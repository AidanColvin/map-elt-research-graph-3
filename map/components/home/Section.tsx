"use client";

/**
 * takes a section id, an optional first-section flag, an optional aria-label, and children
 * wraps them in the page's one source of vertical rhythm and horizontal measure
 * returns the section element
 */
export default function Section({
  id,
  first = false,
  label,
  children,
}: {
  id: string;
  first?: boolean;
  label?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      aria-label={label}
      className={`v4-section${first ? " v4-section-first" : ""}`}
    >
      <div className="v4-container">{children}</div>
    </section>
  );
}
