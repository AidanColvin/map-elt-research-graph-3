"use client";

import type { ReportData } from "@/components/Report";
import { FONT } from "./ui";

// takes: a sector ReportData and an onSelect(companyName) callback
// does: renders the minimal grid of company ticker cards found by the scan;
//       clicking a card hands its company to the adjacent Deep Dive panel
// returns: the ticker-card grid element (null when the report has no profiles)
export default function TickerGrid({
  data,
  onSelect,
  active,
}: {
  data: ReportData;
  onSelect: (company: string) => void;
  active?: string;
}) {
  const profiles = data.section4_profiles ?? [];
  if (!profiles.length) return null;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
        gap: 10,
        padding: "18px 24px 6px",
      }}
    >
      {profiles.map((p) => {
        const isActive = active?.toLowerCase() === p.company_name.toLowerCase();
        return (
          <button
            key={p.company_name}
            onClick={() => onSelect(p.company_name)}
            title={`Company profile: ${p.company_name}`}
            style={{
              fontFamily: FONT,
              textAlign: "left",
              border: "none",
              borderRadius: 14,
              padding: "12px 14px",
              cursor: "pointer",
              background: isActive ? "#0a0a0a" : "rgba(0,0,0,0.04)",
              color: isActive ? "#ffffff" : "#0a0a0a",
              transition: "background .15s ease, color .15s ease, transform .15s ease",
            }}
          >
            <div style={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.3 }}>
              {p.company_name}
            </div>
            <div
              style={{
                fontSize: 11.5,
                marginTop: 3,
                color: isActive ? "rgba(255,255,255,0.7)" : "#a3a3a3",
              }}
            >
              {p.existing_unc_tie ? "UNC tie" : p.sector_tag || "View profile"} →
            </div>
          </button>
        );
      })}
    </div>
  );
}
