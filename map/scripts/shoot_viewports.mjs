// takes: a base URL (argv[2]), an output directory (argv[3]), and a label
//        prefix (argv[4], e.g. "after")
// does: captures a full-page screenshot of the homepage at each of the four
//       reference viewport widths
// returns: prints the files written

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.argv[2] || "http://localhost:3010";
const DIR = process.argv[3] || "/tmp/map-verify";
const LABEL = process.argv[4] || "after";
const WIDTHS = [390, 768, 1024, 1440];
// The redesigned homepage's root. The pre-change build rendered ".dash-home"
// instead, so a "before" run against an older revision anchors on that.
const HOME = ".v4-page, .dash-home";

mkdirSync(DIR, { recursive: true });
const browser = await chromium.launch();
const written = [];

for (const width of WIDTHS) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await context.newPage();
  await page.goto(`${BASE}/?skipIntro=1`, { waitUntil: "domcontentloaded" });
  // An older build hydrates into an auth screen; the current one lands straight
  // on the homepage. Wait for whichever appears, then pass the gate.
  const guest = page.getByRole("button", { name: /continue as guest/i });
  const home = page.locator(HOME).first();
  await home.or(guest).first().waitFor({ timeout: 30000 });
  if (await guest.count()) await guest.click();
  await home.waitFor({ timeout: 30000 });
  // Scroll the whole page so every section's reveal has fired, then return to
  // the top — a full-page shot of un-revealed sections would come out blank.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(1200);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.mouse.move(2, 2);
  await page.waitForTimeout(600);
  const path = `${DIR}/${LABEL}-${width}.png`;
  await page.screenshot({ path, fullPage: true });
  written.push(path);
  await context.close();
}

console.log(written.join("\n"));
await browser.close();
