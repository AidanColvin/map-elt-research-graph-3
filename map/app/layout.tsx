import type { Metadata } from "next";
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
    "Free, source-grounded intelligence reports. Company deep dives from SEC EDGAR and sector scans mapping public companies to UNC Chapel Hill research. No API keys, no cost.",
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
