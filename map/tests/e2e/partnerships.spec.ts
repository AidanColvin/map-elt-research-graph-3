import { test, expect, Page } from '@playwright/test';

const BASE = 'http://localhost:3000';

// Guest sign-in on the main workspace, mirroring the other specs.
async function signInGuest(page: Page) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  const guest = page.getByRole('button', { name: /continue as guest/i });
  const nav = page.locator('nav').first();
  await Promise.race([
    guest.waitFor({ state: 'visible', timeout: 30000 }).catch(() => {}),
    nav.waitFor({ state: 'visible', timeout: 30000 }).catch(() => {}),
  ]);
  if (await guest.isVisible().catch(() => false)) await guest.click();
  await nav.waitFor({ state: 'visible', timeout: 20000 });
}

test('Partnerships tab is reachable and renders the three result cards', async ({ page }) => {
  test.setTimeout(120000);
  await signInGuest(page);

  // Click the Partnerships tab — it toggles an in-app view (no route change,
  // so navigation never replays the intro splash).
  await page.locator('nav').getByText('Partnerships', { exact: true }).first().click();
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
  for (const label of ['Partnerships', 'Sector Scan', 'Partnerships', 'Dashboard']) {
    await page.locator('nav').getByText(label, { exact: true }).first().click();
    await page.waitForTimeout(600);
    const body = await page.locator('body').innerText();
    // The intro graphic ("Click to skip" / "MAPPING ARCHITECTURE PLATFORM")
    // must never reappear on in-app navigation — only on a hard load.
    expect(body).not.toContain('Click to skip');
    expect(body).not.toContain('MAPPING ARCHITECTURE PLATFORM');
  }
  // The workspace nav is still present (we never left the SPA / re-gated auth).
  await expect(page.locator('nav').getByText('Partnerships', { exact: true }).first()).toBeVisible();
});

test('typo "Eli Lily" is corrected and shown to the user', async ({ page }) => {
  test.setTimeout(120000);
  await signInGuest(page);
  await page.locator('nav').getByText('Partnerships', { exact: true }).first().click();
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
  await page.locator('nav').getByText('Partnerships', { exact: true }).first().click();
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
