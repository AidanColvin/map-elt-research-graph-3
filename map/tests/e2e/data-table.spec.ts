import { test, expect } from '@playwright/test';
import { mockBackend, gotoWorkspace, clickNav, visibleView, unlockWithPassword } from './helpers';

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
    await clickNav(page, 'Accounts');
    // The Directory is behind the server-side access gate for guests; enter
    // the shared password so the workbook rows load from /api/inventory/data.
    await unlockWithPassword(page);
    await visibleView(page).locator('.db-table tbody tr').first().waitFor({ state: 'visible', timeout: 20000 });
  });

  test('renders summary cards, the fit column, and a live count', async ({ page }) => {
    const view = visibleView(page);
    // Four summary metric cards.
    for (const label of ['Total Partners', 'NC-Based', 'Life Sciences', 'Public Companies']) {
      await expect(view.getByText(label, { exact: true }).first()).toBeVisible({ timeout: 8000 });
    }
    // Fit column header + at least one badge (columns today: Company,
    // Employees, UNC, Fit, Sector, Revenue, Actions).
    await expect(view.locator('.db-table thead th', { hasText: 'Fit' }).first()).toBeVisible();
    await expect(view.locator('.db-table tbody tr').first()).toBeVisible();
    await expect(
      view.locator('.db-table tbody tr').first().getByText(/^(High|Mid|Low)$/).first(),
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

    // The slide-out drawer stays mounted; when open it carries the selected
    // company's aria-label (React omits aria-hidden={false} entirely).
    const panel = page.locator('aside[role="dialog"]');
    await expect(panel).toHaveAttribute('aria-label', /details$/, { timeout: 8000 });
    // The drawer's quick stats always include Employees / Revenue / HQ.
    await expect(panel.getByText('HQ', { exact: true })).toBeVisible();
    await expect(panel.getByText('Revenue', { exact: true }).first()).toBeVisible();

    await page.keyboard.press('Escape');
    // Deselecting drops the company aria-label (and unmounts the body).
    await expect(panel).not.toHaveAttribute('aria-label', /details$/);
  });

  test('the row Profile action navigates to the Company view', async ({ page }) => {
    const view = visibleView(page);
    const firstRow = view.locator('.db-table tbody tr').first();
    const company = (await firstRow.locator('td').first().innerText()).split('\n')[0].trim();

    // The deep-dive CTA lives in the row's Actions column today.
    await firstRow.getByRole('button', { name: /profile/i }).click();

    // The Data table is no longer the visible view…
    await expect(page.locator('.db-table')).toBeHidden({ timeout: 8000 });
    // …and the chosen company is carried into the Company view (prefilled input).
    await expect(page.locator(`.ws-view:visible input[value="${company}"]`)).toBeVisible({
      timeout: 8000,
    });
  });
});
