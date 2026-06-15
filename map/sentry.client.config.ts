// Sentry browser init. No-op unless NEXT_PUBLIC_SENTRY_DSN is set, so the app
// runs identically with zero overhead until error monitoring is turned on by
// adding the DSN to the environment.
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    // Keep payloads small and privacy-safe: no session replay, no PII.
    sendDefaultPii: false,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV || "development",
  });
}
