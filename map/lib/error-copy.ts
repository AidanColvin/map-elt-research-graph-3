/**
 * Human-readable error copy.
 *
 * The engine leans on free public APIs (SEC EDGAR, OpenAlex, ClinicalTrials,
 * Wikipedia) and gives them a ~44-second concurrency budget per run. When one
 * is slow or down, users should see a calm, plain-English explanation — never a
 * raw "AbortError", HTTP code, or stack trace. These helpers centralize that
 * copy so the Sector Scan and Company Deep Dive speak with one voice.
 */

// The shared, plain-English line for when the data sources run out of time.
export const TIMEOUT_MESSAGE =
  "The public data sources (SEC EDGAR and friends) didn't answer within the 44-second window we give them. They're free, so they're occasionally slow or busy — please try again in a moment.";

// The shared line for a dropped connection or unexpected failure.
export const NETWORK_MESSAGE =
  "We couldn't reach the data sources just now. Check your connection and try again — nothing was charged or lost.";

// takes: a caught error (any shape) plus optional context for the noun used
// does: classifies it as a timeout, a network drop, or an unknown failure and
//       returns a friendly sentence — never a technical code or stack trace
// returns: a human-readable message safe to show in the UI
export function friendlyError(err: unknown, what: "report" | "scan" = "report"): string {
  const e = err as any;
  const name = e?.name || "";
  const msg = (e?.message || "").toString();

  if (name === "AbortError" || /timed?\s*out|timeout|deadline/i.test(msg)) {
    return TIMEOUT_MESSAGE;
  }
  if (/network|fetch|connection|failed to fetch/i.test(msg)) {
    return NETWORK_MESSAGE;
  }
  return `Something interrupted the ${what}. The data sources are free and sometimes flaky — please try again.`;
}

// takes: an HTTP status code from a failed engine response
// does: turns the status into a calm explanation, calling out the 44-second
//       budget for the gateway/timeout family (502/503/504)
// returns: a human-readable message safe to show in the UI
export function friendlyHttp(status: number): string {
  if (status === 504 || status === 503 || status === 502) return TIMEOUT_MESSAGE;
  if (status === 429) {
    return "The free data sources are rate-limiting us right now. Give it a minute and try again.";
  }
  return "The engine hit a snag building this. It's free and occasionally flaky — please try again.";
}
