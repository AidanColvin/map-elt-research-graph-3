"use client";

import { useSeenOnce } from "./homeHooks";

/** One step of the reveal stagger, in milliseconds. */
const STAGGER_MS = 60;

/**
 * takes a stagger position, an optional class name, and children
 * fades and lifts them into place the first time they scroll into view, once
 * returns the wrapping element
 */
export default function Reveal({
  order = 0,
  className,
  children,
}: {
  order?: number;
  className?: string;
  children: React.ReactNode;
}) {
  const [ref, seen] = useSeenOnce();
  return (
    <div
      ref={ref}
      className={`v4-reveal${className ? ` ${className}` : ""}`}
      data-shown={seen}
      style={{ transitionDelay: `${order * STAGGER_MS}ms` }}
    >
      {children}
    </div>
  );
}
