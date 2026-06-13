import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:3000';

// The Partnerships page is a standalone route (no intro / auth gate), so we can
// navigate to it directly. We toggle to "Company", search "Apple", and verify
// the Results Canvas renders all three verbatim-source cards. The canvas always
// renders its three cards once a lookup resolves — even when an individual
// source is empty — so this assertion is robust to flaky live upstream data.
test('partnerships company search renders the three result cards', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto(`${BASE}/partnerships`);

  // Toggle to Company (it's the default, but assert the control works).
  await page.locator('button[aria-pressed]', { hasText: /^Company$/i }).first().click();

  const input = page.locator('input[aria-label="Company"]');
  await input.waitFor({ timeout: 15000 });
  await input.fill('Apple');
  await input.press('Enter');

  // Wait for the Results Canvas with its three cards.
  const canvas = page.locator('[data-testid="results-canvas"]');
  await canvas.waitFor({ timeout: 90000 });

  const cards = page.locator('[data-testid="result-card"]');
  await expect(cards).toHaveCount(3);

  const body = await page.locator('body').innerText();
  expect(body).toContain('Clinical / Research');
  expect(body).toContain('Financial / Legal');
  expect(body).toContain('University Ecosystem');
});
