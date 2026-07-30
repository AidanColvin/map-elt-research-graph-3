import { test, expect, Page } from '@playwright/test';
import { mockBackend, gotoWorkspace, visibleView } from './helpers';

// Arm the offline backend mocks before every test so the deep dive, sector
// scan, and the company-vs-sector classifier are deterministic.
test.beforeEach(async ({ page }) => {
  await mockBackend(page);
});

// The Dashboard (Home) hero search bar. Its placeholder is
// "Start a project, e.g. Pfizer or oncology".
function homeSearch(page: Page) {
  return visibleView(page).locator('input[placeholder*="Start a project" i]').first();
}

// The label of the currently-active workspace nav tab.
function activeNavTab(page: Page) {
  return page.locator('nav[aria-label="Workspace views"] .ws-nav-item.active');
}

test('home search runs a COMPANY report in the Companies view — not a Projects redirect', async ({ page }) => {
  test.setTimeout(60000);
  await gotoWorkspace(page);

  const input = homeSearch(page);
  await expect(input).toBeVisible({ timeout: 10000 });
  await input.fill('Apple');
  await input.press('Enter');

  // It lands on the Companies tab…
  await expect(activeNavTab(page)).toHaveText('Companies', { timeout: 15000 });

  // …and streams the company report (header + body), exactly like the in-tool
  // Companies search bar does.
  const view = visibleView(page);
  await expect(view.getByRole('heading', { name: 'Apple', exact: true })).toBeVisible({ timeout: 30000 });
  const body = await view.innerText();
  expect(body).toContain('Executive Summary');

  // Crucially, it did NOT open the Projects pipeline (no project picker / run
  // controls anywhere on the page).
  await expect(page.getByTestId('run-pipeline')).toHaveCount(0);
  await expect(page.getByTestId('create-project')).toHaveCount(0);
});

test('home search runs a SECTOR scan in the Sectors view', async ({ page }) => {
  test.setTimeout(60000);
  await gotoWorkspace(page);

  const input = homeSearch(page);
  await expect(input).toBeVisible({ timeout: 10000 });
  await input.fill('Oncology');
  await input.press('Enter');

  // It lands on the Sectors tab…
  await expect(activeNavTab(page)).toHaveText('Sectors', { timeout: 15000 });

  // …and renders the sector scan report for the typed sector.
  await page.waitForFunction(
    () =>
      ['PARTNERSHIP INTELLIGENCE REPORT', 'Summary', 'Sector Scan'].some((s) =>
        document.body.innerText.includes(s),
      ),
    undefined,
    { timeout: 30000 },
  );
  const text = await page.locator('body').innerText();
  expect(text).toContain('Oncology');

  // And it did NOT open the Projects pipeline.
  await expect(page.getByTestId('run-pipeline')).toHaveCount(0);
});
