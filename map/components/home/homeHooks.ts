"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The browser-facing edges of the homepage. Each hook reads one thing from the
 * environment and reports it back as state; every component that consumes them
 * stays pure and renders from props.
 */

/**
 * takes a media query string
 * subscribes to it and tracks whether it currently matches
 * returns true while the query matches, and false during the server render
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    setMatches(mq.matches);
    const onChange = () => setMatches(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

/**
 * takes a scroll distance in pixels
 * watches the window's vertical scroll position against it
 * returns true once the page has scrolled past that distance
 */
export function useScrolledPast(distance: number): boolean {
  const [past, setPast] = useState(false);
  useEffect(() => {
    const read = () => setPast(window.scrollY > distance);
    read();
    window.addEventListener("scroll", read, { passive: true });
    return () => window.removeEventListener("scroll", read);
  }, [distance]);
  return past;
}

/**
 * takes nothing
 * watches an element and notes the first time it enters the viewport
 * returns a ref to attach and whether the element has been seen yet
 */
export function useSeenOnce(): [React.RefObject<HTMLDivElement | null>, boolean] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    // No element, or an engine without the observer: show the content rather
    // than leaving it permanently transparent.
    if (!el || typeof IntersectionObserver === "undefined") {
      setSeen(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return [ref, seen];
}
