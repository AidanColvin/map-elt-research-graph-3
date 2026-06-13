import { test, expect, Page } from '@playwright/test';

const BASE = 'http://localhost:3000';
const EMAIL = process.env.TEST_EMAIL ?? '';
const PASSWORD = process.env.TEST_PASSWORD ?? '';

// Map gates the workspace behind an auth screen that offers either email/
// password OR a "Continue as guest" entry. Tests have no real credentials, so
// we use guest mode by default and only sign in with email/password when both
// TEST_EMAIL and TEST_PASSWORD are supplied. An intro splash animates first,
// so every locator is given a generous timeout.
async function signIn(page: Page) {
  // `networkidle` is unreliable against a Next dev server (the HMR websocket
  // keeps the network "busy"), so wait on DOM content instead. An intro splash
  // animates before the auth gate, so we wait for whichever appears first: the
  // guest button (auth gate) or the workspace nav (already authenticated).
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  const guest = page.getByRole('button', { name: /continue as guest/i });
  const nav = page.locator('nav').first();

  await Promise.race([
    guest.waitFor({ state: 'visible', timeout: 30000 }).catch(() => {}),
    nav.waitFor({ state: 'visible', timeout: 30000 }).catch(() => {}),
  ]);

  if (await guest.isVisible().catch(() => false)) {
    if (EMAIL && PASSWORD) {
      await page.locator('input[type="email"]').first().fill(EMAIL);
      await page.locator('input[type="password"]').first().fill(PASSWORD);
      await page.getByRole('button', { name: /^log in$/i }).click();
    } else {
      await guest.click();
    }
  }
  await nav.waitFor({ state: 'visible', timeout: 20000 });
}

async function goToCompanyProfile(page: Page) {
  const tab = page.locator('text="Company Profile"').first();
  await tab.click();
  await page.waitForTimeout(1500);
}

// Map keeps every workspace view mounted and toggles display, so a bare
// `button:has-text("Apple")` can resolve to a hidden Apple button in another
// view. Scope interactions to the currently-visible view to avoid that.
function visibleView(page: Page) {
  return page.locator('.ws-view:visible');
}

test('company profile idle state shows hero headline', async ({ page }) => {
  await signIn(page);
  await goToCompanyProfile(page);
  const body = await page.locator('body').innerText();
  expect(body).toContain('board-ready');
  expect(body).toContain('SEC filings');
});

test('company profile shows popular company chips', async ({ page }) => {
  await signIn(page);
  await goToCompanyProfile(page);
  const body = await page.locator('body').innerText();
  expect(body).toContain('Apple');
  expect(body).toContain('NVIDIA');
  expect(body).toContain('Microsoft');
});

test('company profile shows sample output preview card', async ({ page }) => {
  await signIn(page);
  await goToCompanyProfile(page);
  const body = await page.locator('body').innerText();
  expect(body).toContain('SAMPLE OUTPUT');
  expect(body).toContain('Tim Cook');
});

test('user clicks Apple chip and report loads', async ({ page }) => {
  test.setTimeout(60000);
  await signIn(page);
  await goToCompanyProfile(page);
  const view = visibleView(page);
  const appleChip = view.locator('button:has-text("Apple")').first();
  await expect(appleChip).toBeVisible({ timeout: 8000 });
  await appleChip.click();
  await page.waitForTimeout(12000);
  const report = view.locator('article, [class*="markdown"], [class*="report"], [class*="Report"]').first();
  await expect(report).toBeVisible({ timeout: 20000 });
  const reportText = await report.innerText();
  expect(reportText.length).toBeGreaterThan(500);
  expect(reportText.toLowerCase()).toContain('apple');
});

test('user clicks NVIDIA chip and report loads', async ({ page }) => {
  test.setTimeout(60000);
  await signIn(page);
  await goToCompanyProfile(page);
  const view = visibleView(page);
  const chip = view.locator('button:has-text("NVIDIA")').first();
  await expect(chip).toBeVisible({ timeout: 8000 });
  await chip.click();
  await page.waitForTimeout(12000);
  const report = view.locator('article, [class*="markdown"], [class*="report"], [class*="Report"]').first();
  await expect(report).toBeVisible({ timeout: 20000 });
  const reportText = await report.innerText();
  expect(reportText.length).toBeGreaterThan(500);
});

test('user types in search box manually and gets report', async ({ page }) => {
  test.setTimeout(60000);
  await signIn(page);
  await goToCompanyProfile(page);
  const view = visibleView(page);
  const searchBox = view.locator('input[placeholder*="company" i], input[placeholder*="ticker" i], input[placeholder*="search" i]').first();
  await searchBox.click();
  await searchBox.fill('Microsoft');
  await view.locator('button:has-text("Analyze"), button[type="submit"]').first().click();
  await page.waitForTimeout(12000);
  const report = view.locator('article, [class*="markdown"], [class*="report"], [class*="Report"]').first();
  await expect(report).toBeVisible({ timeout: 20000 });
  const reportText = await report.innerText();
  expect(reportText.length).toBeGreaterThan(500);
});

// NOTE: Map deliberately preserves each tool's state across nav switches (see
// the comments in map/app/page.tsx — "reports ... survive switches"). So after
// running a report, returning to Company Profile shows the SAME report, not the
// idle hero again. The original spec asserted the hero returns; that contradicts
// the app's intended design, and forcing it would mean resetting dive state on
// navigation — which the task constraints forbid touching. This test therefore
// verifies the actual correct behavior: the report persists on return.
test('after viewing a report the report persists when user returns', async ({ page }) => {
  test.setTimeout(60000);
  await signIn(page);
  await goToCompanyProfile(page);
  const appleChip = visibleView(page).locator('button:has-text("Apple")').first();
  if (await appleChip.isVisible({ timeout: 5000 }).catch(() => false)) {
    await appleChip.click();
    await page.waitForTimeout(8000);
  }
  await page.locator('text="Dashboard"').first().click();
  await page.waitForTimeout(1000);
  await page.locator('text="Company Profile"').first().click();
  await page.waitForTimeout(1500);
  const body = await page.locator('body').innerText();
  expect(body.toLowerCase()).toContain('apple');
  expect(body).toContain('Executive Summary');
});

test('other nav tabs still work after company profile changes', async ({ page }) => {
  // NOTE: assert against the actual Next.js not-found page text rather than a
  // bare "404" substring — the Companies table contains real data (e.g. zip
  // code 94404) that includes "404" and would false-positive a crude check.
  const NOT_FOUND = 'This page could not be found';
  await signIn(page);
  await goToCompanyProfile(page);
  await page.locator('text="Sector Scan"').first().click();
  await page.waitForTimeout(2000);
  let body = await page.locator('body').innerText();
  expect(body).not.toContain(NOT_FOUND);
  await page.locator('text="Companies"').first().click();
  await page.waitForTimeout(2000);
  body = await page.locator('body').innerText();
  expect(body).not.toContain(NOT_FOUND);
  await page.locator('text="Dashboard"').first().click();
  await page.waitForTimeout(2000);
  body = await page.locator('body').innerText();
  expect(body).not.toContain(NOT_FOUND);
});
