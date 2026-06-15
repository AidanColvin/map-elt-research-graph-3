import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// Inter, loaded and self-hosted by Next at build time (no runtime network, no
// cost). Exposed as the `--font-inter` CSS variable so globals.css can place it
// at the front of the sans-serif stack for an Apple-tier, consistent typeface.
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Map — Research & Company Intelligence",
  description:
    "Free, source-grounded intelligence reports. Company profiles from SEC EDGAR and sector scans mapping public companies to UNC Chapel Hill research. No API keys, no cost.",
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
  themeColor: "#f5f5f7",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
