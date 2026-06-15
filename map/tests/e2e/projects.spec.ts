import { test, expect, Page } from '@playwright/test';
import { mockBackend, gotoWorkspace, clickNav, visibleView } from './helpers';

test.beforeEach(async ({ page }) => {
  await mockBackend(page);
});

async function openProjectsAndCreate(page: Page, name = 'Test Project') {
  await gotoWorkspace(page);
  await clickNav(page, 'Projects');
  const view = visibleView(page);
  const input = view.getByLabel('New project name');
  await expect(input).toBeVisible({ timeout: 10000 });
  await input.fill(name);
  await view.getByTestId('create-project').click();
  await expect(view.getByTestId('run-pipeline')).toBeVisible({ timeout: 10000 });
}

test('Projects tab is reachable and shows the project picker', async ({ page }) => {
  test.setTimeout(45000);
  await gotoWorkspace(page);
  await clickNav(page, 'Projects');
  await expect(visibleView(page).getByRole('heading', { name: 'Projects' })).toBeVisible({ timeout: 10000 });
});

test('Create a project then open its run view', async ({ page }) => {
  test.setTimeout(60000);
  await openProjectsAndCreate(page);
  await expect(visibleView(page).getByTestId('run-pipeline')).toBeVisible();
});

test('Run full pipeline shows all four artifact panels with downloads', async ({ page }) => {
  test.setTimeout(120000);
  await openProjectsAndCreate(page);
  const view = visibleView(page);
  await view.getByLabel('Pipeline subject').fill('Apple');
  await view.getByTestId('run-pipeline').click();

  // Results container appears; the run completes when Save-to-project shows.
  await expect(view.getByTestId('pipeline-results')).toBeVisible({ timeout: 30000 });
  await expect(view.getByTestId('save-run')).toBeVisible({ timeout: 90000 });

  const body = await page.locator('body').innerText();
  expect(body).toContain('Company Profile');
  expect(body).toContain('UNC Partnership Profile');
  expect(body).toContain('Sector Scan');
  expect(body).toContain('Database');
});

test('Saving a run makes it reopenable in the project', async ({ page }) => {
  test.setTimeout(120000);
  await openProjectsAndCreate(page);
  const view = visibleView(page);
  await view.getByLabel('Pipeline subject').fill('Apple');
  await view.getByTestId('run-pipeline').click();
  await expect(view.getByTestId('save-run')).toBeVisible({ timeout: 90000 });
  await view.getByTestId('save-run').click();
  await expect(view.getByTestId('saved-run').first()).toBeVisible({ timeout: 15000 });
});

test('All nav tabs still work after a pipeline run', async ({ page }) => {
  test.setTimeout(120000);
  await openProjectsAndCreate(page);
  const view = visibleView(page);
  await view.getByLabel('Pipeline subject').fill('Apple');
  await view.getByTestId('run-pipeline').click();
  await expect(view.getByTestId('save-run')).toBeVisible({ timeout: 90000 });

  for (const label of ['Dashboard', 'Company', 'Sector', 'UNC', 'Database', 'Projects']) {
    await clickNav(page, label);
    await page.waitForTimeout(500);
    const body = await page.locator('body').innerText();
    expect(body, `Crash on ${label} tab`).not.toContain('This page could not be found');
    expect(body, `App error on ${label} tab`).not.toContain('Application error');
  }
});
