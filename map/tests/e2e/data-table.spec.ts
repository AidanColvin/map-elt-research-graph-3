import { test, expect } from '@playwright/test';
import { mockBackend, gotoWorkspace, clickNav, visibleView } from './helpers';

/**
 * Coverage for the interactive Database ("Data" tab) intelligence features:
 * summary metric cards, client-side filters with a live count, the UNC Fit
 * (est.) badge column, and the click-to-expand slide-out detail panel with its
 * SEC link + "Run Deep Dive" in-app navigation.
 */
test.describe('Data tab — interactive database', () => {
  test.beforeEach(async ({ page }) => {
    await mockBackend(page);
    await gotoWorkspace(page);
    await clickNav(page, 'Companies');
  });

  test('renders summary cards, the fit column, and a live count', async ({ page }) => {
    const view = visibleView(page);
    // Four summary metric cards.
    for (const label of ['Total Partners', 'NC-Based', 'Life Sciences', 'Public Companies']) {
      await expect(view.getByText(label, { exact: true }).first()).toBeVisible({ timeout: 8000 });
    }
    // UNC Fit (est.) column header + at least one badge.
    await expect(view.locator('.db-table thead th', { hasText: 'UNC Fit' }).first()).toBeVisible();
    await expect(view.locator('.db-table tbody tr').first()).toBeVisible();
    await expect(
      view.locator('.db-table tbody tr td:nth-child(2)').getByText(/^(High|Mid|Low)$/).first(),
    ).toBeVisible();
    // Live count line.
    await expect(view.getByText(/Showing \d+ of \d+ partners/).first()).toBeVisible();
  });

  test('sector filter narrows the rows and updates the count', async ({ page }) => {
    const view = visibleView(page);
    const countText = () => view.getByText(/Showing \d+ of \d+ partners/).first().innerText();

    const before = await countText();
    const total = Number(before.match(/of (\d+)/)![1]);
    const shownBefore = Number(before.match(/Showing (\d+)/)![1]);
    expect(shownBefore).toBe(total);

    // Pick the first real sector option (index 0 is the "All Sectors" default).
    const sectorSelect = view.locator('select').first();
    const firstSector = await sectorSelect.locator('option').nth(1).getAttribute('value');
    await sectorSelect.selectOption(firstSector!);

    await expect
      .poll(async () => Number((await countText()).match(/Showing (\d+)/)![1]))
      .toBeLessThan(total);
  });

  test('row click opens the detail panel; Escape closes it', async ({ page }) => {
    const view = visibleView(page);
    await view.locator('.db-table tbody tr').first().click();

    const panel = page.locator('aside[role="dialog"]');
    const deepDive = panel.getByRole('button', { name: /run deep dive/i });
    await expect(deepDive).toBeVisible({ timeout: 8000 });
    // Panel always shows HQ / location and Revenue field labels.
    await expect(panel.getByText('HQ / location', { exact: true })).toBeVisible();

    await page.keyboard.press('Escape');
    // Panel content unmounts when deselected, so the CTA detaches.
    await expect(deepDive).toHaveCount(0);
  });

  test('"Run Deep Dive" navigates to the Company view', async ({ page }) => {
    const view = visibleView(page);
    const firstRow = view.locator('.db-table tbody tr').first();
    const company = (await firstRow.locator('td').first().innerText()).split('\n')[0].trim();

    await firstRow.click();
    const panel = page.locator('aside[role="dialog"]');
    await panel.getByRole('button', { name: /run deep dive/i }).click();

    // The Data table is no longer the visible view…
    await expect(page.locator('.db-table')).toBeHidden({ timeout: 8000 });
    // …and the chosen company is carried into the Company view (prefilled input).
    await expect(
      page.locator('.ws-view:visible input').filter({ hasText: '' }).first(),
    ).toBeVisible();
    await expect(page.locator(`.ws-view:visible input[value="${company}"]`)).toBeVisible({
      timeout: 8000,
    });
  });
});
