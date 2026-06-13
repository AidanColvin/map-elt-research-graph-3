"use client";

import { useEffect, useRef, useState } from "react";
import MarkdownArticle from "@/app/components/MarkdownArticle";
import CompanyLogo from "@/app/components/CompanyLogo";
import { CompanyActionBar } from "./ActionBar";
import type { DeepDiveState } from "./useDeepDive";
import type { SavedReportsState } from "./useSavedReports";
import { SavedStrip, SaveControl, VerifyPill } from "./SavedReports";
import { savedId, fetchSignature, type SavedReport } from "@/lib/savedReports";
import { CanvasCard, Loading, FONT } from "./ui";

// The five popular companies offered as one-click starting points. Each is a
// curated name so the chip resolves to an instant report; CompanyLogo handles
// the logo fetch + monogram fallback exactly as it does elsewhere.
const POPULAR = [
  { name: "Apple", domain: "apple.com", accent: "#1d1d1f" },
  { name: "NVIDIA", domain: "nvidia.com", accent: "#76b900" },
  { name: "Microsoft", domain: "microsoft.com", accent: "#0078d4" },
  { name: "Alphabet", domain: "abc.xyz", accent: "#4285f4" },
  { name: "Amazon", domain: "amazon.com", accent: "#ff9900" },
];

// Sample-card leadership. These are Apple's current named executives, taken
// from the curated registry (Tim Cook, Kevan Parekh, Sabih Khan) rather than
// long-departed officers, so the illustrative card stays accurate.
const SAMPLE_LEADERS = [
  { name: "Tim Cook", initials: "TC", color: "#1d1d1f" },
  { name: "Kevan Parekh", initials: "KP", color: "#5b6cff" },
  { name: "Sabih Khan", initials: "SK", color: "#8a5cf6" },
];

// takes: a small caps eyebrow string
// does: renders the shared 11px tracked-uppercase label used across the hero
// returns: a styled label element
function Eyebrow({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <p
      style={{
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        color: "#9a9aa2",
        margin: 0,
        fontFamily: FONT,
        ...style,
      }}
    >
      {children}
    </p>
  );
}

// takes: the lifted draft value/onChange, the run handler, and busy flag
// does: renders the Company Profile pre-search hero — a split layout with the
//       headline, subtext, the existing search bar, and popular company chips
//       on the left, and a static illustrative "sample output" preview card on
//       the right. Stacks vertically below 768px.
// returns: the idle-state hero element
function CompanyHero({
  draft,
  onDraftChange,
  onRun,
  busy,
  savedItems,
  onOpenSaved,
  onRemoveSaved,
}: {
  draft: string;
  onDraftChange: (v: string) => void;
  onRun: (name: string) => void;
  busy: boolean;
  savedItems: SavedReport[];
  onOpenSaved: (r: SavedReport) => void;
  onRemoveSaved: (id: string) => void;
}) {
  return (
    <div
      className="flex flex-col md:flex-row gap-8 md:gap-10"
      style={{ padding: "28px 28px 40px", fontFamily: FONT }}
    >
      {/* ── Left panel (~60%) ── */}
      <div className="md:w-3/5">
        <Eyebrow>Company Deep Dive</Eyebrow>
        <h1
          style={{
            fontSize: 38,
            lineHeight: 1.08,
            fontWeight: 700,
            letterSpacing: "-0.025em",
            color: "#1d1d1f",
            margin: "14px 0 0",
          }}
        >
          Every public company,
          <br />
          board-ready in seconds.
        </h1>
        <p
          style={{
            fontSize: 15.5,
            lineHeight: 1.55,
            color: "#6b6b73",
            margin: "16px 0 0",
            maxWidth: 460,
          }}
        >
          Financials, strategy, leadership and risk — assembled live from the
          company&apos;s own SEC filings.
        </p>

        {/* The existing search input, repositioned into the hero. Same handler. */}
        <div style={{ margin: "22px 0 0", marginLeft: -24 }}>
          <CompanyActionBar value={draft} onChange={onDraftChange} onRun={onRun} busy={busy} />
        </div>

        <Eyebrow style={{ margin: "10px 0 12px" }}>Popular</Eyebrow>
        <div className="flex flex-wrap gap-2.5">
          {POPULAR.map((c) => (
            <button
              key={c.name}
              onClick={() => {
                onDraftChange(c.name);
                onRun(c.name);
              }}
              className="flex items-center gap-2 rounded-full bg-white/80 border border-black/[0.06] hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-pointer [&_.company-logo]:w-[22px] [&_.company-logo]:h-[22px] [&_.company-logo]:rounded-md [&_.company-logo]:shadow-none [&_.company-logo_img]:p-[2px] [&_.company-logo.monogram]:text-[11px]"
              style={{ padding: "5px 13px 5px 7px" }}
            >
              <CompanyLogo name={c.name} domain={c.domain} accent={c.accent} />
              <span style={{ fontSize: 13.5, fontWeight: 500, color: "#1d1d1f" }}>{c.name}</span>
            </button>
          ))}
        </div>

        {savedItems.length > 0 && (
          <div style={{ marginTop: 26 }}>
            <SavedStrip
              items={savedItems}
              onOpen={onOpenSaved}
              onRemove={onRemoveSaved}
              label="Saved profiles"
            />
          </div>
        )}
      </div>

      {/* ── Right panel (~40%) — lavender sample-output card ── */}
      <div className="md:w-2/5">
        <div style={{ background: "#efecfb", borderRadius: 22, padding: 18 }}>
          <Eyebrow style={{ color: "#8b80c4", marginBottom: 12 }}>Sample Output</Eyebrow>
          <div
            style={{
              background: "#fff",
              borderRadius: 16,
              padding: 18,
              boxShadow: "0 8px 28px rgba(60,40,120,0.08)",
            }}
          >
            <Eyebrow style={{ marginBottom: 10 }}>Curated Deep Dive</Eyebrow>
            <div className="flex items-center gap-2.5 [&_.company-logo]:w-[30px] [&_.company-logo]:h-[30px] [&_.company-logo]:rounded-lg [&_.company-logo]:shadow-none [&_.company-logo_img]:p-[3px] [&_.company-logo.monogram]:text-[14px]" style={{ marginBottom: 14 }}>
              <CompanyLogo name="Apple" domain="apple.com" accent="#1d1d1f" />
              <span style={{ fontSize: 22, fontWeight: 700, color: "#1d1d1f", letterSpacing: "-0.02em" }}>
                Apple
              </span>
            </div>

            {/* Three stat tiles — Apple FY2025, from the curated registry. */}
            <div className="grid grid-cols-3 gap-2" style={{ marginBottom: 16 }}>
              {[
                { v: "$416B", l: "Revenue" },
                { v: "$112B", l: "Net Inc." },
                { v: "47%", l: "Margin" },
              ].map((s) => (
                <div
                  key={s.l}
                  style={{ background: "#f6f6f8", borderRadius: 10, padding: "10px 8px", textAlign: "center" }}
                >
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#1d1d1f" }}>{s.v}</div>
                  <div
                    style={{
                      fontSize: 9,
                      fontWeight: 600,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: "#a0a0a8",
                      marginTop: 2,
                    }}
                  >
                    {s.l}
                  </div>
                </div>
              ))}
            </div>

            <Eyebrow style={{ fontSize: 9.5, marginBottom: 6 }}>Revenue vs Net Income · 5Y</Eyebrow>
            {/* Static, illustrative trend — no data fetch. */}
            <svg viewBox="0 0 240 64" width="100%" height="56" style={{ marginBottom: 16 }} aria-hidden>
              <polyline
                points="4,52 62,44 120,34 178,22 236,8"
                fill="none"
                stroke="#5b6cff"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <polyline
                points="4,58 62,55 120,50 178,46 236,40"
                fill="none"
                stroke="#c7cdf7"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {[
                [4, 52],
                [62, 44],
                [120, 34],
                [178, 22],
                [236, 8],
              ].map(([cx, cy]) => (
                <circle key={`${cx}`} cx={cx} cy={cy} r="2.6" fill="#5b6cff" />
              ))}
            </svg>

            <Eyebrow style={{ marginBottom: 10 }}>Leadership</Eyebrow>
            <div className="flex gap-4">
              {SAMPLE_LEADERS.map((p) => (
                <div key={p.name} className="flex flex-col items-center" style={{ width: 60 }}>
                  <div
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: "50%",
                      background: p.color,
                      color: "#fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 13,
                      fontWeight: 600,
                    }}
                  >
                    {p.initials}
                  </div>
                  <div
                    style={{
                      fontSize: 10.5,
                      color: "#6b6b73",
                      textAlign: "center",
                      marginTop: 6,
                      lineHeight: 1.2,
                    }}
                  >
                    {p.name}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// takes: the useDeepDive hook state plus the lifted draft value/onChange
// does: renders the Company Profile module — its command bar pinned at the
//       top, then empty glyph, standardized loading row, or the streamed
//       report under the company's name
// returns: the company canvas card element
export default function CompanyCanvas({
  dive,
  draft,
  onDraftChange,
  saved,
}: {
  dive: DeepDiveState;
  draft: string;
  onDraftChange: (v: string) => void;
  saved: SavedReportsState;
}) {
  // The H1 is replaced by the card's own title row, like every other module.
  const body = dive.markdown.replace(/^#\s+.*\n?/, "");
  const busy = dive.status === "loading" || dive.status === "streaming";

  const companyItems = saved.saved.filter((r) => r.kind === "company");
  const [verifyNote, setVerifyNote] = useState("");
  // When a reopened-but-stale report is regenerating, remember the subject so
  // the fresh stream can be re-saved the moment it finishes.
  const resaveRef = useRef<{ query: string; sig: string } | null>(null);

  // takes: a saved company report
  // does: shows the saved copy instantly, then re-verifies it against the
  //       latest SEC signature — if the source has new filings it regenerates
  //       live; otherwise it just bumps the "verified" time. Never serves a
  //       stale report silently.
  async function openSaved(r: SavedReport) {
    onDraftChange(r.query);
    dive.loadSaved(r.query, r.content);
    setVerifyNote("Checking for updates…");
    const sig = await fetchSignature("company", r.query);
    if (sig && r.sig && sig !== r.sig) {
      setVerifyNote("New filings found — refreshing…");
      resaveRef.current = { query: r.query, sig };
      dive.run(r.query);
    } else {
      setVerifyNote("Verified current");
      await saved.save({ ...r, verifiedAt: Date.now() });
      window.setTimeout(() => setVerifyNote(""), 2600);
    }
  }

  // After a staleness-triggered regeneration finishes streaming, persist the
  // fresh content + signature over the saved copy.
  useEffect(() => {
    const pending = resaveRef.current;
    if (dive.status === "done" && pending && pending.query === dive.company) {
      resaveRef.current = null;
      const now = Date.now();
      saved
        .save({
          id: savedId("company", pending.query),
          kind: "company",
          query: pending.query,
          title: pending.query,
          content: dive.markdown,
          sig: pending.sig,
          savedAt: now,
          verifiedAt: now,
        })
        .finally(() => {
          setVerifyNote("Updated to latest");
          window.setTimeout(() => setVerifyNote(""), 2600);
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dive.status, dive.company]);

  const showReport =
    dive.status === "streaming" || dive.status === "done" || dive.status === "error";

  return (
    <CanvasCard
      title="Company Profile"
      // In the idle hero the search lives inside the hero itself, so the pinned
      // top toolbar is omitted; every other state keeps it.
      toolbar={
        dive.status === "idle" ? undefined : (
          <CompanyActionBar value={draft} onChange={onDraftChange} onRun={dive.run} busy={busy} />
        )
      }
    >
      {dive.status === "idle" && (
        <CompanyHero
          draft={draft}
          onDraftChange={onDraftChange}
          onRun={dive.run}
          busy={busy}
          savedItems={companyItems}
          onOpenSaved={openSaved}
          onRemoveSaved={saved.remove}
        />
      )}
      {dive.status === "loading" && <Loading label={`Gathering public data on ${dive.company}…`} />}
      {showReport && (
        <div style={{ padding: "24px 28px 36px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
              margin: "0 0 6px",
            }}
          >
            <h2
              style={{
                fontFamily: FONT,
                fontSize: 26,
                fontWeight: 700,
                letterSpacing: "-0.02em",
                margin: 0,
                color: "#1d1d1f",
              }}
            >
              {dive.company}
            </h2>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <VerifyPill note={verifyNote} />
              {dive.status === "done" && dive.markdown.length > 200 && (
                <SaveControl
                  saved={saved}
                  kind="company"
                  query={dive.company}
                  title={dive.company}
                  getContent={() => dive.markdown}
                />
              )}
            </div>
          </div>
          <div className={`workspace-md ${dive.status === "streaming" ? "streaming" : ""}`}>
            <MarkdownArticle markdown={body} />
            {dive.status === "streaming" && <span className="cursor" />}
          </div>
        </div>
      )}
    </CanvasCard>
  );
}
