// Comprehensive LIVE browser walkthrough of the public site — clicks through
// every interface a user would touch and asserts each renders/works.
// Run: PROD_BASE=https://map-omega-azure.vercel.app node tests/e2e/live-full.mjs
import { chromium } from '@playwright/test';

const BASE = process.env.PROD_BASE || 'https://map-omega-azure.vercel.app';
const results = [];
const check = async (name, fn) => {
  try { await fn(); results.push([true, name]); console.log(`PASS  ${name}`); }
  catch (e) { results.push([false, name]); console.error(`FAIL  ${name} :: ${e.message}`); }
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1320, height: 950 } });
const view = () => page.locator('.ws-view:visible');

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

async function awaitReport(sentinels, timeout = 110000) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const state = await page.waitForFunction(
      (ss) => {
        const t = document.body.innerText;
        if (/Pipeline failed/i.test(t)) return 'failed';
        return ss.some((s) => t.includes(s)) ? 'ready' : false;
      }, sentinels, { timeout },
    ).then((h) => h.jsonValue());
    if (state === 'ready') return;
    if (attempt === 0) await page.locator('button:has-text("Scan")').first().click();
  }
  throw new Error('scan kept failing');
}

try {
  await check('guest sign-in + nav', signInGuest);

  await check('dashboard hero + 5 deep-dive logos load', async () => {
    await page.locator('text="Dashboard"').first().click();
    await page.waitForTimeout(2000);
    const b = await page.locator('body').innerText();
    for (const s of ['partnership', 'CURATED DEEP DIVES', 'TRENDING SECTORS']) if (!b.includes(s)) throw new Error(`missing ${s}`);
    const logos = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('.ws-view').forEach((v) => { if (v.offsetParent) v.querySelectorAll('.company-logo img').forEach((i) => out.push(i.complete && i.naturalWidth > 0)); });
      return out;
    });
    if (logos.length < 5 || logos.some((x) => !x)) throw new Error(`logos: ${JSON.stringify(logos)}`);
  });

  await check('nav: all five tabs reachable (incl. Partnerships link)', async () => {
    for (const label of ['Company Profile', 'Sector Scan', 'Companies', 'Dashboard']) {
      await page.locator(`text="${label}"`).first().click();
      await page.waitForTimeout(800);
    }
    await page.locator('nav').getByText('Partnerships', { exact: true }).first().waitFor({ state: 'visible' });
  });

  await check('company deep dive: chip -> report + export buttons + Save to Project', async () => {
    await page.locator('text="Company Profile"').first().click();
    await page.waitForTimeout(1200);
    await view().locator('button:has-text("Apple")').first().click();
    await view().locator('button:has-text("Download PDF")').first().waitFor({ state: 'visible', timeout: 40000 });
    for (const b of ['Download PDF', 'Download DOCX', 'Markdown', 'Save to Project'])
      if (!(await view().locator(`button:has-text("${b}")`).first().isVisible())) throw new Error(`missing ${b}`);
    // Markdown export downloads.
    const [dl] = await Promise.all([
      page.waitForEvent('download', { timeout: 15000 }),
      view().locator('button:has-text("Markdown")').first().click(),
    ]);
    if (!/\.md$/.test(dl.suggestedFilename())) throw new Error('md download name');
    // Save-to-Project modal opens + submits.
    await view().locator('button:has-text("Save to Project")').first().click();
    await page.getByRole('button', { name: /new project/i }).first().click();
    const dialog = page.getByRole('dialog', { name: /create project/i });
    await dialog.waitFor({ state: 'visible', timeout: 5000 });
    await dialog.getByLabel('Project name').fill('Live Check');
    await dialog.getByRole('button', { name: /create & save/i }).click();
    await dialog.waitFor({ state: 'hidden', timeout: 5000 });
  });

  await check('sector scan: Oncology -> report', async () => {
    await page.locator('text="Sector Scan"').first().click();
    await page.waitForTimeout(800);
    const input = page.locator('input[aria-label="Sector"]:visible').first();
    await input.fill('Oncology');
    await input.press('Enter');
    await awaitReport(['PARTNERSHIP INTELLIGENCE REPORT', 'Summary']);
  });

  await check('companies table + downloads', async () => {
    await page.locator('text="Companies"').first().click();
    await page.waitForTimeout(2000);
    await view().locator('table').first().waitFor({ state: 'visible', timeout: 10000 });
    await view().locator('button:has-text("Excel"), button:has-text("PDF"), button:has-text("Download")').first().waitFor({ state: 'visible', timeout: 5000 });
  });

  await check('partnerships: nav -> Company search Apple -> 3 cards (no intro replay)', async () => {
    await page.locator('nav').getByText('Partnerships', { exact: true }).first().click();
    await page.getByLabel('Partnership search').waitFor({ state: 'visible', timeout: 15000 });
    const body = await page.locator('body').innerText();
    if (body.includes('Click to skip') || body.includes('MAPPING ARCHITECTURE PLATFORM'))
      throw new Error('intro splash replayed on Partnerships navigation');
    await page.getByRole('tab', { name: /company/i }).click();
    await page.getByLabel('Partnership search').fill('Apple');
    await page.getByRole('button', { name: /^Search$/ }).click();
    await page.getByTestId('results-canvas').waitFor({ state: 'visible', timeout: 90000 });
    for (const t of ['card-clinical', 'card-financial', 'card-ecosystem'])
      if (!(await page.getByTestId(t).isVisible())) throw new Error(`missing ${t}`);
  });

  await check('partnerships: Sector toggle search renders cards', async () => {
    await page.getByRole('tab', { name: /sector/i }).click();
    await page.getByLabel('Partnership search').fill('Gene Therapy');
    await page.getByRole('button', { name: /^Search$/ }).click();
    await page.getByTestId('results-canvas').waitFor({ state: 'visible', timeout: 90000 });
  });

  await page.screenshot({ path: 'test-results/live-full.png' });
} catch (e) {
  console.error(`UNCAUGHT: ${e.message}`);
  results.push([false, `uncaught: ${e.message}`]);
} finally {
  await browser.close();
  const passed = results.filter(([ok]) => ok).length;
  const failed = results.filter(([ok]) => !ok);
  console.log(`\n=== LIVE FULL: ${passed}/${results.length} passed ===`);
  if (failed.length) { failed.forEach(([, n]) => console.log(`  FAILED: ${n}`)); process.exit(1); }
  console.log('All live public-site interfaces work.');
}
