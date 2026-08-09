// takes: a base URL (argv[2], default http://localhost:3010)
// does: proves the homepage's single search bar still routes a company query
//       and a sector query to their different report types, and that the
//       closing call-to-action returns focus to that one field
// returns: prints a JSON result; exits non-zero if any check fails

import { chromium } from "playwright";

const BASE = process.argv[2] || "http://localhost:3010";
const SEARCH = "input[aria-label*='Search' i]";

// takes: a page on the workspace
// does: counts the search inputs the homepage renders
// returns: the number of inputs found
async function countSearchInputs(page) {
  return page.locator(SEARCH).count();
}

// takes: a page, and the query to run
// does: types the query into the one search bar and submits it
// returns: nothing
async function runQuery(page, query) {
  await page.fill(SEARCH, "");
  await page.fill(SEARCH, query);
  await page.getByRole("button", { name: /generate report/i }).first().click();
}

// takes: a page and how long to wait
// does: waits, then reads which workspace tab the app marked current — the
//       report bodies share headings like "Executive Summary", so the nav
//       state is the only unambiguous signal of where a query routed
// returns: the active tab's label, lowercased
async function activeTab(page, ms) {
  await page.waitForTimeout(ms);
  return page.evaluate(
    () => document.querySelector('[aria-current="page"]')?.textContent?.trim().toLowerCase() ?? "none",
  );
}

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const failures = [];

await page.goto(`${BASE}/?skipIntro=1`, { waitUntil: "domcontentloaded" });
// With guest-first entry the workspace is already there; with the flag off an
// auth screen stands in front of it. Handle both.
const guestButton = page.getByRole("button", { name: /continue as guest/i });
if (await guestButton.count()) await guestButton.click();
await page.waitForSelector(SEARCH);
await page.mouse.move(5, 5);

const inputCount = await countSearchInputs(page);
if (inputCount !== 1) failures.push(`expected exactly 1 search input, found ${inputCount}`);

// Only one field can ever show the accent focus ring.
await page.focus(SEARCH);
const ringed = await page.evaluate(() => {
  const bordered = Array.from(document.querySelectorAll("div")).filter((d) => {
    const b = getComputedStyle(d).borderColor;
    return b === "rgb(0, 122, 255)" || b === "rgb(0, 113, 227)";
  });
  return bordered.length;
});
if (ringed > 1) failures.push(`expected at most 1 focus ring, found ${ringed}`);

// The closing CTA must lead back to the one field.
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await page.getByRole("button", { name: /your turn/i }).click();
// The jump scrolls smoothly before focusing, so poll rather than sampling a
// single instant mid-animation.
let ctaFocused = false;
for (let i = 0; i < 20 && !ctaFocused; i++) {
  await page.waitForTimeout(200);
  ctaFocused = await page.evaluate(
    () => document.activeElement?.getAttribute("aria-label")?.includes("Search") ?? false,
  );
}
const activeAfterCta = await page.evaluate(() => ({
  tag: document.activeElement?.tagName,
  aria: document.activeElement?.getAttribute("aria-label"),
  text: document.activeElement?.textContent?.slice(0, 40),
}));
if (!ctaFocused) {
  failures.push(`CTA did not return focus to the search field (active: ${JSON.stringify(activeAfterCta)})`);
}

// Typing must not steal focus. If the search bar is ever rendered as a JSX
// element instead of being called as a function, React remounts the input on
// each render and the field loses focus after every character.
await page.click(SEARCH);
await page.keyboard.type("Pfiz", { delay: 60 });
const typedValue = await page.inputValue(SEARCH);
const stillFocused = await page.evaluate(
  () => document.activeElement?.getAttribute("aria-label")?.includes("Search") ?? false,
);
if (typedValue !== "Pfiz") failures.push(`typing dropped characters: got "${typedValue}"`);
if (!stillFocused) failures.push("field lost focus while typing");

// Same field, two query kinds, two report types.
await runQuery(page, "Pfizer");
const companyKind = await activeTab(page, 45000);
if (companyKind !== "companies") failures.push(`"Pfizer" routed to "${companyKind}", expected companies`);
await page.screenshot({ path: "/tmp/map-verify/route-company.png", fullPage: false });

await page.getByRole("button", { name: /^Home$/ }).first().click();
await page.waitForTimeout(1000);
await runQuery(page, "oncology");
const sectorKind = await activeTab(page, 60000);
if (sectorKind !== "sectors") failures.push(`"oncology" routed to "${sectorKind}", expected sectors`);
await page.screenshot({ path: "/tmp/map-verify/route-sector.png", fullPage: false });

console.log(JSON.stringify({ inputCount, ringed, ctaFocused, companyKind, sectorKind, failures }, null, 2));
await browser.close();

if (failures.length) {
  console.error("FAIL");
  process.exit(1);
}
console.log("PASS");
