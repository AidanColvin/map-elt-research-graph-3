"use client";

import { useState } from "react";
import type { ReportData } from "@/components/Report";

export type SectorScanStatus = "idle" | "running" | "done" | "error";

export type SectorScanState = {
  sector: string;
  data: ReportData | null;
  status: SectorScanStatus;
  progress: { done: number; total: number } | null;
  error: string | null;
  run: (sector: string) => void;
  loadSaved: (sector: string, data: ReportData) => void;
};

// takes: the accumulated text buffer plus the newly decoded chunk
// does: pure SSE wire-format decoding — splits complete "\n\n"-delimited
//       frames, extracts each frame's "data:" line, and JSON-parses it
// returns: { events, rest } — parsed event objects and the unconsumed buffer
export function parseSseFrames(buf: string, chunk: string): { events: any[]; rest: string } {
  const events: any[] = [];
  const combined = buf + chunk;
  const frames = combined.split("\n\n");
  const rest = frames.pop() ?? "";
  for (const frame of frames) {
    const line = frame.split("\n").find((l) => l.startsWith("data:"));
    if (!line) continue;
    try {
      events.push(JSON.parse(line.slice(5).trim()));
    } catch {
      /* ignore malformed frame */
    }
  }
  return { events, rest };
}

// takes: nothing (React hook)
// does: owns Sector Scan state; runs the backend pipeline via the SSE proxy
//       (with a plain-request fallback) and tracks live company progress
// returns: { sector, data, status, progress, error, run } for the workspace
export function useSectorScan(): SectorScanState {
  const [sector, setSector] = useState("");
  const [data, setData] = useState<ReportData | null>(null);
  const [status, setStatus] = useState<SectorScanStatus>("idle");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // takes: a parsed SSE event object, plus a mutable capture slot
  // does: interprets one backend event — progress updates go to state, the
  //       final report and failure flag go into the capture slot
  // returns: nothing (mutates capture / updates state)
  function applyEvent(ev: any, capture: { report: ReportData | null; failed: boolean }) {
    if (ev.type === "stage" && ev.key === "resolved") {
      setProgress({ done: 0, total: ev.total || 0 });
    } else if (ev.type === "progress") {
      setProgress({ done: ev.done, total: ev.total });
    } else if (ev.type === "done") {
      capture.report = (ev.report ?? null) as ReportData | null;
    } else if (ev.type === "error") {
      capture.failed = true;
    }
  }

  // takes: sector name string
  // does: resets state, tries the streaming endpoint first, falls back to the
  //       plain endpoint if streaming fails before delivering a report
  // returns: nothing (updates hook state)
  async function run(name: string) {
    const trimmed = name.trim();
    if (!trimmed || status === "running") return;
    setSector(trimmed);
    setStatus("running");
    setData(null);
    setProgress(null);
    setError(null);

    const ok = await runStreaming(trimmed);
    if (!ok) await runFallback(trimmed);
  }

  // takes: sector name string
  // does: requests the SSE endpoint and feeds chunks through parseSseFrames,
  //       applying each event until the stream ends
  // returns: true when a report was delivered, false to trigger the fallback
  async function runStreaming(name: string): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 300_000);
      const res = await fetch("/api/run-pipeline-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sector: name }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        clearTimeout(timeout);
        return false;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      const capture: { report: ReportData | null; failed: boolean } = {
        report: null,
        failed: false,
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const { events, rest } = parseSseFrames(buf, decoder.decode(value, { stream: true }));
        buf = rest;
        for (const ev of events) applyEvent(ev, capture);
      }
      clearTimeout(timeout);

      if (capture.report && !capture.failed) {
        setData(capture.report);
        setStatus("done");
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  // takes: sector name string
  // does: plain POST to /api/run-pipeline when streaming is unavailable
  // returns: nothing (updates hook state with the report or an error)
  async function runFallback(name: string): Promise<void> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 300_000);
      const res = await fetch("/api/run-pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sector: name }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) throw new Error(`Pipeline failed (${res.status})`);
      const json = await res.json();
      setData(json.data as ReportData);
      setStatus("done");
    } catch (e: any) {
      setError(
        e?.name === "AbortError"
          ? "The engine took too long to respond. Try again."
          : e?.message ?? "Something went wrong.",
      );
      setStatus("error");
    }
  }

  // takes: a sector name and a previously-saved report
  // does: shows a saved sector scan instantly with no pipeline call — the
  //       caller re-verifies freshness separately and re-runs if stale
  // returns: nothing (updates hook state)
  function loadSaved(name: string, savedData: ReportData) {
    setSector(name);
    setData(savedData);
    setProgress(null);
    setError(null);
    setStatus("done");
  }

  return { sector, data, status, progress, error, run, loadSaved };
}
