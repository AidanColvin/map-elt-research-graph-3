"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ReactNode } from "react";
import Chart from "./Charts";
import { safeUrl } from "@/lib/markdownSafe";

/**
 * given any react children
 * return their concatenated plain-text content
 */
function toText(node: ReactNode): string {
  if (node == null || node === false) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(toText).join("");
  if (typeof node === "object" && "props" in (node as any)) {
    return toText((node as any).props?.children);
  }
  return "";
}

/**
 * given heading text
 * return a url-safe slug used as the heading id (for the table of contents)
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\w]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * given the (possibly incomplete) text of a ```chart code block while it is
 * still streaming, sniff its declared chart type so the placeholder can reserve
 * the exact aspect ratio the finished chart will occupy. defaults to "bar".
 */
function sniffChartType(raw: string): string {
  const m = raw.match(/"type"\s*:\s*"(\w+)"/);
  return m ? m[1] : "bar";
}

/**
 * given a chart type
 * return the width/height the matching <Chart> renders at, so the streaming
 * placeholder can reserve the identical box and the page never jumps when the
 * real chart replaces it. dimensions mirror the viewBoxes in Charts.tsx.
 */
function chartBox(type: string): { w: number; h: number } {
  switch (type) {
    case "pie":
    case "donut":
      return { w: 220, h: 220 };
    case "hierarchy":
    case "tree":
      return { w: 620, h: 240 };
    default: // line, bar
      return { w: 620, h: 300 };
  }
}

/**
 * renders a markdown report string with anchored headings and GFM tables
 */
export default function MarkdownArticle({ markdown }: { markdown: string }) {
  return (
    <article className="report">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        // Defense-in-depth: drop any non-http(s)/mailto/anchor URL so a poisoned
        // link in parsed source text can never become a javascript:/data: sink.
        urlTransform={safeUrl}
        components={{
          h2: ({ children }) => <h2 id={slugify(toText(children))}>{children}</h2>,
          h3: ({ children }) => <h3 id={slugify(toText(children))}>{children}</h3>,
          table: ({ children }) => (
            <div className="table-wrap">
              <table>{children}</table>
            </div>
          ),
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
          // unwrap <pre> so chart blocks render as block-level figures
          pre: ({ children }) => <>{children}</>,
          code: ({ className, children }) => {
            if (className && className.includes("language-chart")) {
              const raw = toText(children).trim();
              try {
                return <Chart spec={JSON.parse(raw)} />;
              } catch {
                // JSON not complete yet (still streaming). Reserve the exact box
                // the finished chart will fill so the page never jumps when it
                // resolves: use the chart's own aspect ratio as a placeholder.
                const { w, h } = chartBox(sniffChartType(raw));
                return (
                  <figure className="chart chart-skeleton">
                    <div
                      className="chart-skeleton-box"
                      style={{ aspectRatio: `${w} / ${h}` }}
                    >
                      <span className="chart-loading">Rendering chart…</span>
                    </div>
                  </figure>
                );
              }
            }
            return <code className={className}>{children}</code>;
          },
        }}
      >
        {markdown}
      </ReactMarkdown>
    </article>
  );
}
