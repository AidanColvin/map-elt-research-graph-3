import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { join } from 'path';

// Configurable so the same harness captures baseline vs after, desktop vs
// mobile, and any partnership query without code edits:
//   SHOOT_DIR    output folder (default screenshots/)
//   SHOOT_W      viewport width (default 1440; use 390 for the responsive check)
//   PARTNER_QUERY company to resolve on the Partnerships view (default Eli Lilly)
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const OUT = join(process.cwd(), process.env.SHOOT_DIR || 'screenshots');
const WIDTH = parseInt(process.env.SHOOT_W || '1440', 10);
const HEIGHT = parseInt(process.env.SHOOT_H || '900', 10);
const PARTNER_QUERY = process.env.PARTNER_QUERY || 'Eli Lilly';
mkdirSync(OUT, { recursive: true });
const errors = [];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 2 });
await page.emulateMedia({ reducedMotion: 'reduce' });

// Dev-server-only noise that never ships to production — not a real app error.
const isDevNoise = (s) => /webpack-hmr|ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS|_next\/static\/.*hot-update/.test(s);
page.on('console', (m) => { if (m.type() === 'error' && !isDevNoise(m.text())) errors.push(m.text()); });
page.on('pageerror', (e) => { if (!isDevNoise(String(e))) errors.push(String(e)); });

// Strip the app's CSP from HTML document responses only. The Next.js dev server
// uses eval() for HMR, but the app's CSP omits 'unsafe-eval', which blocks
// hydration entirely under dev — the canvas never mounts. Production builds
// don't eval, so this only affects the dev server we screenshot against. API
// responses are untouched, so partnership data stays live.
await page.route('**/*', async (route) => {
  if (route.request().resourceType() !== 'document') return route.fallback();
  try {
    const resp = await route.fetch();
    const headers = { ...resp.headers() };
    delete headers['content-security-policy'];
    delete headers['content-security-policy-report-only'];
    await route.fulfill({ response: resp, headers, body: await resp.body() });
  } catch {
    await route.fallback();
  }
});

// Belt-and-suspenders: freeze every CSS animation/transition so frames are stable
await page.addInitScript(() => {
  const css = '*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition-duration:0s!important;transition-delay:0s!important;}';
  const add = () => {
    const root = document.head || document.documentElement;
    if (!root) return false;
    const s = document.createElement('style');
    s.textContent = css;
    root.appendChild(s);
    return true;
  };
  // documentElement can be null at document_start — retry once the DOM exists.
  if (!add()) document.addEventListener('DOMContentLoaded', add, { once: true });
});

// ── Dashboard + network-graph hero ────────────────────────────────────────────
// domcontentloaded (NOT networkidle — the app streams, so networkidle can hang)
await page.goto(`${BASE}/?screenshot=1`, { waitUntil: 'domcontentloaded' });

const nav = page.getByRole('button', { name: /dashboard/i });
if (await nav.count()) await nav.first().click();

// Wait on REAL hydrated content — the workspace nav proves the client mounted
// (the dashboard hero is now a static rail, no canvas).
await page.getByText('Partnerships', { exact: true }).first().waitFor({ state: 'visible', timeout: 60000 });
await page.evaluate(() => document.fonts?.ready);

await page.screenshot({ path: join(OUT, `dashboard.png`), fullPage: true });

// ── Partnerships view — idle, then a real resolved company ────────────────────
// Partnerships is an in-app tab (not a route): open it from the workspace nav,
// screenshot the idle state, then drive a live lookup.
await page.getByText('Partnerships', { exact: true }).first().click();
await page.waitForSelector('input[aria-label="Partnership search"]', { state: 'visible', timeout: 60000 });
await page.evaluate(() => document.fonts?.ready);
await page.screenshot({ path: join(OUT, `partnerships-idle.png`), fullPage: true });

// Resolve a company against the live backend the dev server is proxying to.
await page.fill('input[aria-label="Partnership search"]', PARTNER_QUERY);
await page.getByRole('button', { name: /^search/i }).click();
try {
  // Live SEC/PubMed/NIH lookups are slow — give the resolver real headroom.
  await page.waitForSelector('[data-testid="results-canvas"]', { timeout: 180000 });
  // Talking points load on a second request; wait best-effort so they appear.
  await page.waitForSelector('[data-testid="talking-points-card"]', { timeout: 30000 }).catch(() => {});
  await page.waitForSelector('[data-testid="talking-point-row"]', { timeout: 30000 }).catch(() => {});
  await page.evaluate(() => document.fonts?.ready);
  await page.screenshot({ path: join(OUT, `partnerships-results.png`), fullPage: true });

  // Readable close-ups of the panels that change most across this work.
  const closeup = async (testid, name) => {
    const el = page.locator(`[data-testid="${testid}"]`).first();
    if (await el.count()) await el.scrollIntoViewIfNeeded().then(() => el.screenshot({ path: join(OUT, name) })).catch(() => {});
  };
  await closeup('talking-points-card', 'talking-points.png');
  await closeup('strategic-overlap', 'strategic-overlap.png');
  await closeup('partnership-graph', 'partnership-graph.png');
} catch (e) {
  errors.push(`partnerships results did not render for "${PARTNER_QUERY}": ${e}`);
}

await browser.close();

if (errors.length) {
  console.error(`\n✗ ${errors.length} console error(s):`);
  errors.forEach((e) => console.error('  -', e));
  process.exit(1);
}
console.log(`\n✓ Screenshots in ${OUT}  (${WIDTH}px, query "${PARTNER_QUERY}")`);
