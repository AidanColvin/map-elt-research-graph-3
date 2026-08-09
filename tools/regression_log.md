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

---

## Tier 2 — splash plays once, faster, with a readable caption

`map/scripts/verify_intro.mjs`, each case in a brand-new browser context so
storage starts empty.

| # | Check | Result |
|---|---|---|
| 1 | Intro plays on a first visit | pass |
| 2 | `map_seen_intro` set afterwards | pass — `"1"` |
| 3 | Second visit in same browser skips it | pass |
| 4 | Splash on screen within 900ms budget | pass — 797–811ms measured |
| 5 | Caption text | pass — "Research, written for you." |
| 6 | Caption contrast vs splash background | pass — **4.82:1** (`#6e6e73` on `#faf9f7`), clears AA 4.5:1. The previous `#bbb` did not. |
| 7 | Click-to-skip still works | pass |
| 8 | `?skipIntro=1` bypass | pass |
| 9 | `?screenshot=1` bypass | pass |
| 10 | Reduced motion: nothing animates, still hands off | pass — 0 animated nodes |
| 11 | Tier 1 home checks still green | pass |

Timing note: the splash is server-rendered, so it is painted before the bundle
hydrates and its hold timer can start. The hold now counts from navigation
rather than from the effect, so a slow load cannot stack a full hold on top of
it. Wall-clock from navigation to workspace measured ~1.0s locally; the splash's
own time on screen — the thing the budget governs — is ~800ms.

### Bug found and fixed during Tier 2

6. **Reduced motion had no effect.** The preference was read in JS, which
   returns `false` during server rendering, so all 66 nodes still animated.
   Moved the static end-state to a CSS `prefers-reduced-motion` rule, which
   applies regardless of when the client resolves the preference.

---

## Tier 3 — guest-first entry, sign-in modal, trimmed nav

`map/scripts/verify_entry.mjs`, run once with the flag on and once with it off.

| # | Check | Result |
|---|---|---|
| 1 | Guest lands in the workspace, no auth screen | pass |
| 2 | Search focused on arrival (desktop) | pass |
| 3 | Guest nav = Home, Companies, Sectors, Projects | pass |
| 4 | Partnerships / Directory absent for a guest | pass |
| 5 | Quiet "Sign in" shown, no Account pill | pass |
| 6 | Header modal carries the guest line + reason line | pass |
| 7 | Focus moves into the modal | pass |
| 8 | Escape closes it and the workspace survives | pass |
| 9 | Projects stays open to guests | pass |
| 10 | Phone (390px): tab row collapses to a menu | pass |
| 11 | Menu touch target ≥ 44px | pass — exactly 44px |
| 12 | Menu lists every guest tab | pass |
| 13 | No horizontal scroll at 390px | pass |
| 14 | **Flag off restores the original flow** | pass — full-page auth screen on arrival, all six tabs after continuing as guest |

## Part 3 — abuse and craft pass

`map/scripts/verify_abuse.mjs`

| # | Check | Result |
|---|---|---|
| 1 | Empty submit | pass — Generate stays disabled |
| 2 | `<script>alert(1)</script>` in the field | pass — echoed as inert text, no dialog, no script node |
| 3 | "asdf" | pass — warm not-found voice: "No SEC filings located — the company may be private, a subsidiary, or a foreign filer (20-F/6-K). Profile assembled from public web sources." |
| 4 | Double-click Generate | pass — 1 pipeline run, not 2 |
| 5 | Refresh mid-generation | pass — returns to a usable page |
| 6 | Reduced motion: placeholder static | pass |
| 7 | Reduced motion: demo shown complete | pass |
| 8 | Keyboard-only reach to search | pass |

## Part 3 — exports (guest path)

`map/scripts/verify_exports.mjs` — real Pfizer report, every offered format
downloaded and inspected.

| File | Size | Verdict |
|---|---|---|
| `pfizer-deep-dive.pdf` | 29,625 B | valid `%PDF-` header |
| `pfizer-deep-dive.docx` | 13,312 B | valid zip container |
| `pfizer-deep-dive.md` | 11,096 B | 14 headings, 3 source URLs, complete |

### Test bug found (not an app bug)

An earlier version of the abuse script flagged the "asdf" run as surfacing a raw
value. The regex was at fault: a case-insensitive `/NaN/` matches inside
ordinary words such as "finance" and "governance". Tightened to a word-bounded,
case-sensitive check; the app's handling was correct all along.

## Before/after captures (pre-change main vs. Tiers 1–3)

`map/scripts/shoot_viewports.mjs`, headed Chromium, full-page, 390/768/1440.
BEFORE from a worktree of pre-change `main` (6cefc11) served at :3011; AFTER
from the branch production build at :3010. Worktree removed afterwards.

Artifacts (untracked, repo root): `qa-viewports/before-{390,768,1440}.png`,
`qa-viewports/after-{390,768,1440}.png`. Both sets visually confirmed: BEFORE
shows the marketing sections, Search button, six-tab signed-in nav; AFTER shows
the guest nav, Generate report, demo panel with the real Pfizer numbers.

One harness fix while recovering this step: the script checked for the
pre-change auth screen's "Continue as guest" button immediately at
`domcontentloaded`, before hydration had rendered it, so the click never
happened and the Home selector timed out. It now waits for either the auth
screen or Home, whichever renders first.

---

### Still outstanding at end of Tier 1

- Mobile nav overflows (tabs clipped past ~390px). Pre-existing; Tier 3 addresses it.
- Lighthouse was not run — no Lighthouse tooling available in this environment.
  Accessibility was checked manually instead (contrast, focus rings, keyboard).
