// Live click-through: confirm the fixed deep-dive cards still navigate to a
// company report when clicked, and capture the dashboard.
import { chromium } from '@playwright/test';
const BASE = process.env.PROD_BASE || 'https://map-omega-azure.vercel.app';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });

await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 45000 });
const guest = page.getByRole('button', { name: /continue as guest/i });
const nav = page.locator('nav').first();
await Promise.race([
  guest.waitFor({ state: 'visible', timeout: 30000 }).catch(() => {}),
  nav.waitFor({ state: 'visible', timeout: 30000 }).catch(() => {}),
]);
if (await guest.isVisible().catch(() => false)) await guest.click();
await nav.waitFor({ state: 'visible', timeout: 20000 });

await page.locator('text="Dashboard"').first().click();
await page.waitForTimeout(2500);
await page.screenshot({ path: 'test-results/live-dashboard.png' });

// Click the Alphabet deep-dive card (the one that was broken) → expect a report.
const card = page.locator('.ws-view:visible button:has-text("Alphabet")').first();
await card.scrollIntoViewIfNeeded();
await card.click();
const report = page.locator('.ws-view:visible article, .ws-view:visible [class*="markdown"], .ws-view:visible [class*="report"], .ws-view:visible [class*="Report"]').first();
await report.waitFor({ state: 'visible', timeout: 35000 });
const txt = await report.innerText();
console.log(`Alphabet card → report rendered: ${txt.length} chars, mentions Alphabet/Google: ${/alphabet|google/i.test(txt)}`);
await page.screenshot({ path: 'test-results/live-alphabet-report.png' });

await browser.close();
console.log('CLICK-THROUGH OK');
