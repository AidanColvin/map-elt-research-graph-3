import { test, expect, Page } from '@playwright/test';
import { mockBackend, gotoWorkspace, clickNav, visibleView } from './helpers';

// Arm offline backend + image-host mocks before every test so sector scans,
// company deep dives, and logos are deterministic and never hit the network.
test.beforeEach(async ({ page }) => {
  await mockBackend(page);
});

// Enter the workspace as a guest (skips the intro splash + auth gate).
async function signIn(page: Page) {
  await gotoWorkspace(page);
}

// Run a sector scan from the Sector view and submit via the keyboard.
async function runSectorScan(page: Page, sector: string) {
  await clickNav(page, 'Sectors');
  await page.waitForTimeout(500);
  const input = visibleView(page).locator('input[aria-label="Sector"]').first();
  await expect(input).toBeVisible({ timeout: 8000 });
  await input.fill(sector);
  await input.press('Enter');
}

// Wait until the rendered report contains any of `sentinels`. With the backend
// mocked the scan returns deterministically, so a single wait is sufficient.
async function awaitReport(page: Page, sentinels: string[], timeout = 30000) {
  await page.waitForFunction(
    (ss) => ss.some((s) => document.body.innerText.includes(s)),
    sentinels,
    { timeout },
  );
}

test('dashboard loads without error', async ({ page }) => {
  await signIn(page);
  const body = await page.locator('body').innerText();
  expect(body.length).toBeGreaterThan(200);
  expect(body).not.toContain('This page could not be found');
  expect(body).not.toContain('Application error');
});

test('dashboard hero renders correctly', async ({ page }) => {
  await signIn(page);
  const view = visibleView(page);
  // Current dashboard headline + value-prop copy.
  await expect(
    view.getByRole('heading', { name: /every sentence has a source/i }),
  ).toBeVisible({ timeout: 8000 });
  const body = await view.innerText();
  // The five records the brief is allowed to cite are still named on the page.
  expect(body).toContain('SEC EDGAR');
  // …under the provenance headline that replaced the how-it-works explainer.
  expect(body).toContain('Five public records. One document.');
});

test('homepage shows the one search field and the provenance diagram', async ({ page }) => {
  await signIn(page);
  const view = visibleView(page);
  // The homepage leads with a single search field…
  await expect(view.locator('input[placeholder="Pfizer"]').first()).toBeVisible({ timeout: 8000 });
  // …and the provenance diagram beneath it, which carries its own accessible
  // name and names each of the five records.
  await expect(view.locator('.v4-diagram')).toBeVisible();
  await expect(view.getByText('NIH RePORTER', { exact: true }).first()).toBeVisible();
});

test('all nav tabs load without a not-found page', async ({ page }) => {
  await signIn(page);
  for (const label of ['Home', 'Companies', 'Sectors', 'Accounts']) {
    await clickNav(page, label);
    await page.waitForTimeout(800);
    const body = await page.locator('body').innerText();
    expect(body).not.toContain('This page could not be found');
    expect(body).not.toContain('Application error');
  }
});

test('Apple deep dive loads and streams a report', async ({ page }) => {
  test.setTimeout(60000);
  await signIn(page);
  await clickNav(page, 'Companies');
  await page.waitForTimeout(500);
  const view = visibleView(page);
  const input = view.locator('input[aria-label="Company or ticker"]').first();
  await input.fill('Apple');
  await input.press('Enter');
  const report = view.locator('article, [class*="markdown"], [class*="report"], [class*="Report"]').first();
  await expect(report).toBeVisible({ timeout: 30000 });
  const text = await report.innerText();
  expect(text.length).toBeGreaterThan(500);
});

test('Oncology sector scan completes and shows a report', async ({ page }) => {
  test.setTimeout(60000);
  await signIn(page);
  await runSectorScan(page, 'Oncology');
  await awaitReport(page, ['PARTNERSHIP INTELLIGENCE REPORT', 'Summary']);
  const text = await page.locator('body').innerText();
  expect(text).toContain('Oncology');
});

test('Gene Therapy scan shows report content', async ({ page }) => {
  test.setTimeout(60000);
  await signIn(page);
  await runSectorScan(page, 'Gene Therapy');
  await awaitReport(page, ['PARTNERSHIP INTELLIGENCE REPORT', 'Summary']);
  const text = await page.locator('body').innerText();
  expect(text.length).toBeGreaterThan(1000);
  expect(text).toContain('Gene Therapy');
});
