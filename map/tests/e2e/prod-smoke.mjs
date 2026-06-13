// Production verification: drives the PUBLIC site the way a real user would.
// Covers dashboard, navigation, company-profile (chips + manual search),
// multiple sector scans, the companies table + downloads, and report
// persistence across navigation. Run: node tests/e2e/prod-smoke.mjs
import { chromium } from '@playwright/test';

const BASE = process.env.PROD_BASE || 'https://map-omega-azure.vercel.app';
const results = [];
const check = async (name, fn) => {
  try { await fn(); results.push([true, name]); console.log(`PASS  ${name}`); }
  catch (e) { results.push([false, name]); console.error(`FAIL  ${name} :: ${e.message}`); }
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on('pageerror', (e) => console.error(`  [pageerror] ${e.message}`));

const visibleView = () => page.locator('.ws-view:visible');

async function signInGuest() {
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 45000 });
  const guest = page.getByRole('button', { name: /continue as guest/i });
  const nav = page.locator('nav').first();
  await Promise.race([
    guest.waitFor({ state: 'visible', timeout: 30000 }).catch(() => {}),
    nav.waitFor({ state: 'visible', timeout: 30000 }).catch(() => {}),
  ]);
  if (await guest.isVisible().catch(() => false)) await guest.click();
  await nav.waitFor({ state: 'visible', timeout: 20000 });
}

// Tolerate a one-off cold-start 502 on the heavier scans, like the spec suite.
async function runScanAwaitReport(sector, sentinels) {
  await page.locator('text=Sector Scan').first().click();
  await page.waitForTimeout(800);
  const input = page.locator('input[aria-label="Sector"]:visible').first();
  await input.fill(sector);
  await input.press('Enter');
  for (let attempt = 0; attempt < 2; attempt++) {
    const state = await page.waitForFunction(
      (ss) => {
        const t = document.body.innerText;
        if (/Pipeline failed/i.test(t)) return 'failed';
        return ss.some((s) => t.includes(s)) ? 'ready' : false;
      }, sentinels, { timeout: 110000 },
    ).then((h) => h.jsonValue());
    if (state === 'ready') return;
    if (attempt === 0) await page.locator('button:has-text("Scan")').first().click();
  }
  throw new Error(`scan kept failing for ${sector}`);
}

async function clickProfileChipAndAwait(label) {
  // The app keeps generated reports mounted, so once one renders the idle-hero
  // chips are gone. Reload to reset in-memory dive state, then re-enter as guest
  // (guest mode is in-memory and does not survive a reload).
  await signInGuest();
  await page.locator('text="Company Profile"').first().click();
  await page.waitForTimeout(1200);
  const chip = visibleView().locator(`button:has-text("${label}")`).first();
  await chip.waitFor({ state: 'visible', timeout: 8000 });
  await chip.click();
  const report = visibleView().locator('article, [class*="markdown"], [class*="report"], [class*="Report"]').first();
  await report.waitFor({ state: 'visible', timeout: 30000 });
  const txt = await report.innerText();
  if (txt.length < 500) throw new Error(`${label} report too short (${txt.length})`);
}

try {
  // 1. Auth + dashboard
  await check('guest sign-in + workspace nav', signInGuest);
  await check('dashboard hero content', async () => {
    const b = await page.locator('body').innerText();
    for (const s of ['partnership', 'Map it', 'Deep dive', 'TRENDING SECTORS'])
      if (!b.includes(s)) throw new Error(`missing "${s}"`);
  });

  // 2. Quick-try chip prefills search
  await check('quick-try chip prefills search', async () => {
    await page.locator('button', { hasText: /^Apple$/ }).first().click();
    await page.locator('input[placeholder="Company, ticker, or sector..."]')
      .waitFor({ state: 'visible', timeout: 5000 });
    const v = await page.locator('input[placeholder="Company, ticker, or sector..."]').inputValue();
    if (v !== 'Apple') throw new Error(`expected "Apple", got "${v}"`);
  });

  // 3. All nav tabs load without the Next not-found page
  await check('all nav tabs load (no 404 / app error)', async () => {
    for (const label of ['Dashboard', 'Company Profile', 'Sector Scan', 'Companies']) {
      await page.locator(`text="${label}"`).first().click();
      await page.waitForTimeout(1200);
      const b = await page.locator('body').innerText();
      if (b.includes('This page could not be found') || b.includes('Application error'))
        throw new Error(`error page on ${label}`);
    }
  });

  // 4. Company Profile idle hero + chips
  await check('company profile idle hero + chips', async () => {
    await page.locator('text="Company Profile"').first().click();
    await page.waitForTimeout(1200);
    const b = await page.locator('body').innerText();
    for (const s of ['board-ready', 'SEC filings', 'Apple', 'NVIDIA', 'Microsoft', 'SAMPLE OUTPUT'])
      if (!b.includes(s)) throw new Error(`missing "${s}"`);
  });

  // 5. Company Profile reports — chip clicks + manual search
  await check('Apple chip → report', () => clickProfileChipAndAwait('Apple'));
  await check('NVIDIA chip → report', () => clickProfileChipAndAwait('NVIDIA'));
  await check('manual search (Microsoft) → report', async () => {
    await signInGuest();
    await page.locator('text="Company Profile"').first().click();
    await page.waitForTimeout(1000);
    const box = visibleView().locator('input[placeholder*="company" i], input[placeholder*="ticker" i], input[placeholder*="search" i]').first();
    await box.click(); await box.fill('Microsoft');
    await visibleView().locator('button:has-text("Analyze"), button[type="submit"]').first().click();
    const report = visibleView().locator('article, [class*="markdown"], [class*="report"], [class*="Report"]').first();
    await report.waitFor({ state: 'visible', timeout: 30000 });
    if ((await report.innerText()).length < 500) throw new Error('report too short');
  });

  // 6. Report persists across nav (intended design)
  await check('report persists when returning to Company Profile', async () => {
    await page.locator('text="Dashboard"').first().click();
    await page.waitForTimeout(1000);
    await page.locator('text="Company Profile"').first().click();
    await page.waitForTimeout(1500);
    const b = await page.locator('body').innerText();
    if (!b.includes('Executive Summary')) throw new Error('prior report did not persist');
  });

  // 7. Sector scans (real pipeline) — light + heavy sectors
  await check('Oncology sector scan → report + signals', async () => {
    await runScanAwaitReport('Oncology', ['PARTNERSHIP INTELLIGENCE REPORT', 'Summary']);
    const t = await page.locator('body').innerText();
    if (!t.includes('Oncology') || t.length < 1000) throw new Error('weak Oncology report');
    const sig = ['Deal track record', 'Potential UNC contacts', 'IP portfolio', 'Partnership language'].filter((s) => t.includes(s));
    console.log(`      Oncology signals: ${sig.length ? sig.join(', ') : '(none — data-dependent)'}`);
  });
  await check('Pharmaceutical sector scan → report (heaviest)', async () => {
    await runScanAwaitReport('Pharmaceutical', ['PARTNERSHIP INTELLIGENCE REPORT', 'IP portfolio']);
    const t = await page.locator('body').innerText();
    if (t.length < 1000) throw new Error('weak Pharmaceutical report');
    const sig = ['Deal track record', 'Potential UNC contacts', 'IP portfolio', 'Partnership language'].filter((s) => t.includes(s));
    console.log(`      Pharmaceutical signals: ${sig.length ? sig.join(', ') : '(none)'}`);
  });

  // 8. Companies table + downloads
  await check('companies table + download buttons', async () => {
    await page.locator('text="Companies"').first().click();
    await page.waitForTimeout(2000);
    // Other views stay mounted-but-hidden (incl. report tables), so target the
    // table inside the currently-visible view rather than the first in the DOM.
    await visibleView().locator('table').first().waitFor({ state: 'visible', timeout: 10000 });
    await visibleView().locator('button:has-text("Excel"), button:has-text("Download"), button:has-text("PDF")')
      .first().waitFor({ state: 'visible', timeout: 5000 });
  });

  await page.screenshot({ path: 'test-results/prod-verify.png', fullPage: false });
} catch (e) {
  console.error(`UNCAUGHT: ${e.message}`);
  results.push([false, `uncaught: ${e.message}`]);
} finally {
  await browser.close();
  const passed = results.filter(([ok]) => ok).length;
  const failed = results.filter(([ok]) => !ok);
  console.log(`\n=== PROD VERIFY: ${passed}/${results.length} passed ===`);
  if (failed.length) { failed.forEach(([, n]) => console.log(`  FAILED: ${n}`)); process.exit(1); }
  console.log('All public-site user flows OK.');
}
