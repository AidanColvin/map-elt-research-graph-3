import { test, expect, Page } from '@playwright/test';

const BASE = 'http://localhost:3000';

// Guest sign-in + reach a generated Apple report on the Company Profile view.
// Apple is curated, so the deep dive returns instantly without external calls.
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

function visibleView(page: Page) {
  return page.locator('.ws-view:visible');
}

async function openAppleReport(page: Page) {
  await page.locator('text="Company Profile"').first().click();
  await page.waitForTimeout(1200);
  const chip = visibleView(page).locator('button:has-text("Apple")').first();
  await expect(chip).toBeVisible({ timeout: 8000 });
  await chip.click();
  // Wait for the report to finish streaming — the export/save controls only
  // render once status is "done" and the markdown is substantial.
  const exportBtn = visibleView(page).locator('button:has-text("Download PDF")').first();
  await expect(exportBtn).toBeVisible({ timeout: 40000 });
}

test('company report shows PDF / DOCX / Markdown export buttons', async ({ page }) => {
  test.setTimeout(60000);
  await signInGuest(page);
  await openAppleReport(page);
  const view = visibleView(page);
  await expect(view.locator('button:has-text("Download PDF")').first()).toBeVisible();
  await expect(view.locator('button:has-text("Download DOCX")').first()).toBeVisible();
  await expect(view.locator('button:has-text("Markdown")').first()).toBeVisible();
});

test('Markdown export downloads without crashing', async ({ page }) => {
  test.setTimeout(60000);
  await signInGuest(page);
  await openAppleReport(page);
  const view = visibleView(page);
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 15000 }),
    view.locator('button:has-text("Markdown")').first().click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.md$/);
  // The page must remain interactive (no crash) after exporting.
  await expect(view.locator('button:has-text("Download PDF")').first()).toBeVisible();
});

test('PDF export button clicks without throwing a page error', async ({ page }) => {
  test.setTimeout(60000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await signInGuest(page);
  await openAppleReport(page);
  const view = visibleView(page);
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 30000 }),
    view.locator('button:has-text("Download PDF")').first().click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.pdf$/);
  expect(errors).toEqual([]);
});

test('Save to Project opens the new-project modal and submits', async ({ page }) => {
  test.setTimeout(60000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await signInGuest(page);
  await openAppleReport(page);
  const view = visibleView(page);

  // Open the dropdown, then the "New project" modal.
  await view.locator('button:has-text("Save to Project")').first().click();
  await page.getByRole('button', { name: /new project/i }).first().click();

  const dialog = page.getByRole('dialog', { name: /create project/i });
  await expect(dialog).toBeVisible({ timeout: 5000 });

  // Fill and submit. As a guest there is no Firestore (the calls are no-ops,
  // i.e. effectively mocked), so the modal should simply close without error.
  await dialog.getByLabel('Project name').fill('My Watchlist');
  await dialog.getByRole('button', { name: /create & save/i }).click();
  await expect(dialog).toBeHidden({ timeout: 5000 });
  expect(errors).toEqual([]);
});
