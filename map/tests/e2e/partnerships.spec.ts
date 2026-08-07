import { test, expect } from '@playwright/test';
import { mockBackend, gotoWorkspace, clickNav, visibleView, unlockWithPassword } from './helpers';

/**
 * The Partnerships tab renders the UNC partnership inventory (the workbook's
 * 589 unit ↔ organization rows) behind the server-side access gate: a guest
 * sees the SignInRequired panel, and the shared password mints a token that
 * lets /api/inventory/data serve the rows. These specs drive the REAL gate and
 * the REAL local data route — mockBackend still stubs the unrelated report
 * APIs, so nothing here talks to the deployed backend.
 */
test.beforeEach(async ({ page }) => {
  await mockBackend(page);
  await gotoWorkspace(page);
  await clickNav(page, 'Partnerships');
});

test('guest sees the gate; wrong password is refused with a message', async ({ page }) => {
  const view = visibleView(page);
  await expect(view.getByText('Partnerships needs an account')).toBeVisible({ timeout: 15000 });

  await view.getByRole('button', { name: 'Password', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Password' });
  await dialog.getByRole('textbox').fill('not-the-code');
  await dialog.getByRole('button', { name: 'Go' }).click();
  await expect(dialog.getByText('Wrong password')).toBeVisible({ timeout: 15000 });
  await page.keyboard.press('Escape');
});

test('correct password unlocks the inventory table with stat tiles', async ({ page }) => {
  await unlockWithPassword(page);
  const view = visibleView(page);

  // The stat tiles quantify the workbook inventory.
  await expect(view.getByText('Organizations', { exact: true })).toBeVisible({ timeout: 20000 });
  await expect(view.getByText('UNC units', { exact: true })).toBeVisible();

  // The table renders workbook rows. (The header is uppercased by CSS; the
  // DOM text keeps its source casing.)
  await expect(view.locator('table thead').first()).toContainText(/UNC Unit/i);
  const rows = view.locator('table tbody tr');
  await expect(rows.first()).toBeVisible({ timeout: 20000 });
  expect(await rows.count()).toBeGreaterThan(50);
});

test('unit filter narrows rows and search matches organizations', async ({ page }) => {
  await unlockWithPassword(page);
  const view = visibleView(page);
  const rows = view.locator('table tbody tr');
  await expect(rows.first()).toBeVisible({ timeout: 20000 });
  const all = await rows.count();

  // Filter to one UNC unit — the row count must drop.
  const unitSelect = view.locator('select').first();
  const firstUnit = await unitSelect.locator('option').nth(1).getAttribute('value');
  await unitSelect.selectOption(firstUnit!);
  await expect.poll(async () => rows.count()).toBeLessThan(all);
  await unitSelect.selectOption('all');

  // Free-text search narrows to matching organizations.
  await view.getByPlaceholder(/Search unit, company/).fill('Dental Foundation');
  await expect.poll(async () => rows.count()).toBeLessThan(all);
  await expect(view.locator('table tbody').first()).toContainText('Dental Foundation');
});

test('clicking a row expands its description detail', async ({ page }) => {
  await unlockWithPassword(page);
  const view = visibleView(page);
  const rows = view.locator('table tbody tr');
  await expect(rows.first()).toBeVisible({ timeout: 20000 });

  await rows.first().click();
  await expect(view.locator('table tbody').first()).toContainText('Description');
});

test('navigating to Partnerships and back does NOT replay the intro splash', async ({ page }) => {
  for (const label of ['Sectors', 'Partnerships', 'Home', 'Partnerships']) {
    await clickNav(page, label);
    await page.waitForTimeout(400);
    const body = await page.locator('body').innerText();
    // The intro graphic must never reappear on in-app navigation — only on a
    // hard load.
    expect(body).not.toContain('Click to skip');
    expect(body).not.toContain('MAPPING ARCHITECTURE PLATFORM');
  }
  await expect(page.locator('nav').getByText('Partnerships', { exact: true }).first()).toBeVisible();
});
