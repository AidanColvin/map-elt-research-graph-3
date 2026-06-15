import { test, expect } from '@playwright/test';
import { gotoWorkspace, visibleView, clickNav, openProfile, attachConsole, mockBackend } from './helpers';

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
  // Arm offline backend + image-host mocks before every navigation so no test
  // depends on a real backend, Firebase, or third-party logo hosts.
  test.beforeEach(async ({ page }) => {
    await mockBackend(page);
  });

  /**
   * 1a. Typing in the Company Profile search bar updates the input's value
   *     (the search field is controlled, so what you type is reflected live).
   */
  test('typing in the company search bar updates the input value', async ({ page }) => {
    await gotoWorkspace(page);
    await clickNav(page, 'Company');

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
   * 1b. The dashboard search is a controlled input with a Company/Sector mode
   *     toggle. Typing reflects live, and switching mode swaps the placeholder —
   *     proving the interactive controls mutate state.
   */
  test('dashboard search input is controlled and the mode toggle works', async ({ page }) => {
    await gotoWorkspace(page);
    // Default landing view is the Dashboard.
    const view = visibleView(page);
    const search = view.locator('input[placeholder*="company" i]').first();
    await expect(search).toBeVisible({ timeout: 8000 });
    await expect(search).toHaveValue('');

    await search.fill('Pfizer');
    await expect(search).toHaveValue('Pfizer');

    // Switching to Sector mode swaps the placeholder copy.
    await view.getByRole('button', { name: /^Sector$/ }).click();
    await expect(view.locator('input[placeholder*="sector" i]').first()).toBeVisible();
  });

  /**
   * 2. Cross-loading a company: running a curated company from the Dashboard
   *    search hands it to the Company canvas and switches focus there, with the
   *    streamed report appearing under that company's name.
   */
  test('running a company from the dashboard cross-loads the Company view', async ({ page }) => {
    test.setTimeout(REPORT_TIMEOUT + 20000);
    await gotoWorkspace(page);

    // Dashboard is in "company" mode by default — type a company and submit.
    const dash = visibleView(page);
    const search = dash.locator('input[placeholder*="company" i]').first();
    await expect(search).toBeVisible({ timeout: 8000 });
    await search.fill('Apple');
    await search.press('Enter');

    // We should now be on the Company canvas...
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
      visibleView(page).getByRole('heading', { name: /board-ready intelligence/i }),
    ).toBeVisible({ timeout: 8000 });

    // Company Profile — idle hero headline ("...board-ready in seconds.").
    await clickNav(page, 'Company');
    await expect(
      visibleView(page).getByRole('heading', { name: /board-ready/i }),
    ).toBeVisible({ timeout: 8000 });

    // Sector Scan — idle hero headline ("Scan an entire sector...").
    await clickNav(page, 'Sector');
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
      visibleView(page).getByRole('heading', { name: /board-ready intelligence/i }),
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
    for (const label of ['Company', 'Sector', 'Dashboard']) {
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
   *     after a *completed* sector scan. With the backend mocked, the scan
   *     returns a deterministic report whose `section4_profiles` populate the
   *     grid, so this is now a real green test rather than a perpetual skip.
   */
  test('clicking a sector ticker cross-loads that company into the Company view', async ({ page }) => {
    test.setTimeout(60000);
    await gotoWorkspace(page);
    await clickNav(page, 'Sector');

    const sectorView = visibleView(page);
    const input = sectorView.locator('input[aria-label="Sector"]').first();
    await expect(input).toBeVisible({ timeout: 8000 });
    await input.fill('Oncology');
    await input.press('Enter');

    // The ticker grid renders buttons titled "Company profile: <company>" once
    // the (mocked) scan finishes.
    const ticker = page.locator('button[title^="Company profile:"]').first();
    await expect(ticker).toBeVisible({ timeout: 30000 });

    const companyName = (await ticker.innerText()).split('\n')[0].trim();
    await ticker.click();

    // Selecting a ticker triggers a deep dive AND moves focus to Company Profile.
    const companyView = visibleView(page);
    await expect(
      companyView.getByRole('heading', { name: new RegExp(companyName, 'i') }),
    ).toBeVisible({ timeout: REPORT_TIMEOUT });
  });
});
