// Audit company logos on the live public site: which images actually load,
// which fall back to a monogram, and what each resolves to.
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

async function auditView(viewLabel) {
  if (viewLabel) { await page.locator(`text="${viewLabel}"`).first().click(); await page.waitForTimeout(2500); }
  // wait for logo images to settle
  await page.waitForTimeout(2500);
  const data = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('.ws-view').forEach((v) => {
      if (v.offsetParent === null) return; // visible view only
      v.querySelectorAll('.company-logo').forEach((el) => {
        const img = el.querySelector('img');
        const mono = el.classList.contains('monogram') || (!img && el.textContent.trim().length <= 2);
        out.push({
          mono,
          src: img ? img.getAttribute('src') : null,
          loaded: img ? (img.complete && img.naturalWidth > 0) : false,
          w: img ? img.naturalWidth : 0,
          text: el.textContent.trim().slice(0, 3),
        });
      });
    });
    return out;
  });
  return data;
}

console.log('=== DASHBOARD deep-dive logos ===');
console.log(JSON.stringify(await auditView(null), null, 0));
await page.screenshot({ path: 'test-results/audit-dashboard.png' });

console.log('\n=== COMPANY PROFILE example-grid logos ===');
const cp = await auditView('Company Profile');
console.log(`total: ${cp.length}, monograms: ${cp.filter((x) => x.mono).length}, broken(img not loaded): ${cp.filter((x) => x.src && !x.loaded).length}`);
console.log(JSON.stringify(cp, null, 0));
await page.screenshot({ path: 'test-results/audit-company-profile.png', fullPage: true });

await browser.close();
