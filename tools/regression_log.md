# Homepage redesign — regression log

Harness note: the in-app browser pane proved unreliable for this work — it keeps
the page in a `document.hidden` state, which throttles interval timers and stops
CSS animations from advancing, so animated surfaces cannot be observed at real
speed. Verification therefore runs through **headed Chromium via Playwright**
(`map/scripts/verify_home.mjs`), which opens a genuinely visible window. The
script lives under `map/scripts/` rather than `tools/` because that is where
Node resolves the repo's Playwright install.

Known pre-existing console noise, filtered by the script and by the repo's own
e2e suite (`map/tests/e2e/sector-package.spec.ts:155`): company logos load from
Google's favicon service, which redirects to `gstatic.com` — a host the CSP does
not allow. Present before this work; unrelated to it.

---

## Tier 1 — cosmetics (tokens, hero copy, demo panel, footer, copy sweep)

Run against the production build on `http://localhost:3010`.

| # | Check | Result |
|---|---|---|
| 1 | Typecheck (`tsc --noEmit`) | pass — clean |
| 2 | Production build (`next build`) | pass — `/privacy` route registered |
| 3 | H1 text unchanged | pass — "Research, written for you." |
| 4 | New subheadline renders | pass |
| 5 | Button label | pass — "Generate report" |
| 6 | Demo panel assembles all 4 source lines | pass — all at opacity 1, overview fully typed (167 chars) |
| 7 | Format chips appear | pass |
| 8 | Placeholder cycles and stays visible | pass — advanced to `Try "oncology"`, opacity 1 |
| 9 | Footer renders with real sources + links | pass |
| 10 | Console errors (excluding known noise) | pass — none |
| 11 | Viewports 390 / 768 / 1440 | pass — no horizontal scroll; footer wraps on mobile |

### Bugs found and fixed during Tier 1

1. **Demo panel froze in background pages.** A `visibilitychange` handler was
   conflated with viewport intersection, so the panel stopped permanently.
   Removed — browsers already throttle interval timers in hidden documents.
2. **Placeholder stuck invisible.** The crossfade relied on a CSS animation to
   reach its end state, so it rendered at `opacity: 0` whenever animations did
   not advance. Rewritten as state-driven opacity, which always resolves visible.
3. **Demo panel failed closed.** `onScreen` started `false`, so if
   IntersectionObserver never reported, the panel sat permanently blank. Now
   starts `true` and the observer only ever pauses it.
4. **Both search bars showed a focus ring at once.** A single `focused` boolean
   was shared by the hero bar and the closing CTA bar. Replaced with a
   `focusedBar` discriminator.

---

## Tier 1 amendment — one search bar, real demo data

| # | Check | Result |
|---|---|---|
| 1 | Exactly one search input on the homepage | pass |
| 2 | At most one focus ring ever visible | pass |
| 3 | Typing does not steal focus (4 chars, 60ms apart) | pass |
| 4 | Closing CTA returns focus to the one field | pass |
| 5 | "Pfizer" from that field routes to Companies | pass |
| 6 | "oncology" from that field routes to Sectors | pass |
| 7 | Demo panel still assembles, console clean | pass |

Demo data provenance: a real Pfizer company report was generated through the
app (guest path, production build) on 2026-08-08 and every value in
`pfizerDemoData.ts` was taken from that output unedited. No number is invented,
so no line needed the qualitative fallback.

That run also corrected two misrepresentations in the first draft of the panel:

- A **company** report cites SEC EDGAR and OpenAlex. It does not cite PubMed,
  ClinicalTrials.gov, or NIH RePORTER — those feed sector scans and the
  partnership views. Those three chips were removed.
- A company report offers **PDF, Word (DOCX), and Markdown**. There is no Excel
  export on that report type; the Excel chip was removed.

### Bugs found and fixed during the amendment

5. **Search bar remounted on every render.** Rewriting the hero to render
   `<SearchBar />` (JSX) instead of calling `{SearchBar()}` gave React a new
   component identity each render, remounting the input and dropping focus —
   the exact failure the original code carried a comment warning about.
   Restored the function call and added a typing-focus regression check.

### Still outstanding at end of Tier 1

- Mobile nav overflows (tabs clipped past ~390px). Pre-existing; Tier 3 addresses it.
- Lighthouse was not run — no Lighthouse tooling available in this environment.
  Accessibility was checked manually instead (contrast, focus rings, keyboard).
