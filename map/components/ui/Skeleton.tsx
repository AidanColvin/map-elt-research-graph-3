"use client";

export type SkeletonProps = {
  rows: number;
  height?: number;
};

// takes: a row count and an optional row height in px
// does: renders animated gray blocks for a real in-flight fetch; rows vary
//       slightly in width so the placeholder reads like settling content
// returns: the skeleton block element
export default function Skeleton({ rows, height = 16 }: SkeletonProps) {
  const widths = ["62%", "94%", "88%", "97%", "80%", "91%", "70%", "96%"];
  return (
    <div
      aria-hidden
      style={{ display: "flex", flexDirection: "column", gap: 12, padding: "24px 28px" }}
    >
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="tk-skel"
          style={{
            height: i === 0 ? height * 1.6 : height,
            width: widths[i % widths.length],
          }}
        />
      ))}
    </div>
  );
}
