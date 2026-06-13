// One-off production verification: drives the PUBLIC site end-to-end.
// Signs in as guest, runs an Oncology sector scan, confirms a report renders.
// Run: node tests/e2e/prod-smoke.mjs
import { chromium } from '@playwright/test';

const BASE = process.env.PROD_BASE || 'https://map-omega-azure.vercel.app';

const browser = await chromium.launch();
const page = await browser.newPage();
const steps = [];
const ok = (m) => { steps.push(`PASS ${m}`); console.log(`PASS ${m}`); };
const fail = (m) => { steps.push(`FAIL ${m}`); console.error(`FAIL ${m}`); };

try {
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 45000 });
  const guest = page.getByRole('button', { name: /continue as guest/i });
  const nav = page.locator('nav').first();
  await Promise.race([
    guest.waitFor({ state: 'visible', timeout: 30000 }).catch(() => {}),
    nav.waitFor({ state: 'visible', timeout: 30000 }).catch(() => {}),
  ]);
  if (await guest.isVisible().catch(() => false)) await guest.click();
  await nav.waitFor({ state: 'visible', timeout: 20000 });
  ok('signed in (guest) and workspace nav rendered');

  await page.locator('text=Sector Scan').first().click();
  await page.waitForTimeout(1000);
  const input = page.locator('input[aria-label="Sector"]:visible').first();
  await input.fill('Oncology');
  await input.press('Enter');
  ok('submitted Oncology sector scan');

  await page.waitForFunction(
    () => {
      const t = document.body.innerText;
      if (/Pipeline failed/i.test(t)) throw new Error('Pipeline failed on prod');
      return t.includes('PARTNERSHIP INTELLIGENCE REPORT') || t.includes('Summary');
    },
    { timeout: 110000 },
  );
  const text = await page.locator('body').innerText();
  if (text.length > 1000 && text.includes('Oncology')) ok(`report rendered (${text.length} chars)`);
  else fail('report too short or missing sector');

  const signals = ['Deal track record', 'Potential UNC contacts', 'IP portfolio', 'Partnership language']
    .filter((s) => text.includes(s));
  console.log(`signals present: ${signals.length ? signals.join(', ') : '(none — data-dependent, OK)'}`);

  await page.screenshot({ path: 'test-results/prod-oncology.png', fullPage: false });
  ok('screenshot saved to test-results/prod-oncology.png');
} catch (e) {
  fail(`exception: ${e.message}`);
} finally {
  await browser.close();
  const failed = steps.some((s) => s.startsWith('FAIL'));
  console.log(`\n=== PROD VERIFY ${failed ? 'FAILED' : 'OK'} ===`);
  process.exit(failed ? 1 : 0);
}
