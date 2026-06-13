import { test, expect, Page } from '@playwright/test';

const BASE = 'http://localhost:3000';
const EMAIL = process.env.TEST_EMAIL ?? '';
const PASSWORD = process.env.TEST_PASSWORD ?? '';

// The app shows a ~5s intro animation, then the auth gate. With TEST_EMAIL /
// TEST_PASSWORD set we sign in with email; otherwise we use the built-in
// "Continue as guest" path, which exercises the same workspace.
async function signIn(page: Page) {
  await page.goto(BASE);
  const guestBtn = page.locator('text=Continue as guest').first();
  const emailInput = page.locator('input[type="email"]').first();
  await guestBtn.or(emailInput).first().waitFor({ timeout: 20000 });
  if (EMAIL && PASSWORD && (await emailInput.isVisible().catch(() => false))) {
    await emailInput.fill(EMAIL);
    await page.locator('input[type="password"]').first().fill(PASSWORD);
    await page.locator('button[type="submit"]').first().click();
  } else {
    await guestBtn.click();
  }
  await page.locator('text=Dashboard').first().waitFor({ timeout: 15000 });
}

test('dashboard hero renders correctly', async ({ page }) => {
  await signIn(page);
  await page.waitForTimeout(2000);
  const body = await page.locator('body').innerText();
  expect(body).toContain('partnership');
  expect(body).toContain('Map it');
  expect(body).toContain('Deep dive');
  expect(body).toContain('TRENDING SECTORS');
});

test('quick-try chips prefill the search input', async ({ page }) => {
  await signIn(page);
  await page.waitForTimeout(1000);
  const appleChip = page.locator('button', { hasText: /^Apple$/ }).first();
  await appleChip.waitFor({ timeout: 5000 });
  await appleChip.click();
  const input = page.locator('input[placeholder="Company, ticker, or sector..."]');
  await expect(input).toHaveValue('Apple');
});

test('all nav links clickable and pages load without 404', async ({ page }) => {
  await signIn(page);
  for (const label of ['Dashboard', 'Company Profile', 'Sector Scan', 'Companies']) {
    const link = page.locator(`text=${label}`).first();
    if (await link.isVisible({ timeout: 3000 }).catch(() => false)) {
      await link.click();
      await page.waitForTimeout(1500);
      const bodyText = await page.locator('body').innerText();
      // A bare "404" check false-positives on table data (street addresses,
      // zip codes); assert on the actual Next.js error-page sentences.
      expect(bodyText).not.toContain('This page could not be found');
      expect(bodyText).not.toContain('Application error');
    }
  }
});

test('company deep dive loads for Apple', async ({ page }) => {
  await signIn(page);
  const companyLink = page.locator('text=Company Profile').first();
  await companyLink.click();
  await page.waitForTimeout(1000);
  const input = page.locator('input[aria-label="Company or ticker"]:visible').first();
  await input.fill('Apple');
  await input.press('Enter');
  await page.waitForTimeout(10000);
  const report = page.locator('article, [class*="markdown"], [class*="report"]').first();
  await expect(report).toBeVisible({ timeout: 20000 });
  const text = await report.innerText();
  expect(text.length).toBeGreaterThan(500);
});

test('sector scan runs for Oncology', async ({ page }) => {
  test.setTimeout(120000);
  await signIn(page);
  const sectorLink = page.locator('text=Sector Scan').first();
  await sectorLink.click();
  await page.waitForTimeout(1000);
  const input = page.locator('input[aria-label="Sector"]:visible').first();
  await input.fill('Oncology');
  await input.press('Enter');
  await expect(page.locator('body')).toContainText(/\d+ of \d+/, { timeout: 30000 });
  await page.waitForFunction(
    () => document.body.innerText.includes('Overview') || document.body.innerText.includes('Profile') || document.body.innerText.includes('Pipeline'),
    { timeout: 90000 }
  );
  const text = await page.locator('body').innerText();
  expect(text).toContain('Oncology');
});

test('new fields appear in sector report', async ({ page }) => {
  test.setTimeout(120000);
  await signIn(page);
  const sectorLink = page.locator('text=Sector Scan').first();
  await sectorLink.click();
  await page.waitForTimeout(1000);
  const input = page.locator('input[aria-label="Sector"]:visible').first();
  await input.fill('Oncology');
  await input.press('Enter');
  await page.waitForFunction(
    () => document.body.innerText.includes('Pipeline') || document.body.innerText.includes('UNC Trial Site'),
    { timeout: 90000 }
  );
  const text = await page.locator('body').innerText();
  expect(text.includes('Pipeline:') || text.includes('Active UNC Trial Site')).toBeTruthy();
});

test('accounts table loads with download buttons', async ({ page }) => {
  await signIn(page);
  const companiesLink = page.locator('text=Companies').first();
  await companiesLink.click();
  await page.waitForTimeout(2000);
  const table = page.locator('table').first();
  await expect(table).toBeVisible({ timeout: 10000 });
  const download = page.locator('button:has-text("Excel"), button:has-text("Download"), button:has-text("PDF")').first();
  await expect(download).toBeVisible({ timeout: 5000 });
});

test('deep dive card on dashboard navigates to company report', async ({ page }) => {
  await signIn(page);
  await page.waitForTimeout(1000);
  const deepDiveLink = page.locator('text=Deep dive').first();
  await deepDiveLink.waitFor({ timeout: 5000 });
  await deepDiveLink.click();
  await page.waitForTimeout(8000);
  const body = await page.locator('body').innerText();
  expect(body.length).toBeGreaterThan(500);
});
