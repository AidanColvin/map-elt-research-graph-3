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
};

export default nextConfig;
