/** @type {import('next').NextConfig} */
const nextConfig = {
  // Bundle the curated markdown reports into the serverless function output
  // so they are readable at runtime on Vercel.
  outputFileTracingIncludes: {
    "/**": ["./content/reports/**/*"],
  },
  // Type errors now block the build (the source is type-clean). ESLint is still
  // not a deploy gate: the legacy sector-scan code carries many style-only lint
  // warnings that would otherwise block deploys without affecting correctness.
  typescript: { ignoreBuildErrors: false },
  eslint: { ignoreDuringBuilds: true },
  // Security headers applied to every response. The CSP is intentionally
  // pragmatic: 'unsafe-inline' is required for Next's inline bootstrap and the
  // app's inline style objects, so CSP here is defense-in-depth on top of the
  // render-layer XSS guards (no raw HTML, safeUrl allowlist), not the primary
  // control. External origins cover Firebase auth and the keyless logo/avatar
  // fallback chain; all data APIs are called server-side (same-origin 'self').
  async headers() {
    const csp = [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "script-src 'self' 'unsafe-inline' https://apis.google.com https://*.firebaseapp.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://www.google.com https://icons.duckduckgo.com",
      "font-src 'self' data:",
      "connect-src 'self' https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://*.firebaseapp.com https://accounts.google.com",
      // Firebase signInWithPopup loads an invisible auth-relay iframe from the
      // Firebase authDomain (*.firebaseapp.com) plus Google's account chooser to
      // deliver the popup result back to the app. 'none' here silently breaks
      // Google/Microsoft sign-in (popup hangs, then reports "cancelled"), so the
      // OAuth helper origins must be allowed.
      "frame-src 'self' https://*.firebaseapp.com https://accounts.google.com https://apis.google.com",
    ].join("; ");
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Cache-Control", value: "no-store, max-age=0" },
          { key: "Content-Security-Policy", value: csp },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
          { key: "X-DNS-Prefetch-Control", value: "off" },
        ],
      },
    ];
  },
};

// Wrap with Sentry so server/edge errors and (when a DSN is set) source-mapped
// stack traces are captured. Source-map upload only runs when SENTRY_AUTH_TOKEN
// is present; otherwise the build proceeds normally and Sentry stays a no-op.
import { withSentryConfig } from "@sentry/nextjs";

export default withSentryConfig(nextConfig, {
  silent: true,
  disableLogger: true,
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
});
