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

### Still outstanding at end of Tier 1

- Mobile nav overflows (tabs clipped past ~390px). Pre-existing; Tier 3 addresses it.
- Lighthouse was not run — no Lighthouse tooling available in this environment.
  Accessibility was checked manually instead (contrast, focus rings, keyboard).
