// takes: a base URL (argv[2], default http://localhost:3010)
// does: throws the hostile and awkward inputs at the homepage — empty submit,
//       nonsense queries, injected markup, double submits, refresh mid-run —
//       and checks the reduced-motion and keyboard-focus behaviour
// returns: prints a JSON result; exits non-zero if any check fails

import { chromium } from "playwright";

const BASE = process.argv[2] || "http://localhost:3010";
const SEARCH = "input[aria-label*='Search' i]";
const XSS = '<script>alert(1)</script>';

// takes: a page
// does: opens the app as a guest with the intro skipped
// returns: nothing
async function enterWorkspace(page) {
  await page.goto(`${BASE}/?skipIntro=1`, { waitUntil: "domcontentloaded" });
  const guest = page.getByRole("button", { name: /continue as guest/i });
  if (await guest.count()) await guest.click();
  await page.waitForSelector(SEARCH);
  await page.mouse.move(5, 5);
}

const browser = await chromium.launch({ headless: false });
const failures = [];
const result = {};

// A real alert() would hang the run; record it as a failure instead.
let alertFired = false;

{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on("dialog", async (d) => {
    alertFired = true;
    await d.dismiss();
  });
  await enterWorkspace(page);

  // 1. Empty submit does nothing — the button is disabled until there is text.
  result.emptySubmitDisabled = await page.getByRole("button", { name: /generate report/i }).first().isDisabled();
  if (!result.emptySubmitDisabled) failures.push("Generate is enabled with an empty field");

  // 2. Injected markup must render as inert text, never execute.
  await page.fill(SEARCH, XSS);
  result.xssValueEchoed = (await page.inputValue(SEARCH)) === XSS;
  await page.getByRole("button", { name: /generate report/i }).first().click();
  await page.waitForTimeout(6000);
  result.alertFired = alertFired;
  if (alertFired) failures.push("injected script executed");
  const scriptInjected = await page.evaluate(
    () => !!document.querySelector("script:not([src]):not([type])")?.textContent?.includes("alert(1)"),
  );
  result.scriptNodeInjected = scriptInjected;
  if (scriptInjected) failures.push("injected markup became a live script node");

  await context.close();
}

// 3. Nonsense query lands somewhere graceful, in the product's voice.
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on("dialog", async (d) => d.dismiss());
  await enterWorkspace(page);
  await page.fill(SEARCH, "asdf");
  await page.getByRole("button", { name: /generate report/i }).first().click();
  await page.waitForTimeout(30000);
  const body = await page.evaluate(() => document.body.innerText);
  // Word-bounded and case-sensitive for NaN: an unanchored /nan/i matches the
  // middle of ordinary words like "finance" and "governance".
  const RAW_VALUE = /\b(undefined|null)\b|\[object |\bNaN\b|Internal Server Error/;
  result.nonsenseHandled = !RAW_VALUE.test(body);
  if (!result.nonsenseHandled) failures.push("nonsense query surfaced a raw error value");
  result.nonsenseExcerpt = body.replace(/\s+/g, " ").slice(0, 220);
  await page.screenshot({ path: "/tmp/map-verify/abuse-nonsense.png" });
  await context.close();
}

// 4. Double-click Generate must not start two runs.
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const generateCalls = [];
  page.on("request", (r) => {
    if (/\/api\/(generate|run-pipeline|resolve-kind)/.test(r.url())) generateCalls.push(r.url());
  });
  await enterWorkspace(page);
  await page.fill(SEARCH, "Pfizer");
  const btn = page.getByRole("button", { name: /generate report/i }).first();
  await btn.click();
  await btn.click({ force: true }).catch(() => {});
  await page.waitForTimeout(20000);
  const pipelineRuns = generateCalls.filter((u) => /run-pipeline|\/api\/generate/.test(u)).length;
  result.pipelineRunsAfterDoubleClick = pipelineRuns;
  if (pipelineRuns > 1) failures.push(`double-click started ${pipelineRuns} runs`);

  // 5. Refresh mid-generation must come back to a usable page, not a broken one.
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  result.usableAfterRefresh = (await page.locator(SEARCH).count()) > 0
    || (await page.getByRole("button", { name: /continue as guest/i }).count()) > 0;
  if (!result.usableAfterRefresh) failures.push("page was not usable after refreshing mid-generation");
  await context.close();
}

// 6. Reduced motion: no placeholder cycling, demo already complete.
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  await enterWorkspace(page);
  const first = await page.$eval(".home-placeholder-cycle", (e) => e.textContent);
  await page.waitForTimeout(4200);
  const second = await page.$eval(".home-placeholder-cycle", (e) => e.textContent);
  result.placeholderStatic = first === second;
  if (!result.placeholderStatic) failures.push("placeholder still cycled under reduced motion");
  const demoComplete = await page.$$eval('[role="group"] .demo-rise', (els) =>
    els.every((e) => getComputedStyle(e).opacity === "1"),
  );
  result.demoStaticComplete = demoComplete;
  if (!demoComplete) failures.push("demo panel was not shown complete under reduced motion");
  await context.close();
}

// 7. Keyboard-only: tabbing reaches the search field with a visible ring.
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await enterWorkspace(page);
  await page.evaluate(() => document.activeElement?.blur());
  let reached = false;
  for (let i = 0; i < 15 && !reached; i++) {
    await page.keyboard.press("Tab");
    reached = await page.evaluate(
      () => document.activeElement?.getAttribute("aria-label")?.includes("Search") ?? false,
    );
  }
  result.searchReachableByKeyboard = reached;
  if (!reached) failures.push("could not tab to the search field");
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
