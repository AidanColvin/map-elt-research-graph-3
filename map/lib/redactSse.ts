/**
 * redactSse.ts
 * Applying the JSON name-redactor to a single Server-Sent Events frame.
 *
 * The streaming sector route emits SSE frames like `data: {...}\n\n`. The final
 * frame carries the same report body the non-streaming route returns, so it
 * carries the same investigator names — and must be stripped the same way for an
 * unapproved caller. This parses the JSON out of one frame, runs it through
 * `redactPeople`, and re-emits the frame; anything that is not parseable JSON
 * (progress pings, comments) passes through unchanged.
 */
import { redactPeople } from "./redactPeople";

// takes: one raw SSE frame (may span several `data:` lines)
// does: redacts investigator names from its JSON payload, leaving non-JSON
//       frames untouched
// returns: the frame text, safe to forward to an unapproved caller
export function redactSseFrame(frame: string): string {
  const lines = frame.split("\n");
  const dataLines = lines.filter((l) => l.startsWith("data:"));
  if (dataLines.length === 0) return frame;

  // SSE joins multiple `data:` lines with newlines to form one payload.
  const payload = dataLines.map((l) => l.slice(5).trimStart()).join("\n");
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    // Not JSON (e.g. a heartbeat) — nothing to redact.
    return frame;
  }

  const safe = JSON.stringify(redactPeople(parsed, false));
  // Rebuild the frame, preserving any non-data lines (event:, id:, retry:).
  const preserved = lines.filter((l) => !l.startsWith("data:"));
  const rebuilt = [...preserved, `data: ${safe}`].filter(Boolean);
  return rebuilt.join("\n");
}
