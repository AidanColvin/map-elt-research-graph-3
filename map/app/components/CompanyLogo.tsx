"use client";

import { useState } from "react";

/**
 * given a company name, optional web domain, and accent color
 * render the company logo, falling back through several free, keyless
 * logo/favicon services, and finally to a colored monogram so every
 * report shows something.
 */
export default function CompanyLogo({
  name,
  domain,
  accent,
}: {
  name: string;
  domain?: string;
  accent: string;
}) {
  // Clearbit's free logo API was retired, so it 404s on every request — its
  // only effect now is a wasted round-trip and a console error before the real
  // fallback. Lead with Google's favicon service, which returns a consistent
  // 128px square for any domain (no tiny 16px favicons that look broken when
  // scaled up), then DuckDuckGo as a second source, then a monogram.
  const sources = domain
    ? [
        `https://www.google.com/s2/favicons?domain=${domain}&sz=128`,
        `https://icons.duckduckgo.com/ip3/${domain}.ico`,
      ]
    : [];

  const [index, setIndex] = useState(0);
  const letter = (name.trim()[0] || "?").toUpperCase();

  if (!domain || index >= sources.length) {
    return (
      <div className="company-logo monogram" style={{ background: accent }} aria-hidden>
        {letter}
      </div>
    );
  }

  return (
    <div className="company-logo">
      <img
        src={sources[index]}
        alt={`${name} logo`}
        onError={() => setIndex((n) => n + 1)}
        loading="eager"
      />
    </div>
  );
}
