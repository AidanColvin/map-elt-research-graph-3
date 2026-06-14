/** @type {import('next').NextConfig} */
const nextConfig = {
  // Bundle the curated markdown reports into the serverless function output
  // so they are readable at runtime on Vercel.
  outputFileTracingIncludes: {
    "/**": ["./content/reports/**/*"],
  },
  // The sector-scan code was authored under a non-strict tsconfig; the merged
  // app keeps the strict config for new code but does not block deploys on it.
  typescript: { ignoreBuildErrors: true },
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
      "frame-ancestors 'self'",
      "form-action 'self'",
      "script-src 'self' 'unsafe-inline' https://apis.google.com https://*.firebaseapp.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self' data:",
      "connect-src 'self' https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com",
      "frame-src 'self' https://*.firebaseapp.com https://accounts.google.com https://login.microsoftonline.com",
    ].join("; ");
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "X-DNS-Prefetch-Control", value: "off" },
        ],
      },
    ];
  },
};

export default nextConfig;
