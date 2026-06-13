"use client";

import { useRef, useState } from "react";

export type DeepDiveStatus = "idle" | "loading" | "streaming" | "done" | "error";

export type DeepDiveState = {
  company: string;
  markdown: string;
  status: DeepDiveStatus;
  run: (name: string) => void;
  loadSaved: (company: string, markdown: string) => void;
};

// takes: nothing (React hook)
// does: owns Company Deep Dive state; streams markdown from /api/generate,
//       cancelling any in-flight stream when a new company is requested
// returns: { company, markdown, status, run } for the workspace to render
export function useDeepDive(): DeepDiveState {
  const [company, setCompany] = useState("");
  const [markdown, setMarkdown] = useState("");
  const [status, setStatus] = useState<DeepDiveStatus>("idle");
  const abortRef = useRef<AbortController | null>(null);

  // takes: company name or ticker string
  // does: aborts any previous stream, then streams the report chunk by chunk
  //       into state so the canvas renders progressively
  // returns: nothing (updates hook state)
  async function run(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setCompany(trimmed);
    setMarkdown("");
    setStatus("loading");

    try {
      const res = await fetch(`/api/generate?company=${encodeURIComponent(trimmed)}`, {
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        setStatus("error");
        setMarkdown(`> Could not generate a report (HTTP ${res.status}).`);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      setStatus("streaming");
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setMarkdown(acc);
      }
      setStatus("done");
    } catch (e: any) {
      if (e?.name === "AbortError") return; // superseded by a newer request
      setStatus("error");
      setMarkdown("> Network error while generating the report.");
    }
  }

  // takes: a company name and previously-saved markdown
  // does: shows a saved report instantly without any network call, cancelling
  //       any in-flight stream — the caller re-verifies freshness separately
  // returns: nothing (updates hook state)
  function loadSaved(name: string, saved: string) {
    abortRef.current?.abort();
    setCompany(name);
    setMarkdown(saved);
    setStatus("done");
  }

  return { company, markdown, status, run, loadSaved };
}
