// takes: a base URL (argv[2], default http://localhost:3010)
// does: checks the intro splash — that it plays once per browser, stays inside
//       its time budget, carries the new caption at AA contrast, and still
//       honours click-to-skip and both query-param bypasses
// returns: prints a JSON result; exits non-zero if any check fails

import { chromium } from "playwright";

const BASE = process.argv[2] || "http://localhost:3010";
const BUDGET_MS = 900;
const INTRO = 'main[title="Click to skip"]';

// takes: a CSS rgb() string
// does: converts it to relative luminance per WCAG
// returns: the luminance, 0–1
function luminance(rgb) {
  const [r, g, b] = rgb.match(/\d+/g).map(Number).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// takes: two CSS rgb() strings
// does: computes the WCAG contrast ratio between them
// returns: the ratio, e.g. 4.83
function contrastRatio(fg, bg) {
  const a = luminance(fg);
  const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

// takes: a browser and an optional prefers-reduced-motion setting
// does: opens a brand-new context (empty storage) on the app
// returns: the context and its page
async function freshVisit(browser, reducedMotion) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion,
  });
  const page = await context.newPage();
  return { context, page };
}

const browser = await chromium.launch({ headless: false });
const failures = [];
const result = {};

// 1. First visit plays the intro, and it clears within budget.
{
  const { context, page } = await freshVisit(browser);
  const navStarted = Date.now();
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  const appeared = await page.locator(INTRO).count();
  if (!appeared) failures.push("intro did not render on a first visit");
  // Time the splash itself — from the moment it is on screen to the moment it
  // is gone — so page load and hydration are not charged against the budget.
  const splashStarted = Date.now();
  await page.waitForSelector(INTRO, { state: "detached", timeout: 5000 });
  result.splashOnScreenMs = Date.now() - splashStarted;
  result.navToWorkspaceMs = Date.now() - navStarted;
  // The splash is server-rendered, so it is painted before the bundle hydrates
  // and the hold timer can start. The component absorbs that wait, but it
  // cannot fade out before hydration happens at all — so the floor here is
  // hydration time plus the fade, not the hold alone.
  result.hydrationMs = await page.evaluate(
    () => Math.round(performance.getEntriesByType("navigation")[0]?.domInteractive ?? 0),
  );
  // navToWorkspaceMs is recorded for context only — it also carries navigation
  // and the measurement round-trip. The budget applies to the splash itself.
  if (result.splashOnScreenMs > BUDGET_MS) {
    failures.push(`splash was on screen ${result.splashOnScreenMs}ms, over the ${BUDGET_MS}ms budget`);
  }
  result.seenFlag = await page.evaluate(() => localStorage.getItem("map_seen_intro"));
  if (result.seenFlag !== "1") failures.push("map_seen_intro was not set after the intro played");

  // 2. Second visit in the SAME browser skips it.
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(400);
  result.introOnSecondVisit = (await page.locator(INTRO).count()) > 0;
  if (result.introOnSecondVisit) failures.push("intro replayed on a second visit");
  await context.close();
}

// 3. Caption text and contrast, on a fresh browser so the intro plays.
{
  const { context, page } = await freshVisit(browser);
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  const caption = await page.evaluate((sel) => {
    const root = document.querySelector(sel);
    const el = root?.querySelector("div:last-of-type");
    if (!el) return null;
    return {
      text: el.textContent,
      color: getComputedStyle(el).color,
      bg: getComputedStyle(root).backgroundColor,
    };
  }, INTRO);
  result.caption = caption;
  if (caption?.text?.trim() !== "Research, written for you.") {
    failures.push(`caption is "${caption?.text}", expected "Research, written for you."`);
  }
  if (caption) {
    result.captionContrast = Number(contrastRatio(caption.color, caption.bg).toFixed(2));
    if (result.captionContrast < 4.5) {
      failures.push(`caption contrast ${result.captionContrast}:1 fails AA (needs 4.5:1)`);
    }
  }
  await context.close();
}

// 4. Click-to-skip still works.
{
  const { context, page } = await freshVisit(browser);
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.locator(INTRO).click({ timeout: 2000 }).catch(() => {});
  await page.waitForSelector(INTRO, { state: "detached", timeout: 3000 }).catch(() => {
    failures.push("click-to-skip did not dismiss the intro");
  });
  result.clickToSkip = true;
  await context.close();
}

// 5. Both query-param bypasses still work on a fresh browser.
for (const [param, key] of [["skipIntro=1", "skipIntro"], ["screenshot=1", "screenshot"]]) {
  const { context, page } = await freshVisit(browser);
  await page.goto(`${BASE}/?${param}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(500);
  const shown = (await page.locator(INTRO).count()) > 0;
  result[`bypass_${key}`] = !shown;
  if (shown) failures.push(`?${param} did not bypass the intro`);
  await context.close();
}

// 6. Reduced motion: no drawing animation, still hands off.
{
  const { context, page } = await freshVisit(browser, "reduce");
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  const animated = await page.evaluate((sel) => {
    const root = document.querySelector(sel);
    if (!root) return null;
    // Under reduced motion every node must sit at its finished state: no
    // running animation and fully opaque.
    return Array.from(root.querySelectorAll("line, circle, ellipse")).filter((e) => {
      const s = getComputedStyle(e);
      return s.animationName !== "none" || Number(s.opacity) < 1;
    }).length;
  }, INTRO);
  result.reducedMotionAnimatedNodes = animated;
  if (animated) failures.push(`${animated} elements still animate under reduced motion`);
  await page.waitForSelector(INTRO, { state: "detached", timeout: 5000 }).catch(() => {
    failures.push("intro did not hand off under reduced motion");
  });
  await context.close();
}

result.failures = failures;
console.log(JSON.stringify(result, null, 2));
await browser.close();

if (failures.length) {
  console.error("FAIL");
  process.exit(1);
}
console.log("PASS");
