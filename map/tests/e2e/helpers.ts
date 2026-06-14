import { expect, Page } from '@playwright/test';

/**
 * Shared end-to-end helpers for the Map workspace.
 *
 * The app boots through two gates before the workspace is reachable:
 *   1. An animated intro splash (`components/Intro.tsx`) that auto-advances
 *      after ~5s but is also click-to-skip (the whole <main> has an onClick).
 *   2. An auth gate (`components/AuthGate.tsx`) offering email/password OR a
 *      "Continue as guest" button. Tests have no credentials, so we always take
 *      the guest path, which exercises the exact same workspace shell.
 *
 * `gotoWorkspace` drives past both and resolves once the workspace top-nav is
 * on screen, so every spec can start from a known, authenticated state.
 */

export const BASE = 'http://localhost:3000';

/**
 * Navigate to the app, skip the intro splash, sign in as a guest, and wait for
 * the workspace nav to render. Resilient to whichever gate appears first.
 */
export async function gotoWorkspace(page: Page): Promise<void> {
  // `networkidle` is unreliable against the Next dev server (its HMR websocket
  // keeps the network "busy"), so wait on DOM content instead.
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });

  // The intro is a full-screen <main> labelled "map" that skips on click. Click
  // it if present; if it has already auto-advanced, this is a harmless no-op.
  const intro = page.getByRole('img', { name: /^map$/ });
  if (await intro.isVisible({ timeout: 8000 }).catch(() => false)) {
    await intro.click();
  }

  // Wait for whichever appears first: the guest button (auth gate) or the
  // workspace nav (already authenticated from a prior in-page navigation).
  const guest = page.getByRole('button', { name: /continue as guest/i });
  const nav = page.locator('nav').first();
  await Promise.race([
    guest.waitFor({ state: 'visible', timeout: 30000 }).catch(() => {}),
    nav.waitFor({ state: 'visible', timeout: 30000 }).catch(() => {}),
  ]);

  if (await guest.isVisible().catch(() => false)) {
    await guest.click();
  }

  await nav.waitFor({ state: 'visible', timeout: 20000 });
}

/**
 * Map keeps every workspace view mounted and toggles `display`, so a bare
 * locator can resolve to a hidden element in an inactive view. Scope
 * interactions to the currently-visible `.ws-view` to avoid that.
 */
export function visibleView(page: Page) {
  return page.locator('.ws-view:visible');
}

/**
 * Click a top-nav tab by its visible label (e.g. "Dashboard",
 * "Company Profile", "Sector Scan"). The tabs are buttons inside the
 * "Workspace views" <nav>.
 */
export async function clickNav(page: Page, label: string): Promise<void> {
  await page.locator('nav[aria-label="Workspace views"]').getByRole('button', { name: label, exact: true }).click();
}

/**
 * Open the Account view via the right-hand Profile button (this is the only
 * route to the "Accounts" view; it is intentionally not a nav tab).
 */
export async function openProfile(page: Page): Promise<void> {
  await page.getByRole('button', { name: /open account/i }).click();
}

/** Assert the page has logged no console errors collected by `attachConsole`. */
export function attachConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}
