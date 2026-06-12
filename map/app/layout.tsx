import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
