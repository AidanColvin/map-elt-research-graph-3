import { test, expect, Page } from '@playwright/test';
import { mockBackend, gotoWorkspace, clickNav, visibleView } from './helpers';

// This spec adds its own /api/partnerships mock in beforeEach — AFTER calling
// mockBackend so it overrides the partnerships route for this file only.
// Playwright's route matching: last-registered handler wins for same pattern.
test.beforeEach(async ({ page }) => {
  await mockBackend(page);

  // Override the partnerships mock with one that matches the real PartnerData envelope.
  await page.route('**/api/partnerships', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          query: 'TestCo',
          resolved_name: 'Testco Therapeutics',
          type: 'company',
          links: { pubmed: '', edgar: '', unc_web: '' },
          clinical: { count: 2, top_authors: ['Dr. Smith'], papers: [] },
          coi: { count: 0, papers: [], window_years: 5 },
          unc_units: [{ unit: 'UNC School of Medicine', count: 2 }],
          financial: { quotes: [], filing_url: '' },
          ecosystem: [],
          nih_grants: [],
          nih_pis: [],
          trials: [],
          trials_total: 0,
        },
      }),
    });
  });
});

async function runScanAndWait(page: Page, sector = 'Oncology') {
  await gotoWorkspace(page);
  await clickNav(page, 'Sector');
  const input = visibleView(page).locator('input[aria-label="Sector"]').first();
  await expect(input).toBeVisible({ timeout: 8000 });
  await input.fill(sector);
  await input.press('Enter');
  await page.waitForFunction(
    () =>
      document.body.innerText.includes('PARTNERSHIP INTELLIGENCE REPORT') ||
      document.body.innerText.includes('Summary'),
    { timeout: 30000 },
  );
}

// ── Package button visibility ──────────────────────────────────────────────

test('Package button appears after sector scan completes', async ({ page }) => {
  test.setTimeout(60000);
  await runScanAndWait(page);
  const btn = page.getByTestId('package-btn');
  await expect(btn).toBeVisible({ timeout: 15000 });
  await expect(btn).toContainText('Package');
});

test('Package button is NOT visible before a scan runs', async ({ page }) => {
  test.setTimeout(30000);
  await gotoWorkspace(page);
  await clickNav(page, 'Sector');
  await page.waitForTimeout(1500);
  await expect(page.getByTestId('package-btn')).not.toBeVisible();
});

// ── Package button interaction ─────────────────────────────────────────────

test('Clicking Package shows progress or done state', async ({ page }) => {
  test.setTimeout(90000);
  await runScanAndWait(page);
  await expect(page.getByTestId('package-btn')).toBeVisible({ timeout: 15000 });
  await page.getByTestId('package-btn').click();
  // Fast mock — may reach done before progress renders; accept either
  await expect(
    page.getByTestId('package-progress').or(page.getByTestId('package-done'))
  ).toBeVisible({ timeout: 20000 });
});

test('Package completes and shows done state with correct text', async ({ page }) => {
  test.setTimeout(120000);
  await runScanAndWait(page);
  await page.getByTestId('package-btn').click();
  const done = page.getByTestId('package-done');
  await expect(done).toBeVisible({ timeout: 60000 });
  await expect(done).toContainText('Package ready');
  await expect(done).toContainText('Database');
});

test('"Download again" button appears after Package completes', async ({ page }) => {
  test.setTimeout(120000);
  await runScanAndWait(page);
  await page.getByTestId('package-btn').click();
  await expect(page.getByTestId('package-done')).toBeVisible({ timeout: 60000 });
  await expect(page.getByTestId('package-redownload')).toBeVisible();
});

// ── Navigation safety ─────────────────────────────────────────────────────

test('All nav tabs still work after Package completes', async ({ page }) => {
  test.setTimeout(120000);
  await runScanAndWait(page);
  await page.getByTestId('package-btn').click();
  await expect(page.getByTestId('package-done')).toBeVisible({ timeout: 60000 });

  for (const label of ['Dashboard', 'Company', 'Sector', 'UNC', 'Database']) {
    await clickNav(page, label);
    await page.waitForTimeout(600);
    const body = await page.locator('body').innerText();
    expect(body, `Crash on ${label} tab`).not.toContain('This page could not be found');
    expect(body, `App error on ${label} tab`).not.toContain('Application error');
  }
});

test('Database tab loads without crash after Package', async ({ page }) => {
  test.setTimeout(120000);
  await runScanAndWait(page);
  await page.getByTestId('package-btn').click();
  await expect(page.getByTestId('package-done')).toBeVisible({ timeout: 60000 });
  await clickNav(page, 'Database');
  await page.waitForTimeout(1000);
  const body = await page.locator('body').innerText();
  expect(body).not.toContain('This page could not be found');
  expect(body).not.toContain('Application error');
});

test('Company tab search still works after Package', async ({ page }) => {
  test.setTimeout(120000);
  await runScanAndWait(page);
  await page.getByTestId('package-btn').click();
  await expect(page.getByTestId('package-done')).toBeVisible({ timeout: 60000 });
  await clickNav(page, 'Company');
  await page.waitForTimeout(600);
  const view = visibleView(page);
  const chip = view.locator('button:has-text("Apple")').first();
  await expect(chip).toBeVisible({ timeout: 10000 });
  await chip.click();
  const report = view.locator('article, [class*="markdown"], [class*="report"], [class*="Report"]').first();
  await expect(report).toBeVisible({ timeout: 40000 });
  const text = await report.innerText();
  expect(text.length).toBeGreaterThan(300);
});

test('No console errors during Package flow', async ({ page }) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', e => errors.push(e.message));
  await runScanAndWait(page);
  await page.getByTestId('package-btn').click();
  await expect(page.getByTestId('package-done')).toBeVisible({ timeout: 60000 });
  const appErrors = errors.filter(
    e => !/favicon/i.test(e) && !/Failed to load resource/i.test(e) && !/net::ERR_/i.test(e),
  );
  expect(appErrors, `Console errors:\n${appErrors.join('\n')}`).toEqual([]);
});
