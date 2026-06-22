import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { join } from 'path';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const OUT = join(process.cwd(), 'screenshots');
mkdirSync(OUT, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const errors = [];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await page.emulateMedia({ reducedMotion: 'reduce' });

page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

// Belt-and-suspenders: freeze every CSS animation/transition so frames are stable
await page.addInitScript(() => {
  const s = document.createElement('style');
  s.textContent = '*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition-duration:0s!important;transition-delay:0s!important;}';
  document.documentElement.appendChild(s);
});

// domcontentloaded (NOT networkidle — the app streams, so networkidle can hang)
await page.goto(`${BASE}/?screenshot=1`, { waitUntil: 'domcontentloaded' });

// If the dashboard isn't the default view, click its nav (no-op if absent)
const nav = page.getByRole('button', { name: /dashboard/i });
if (await nav.count()) await nav.first().click();

// Wait on REAL content — the NetworkGraph canvas — not a timer
await page.waitForSelector('canvas', { timeout: 15000 });
await page.evaluate(() => document.fonts?.ready);

await page.screenshot({ path: join(OUT, `dashboard-${stamp}.png`), fullPage: true });

const graph = page.locator('canvas').first();
if (await graph.count()) await graph.screenshot({ path: join(OUT, `network-graph-${stamp}.png`) });

await browser.close();

if (errors.length) {
  console.error(`\n✗ ${errors.length} console error(s):`);
  errors.forEach((e) => console.error('  -', e));
  process.exit(1);
}
console.log(`\n✓ Screenshots in screenshots/  (suffix ${stamp})`);
