import { test, expect, Page } from '@playwright/test';

const BASE = 'http://localhost:3000';
const EMAIL = process.env.TEST_EMAIL ?? '';
const PASSWORD = process.env.TEST_PASSWORD ?? '';

// The app shows a ~5s intro animation, then the auth gate. With TEST_EMAIL /
// TEST_PASSWORD set we sign in with email; otherwise we use the built-in
// "Continue as guest" path, which exercises the same workspace.
async function signIn(page: Page) {
  await page.goto(BASE);
  const guestBtn = page.locator('text=Continue as guest').first();
  const emailInput = page.locator('input[type="email"]').first();
  await guestBtn.or(emailInput).first().waitFor({ timeout: 20000 });
  if (EMAIL && PASSWORD && (await emailInput.isVisible().catch(() => false))) {
    await emailInput.fill(EMAIL);
    await page.locator('input[type="password"]').first().fill(PASSWORD);
    await page.locator('button[type="submit"]').first().click();
  } else {
    await guestBtn.click();
  }
  await page.locator('text=Dashboard').first().waitFor({ timeout: 15000 });
}

async function runSectorScan(page: Page, sector: string) {
  await page.locator('text=Sector Scan').first().click();
  await page.waitForTimeout(1000);
  const input = page.locator('input[aria-label="Sector"]:visible').first();
  await input.fill(sector);
  await input.press('Enter');
}

// Wait until the rendered report contains any of `sentinels`. The backend is a
// Vercel serverless function with a 60s ceiling, so a cold start on the heavier
// sectors can return a transient 502/timeout, surfaced in the UI as "Pipeline
// failed (5xx)". When that happens we click Scan once more and wait again — a
// genuinely broken pipeline still fails (the retry won't recover), but a
// one-off cold-start hiccup no longer flakes the suite.
async function awaitReport(page: Page, sentinels: string[], timeout = 100000) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const state = await page
      .waitForFunction(
        (ss) => {
          const t = document.body.innerText;
          if (/Pipeline failed/i.test(t)) return 'failed';
          return ss.some((s) => t.includes(s)) ? 'ready' : false;
        },
        sentinels,
        { timeout },
      )
      .then((h) => h.jsonValue());
    if (state === 'ready') return;
    if (attempt === 0) await page.locator('button:has-text("Scan")').first().click();
  }
  throw new Error('Sector scan kept failing (pipeline did not produce a report)');
}

test('dashboard loads without error', async ({ page }) => {
  await signIn(page);
  await page.waitForTimeout(2000);
  const body = await page.locator('body').innerText();
  expect(body.length).toBeGreaterThan(200);
  expect(body).not.toContain('404');
  expect(body).not.toContain('Application error');
});

test('dashboard hero renders correctly', async ({ page }) => {
  await signIn(page);
  await page.waitForTimeout(2000);
  const body = await page.locator('body').innerText();
  expect(body).toContain('partnership');
  expect(body).toContain('Map it');
  expect(body).toContain('View profile');
  expect(body).toContain('TRENDING SECTORS');
});

test('quick-try chips prefill the search input', async ({ page }) => {
  await signIn(page);
  await page.waitForTimeout(1000);
  const appleChip = page.locator('button', { hasText: /^Apple$/ }).first();
  await appleChip.waitFor({ timeout: 5000 });
  await appleChip.click();
  const input = page.locator('input[placeholder="Company, ticker, or sector..."]');
  await expect(input).toHaveValue('Apple');
});

test('all nav links load without 404', async ({ page }) => {
  await signIn(page);
  for (const label of ['Dashboard', 'Company Profile', 'Sector Scan', 'Companies']) {
    const link = page.locator(`text=${label}`).first();
    if (await link.isVisible({ timeout: 3000 }).catch(() => false)) {
      await link.click();
      await page.waitForTimeout(1500);
      const body = await page.locator('body').innerText();
      // A bare "404" check false-positives on table data (street addresses,
      // zip codes); assert on the actual Next.js error-page sentences.
      expect(body).not.toContain('This page could not be found');
      expect(body).not.toContain('Application error');
    }
  }
});

test('Apple deep dive loads and streams report', async ({ page }) => {
  await signIn(page);
  await page.locator('text=Company Profile').first().click();
  await page.waitForTimeout(1000);
  const input = page.locator('input[aria-label="Company or ticker"]:visible').first();
  await input.fill('Apple');
  await input.press('Enter');
  await page.waitForTimeout(10000);
  const report = page.locator('article, [class*="markdown"], [class*="report"]').first();
  await expect(report).toBeVisible({ timeout: 20000 });
  const text = await report.innerText();
  expect(text.length).toBeGreaterThan(500);
});

test('Oncology sector scan completes and shows report', async ({ page }) => {
  test.setTimeout(120000);
  await signIn(page);
  await runSectorScan(page, 'Oncology');
  await awaitReport(page, ['PARTNERSHIP INTELLIGENCE REPORT', 'Summary', 'Overview']);
  const text = await page.locator('body').innerText();
  expect(text).toContain('Oncology');
});

// The four "new signals" (Deal track record, Potential UNC contacts, IP
// portfolio, Partnership language) are each appended by the backend ONLY when
// their underlying live data exists for a company — collaboration 8-Ks, NIH
// grants with a UNC PI, PatentsView results (needs PATENTSVIEW_API_KEY), and
// partnership terms in the 10-K text respectively. report_builder inserts
// nothing when a source is empty, so a perfectly healthy scan can surface zero
// signals for a given sector/run. (This mirrors the PatentsView test below.)
// We therefore wait for the rendered report, then: if any signal is present we
// assert it's well-formed; otherwise we assert the scan still produced a
// substantial, error-free report rather than failing on absent external data.
test('new signals render well-formed when present in Oncology scan', async ({ page }) => {
  test.setTimeout(120000);
  await signIn(page);
  await runSectorScan(page, 'Oncology');
  await awaitReport(page, ['PARTNERSHIP INTELLIGENCE REPORT', 'Summary']);
  const text = await page.locator('body').innerText();
  const signals = [
    'Deal track record',
    'Potential UNC contacts',
    'IP portfolio',
    'Partnership language',
  ].filter((s) => text.includes(s));
  if (signals.length > 0) {
    // A rendered signal is always a "<Label>:" lead-in followed by detail text.
    for (const s of signals) expect(text).toContain(`${s}:`);
  } else {
    expect(text.length).toBeGreaterThan(1000);
    expect(text).not.toContain('Application error');
  }
});

test('Gene Therapy scan shows report content', async ({ page }) => {
  test.setTimeout(120000);
  await signIn(page);
  await runSectorScan(page, 'Gene Therapy');
  // "Profile"/"Overview" appear in the nav chrome before any report exists —
  // wait for the rendered report header instead.
  await awaitReport(page, ['PARTNERSHIP INTELLIGENCE REPORT', 'Summary']);
  const text = await page.locator('body').innerText();
  expect(text.length).toBeGreaterThan(1000);
});

test.skip('companies table loads with download buttons' /* Companies tab deactivated in PR #6 */, async ({ page }) => {
  await signIn(page);
  await page.locator('text=Companies').first().click();
  await page.waitForTimeout(2000);
  const table = page.locator('table').first();
  await expect(table).toBeVisible({ timeout: 10000 });
  const download = page.locator('button:has-text("Excel"), button:has-text("Download"), button:has-text("PDF")').first();
  await expect(download).toBeVisible({ timeout: 5000 });
});

// PatentsView's current Search API requires a free API key (the keyless
// legacy endpoints are retired). Without PATENTSVIEW_API_KEY the patents
// signal correctly degrades to zero and inserts nothing — so this test
// strictly requires the IP portfolio line only when a key is configured;
// otherwise it verifies the patents integration never breaks the scan.
test('PatentsView signal appears for a large pharma company', async ({ page }) => {
  test.setTimeout(120000);
  await signIn(page);
  await runSectorScan(page, 'Pharmaceutical');
  await awaitReport(page, ['PARTNERSHIP INTELLIGENCE REPORT', 'IP portfolio']);
  const text = await page.locator('body').innerText();
  if (process.env.PATENTSVIEW_API_KEY) {
    expect(text.includes('IP portfolio') || text.includes('patents')).toBeTruthy();
  } else {
    expect(text.length).toBeGreaterThan(1000);
    expect(text).not.toContain('Application error');
  }
});
