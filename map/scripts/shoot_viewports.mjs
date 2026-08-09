// takes: a base URL (argv[2]), an output directory (argv[3]), and a label
//        prefix (argv[4], e.g. "after")
// does: captures a full-page screenshot of the Home view at each of the three
//       reference viewport widths
// returns: prints the files written

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.argv[2] || "http://localhost:3010";
const DIR = process.argv[3] || "/tmp/map-verify";
const LABEL = process.argv[4] || "after";
const WIDTHS = [390, 768, 1440];
// The pre-change build's search input carries no aria-label, so anchor on the
// Home view container, which both versions render.
const HOME = ".dash-home";

mkdirSync(DIR, { recursive: true });
const browser = await chromium.launch({ headless: false });
const written = [];

for (const width of WIDTHS) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await context.newPage();
  await page.goto(`${BASE}/?skipIntro=1`, { waitUntil: "domcontentloaded" });
  // The pre-change build hydrates into an auth screen; the redesigned build
  // lands straight on Home. Wait for whichever appears, then pass the gate.
  const guest = page.getByRole("button", { name: /continue as guest/i });
  const home = page.locator(HOME);
  await home.or(guest).first().waitFor({ timeout: 30000 });
  if (await guest.count()) await guest.click();
  await home.waitFor({ timeout: 30000 });
  // Park the pointer away from the demo panel, which pauses on hover, and let
  // the sequence reach its assembled state before shooting.
  await page.mouse.move(2, 2);
  await page.waitForTimeout(5200);
  const path = `${DIR}/${LABEL}-${width}.png`;
  await page.screenshot({ path, fullPage: true });
  written.push(path);
  await context.close();
}

console.log(written.join("\n"));
await browser.close();
