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

  // Click the new Partnerships tab in the workspace nav → routes to /partnerships.
  await page.locator('nav').getByText('Partnerships', { exact: true }).first().click();
  await page.waitForURL('**/partnerships', { timeout: 15000 });
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
