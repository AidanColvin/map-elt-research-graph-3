import { test, expect, Page } from '@playwright/test';
import { mockBackend, gotoWorkspace, clickNav, visibleView } from './helpers';

// Arm offline backend + image-host mocks before every test so company deep
// dives, freshness checks, and logos never touch a real backend or the network.
test.beforeEach(async ({ page }) => {
  await mockBackend(page);
});

// Enter the workspace as a guest (skips the intro splash + auth gate). See
// helpers.ts for the gate-handling rationale.
async function signIn(page: Page) {
  await gotoWorkspace(page);
}

// The top-nav tab is labelled "Company" in the live build.
async function goToCompanyProfile(page: Page) {
  await clickNav(page, 'Company');
  await page.waitForTimeout(1000);
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
  await clickNav(page, 'Dashboard');
  await page.waitForTimeout(1000);
  await clickNav(page, 'Company');
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
  await clickNav(page, 'Sector');
  await page.waitForTimeout(2000);
  let body = await page.locator('body').innerText();
  expect(body).not.toContain(NOT_FOUND);
  await clickNav(page, 'Dashboard');
  await page.waitForTimeout(2000);
  body = await page.locator('body').innerText();
  expect(body).not.toContain(NOT_FOUND);
});
