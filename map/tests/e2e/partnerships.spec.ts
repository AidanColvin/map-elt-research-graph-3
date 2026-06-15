import { test, expect, Page } from '@playwright/test';
import { mockBackend, gotoWorkspace } from './helpers';

// NOTE: The Partnerships feature is surfaced in the workspace sub-nav as the
// "UNC" tab (the live VIEWS are Dashboard / Company / Sector / UNC / Database —
// see map/app/page.tsx). The PartnershipsView component renders its own
// "Partnerships" heading and the company/sector toggle inside that view. These
// specs are CI-safe: mockBackend stubs /api/partnerships, so they never hit a
// real backend.

// Arm offline backend + image-host mocks before every test.
test.beforeEach(async ({ page }) => {
  await mockBackend(page);
});

// Guest sign-in on the main workspace, mirroring the other specs.
async function signInGuest(page: Page) {
  await gotoWorkspace(page);
}

test('Partnerships tab is reachable and renders the three result cards', async ({ page }) => {
  test.setTimeout(120000);
  await signInGuest(page);

  // Click the Partnerships tab — it toggles an in-app view (no route change,
  // so navigation never replays the intro splash).
  await page.locator('nav').getByText('UNC', { exact: true }).first().click();
  await page.getByLabel('Partnership search').waitFor({ state: 'visible', timeout: 15000 });
  await expect(page.getByRole('heading', { name: 'Partnerships' })).toBeVisible();

  // Toggle to Company (it is the default, but click it explicitly per the spec).
  await page.getByRole('tab', { name: /company/i }).click();
  await expect(page.getByRole('tab', { name: /company/i })).toHaveAttribute('aria-selected', 'true');

  // Search Apple and wait for the Results Canvas with all three cards.
  await page.getByLabel('Partnership search').fill('Apple');
  await page.getByRole('button', { name: /^Search$/ }).click();

  const canvas = page.getByTestId('results-canvas');
  await expect(canvas).toBeVisible({ timeout: 90000 });
  await expect(page.getByTestId('card-clinical')).toBeVisible();
  await expect(page.getByTestId('card-financial')).toBeVisible();
  await expect(page.getByTestId('card-ecosystem')).toBeVisible();

  // The three cards carry their section titles.
  await expect(canvas).toContainText('Clinical / Research');
  await expect(canvas).toContainText('Financial / Legal');
  await expect(canvas).toContainText('University Ecosystem');
});

test('navigating to Partnerships and back does NOT replay the intro splash', async ({ page }) => {
  await signInGuest(page);
  // Navigate across tabs including the (formerly route-based) Partnerships view.
  for (const label of ['UNC', 'Sector', 'UNC', 'Dashboard']) {
    await page.locator('nav').getByText(label, { exact: true }).first().click();
    await page.waitForTimeout(600);
    const body = await page.locator('body').innerText();
    // The intro graphic ("Click to skip" / "MAPPING ARCHITECTURE PLATFORM")
    // must never reappear on in-app navigation — only on a hard load.
    expect(body).not.toContain('Click to skip');
    expect(body).not.toContain('MAPPING ARCHITECTURE PLATFORM');
  }
  // The workspace nav is still present (we never left the SPA / re-gated auth).
  await expect(page.locator('nav').getByText('UNC', { exact: true }).first()).toBeVisible();
});

test('typo "Eli Lily" is corrected and shown to the user', async ({ page }) => {
  test.setTimeout(120000);
  await signInGuest(page);
  await page.locator('nav').getByText('UNC', { exact: true }).first().click();
  await page.getByLabel('Partnership search').waitFor({ state: 'visible', timeout: 15000 });
  await page.getByRole('tab', { name: /company/i }).click();
  await page.getByLabel('Partnership search').fill('Eli Lily');
  await page.getByRole('button', { name: /^Search$/ }).click();

  await page.getByTestId('results-canvas').waitFor({ state: 'visible', timeout: 90000 });
  // The correction notice surfaces the official SEC name despite the typo.
  const notice = page.getByTestId('resolved-notice');
  await expect(notice).toBeVisible();
  await expect(notice).toContainText('Showing verifiable results for');
  await expect(notice).toContainText(/lilly/i);
  // PubMed (typo-tolerant) still rendered clinical results.
  await expect(page.getByTestId('card-clinical')).toBeVisible();
});

test('typo fix lets the strict SEC client surface verbatim text (Liquidia)', async ({ page }) => {
  test.setTimeout(120000);
  await signInGuest(page);
  await page.locator('nav').getByText('UNC', { exact: true }).first().click();
  await page.getByLabel('Partnership search').waitFor({ state: 'visible', timeout: 15000 });
  await page.getByRole('tab', { name: /company/i }).click();
  // Liquidia is a UNC-Chapel Hill spinout whose 10-K names UNC verbatim; the
  // resolver maps it to the official "Liquidia Corp" so the SEC client finds it.
  await page.getByLabel('Partnership search').fill('Liquidia');
  await page.getByRole('button', { name: /^Search$/ }).click();

  await page.getByTestId('results-canvas').waitFor({ state: 'visible', timeout: 90000 });
  await expect(page.getByTestId('resolved-notice')).toContainText(/liquidia corp/i);
  // The Financial/Legal card shows verbatim SEC text, not the empty state.
  const financial = page.getByTestId('card-financial');
  await expect(financial).toContainText(/University of North Carolina/i);
  await expect(financial).not.toContainText('No verbatim SEC mentions found');
});

test('partner status banner shows Active for Eli Lilly', async ({ page }) => {
  test.setTimeout(120000);
  await signInGuest(page);
  await page.locator('nav').getByText('UNC', { exact: true }).first().click();
  await page.getByLabel('Partnership search').waitFor({ state: 'visible', timeout: 15000 });
  await page.getByLabel('Partnership search').fill('Eli Lilly');
  await page.getByRole('button', { name: /^Search$/ }).click();
  await page.getByTestId('results-canvas').waitFor({ state: 'visible', timeout: 90000 });
  const banner = page.getByTestId('partner-status-banner');
  await expect(banner).toBeVisible();
  await expect(banner).toContainText('Active');
  await expect(banner).toContainText('UNC PARTNER');
});

test('NIH staff section shows PI name from grant data', async ({ page }) => {
  test.setTimeout(120000);
  await signInGuest(page);
  await page.locator('nav').getByText('UNC', { exact: true }).first().click();
  await page.getByLabel('Partnership search').waitFor({ state: 'visible', timeout: 15000 });
  await page.getByLabel('Partnership search').fill('Eli Lilly');
  await page.getByRole('button', { name: /^Search$/ }).click();
  await page.getByTestId('results-canvas').waitFor({ state: 'visible', timeout: 90000 });
  const body = await page.locator('body').innerText();
  expect(body).toContain("D'Alessio D");
  expect(body).toContain('UNC RESEARCH CONTACTS');
  expect(body).toContain('ACTIVE PROGRAMS');
  // Eli Lilly resolves as a partner, so Section D frames as "Deepen the
  // relationship" (the "Why UNC" framing is the non-partner variant).
  expect(body).toContain('DEEPEN THE RELATIONSHIP');
});

test('downloadable UNC report renders with export + save controls', async ({ page }) => {
  test.setTimeout(120000);
  await signInGuest(page);
  await page.locator('nav').getByText('UNC', { exact: true }).first().click();
  await page.getByLabel('Partnership search').waitFor({ state: 'visible', timeout: 15000 });
  await page.getByLabel('Partnership search').fill('Eli Lilly');
  await page.getByRole('button', { name: /^Search$/ }).click();
  const report = page.getByTestId('unc-report');
  await expect(report).toBeVisible({ timeout: 90000 });
  await expect(report.getByRole('heading', { name: /UNC Partnership Report/i })).toBeVisible();
  // The same export + save bar as the Company profile.
  await expect(report.getByRole('button', { name: 'Download PDF' })).toBeVisible();
  await expect(report.getByRole('button', { name: 'Download DOCX' })).toBeVisible();
  await expect(report.getByRole('button', { name: 'Markdown' })).toBeVisible();
  await expect(report.getByRole('button', { name: /Save to Project/ })).toBeVisible();
  await expect(report.getByRole('button', { name: /Save report/ })).toBeVisible();
});
