import type { Metadata, Viewport } from "next";
import { Inter, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

// Inter, loaded and self-hosted by Next at build time (no runtime network, no
// cost). Exposed as the `--font-inter` CSS variable so globals.css can place it
// at the front of the sans-serif stack for an Apple-tier, consistent typeface.
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

// IBM Plex Mono, self-hosted the same way. The homepage uses it for tickers,
// CIKs, dollar figures, dates, citation numerals, and file extensions — the
// values a reader checks — and for nothing else.
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
  variable: "--font-plex-mono",
});

export const metadata: Metadata = {
  title: "Map — Research, written for you.",
  description:
    "Map reads the public record — SEC filings, grants, papers, trials — and writes you a cited research brief. Free, source-grounded, no API keys.",
  // Render full-screen as a home-screen web app on iOS, with a status bar that
  // blends into the light UI.
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Map",
  },
};

// Without this, iOS Safari assumes a 980px desktop canvas and shrinks the whole
// app to fit — the root cause of "tiny, unusable" rendering on iPhone/iPad.
// `viewportFit: "cover"` lets the layout extend under the notch / Dynamic
// Island; the CSS then pads content back in with env(safe-area-inset-*).
// User scaling stays enabled (no maximumScale) so pinch-zoom accessibility
// is preserved.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#faf9f7",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${plexMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
