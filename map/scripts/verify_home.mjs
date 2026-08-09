// takes: a base URL (argv[2], default http://localhost:3010)
// does: drives the Home view in a real visible Chromium window and reports the
//       demo panel's assembly state plus hero copy, so the animation is checked
//       at real speed rather than in a throttled background page
// returns: prints a JSON result and exits non-zero if a check fails

import { chromium } from "playwright";

const BASE = process.argv[2] || "http://localhost:3010";
const SHOT_DIR = process.argv[3] || "/tmp/map-verify";

// takes: a page already on the Home view
// does: reads the demo panel's four source lines and their opacity
// returns: a list of {text, opacity} entries
async function readDemoLines(page) {
  return page.$$eval('[role="group"] .demo-rise', (els) =>
    els.map((e) => ({
      text: e.textContent.slice(0, 28),
      opacity: getComputedStyle(e).opacity,
    })),
  );
}

// takes: a browser page and a viewport width
// does: resizes, screenshots the full Home page at that width
// returns: nothing
async function shootAt(page, width, name) {
  await page.setViewportSize({ width, height: 900 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOT_DIR}/${name}.png`, fullPage: true });
}

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
// Company logos load from external favicon services that redirect to hosts the
// CSP blocks. That noise predates this work and the repo's own e2e suite
// filters it the same way (tests/e2e/sector-package.spec.ts).
const KNOWN_NOISE = /favicon|gstatic|Failed to load resource|net::ERR_/i;
const consoleErrors = [];
page.on("console", (m) => {
  if (m.type() === "error" && !KNOWN_NOISE.test(m.text())) consoleErrors.push(m.text());
});

await page.goto(`${BASE}/?skipIntro=1`, { waitUntil: "domcontentloaded" });
await page.getByRole("button", { name: /continue as guest/i }).click();
await page.waitForSelector('[role="group"]');
// The cursor lands where the demo panel now sits, and hovering it pauses the
// sequence by design. Park the pointer out of the way before timing anything.
await page.mouse.move(5, 5);

const h1 = await page.locator("h1").first().textContent();
const sub = await page.locator("h1 + p").first().textContent();
const btn = await page.getByRole("button", { name: /generate report/i }).first().textContent();

// The panel loops, so a single sample can land mid-restart. Poll across a
// whole cycle and record the best moment: every line visible at once.
let lines = [];
let bestVisible = 0;
let formatsOpacity = "0";
for (let i = 0; i < 60; i++) {
  await page.waitForTimeout(200);
  const sample = await readDemoLines(page);
  const visible = sample.filter((l) => l.opacity === "1").length;
  if (visible > bestVisible) {
    bestVisible = visible;
    lines = sample;
    formatsOpacity = await page.$eval(
      '[role="group"] [data-demo-formats]',
      (e) => getComputedStyle(e).opacity,
    );
  }
  if (bestVisible === 4) break;
}
const overview = await page.$eval("[data-demo-overview]", (e) => e.textContent);

// Placeholder cycling should have advanced past the first phrase by now.
const placeholder = await page.$eval(".home-placeholder-cycle", (e) => ({
  text: e.textContent,
  opacity: getComputedStyle(e).opacity,
}));

const footerText = await page.locator("footer").first().textContent();

await shootAt(page, 1440, "home-1440");
await shootAt(page, 768, "home-768");
await shootAt(page, 390, "home-390");

const result = {
  h1: h1?.trim(),
  subheadline: sub?.trim(),
  generateButton: btn?.trim(),
  overviewTyped: overview?.trim().length,
  demoLines: lines,
  formatsOpacity,
  placeholder,
  footerText: footerText?.trim(),
  consoleErrors,
};
console.log(JSON.stringify(result, null, 2));

const allLinesVisible = lines.length === 4 && lines.every((l) => l.opacity === "1");
await browser.close();

if (!allLinesVisible) {
  console.error("FAIL: demo lines did not all become visible");
  process.exit(1);
}
if (consoleErrors.length) {
  console.error("FAIL: console errors present");
  process.exit(1);
}
console.log("PASS");
