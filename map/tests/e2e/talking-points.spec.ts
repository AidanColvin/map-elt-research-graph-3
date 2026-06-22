import { test, expect, Page } from '@playwright/test';
import { mockBackend, gotoWorkspace } from './helpers';

// Talking Points card spec — mocks /api/partnerships AND /api/talking-points
// so the test never hits a real backend.

const MOCK_PARTNERSHIPS = {
  data: {
    query: 'Apple',
    resolved_name: 'Apple Inc.',
    type: 'company',
    links: {},
    clinical: { count: 0, top_authors: [], papers: [] },
    coi: { count: 0, papers: [], window_years: 5 },
    unc_units: [],
    financial: { quotes: [], filing_url: '' },
    ecosystem: [],
    nih_grants: [],
    nih_pis: [],
    trials: [],
    trials_total: 0,
    unc_faculty_leads: [],
    relationship_signals: [],
    unc_joint_trials: [],
    unc_patents: [],
  },
};

const MOCK_TALKING_POINTS = {
  talking_points: [
    {
      category: 'Existing Relationship',
      headline: 'Apple Inc. has a documented relationship with UNC (SEC 10-K)',
      detail: 'UNC is mentioned in the annual filing. — https://www.sec.gov/example',
      strength: 'high',
    },
    {
      category: 'Contact',
      headline: 'Dr. Smith (Pharmacology) has active NIH funding relevant to Apple Inc.',
      detail: 'Grant R01CA123456: Cancer drug delivery research (2024)',
      strength: 'medium',
    },
  ],
};

test.beforeEach(async ({ page }) => {
  await mockBackend(page);

  // Override /api/talking-points with our fixture.
  await page.route('**/api/talking-points', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_TALKING_POINTS),
    });
  });

  // Override /api/partnerships with a payload that includes the new fields.
  await page.route('**/api/partnerships', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_PARTNERSHIPS),
    });
  });
});

async function goToUNCTab(page: Page) {
  await gotoWorkspace(page);
  await page.locator('nav').getByText('Partnerships', { exact: true }).first().click();
  await page.getByLabel('Partnership search').waitFor({ state: 'visible', timeout: 15000 });
}

async function runSearch(page: Page, company = 'Apple') {
  await page.getByLabel('Partnership search').fill(company);
  await page.getByRole('button', { name: 'Search' }).click();
  // Wait for the talking points card to appear.
  await page.getByTestId('talking-points-card').waitFor({ state: 'visible', timeout: 20000 });
}

test('Talking Points card renders both mocked headlines', async ({ page }) => {
  test.setTimeout(60000);
  await goToUNCTab(page);
  await runSearch(page);

  const headlines = page.getByTestId('tp-headline');
  await expect(headlines).toHaveCount(2);
  await expect(headlines.first()).toContainText('Apple Inc. has a documented relationship');
  await expect(headlines.nth(1)).toContainText('Dr. Smith');
});

test('"Copy all as text" button copies talking points to clipboard', async ({ page }) => {
  test.setTimeout(60000);

  // Grant clipboard read + write — the test writes via the Copy button and then
  // reads the clipboard back to verify (readText needs clipboard-read).
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);

  await goToUNCTab(page);
  await runSearch(page);

  // Click the copy button.
  await page.getByRole('button', { name: /copy all as text/i }).click();

  // Button should briefly show "Copied!".
  await expect(page.getByRole('button', { name: /copied/i })).toBeVisible({ timeout: 3000 });

  // Verify clipboard content.
  const text: string = await page.evaluate(() => navigator.clipboard.readText());
  expect(text).toContain('[Existing Relationship]');
  expect(text).toContain('Apple Inc. has a documented relationship');
  expect(text).toContain('[Contact]');
  expect(text).toContain('Dr. Smith');
});
