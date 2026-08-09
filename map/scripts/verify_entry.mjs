// takes: a base URL (argv[2]) and the expected GUEST_FIRST_ENTRY value
//        (argv[3], "true" or "false")
// does: checks the entry flow — guest-first landing, the sign-in modal and its
//       focus trap, the guest tab set, and the phone menu — or, with the flag
//       off, that the original full-page auth screen is back
// returns: prints a JSON result; exits non-zero if any check fails

import { chromium } from "playwright";

const BASE = process.argv[2] || "http://localhost:3010";
const FLAG_ON = (process.argv[3] ?? "true") === "true";
const GUEST_TABS = ["Home", "Companies", "Sectors", "Projects"];
const ACCOUNT_ONLY_TABS = ["Partnerships", "Directory"];

// takes: a page on the workspace
// does: reads the labels of the tabs the header is rendering
// returns: a list of tab labels
async function navLabels(page) {
  return page.$$eval(".ws-nav .ws-nav-item", (els) => els.map((e) => e.textContent.trim()));
}

const browser = await chromium.launch({ headless: false });
const failures = [];
const result = { flag: FLAG_ON };

const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
await page.goto(`${BASE}/?skipIntro=1`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1200);

const sawAuthScreen = await page.getByRole("button", { name: /continue as guest/i }).count();

if (!FLAG_ON) {
  // Flag off must restore the original flow exactly: a full-page auth screen.
  result.landedOnAuthScreen = sawAuthScreen > 0;
  if (!sawAuthScreen) failures.push("with the flag off, the auth screen did not render on arrival");
  await page.getByRole("button", { name: /continue as guest/i }).click();
  await page.waitForTimeout(600);
  result.navAfterGuest = await navLabels(page);
  const missing = [...GUEST_TABS, ...ACCOUNT_ONLY_TABS].filter((t) => !result.navAfterGuest.includes(t));
  if (missing.length) failures.push(`with the flag off, all six tabs should show; missing ${missing}`);
} else {
  // 1. Guest-first: straight into the workspace, no decision required.
  result.landedOnAuthScreen = sawAuthScreen > 0;
  if (sawAuthScreen) failures.push("guest-first entry still showed the full-page auth screen");
  result.searchFocused = await page.evaluate(
    () => document.activeElement?.getAttribute("aria-label")?.includes("Search") ?? false,
  );
  if (!result.searchFocused) failures.push("search field was not focused on arrival (desktop)");

  // 2. Guests see only the tabs they can open, plus a quiet Sign in.
  result.guestNav = await navLabels(page);
  const unexpected = ACCOUNT_ONLY_TABS.filter((t) => result.guestNav.includes(t));
  if (unexpected.length) failures.push(`guest nav shows account-only tabs: ${unexpected}`);
  const absent = GUEST_TABS.filter((t) => !result.guestNav.includes(t));
  if (absent.length) failures.push(`guest nav is missing: ${absent}`);
  result.signInButton = await page.getByRole("button", { name: /^sign in$/i }).count();
  if (!result.signInButton) failures.push("no Sign in button in the header for a guest");
  result.accountPill = await page.locator(".ws-account-btn").count();
  if (result.accountPill) failures.push("Account pill rendered for a guest");

  // 3. The header modal opens, carries both lines, traps focus, and Escape
  //    closes it without losing anything.
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForSelector('[role="dialog"]');
  const modalText = await page.$eval('[role="dialog"]', (e) => e.innerText);
  result.hasGuestLine = /knows nothing about you/i.test(modalText);
  result.hasHeaderReason = /log in or create your account/i.test(modalText);
  if (!result.hasGuestLine) failures.push("header modal is missing the guest reassurance line");
  if (!result.hasHeaderReason) failures.push("header modal is missing its reason line");

  const focusInside = await page.evaluate(
    () => document.querySelector('[role="dialog"]')?.contains(document.activeElement) ?? false,
  );
  result.focusMovedIntoModal = focusInside;
  if (!focusInside) failures.push("focus did not move into the modal");

  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  result.escapeClosed = (await page.locator('[role="dialog"]').count()) === 0;
  if (!result.escapeClosed) failures.push("Escape did not close the modal");
  result.stillGuestAfterClose = (await navLabels(page)).includes("Home");
  if (!result.stillGuestAfterClose) failures.push("closing the modal lost the workspace");

  // 4. Projects stays open to guests.
  await page.getByRole("button", { name: /^Projects$/ }).first().click();
  await page.waitForTimeout(800);
  result.projectsOpenToGuest =
    (await page.locator('[role="dialog"]').count()) === 0 &&
    (await page.evaluate(() => !/sign in to/i.test(document.body.innerText.slice(0, 400))));
  if (!result.projectsOpenToGuest) failures.push("Projects blocked a guest");

  // 5. Phone: the tab row collapses into a reachable menu.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  const navVisible = await page.locator(".ws-nav").isVisible();
  result.tabRowHiddenOnPhone = !navVisible;
  if (navVisible) failures.push("tab row did not collapse on a phone viewport");
  const menuBtn = page.getByRole("button", { name: /^menu$/i });
  result.menuButtonOnPhone = (await menuBtn.count()) > 0;
  if (!result.menuButtonOnPhone) failures.push("no menu button on a phone viewport");
  const box = await menuBtn.first().boundingBox();
  result.menuTouchTarget = box ? Math.round(Math.min(box.width, box.height)) : 0;
  if (result.menuTouchTarget < 44) failures.push(`menu touch target is ${result.menuTouchTarget}px, under 44px`);
  await menuBtn.first().click();
  await page.waitForTimeout(300);
  result.menuItems = await page.$$eval('.ws-menu-sheet button', (els) => els.map((e) => e.textContent.trim()));
  if (!result.menuItems.includes("Sectors")) failures.push("phone menu did not list the tabs");
  await page.screenshot({ path: "/tmp/map-verify/entry-390-menu.png" });
  const noHScroll = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth + 1,
  );
  result.noHorizontalScroll = noHScroll;
  if (!noHScroll) failures.push("horizontal scroll at 390px");
}

result.failures = failures;
console.log(JSON.stringify(result, null, 2));
await context.close();
await browser.close();

if (failures.length) {
  console.error("FAIL");
  process.exit(1);
}
console.log("PASS");
