import { test, expect } from '@playwright/test';
import { gotoWorkspace, visibleView, clickNav, openProfile, attachConsole } from './helpers';

/**
 * Interactive UI flow coverage for the Map workspace.
 *
 * These tests exercise the *interactive* surface that the existing specs don't
 * focus on: live search-input typing, cross-loading a company from one view
 * into the Company Profile canvas, top-nav view switching (asserting the right
 * heading is visible after each click), and a console-error smoke check.
 *
 * Everything here is offline-friendly: it relies on the bundled curated
 * companies (Apple, NVIDIA, ...) whose deep dives resolve via the local
 * /api/generate route, plus static dashboard/hero content. No external sector
 * pipeline is required. One test that genuinely needs the live sector pipeline
 * (the TickerGrid only renders after a real scan) is split out and skipped when
 * the backend is unavailable, with an explanation inline.
 */

// The curated Apple deep dive is the most reliable offline report path, so we
// give report-producing tests a comfortable budget for the local stream.
const REPORT_TIMEOUT = 45000;

test.describe('Map workspace — interactive flows', () => {
  /**
   * 1a. Typing in the Company Profile search bar updates the input's value
   *     (the search field is controlled, so what you type is reflected live).
   */
  test('typing in the company search bar updates the input value', async ({ page }) => {
    await gotoWorkspace(page);
    await clickNav(page, 'Company Profile');

    const view = visibleView(page);
    const search = view
      .locator('input[aria-label="Company or ticker"], input[placeholder*="company" i], input[placeholder*="ticker" i]')
      .first();
    await expect(search).toBeVisible({ timeout: 8000 });

    await search.fill('Microsoft');
    await expect(search).toHaveValue('Microsoft');

    // Editing the query updates it live (controlled input), proving keystrokes
    // flow into state rather than being dropped.
    await search.fill('Microsoft Corp');
    await expect(search).toHaveValue('Microsoft Corp');
  });

  /**
   * 1b. The dashboard "Try:" quick chips filter/prefill the unified search box,
   *     demonstrating that an interactive control mutates the search query.
   */
  test('dashboard quick-try chips prefill the unified search box', async ({ page }) => {
    await gotoWorkspace(page);
    // Default landing view is the Dashboard.
    const view = visibleView(page);
    const search = view.locator('input[placeholder="Company, ticker, or sector..."]').first();
    await expect(search).toBeVisible({ timeout: 8000 });
    await expect(search).toHaveValue('');

    await view.getByRole('button', { name: /^Apple$/ }).first().click();
    await expect(search).toHaveValue('Apple');
  });

  /**
   * 2. Cross-loading a company: running a curated company from the Dashboard
   *    hands it to the Company Profile canvas and switches focus there, with the
   *    streamed report appearing under that company's name.
   */
  test('running a company from the dashboard cross-loads the Company view', async ({ page }) => {
    test.setTimeout(REPORT_TIMEOUT + 20000);
    await gotoWorkspace(page);

    // Dashboard "Curated Deep Dives" cards run a company and jump to Company view.
    const dash = visibleView(page);
    await dash.getByRole('button', { name: /^Apple/ }).first().click();

    // We should now be on the Company Profile canvas...
    const company = visibleView(page);
    await expect(company.getByRole('heading', { name: 'Apple', exact: true })).toBeVisible({
      timeout: REPORT_TIMEOUT,
    });

    // ...and the streamed report content for Apple should render.
    const report = company.locator('article, .workspace-md, [class*="markdown"]').first();
    await expect(report).toBeVisible({ timeout: REPORT_TIMEOUT });
    const text = await report.innerText();
    expect(text.length).toBeGreaterThan(300);
    expect(text.toLowerCase()).toContain('apple');
  });

  /**
   * 3. The top nav switches between Dashboard, Company Profile and Sector Scan,
   *    and the Profile button opens the Account ("Accounts") view. After each
   *    click we assert the correct heading/landmark for that view is visible.
   *
   *    (Note: "Companies"/"Partnerships" tabs are deactivated in the live build;
   *    the Account view is reached via the Profile button, not a nav tab.)
   */
  test('top nav switches between Dashboard, Company, Sector and Account views', async ({ page }) => {
    await gotoWorkspace(page);

    // Dashboard — the hero headline ("Map the partnership landscape").
    await clickNav(page, 'Dashboard');
    await expect(
      visibleView(page).getByRole('heading', { name: /partnership landscape/i }),
    ).toBeVisible({ timeout: 8000 });

    // Company Profile — idle hero headline ("...board-ready in seconds.").
    await clickNav(page, 'Company Profile');
    await expect(
      visibleView(page).getByRole('heading', { name: /board-ready/i }),
    ).toBeVisible({ timeout: 8000 });

    // Sector Scan — idle hero headline ("Scan an entire sector...").
    await clickNav(page, 'Sector Scan');
    await expect(
      visibleView(page).getByRole('heading', { name: /scan an entire sector/i }),
    ).toBeVisible({ timeout: 8000 });

    // Account view via the Profile button — the AccountView card titled "Account".
    await openProfile(page);
    await expect(visibleView(page).getByText('Account', { exact: true }).first()).toBeVisible({
      timeout: 8000,
    });
    // Guest accounts show the guest-specific email placeholder.
    await expect(visibleView(page).getByText('Guest').first()).toBeVisible();

    // Back to Dashboard to confirm round-trip navigation still works.
    await clickNav(page, 'Dashboard');
    await expect(
      visibleView(page).getByRole('heading', { name: /partnership landscape/i }),
    ).toBeVisible({ timeout: 8000 });
  });

  /**
   * 4. Accessibility / no-console-error smoke check on the main workspace.
   *    Navigating across the offline views must not log console errors or throw
   *    uncaught page errors, and the primary landmarks (nav + main) must exist.
   */
  test('workspace navigation produces no console errors and has core landmarks', async ({ page }) => {
    const errors = attachConsole(page);
    await gotoWorkspace(page);

    // Core a11y landmarks.
    await expect(page.locator('nav[aria-label="Workspace views"]')).toBeVisible();
    await expect(page.locator('main').first()).toBeVisible();
    // The home/logo control exposes an accessible label.
    await expect(page.getByRole('button', { name: /map home/i })).toBeVisible();

    // Walk the offline views; none should error.
    for (const label of ['Company Profile', 'Sector Scan', 'Dashboard']) {
      await clickNav(page, label);
      await page.waitForTimeout(400);
    }

    // Filter out benign noise unrelated to app correctness (favicon 404s,
    // third-party resource warnings) so the assertion targets real app errors.
    const appErrors = errors.filter(
      (e) =>
        !/favicon/i.test(e) &&
        !/Failed to load resource/i.test(e) &&
        !/net::ERR_/i.test(e),
    );
    expect(appErrors, `Unexpected console/page errors:\n${appErrors.join('\n')}`).toEqual([]);
  });

  /**
   * 2b. Cross-loading from the Sector Scan TickerGrid into the Company view.
   *
   *     The ticker grid (`components/workspace/TickerGrid.tsx`) only renders
   *     after a *completed* sector scan, which depends on the live serverless
   *     pipeline. When that backend is unavailable the scan can't produce
   *     profiles, so there's nothing to click. We attempt a real scan and, if
   *     it doesn't complete in time (backend offline/cold), skip rather than
   *     leave a flaky failure.
   */
  test('clicking a sector ticker cross-loads that company into the Company view', async ({ page }) => {
    test.setTimeout(140000);
    await gotoWorkspace(page);
    await clickNav(page, 'Sector Scan');

    const sectorView = visibleView(page);
    const input = sectorView.locator('input[aria-label="Sector"]').first();
    await expect(input).toBeVisible({ timeout: 8000 });
    await input.fill('Oncology');
    await input.press('Enter');

    // Wait for the ticker grid (buttons titled "Deep dive: <company>") to appear
    // once the scan finishes. If the pipeline is unavailable, skip.
    const ticker = page.locator('button[title^="Deep dive:"]').first();
    const ready = await ticker
      .waitFor({ state: 'visible', timeout: 110000 })
      .then(() => true)
      .catch(() => false);

    test.skip(
      !ready,
      'Sector pipeline did not return profiles (live backend unavailable); TickerGrid requires a completed scan.',
    );

    const companyName = (await ticker.innerText()).split('\n')[0].trim();
    await ticker.click();

    // Selecting a ticker triggers a deep dive AND moves focus to Company Profile.
    const companyView = visibleView(page);
    await expect(
      companyView.getByRole('heading', { name: new RegExp(companyName, 'i') }),
    ).toBeVisible({ timeout: REPORT_TIMEOUT });
  });
});
