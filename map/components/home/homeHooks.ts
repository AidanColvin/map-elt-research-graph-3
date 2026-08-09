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
 * takes an element and the viewport height
 * tests whether the element's top edge has reached the viewport or gone past it
 * returns true once the element has been arrived at, or skipped over
 */
export function hasReachedViewport(top: number, viewportHeight: number): boolean {
  // Deliberately "top edge past the bottom of the screen", not "is currently
  // intersecting": a jump to the end of the page, an anchor link, or a fast
  // flick moves straight past a section without it ever intersecting, and
  // content must never be left permanently invisible because of how someone
  // scrolled.
  return top < viewportHeight * 0.92;
}

/**
 * takes nothing
 * watches an element and notes the first time the page reaches or passes it,
 * and whether that happened on the very first frame rather than on a scroll
 * returns a ref to attach, whether it has been seen, and whether it was already there
 */
export function useSeenOnce(): [
  React.RefObject<HTMLDivElement | null>,
  boolean,
  boolean,
] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [seen, setSeen] = useState(false);
  // These are *scroll* reveals. Content that was on screen before anyone
  // scrolled was never revealed by scrolling, so it simply appears — which also
  // keeps a fade from delaying the page's largest paint.
  const [immediate, setImmediate] = useState(false);
  const mounting = useRef(true);
  useEffect(() => {
    const el = ref.current;
    // No element to watch: show the content rather than leaving it transparent.
    if (!el) {
      setSeen(true);
      setImmediate(true);
      return;
    }
    let frame = 0;
    let done = false;
    const check = () => {
      frame = 0;
      if (done) return;
      if (!hasReachedViewport(el.getBoundingClientRect().top, window.innerHeight)) return;
      done = true;
      if (mounting.current) setImmediate(true);
      setSeen(true);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
    const schedule = () => {
      if (frame || done) return;
      frame = window.requestAnimationFrame(check);
    };
    check();
    mounting.current = false;
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, []);
  return [ref, seen, immediate];
}
